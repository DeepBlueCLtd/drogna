"""The deployment's own credential path, exercised end to end against a real broker.

ADR-0016 recorded that no component could authenticate to the broker it was configured for:
`allow_anonymous false`, and every tracked broker URL naming neither a role nor a secret.
The role went into the tracked files; the secret has to come from somewhere at deploy time,
and `deploy/lib/render_credentials.py` is what produces it.

What this file asserts is the property that record said could not be had here: that the
configuration a container reads, rendered by the real renderer, authenticates against a
broker started from this repository's own `mosquitto.conf`, `acl` and a password file
written by the same renderer from the same values.

The tests that existed before this one all supplied their own credentials. That is why the
gap survived: they exercised a correctly credentialled broker and never the deployment's
ability to produce one. A broker fixture that writes its own password file can never fail
the way the deployment failed.

Container-backed in spirit and not in fact. It needs `mosquitto` and `mosquitto_passwd` on
PATH and skips loudly without them, so what skips here runs in CI (CLAUDE.md).
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "deploy" / "lib"))
sys.path.insert(0, str(REPO_ROOT / "tests" / "support"))

import local_broker as lb  # noqa: E402
import render_credentials  # noqa: E402
from destination import ConfigurationError  # noqa: E402

# Fixed rather than drawn: Constitution II, and a test whose credentials differ per run
# cannot be compared with the run before it. Derived from SECRET_NAMES rather than
# listed, because a role added to the access control list and forgotten here would make
# every test in this file fail on the renderer's refusal rather than on its subject —
# which is exactly what happened when the query layer gained a role.
VALUES = {name: f"secret-for-{name.lower()}" for name in render_credentials.SECRET_NAMES}


def _rendered(tmp_path: Path) -> Path:
    """Render `config/local/` into a scratch root using the deployment's own renderer."""
    root = tmp_path / "repo"
    (root / "config").mkdir(parents=True)
    (root / "deploy" / "broker").mkdir(parents=True)
    for name in ("local",):
        target = root / "config" / name
        target.mkdir()
        for source in (REPO_ROOT / "config" / name).iterdir():
            if source.is_file():
                (target / source.name).write_bytes(source.read_bytes())
    return root


@pytest.fixture()
def scratch(tmp_path: Path) -> Path:
    return _rendered(tmp_path)


def test_the_render_puts_the_role_secret_into_the_url(scratch: Path) -> None:
    directory = render_credentials.render_destination("local", VALUES, scratch)
    document = json.loads((directory / "clock.json").read_text(encoding="utf-8"))
    control = VALUES[render_credentials.ROLE_SECRETS["drogna_control"]]
    assert document["broker"]["url"] == f"mqtt://drogna_control:{control}@broker:1883"
    sensors = json.loads((directory / "sensors.json").read_text(encoding="utf-8"))
    sensor = VALUES[render_credentials.ROLE_SECRETS["drogna_sensor"]]
    assert sensors["broker"]["url"] == f"mqtt://drogna_sensor:{sensor}@broker:1883"


def test_nothing_but_the_broker_url_changes(scratch: Path) -> None:
    """A render that altered anything else would make the running stack unreviewed."""
    directory = render_credentials.render_destination("local", VALUES, scratch)
    for rendered in sorted(directory.glob("*.json")):
        tracked = json.loads(
            (REPO_ROOT / "config" / "local" / rendered.name).read_text(encoding="utf-8")
        )
        produced = json.loads(rendered.read_text(encoding="utf-8"))
        if isinstance(tracked.get("broker"), dict):
            tracked["broker"] = dict(tracked["broker"])
            tracked["broker"].pop("url", None)
            produced["broker"] = dict(produced["broker"])
            produced["broker"].pop("url", None)
        assert produced == tracked, f"{rendered.name} differs beyond its broker URL"


def test_a_role_with_no_secret_stops_the_render(scratch: Path) -> None:
    """The failure this path exists to prevent must not be reachable by omission."""
    incomplete = dict(VALUES)
    incomplete["HARNESS_BROKER_SECRET_CONTROL"] = ""
    with pytest.raises(ConfigurationError) as raised:
        render_credentials.render_destination("local", incomplete, scratch)
    message = str(raised.value)
    assert "HARNESS_BROKER_SECRET_CONTROL" in message
    assert "drogna_control" in message


