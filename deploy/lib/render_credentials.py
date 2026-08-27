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
import hashlib
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
    "write_proxy_credentials",
]

# The proxy's credential is not a broker role and has no access control list to take a name
# from, so the identity is declared per destination in proxy.credentials.user and the secret
# is generated beside the broker's.
PROXY_SECRET = "HARNESS_PROXY_SECRET"

# The roles `deploy/broker/acl` defines, and the environment variable carrying each one's
# secret. Adding a role means adding a block to the access control list and a line here,
# and nowhere else: deploy/env.template and deploy/lib/common.sh derive their names from
# this mapping rather than repeating it.
ROLE_SECRETS: dict[str, str] = {
    "drogna_sensor": "HARNESS_BROKER_SECRET_SENSOR",
    "drogna_ingest": "HARNESS_BROKER_SECRET_INGEST",
    "drogna_control": "HARNESS_BROKER_SECRET_CONTROL",
    "drogna_viewer": "HARNESS_BROKER_SECRET_VIEWER",
    "drogna_query": "HARNESS_BROKER_SECRET_QUERY",
}

SECRET_NAMES: tuple[str, ...] = (*ROLE_SECRETS.values(), PROXY_SECRET)

# The uid and gid mosquitto drops to inside the pinned broker image. The password file has
# to be owned by it, not merely restricted: the broker reads the file after dropping
# privileges, so a 0600 file owned by the deploying user is one the broker cannot open, and
# `allow_anonymous false` then stops it dead with exit 13.
#
# This was invisible on macOS for as long as it was only ever run there. A Docker Desktop
# bind mount does not enforce ownership - every file reads as root and every uid may open
# it - so the broker started locally and exited 13 in Linux CI, which is the divergence
# CLAUDE.md warns about in the other direction. `deploy/broker/README.md` asked for this
# chown from the beginning; only the chmod half was ever written.
BROKER_UID = 1883
BROKER_GID = 1883

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


def _written_by_another_path(destination: str, base: Path) -> set[str]:
    """Names this module puts in the rendered directory without a source file beside them.

    The sweep in `render_destination` removes what the destination no longer declares, and
    it decides that by comparing against `config/<destination>/`. The proxy's credential
    file has no counterpart there — it is produced from a secret, not copied from a tracked
    document — so without this it would be swept on every render after the first. It is
    named here from the same tracked field `write_proxy_credentials` reads, rather than
    written down twice: a literal here would go stale the day the file is renamed, and the
    failure would be a credential file deleted between two renders.
    """
    proxy = destination_dir(destination, base) / "proxy.json"
    if not proxy.is_file():
        return set()
    document = json.loads(proxy.read_text(encoding="utf-8"))
    declared = document.get("proxy", {}).get("credentials", {}).get("file")
    return {Path(str(declared)).name} if declared else set()


def render_destination(destination: str, values: dict[str, str], root: Path | None = None) -> Path:
    """Write the rendered configuration tree and return the directory it was written to."""
    base = root or repository_root()
    source_dir = destination_dir(destination, base)
    target_dir = rendered_dir(destination, base)
    # The directory is kept and its contents are swept, rather than the directory being
    # removed and remade. `deploy/compose.yaml` binds this path into every container as
    # /etc/drogna, and a bind mount resolves to an inode: removing the directory does not
    # empty the mount, it orphans it, and every container already running then sees an
    # empty /etc/drogna for the rest of its life. `scripts/up.sh` is required to converge,
    # so a render over a stack that is already up is ordinary and not an edge case — the
    # first bring-up worked and the second left the proxy answering 403 to a valid
    # credential, having no proxy.htpasswd to read, while all six containers reported
    # healthy. Same trap as write_password_file below, one directory up.
    target_dir.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()
    kept = _written_by_another_path(destination, base)

    for source in sorted(source_dir.iterdir()):
        if not source.is_file():
            continue
        target = target_dir / source.name
        written.add(source.name)
        # Unlinked before it is written, never truncated in place, for the reason
        # write_password_file records: a file this process has given away can still be
        # removed, because unlinking is a permission on the directory the deployer keeps,
        # and cannot be reopened for writing.
        target.unlink(missing_ok=True)
        if source.suffix != ".json":
            shutil.copy2(source, target)
            continue
        document: Any = json.loads(source.read_text(encoding="utf-8"))
        broker = document.get("broker") if isinstance(document, dict) else None
        if isinstance(broker, dict) and isinstance(broker.get("url"), str):
            broker["url"] = _with_secret(broker["url"], values, source=source)
        target.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
        target.chmod(0o600)

    # What the destination no longer declares must not stay mounted. Sweeping the contents
    # is the half of `rmtree` that was actually wanted; keeping the directory is the half
    # that was not. Credentials this module writes into the same directory by another path
    # are exempt, since they have no counterpart under config/<destination>/.
    for present in sorted(target_dir.iterdir()):
        if present.name in written or present.name in kept:
            continue
        if present.is_dir():
            shutil.rmtree(present)
        else:
            present.unlink()
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
    # Removed rather than truncated, and that is the whole of what makes a second bring-up
    # converge. The file this function last wrote belongs to uid 1883 with mode 0600, so the
    # deploying user cannot open it for writing — `PermissionError: [Errno 13]` on the very
    # next run, from the fix that made the first run work. Unlinking needs write permission
    # on the directory, which the deploying user has, and not on the file, which it does not.
    target.unlink(missing_ok=True)
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
    _restrict(target, command, root)
    return target


