"""Render the configuration a running stack reads, with the broker secret in it.

The tracked configuration under ``config/<destination>/`` carries the role a component
authenticates as and no secret: the role, an at-sign, then the location. That is the contract
``deploy/broker/README.md`` states, and it is the same shape the database DSNs in the same
files already use. A secret in a tracked file is a secret in the history for ever.

Something has to put the secret in before a component connects, because the broker refuses
anonymous clients (``allow_anonymous false``) and a role with no password is an anonymous
client wearing a name. That is this module. It reads the tracked tree, substitutes each
role's secret into the URL, and writes the result under ``deploy/.runtime/config/``, which
is untracked and is what the Compose file mounts.

Two properties this arrangement has to keep, and both are tested:

**Nothing but the broker URL changes.** The rendered document is the tracked document with
one field rewritten. A render that reformatted, reordered or dropped anything would make the
running configuration something nobody had read, which is the drift the tracked tree exists
to prevent.

**A role with no secret is a refusal, not a silent anonymous connection.** The failure this
whole path exists to prevent is a component that looks configured and cannot authenticate,
so an unresolvable role stops the render rather than producing a URL that will be refused at
the broker with a message nobody reads.

The password file the broker itself reads is produced here too, by ``mosquitto_passwd``, so
that the two halves of a credential are written from one set of values in one place. They
were previously described in a README and produced by nothing.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import compose_document
from destination import ConfigurationError, destination_dir, repository_root

__all__ = [
    "ROLE_SECRETS",
    "SECRET_NAMES",
    "render_destination",
    "rendered_dir",
    "write_password_file",
]

# The four roles `deploy/broker/acl` defines, and the environment variable carrying each
# one's secret. Adding a role means adding a block to the access control list and a line
# here; there is no fifth place.
ROLE_SECRETS: dict[str, str] = {
    "drogna_sensor": "HARNESS_BROKER_SECRET_SENSOR",
    "drogna_ingest": "HARNESS_BROKER_SECRET_INGEST",
    "drogna_control": "HARNESS_BROKER_SECRET_CONTROL",
    "drogna_viewer": "HARNESS_BROKER_SECRET_VIEWER",
}

SECRET_NAMES: tuple[str, ...] = tuple(ROLE_SECRETS.values())

_RUNTIME_CONFIG_DIRNAME = "config"


def rendered_dir(destination: str, root: Path | None = None) -> Path:
    """Where the rendered configuration for a destination goes. Untracked."""
    base = root or repository_root()
    return base / "deploy" / ".runtime" / _RUNTIME_CONFIG_DIRNAME / destination


def _with_secret(url: str, values: dict[str, str], *, source: Path) -> str:
    """The same URL with the role's secret in it, or an error naming what is missing."""
    scheme, _, remainder = url.partition("://")
    if not remainder or "@" not in remainder:
        # No role named. Left exactly as it is: `common.json` and the two components that
        # are in no role block are deliberate, and tests/unit/test_broker_role_in_
        # configuration.py is what holds that list to a reason.
        return url
    role, _, location = remainder.partition("@")
    if ":" in role:
        raise ConfigurationError(
            f"{source}: the tracked broker URL already carries a secret. The tracked files "
            "carry the role and never the secret; this render is what adds it"
        )
    variable = ROLE_SECRETS.get(role)
    if variable is None:
        raise ConfigurationError(
            f"{source}: broker URL names the role {role!r}, which deploy/broker/acl does "
            f"not define. Known roles: {', '.join(sorted(ROLE_SECRETS))}"
        )
    secret = values.get(variable, "")
    if not secret:
        raise ConfigurationError(
            f"{source}: no value for {variable}, so the role {role!r} would connect with no "
            "password to a broker that refuses anonymous clients. Nothing is rendered: a "
            "component that cannot authenticate should fail here rather than at the broker"
        )
    return scheme + "://" + role + ":" + secret + "@" + location


def render_destination(destination: str, values: dict[str, str], root: Path | None = None) -> Path:
    """Write the rendered configuration tree and return the directory it was written to."""
    base = root or repository_root()
    source_dir = destination_dir(destination, base)
    target_dir = rendered_dir(destination, base)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True)

    for source in sorted(source_dir.iterdir()):
        if not source.is_file():
            continue
        target = target_dir / source.name
        if source.suffix != ".json":
            shutil.copy2(source, target)
            continue
        document: Any = json.loads(source.read_text(encoding="utf-8"))
        broker = document.get("broker") if isinstance(document, dict) else None
        if isinstance(broker, dict) and isinstance(broker.get("url"), str):
            broker["url"] = _with_secret(broker["url"], values, source=source)
        target.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        target.chmod(0o600)
    return target_dir