def test_an_unknown_role_stops_the_render(scratch: Path) -> None:
    path = scratch / "config" / "local" / "clock.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["broker"]["url"] = "mqtt://drogna_admin@broker:1883"
    path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    with pytest.raises(ConfigurationError) as raised:
        render_credentials.render_destination("local", VALUES, scratch)
    assert "drogna_admin" in str(raised.value)


def test_a_tracked_url_carrying_a_secret_stops_the_render(scratch: Path) -> None:
    path = scratch / "config" / "local" / "clock.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["broker"]["url"] = "mqtt://drogna_control:already-here@broker:1883"
    path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    with pytest.raises(ConfigurationError) as raised:
        render_credentials.render_destination("local", VALUES, scratch)
    assert "already carries a secret" in str(raised.value)


# --- against a running broker ---------------------------------------------------------


def _connect(port: int, username: str | None, password: str | None) -> Any:
    import paho.mqtt.client as mqtt

    outcome: dict[str, Any] = {}
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="credentialprobe")
    if username is not None:
        client.username_pw_set(username, password)
    client.on_connect = lambda c, u, f, rc, p=None: outcome.setdefault("reason", rc)
    client.connect("127.0.0.1", port, 30)
    client.loop_start()
    deadline = time.monotonic() + 10.0  # harness:allow-wallclock test setup; awaiting a socket
    while "reason" not in outcome and time.monotonic() < deadline:
        time.sleep(0.05)
    client.loop_stop()
    return outcome.get("reason")


@lb.skip_without_broker()
def test_a_component_authenticates_with_what_the_render_produced(scratch: Path) -> None:
    """The whole point: rendered configuration in, authenticated connection out.

    Both halves of the credential come from `render_credentials` and from the same four values —
    the URL the component reads, and the password file the broker reads. Nothing in this
    test writes a credential by hand, which is exactly what the tests that missed the gap
    did.
    """
    from harness_core.broker import BrokerEndpoint

    directory = render_credentials.render_destination("local", VALUES, scratch)
    password_file = render_credentials.write_password_file(VALUES, scratch)
    assert password_file.is_file()

    port = lb.free_port()
    broker_dir = scratch / "brokerconf"
    broker_dir.mkdir()
    configuration = (REPO_ROOT / "deploy" / "broker" / "mosquitto.conf").read_text(encoding="utf-8")
    configuration = configuration.replace("listener 1883", f"listener {port}")
    configuration = "\n".join(
        line
        for line in configuration.splitlines()
        if not line.startswith(("listener 9001", "protocol websockets"))
    )
    configuration = configuration.replace(
        "persistence_location /mosquitto/data/", f"persistence_location {scratch}/"
    )
    configuration = configuration.replace(
        "password_file /mosquitto/config/passwd", f"password_file {password_file}"
    )
    configuration = configuration.replace(
        "acl_file /mosquitto/config/acl",
        f"acl_file {REPO_ROOT / 'deploy' / 'broker' / 'acl'}",
    )
    configuration += "\nuser root\n"
    written = broker_dir / "mosquitto.conf"
    written.write_text(configuration, encoding="utf-8")

    log = (broker_dir / "broker.log").open("w")
    process = subprocess.Popen([lb._which("mosquitto"), "-c", str(written)], stdout=log, stderr=log)
    try:
        lb._wait_until(lambda: lb._listening(port), what=f"the broker on {port}")

        section = dict(json.loads((directory / "clock.json").read_text())["broker"])
        section["url"] = section["url"].replace("@broker:1883", f"@127.0.0.1:{port}")
        endpoint = BrokerEndpoint.from_config(section)
        assert endpoint.username == "drogna_control"
        assert endpoint.password == VALUES[render_credentials.ROLE_SECRETS["drogna_control"]]

        assert str(_connect(port, endpoint.username, endpoint.password)) == "Success", (
            "the rendered credentials were refused; the URL and the password file are "
            "written from the same four values and must agree"
        )
        assert str(_connect(port, endpoint.username, "not-the-secret")) != "Success", (
            "a wrong secret was accepted, so this test proves nothing about the right one"
        )
        assert str(_connect(port, None, None)) != "Success", (
            "an anonymous client was accepted; allow_anonymous is false in the tracked "
            "configuration and this is the property the whole credential path rests on"
        )
    finally:
        process.terminate()
        process.wait(timeout=10)
        log.close()