def _restrict(target: Path, command: list[str], root: Path | None = None) -> None:
    """Give the credential file the owner and the mode the broker needs to read it.

    Both halves matter and only one of them used to be here. `chmod 0600` without the
    matching `chown` produces a file the broker is refused by its own kernel - it reads the
    password file as `mosquitto`, not as root, and not as whoever deployed. That is exit 13
    with `Error: Unable to open pwfile`, and it is what Linux CI reported while macOS,
    whose bind mounts enforce neither owner nor mode, reported a healthy broker.

    Done inside the container wherever there is a container runtime, which is the form
    `deploy/broker/README.md` documents and the only form that works: the deploying user is
    not root, cannot give a file away, and cannot change the mode of a file the
    containerised tool wrote as root. The container is root and can do both.
    """
    # Both routes are tried, because a `docker` on PATH is not a daemon that answers and the
    # two failures are indistinguishable from here. A machine with the client installed and
    # nothing listening reported the client's own connection error as though the file could
    # not be secured at all, and stopped the render — where the host could have done the job
    # itself in one syscall.
    detail = ""
    runtime = shutil.which("docker")
    if runtime is not None:
        seen_at = str(Path("/work") / target.name)
        try:
            result = subprocess.run(
                [
                    runtime,
                    "run",
                    "--rm",
                    "-v",
                    f"{target.parent}:/work",
                    broker_image(root),
                    "sh",
                    "-c",
                    f"chown {BROKER_UID}:{BROKER_GID} {seen_at} && chmod 0600 {seen_at}",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                return
            detail = result.stderr.strip() or result.stdout.strip()
        except (OSError, ConfigurationError) as error:
            # No compose file to read the image pin out of, or the client could not be run.
            detail = str(error)

    # The host itself. Only root can hand a file to another user; anyone else gets the mode
    # right and the owner wrong, which is the failure this function exists to prevent, so it
    # is reported rather than left to the broker to discover.
    try:
        os.chown(target, BROKER_UID, BROKER_GID)
        target.chmod(0o600)
        return
    except OSError as error:
        detail = (
            f"{detail + '; and ' if detail else ''}{error}. Only root can give a file to "
            f"uid {BROKER_UID}, and no container runtime did it either"
        )
    raise ConfigurationError(
        f"the broker password file was written but could not be given the owner and mode "
        f"the broker needs: {detail}. A credential file the broker cannot read, or one "
        f"left world-readable, is not left in place silently"
    )


def write_proxy_credentials(
    destination: str, values: dict[str, str], root: Path | None = None
) -> Path:
    """Produce the file the proxy's `auth_basic_user_file` names, from tracked configuration.

    ADR-0016 recorded this as a sibling of the broker's credential gap and it failed worse.
    nginx does not resolve `auth_basic_user_file` when it loads its configuration, so a
    missing file did not stop the proxy: it started, reported healthy, and answered 500 to
    anything behind that location. A credential that is absent should be absent loudly.

    The identity comes from `proxy.credentials.user` and the location from
    `proxy.credentials.file`, both tracked, because neither is a secret. The secret comes
    from the environment and reaches this file alone.

    The hash is apr1, which nginx has always accepted, produced by `openssl` rather than by
    anything here: this module invents no hashing scheme, exactly as it invents none for the
    broker. The salt is derived from the secret rather than drawn, so that a second render
    of an unchanged secret produces an unchanged file — and since the secret is generated per
    installation, the salt still differs between installations, which is what a salt is for.
    """
    base = root or repository_root()
    document = json.loads(
        (destination_dir(destination, base) / "proxy.json").read_text(encoding="utf-8")
    )
    credentials = document["proxy"]["credentials"]
    user = str(credentials["user"])
    # The configuration names a container path under the directory Compose mounts the
    # rendered configuration at, so the file belongs in the rendered tree beside the
    # documents it sits with. Written after render_destination, which clears that directory.
    target = rendered_dir(destination, base) / Path(str(credentials["file"])).name
    secret = values.get(PROXY_SECRET, "")
    if not secret:
        raise ConfigurationError(
            f"no value for {PROXY_SECRET}, so the proxy would start with no credential file "
            "and answer 500 behind its authenticated location rather than refusing to start"
        )
    tool = shutil.which("openssl")
    if tool is None:
        raise ConfigurationError(
            "openssl is not on PATH, so the proxy credential cannot be hashed. Nothing was "
            "written: a missing credential file is quieter than a bad one and both are wrong"
        )
    salt = hashlib.sha256(f"{user}:{secret}".encode()).hexdigest()[:8]
    result = subprocess.run(
        [tool, "passwd", "-apr1", "-salt", salt, secret],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ConfigurationError(
            f"openssl refused to hash the proxy credential: "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f"{user}:{result.stdout.strip()}\n", encoding="utf-8")
    target.chmod(0o600)
    return target


def main(argv: list[str] | None = None) -> int:
    """Render one destination's configuration and the broker's password file."""

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination", nargs="?")
    parser.add_argument(
        "--secret-names",
        action="store_true",
        help=(
            "print the environment variable carrying each role's secret, one per line, so "
            "that the shell that generates them does not repeat the list"
        ),
    )
    arguments = parser.parse_args(argv)
    if arguments.secret_names:
        for name in SECRET_NAMES:
            print(name)
        return 0
    if arguments.destination is None:
        parser.error("a destination is required unless --secret-names is given")

    values = {name: os.environ.get(name, "") for name in SECRET_NAMES}
    try:
        rendered = render_destination(arguments.destination, values)
        password_file = write_password_file(values)
        proxy_file = write_proxy_credentials(arguments.destination, values)
    except ConfigurationError as failure:
        print(str(failure), file=sys.stderr)
        return 2
    print(rendered)
    print(password_file)
    print(proxy_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