def broker_image(root: Path | None = None) -> str:
    """The broker image `deploy/compose.yaml` pins, read rather than repeated.

    The same build has to hash the passwords and check them, so the tool that writes the
    file is taken from the image that will read it. A second spelling of the image here
    would be a pin that could fall behind the one Compose uses.
    """
    base = root or repository_root()
    text = (base / "deploy" / "compose.yaml").read_text(encoding="utf-8")
    blocks = compose_document.service_blocks(text)
    for line in blocks.get("broker", "").splitlines():
        stripped = line.strip()
        if stripped.startswith("image:"):
            return stripped.split(":", 1)[1].strip()
    raise ConfigurationError(
        "deploy/compose.yaml declares no image for the broker service, so the tool that "
        "writes the password file cannot be taken from the image that reads it"
    )


def _passwd_command(target: Path, root: Path | None) -> tuple[list[str], Path]:
    """How to run `mosquitto_passwd`, and the path it will see the file at.

    The binary where a host has it, and the pinned broker image where it does not. Both are
    the same tool; neither invents a hashing scheme. `deploy/broker/README.md` documents the
    containerised form, and `scripts/up.sh` calls `require_docker` before any of this, so a
    bring-up always has one of the two — which is what makes this a fallback rather than a
    second mechanism.
    """
    tool = shutil.which("mosquitto_passwd")
    if tool is not None:
        return [tool], target
    runtime = shutil.which("docker")
    if runtime is None:
        raise ConfigurationError(
            "neither mosquitto_passwd nor docker is available, so the broker's password "
            "file cannot be produced by the tool that will read it. Install the mosquitto "
            "clients, or a container runtime. Nothing was written"
        )
    mount = f"{target.parent}:/work"
    return (
        [runtime, "run", "--rm", "-v", mount, broker_image(root), "mosquitto_passwd"],
        Path("/work") / target.name,
    )


def write_password_file(values: dict[str, str], root: Path | None = None) -> Path:
    """Produce the broker's password file from the same values the URLs were rendered from.

    `mosquitto_passwd` hashes them; nothing here invents a hashing scheme. It runs as a host
    binary where there is one and inside the pinned broker image where there is not, because
    a deploying host is not required to carry the mosquitto clients and is required to carry
    a container runtime.
    """
    base = root or repository_root()
    target = base / "deploy" / "broker" / "passwd"
    missing = sorted(name for name in SECRET_NAMES if not values.get(name))
    if missing:
        raise ConfigurationError(
            "no value for broker secret(s) " + ", ".join(missing) + "; nothing was written"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    command, seen_at = _passwd_command(target, root)
    target.write_text("", encoding="utf-8")
    for role, variable in ROLE_SECRETS.items():
        result = subprocess.run(
            [*command, "-b", str(seen_at), role, values[variable]],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise ConfigurationError(
                f"mosquitto_passwd refused the entry for {role}: "
                f"{result.stderr.strip() or result.stdout.strip()}"
            )
    _restrict(target, command)
    return target


def _restrict(target: Path, command: list[str]) -> None:
    """Make the credential file readable by its owner alone, from wherever it is reachable.

    `deploy/broker/README.md` records the trap this avoids, and it is a real one: the
    containerised tool writes as root, so a deploying user who is not root then cannot
    change the mode of a file they do not own and the attempt fails with `Operation not
    permitted`. Where that happens the mode is set from inside the container instead, which
    is the form the README documents.
    """
    try:
        target.chmod(0o600)
        return
    except PermissionError:
        pass
    if command[0].endswith("docker"):
        runner = [*command[:-1], "chmod", "0600", str(Path("/work") / target.name)]
        result = subprocess.run(runner, capture_output=True, text=True, check=False)
        if result.returncode == 0:
            return
        detail = result.stderr.strip() or result.stdout.strip()
    else:
        detail = "no container runtime was used, so there is no second way to set the mode"
    raise ConfigurationError(
        f"the broker password file was written but its mode could not be restricted: "
        f"{detail}. A world-readable credential file is not left in place silently"
    )


def main(argv: list[str] | None = None) -> int:
    """Render one destination's configuration and the broker's password file."""

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination")
    arguments = parser.parse_args(argv)

    values = {name: os.environ.get(name, "") for name in SECRET_NAMES}
    try:
        rendered = render_destination(arguments.destination, values)
        password_file = write_password_file(values)
    except ConfigurationError as failure:
        print(str(failure), file=sys.stderr)
        return 2
    print(rendered)
    print(password_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