def test_the_password_tool_falls_back_to_the_pinned_image(monkeypatch: Any) -> None:
    """CI has no mosquitto clients and does have a container runtime; both must work.

    The first version of this required `mosquitto_passwd` on PATH and failed five bring-up
    tests on the runner, which does not carry it. `deploy/broker/README.md` documents the
    containerised form and `scripts/up.sh` calls `require_docker` before any of this, so the
    fallback is always available where a bring-up happens.
    """
    seen: dict[str, str] = {}

    def fake_which(name: str) -> str | None:
        seen[name] = name
        return "/usr/bin/docker" if name == "docker" else None

    monkeypatch.setattr(render_credentials.shutil, "which", fake_which)
    command, seen_at = render_credentials._passwd_command(Path("/tmp/broker/passwd"), None)

    assert command[0].endswith("docker")
    assert "run" in command and "--rm" in command
    assert command[-1] == "mosquitto_passwd"
    assert str(seen_at) == "/work/passwd", "the container sees the file at its mounted path"
    pinned = render_credentials.broker_image()
    assert pinned in command, "the tool must come from the image that will read the file"
    assert "@sha256:" in pinned, "the broker image is pinned by digest and this reads that pin"


def test_no_runtime_and_no_binary_is_a_refusal(monkeypatch: Any) -> None:
    monkeypatch.setattr(render_credentials.shutil, "which", lambda name: None)
    with pytest.raises(ConfigurationError) as raised:
        render_credentials._passwd_command(Path("/tmp/broker/passwd"), None)
    assert "Nothing was written" in str(raised.value)


# --- the proxy's credential, the sibling gap ADR-0016 recorded -------------------------


def _verifies(entry: str, secret: str) -> bool:
    """Recompute the hash from the salt the file carries and compare. openssl's own check."""
    import subprocess as sp

    _, _, digest = entry.partition(":")
    salt = digest.split("$")[2]
    produced = sp.run(
        ["openssl", "passwd", "-apr1", "-salt", salt, secret],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return produced == digest.strip()


def test_the_proxy_credential_is_produced_and_verifies(scratch: Path) -> None:
    values = dict(VALUES)
    values[render_credentials.PROXY_SECRET] = "secret-for-the-reader"
    render_credentials.render_destination("local", values, scratch)
    written = render_credentials.write_proxy_credentials("local", values, scratch)

    entry = written.read_text(encoding="utf-8").strip()
    tracked = json.loads(
        (REPO_ROOT / "config" / "local" / "proxy.json").read_text(encoding="utf-8")
    )
    user = tracked["proxy"]["credentials"]["user"]
    assert entry.startswith(f"{user}:"), "the file must name the identity the configuration does"
    assert "$apr1$" in entry, "nginx is given an apr1 hash, not a plaintext secret"
    assert "secret-for-the-reader" not in entry, "the secret itself must not reach the file"
    assert _verifies(entry, "secret-for-the-reader"), (
        "the hash does not verify against the secret it was made from, so nginx would "
        "refuse every reader"
    )
    assert not _verifies(entry, "not-the-secret"), (
        "a wrong secret verified, so this test proves nothing about the right one"
    )
    assert written.stat().st_mode & 0o077 == 0, "a credential file is readable by its owner alone"


def test_no_proxy_secret_is_a_refusal(scratch: Path) -> None:
    """Absent, this file used to be missing silently and nginx answered 500 behind it."""
    values = dict(VALUES)
    values[render_credentials.PROXY_SECRET] = ""
    render_credentials.render_destination("local", values, scratch)
    with pytest.raises(ConfigurationError) as raised:
        render_credentials.write_proxy_credentials("local", values, scratch)
    assert render_credentials.PROXY_SECRET in str(raised.value)
