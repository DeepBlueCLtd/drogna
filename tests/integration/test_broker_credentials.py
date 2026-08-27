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
# cannot be compared with the run before it.
VALUES = {
    "HARNESS_BROKER_SECRET_SENSOR": "secret-for-the-sensor-role",
    "HARNESS_BROKER_SECRET_INGEST": "secret-for-the-ingest-role",
    "HARNESS_BROKER_SECRET_CONTROL": "secret-for-the-control-role",
    "HARNESS_BROKER_SECRET_VIEWER": "secret-for-the-viewer-role",
}


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
    assert document["broker"]["url"] == (
        "mqtt://drogna_control:secret-for-the-control-role@broker:1883"
    )
    sensors = json.loads((directory / "sensors.json").read_text(encoding="utf-8"))
    assert sensors["broker"]["url"].startswith("mqtt://drogna_sensor:secret-for-the-sensor-")


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
        assert endpoint.password == VALUES["HARNESS_BROKER_SECRET_CONTROL"]

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
