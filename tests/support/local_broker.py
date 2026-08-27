"""A real broker, from the tracked configuration, on a free port and with no daemon.

The container-backed scaffolding in :mod:`observation_path` runs the pinned Mosquitto image
and is the right thing for the access-control tests: an access control list is tested by
being refused, and that wants the image a destination actually runs. It needs a container
daemon, and this container has none, so everything built on it skips here and runs only in
continuous integration.

The question these helpers answer is narrower and needed everywhere: *does this component,
given a configuration that names a broker, actually connect to it and publish?* That is
answered by any conforming broker, and a ``mosquitto`` binary on the path is one. So this
starts one directly — no daemon, no image, no network — from the same
``deploy/broker/mosquitto.conf`` and ``deploy/broker/acl`` a destination mounts.

Four things in the copied configuration are changed and nothing else is:

* ``listener 1883`` becomes a free port, because two tests running at once cannot both have
  1883 and because the port a broker is published on is the one thing ``deploy/broker/
  README.md`` already says differs per destination;
* the WebSockets listener on 9001 is dropped, because it is ADR-0008's browser path rather
  than anything a component uses, and a Mosquitto built without WebSockets support refuses
  to start on it — that listener is tested against the pinned image in
  ``tests/integration/test_topic_isolation.py``;
* ``persistence_location`` becomes a scratch directory, since the tracked value is a
  container path;
* a ``user`` line is appended naming whoever is running the tests. Mosquitto 2.0 started as
  root drops to its own packaged user, which cannot traverse a private temporary directory
  and so cannot read the password file — in the deployment the image settles this, and here
  nothing does.

The roles, the access control lists and ``allow_anonymous false`` are used verbatim, which
is the point: a component that publishes here has authenticated as a real role and been
allowed by the real list. Credentials are generated per test run with the broker's own
``mosquitto_passwd`` and thrown away, exactly as :mod:`observation_path` does, because no
value of one appears in a tracked file.

Where the binary is absent these tests skip, loudly and with the reason. They never fail
for want of it and — the failure this repository actually cares about — they never quietly
pass without it.

Host time appears here, in deciding when the broker is listening and how long to wait for a
message. That is test harness setup, which Constitution I permits; nothing here is an
operational path and no value derived from it reaches a component.
"""

from __future__ import annotations

import json
import os
import pwd
import shutil
import socket
import subprocess
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BROKER_CONFIG = REPO_ROOT / "deploy" / "broker"

# The roles the tracked access control list names. Secrets are this test run's and nothing
# else's; the deployment generates its own and they appear in no tracked file.
ROLES: dict[str, str] = {
    "drogna_sensor": "sensor-secret",
    "drogna_ingest": "ingest-secret",
    "drogna_control": "control-secret",
    "drogna_viewer": "viewer-secret",
}

# Every component wired in this feature publishes on the control namespace, which is the
# `drogna_control` block in `deploy/broker/acl`. The sensors publish under obs/ and are the
# one component with a different role.
CONTROL_ROLE = "drogna_control"
SENSOR_ROLE = "drogna_sensor"
VIEWER_ROLE = "drogna_viewer"

_READY_TIMEOUT = 20.0
_POLL_SECONDS = 0.05


@dataclass(frozen=True)
class BrokerSupport:
    """Whether this machine can run these tests, and if not, exactly what is missing."""

    usable: bool
    reason: str = ""


@cache
def broker_support() -> BrokerSupport:
    """Probe once for the two binaries these helpers need, and name whichever is absent."""
    for binary in ("mosquitto", "mosquitto_passwd"):
        if _which(binary) is None:
            return BrokerSupport(
                False,
                f"no {binary} on the path; the broker in these tests is a real one, started "
                "from deploy/broker/ rather than mocked",
            )
    try:
        from paho.mqtt import client as _  # noqa: F401
    except ImportError:  # pragma: no cover - the workspace installs it
        return BrokerSupport(False, "no MQTT client is installed, so nothing can subscribe")
    return BrokerSupport(True)


def _which(binary: str) -> str | None:
    """``mosquitto`` installs into sbin, which is not always on a non-root PATH."""
    found = shutil.which(binary)
    if found is not None:
        return found
    for directory in ("/usr/sbin", "/usr/local/sbin", "/sbin"):
        candidate = Path(directory) / binary
        if candidate.is_file():
            return str(candidate)
    return None


def skip_without_broker() -> Any:
    """The module-level mark these tests carry: skip with the reason, never fail, never pass."""
    support = broker_support()
    return pytest.mark.skipif(
        not support.usable, reason=support.reason or "a broker binary is available"
    )


def free_port() -> int:
    """A loopback port nothing is listening on: a free one to bind, a closed one to fail on."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


_free_port = free_port


def _listening(port: int) -> bool:
    with socket.socket() as probe:
        probe.settimeout(_POLL_SECONDS)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def _wait_until(predicate: Any, *, what: str, timeout: float = _READY_TIMEOUT) -> None:
    # harness:allow-wallclock test harness setup; deciding when the broker is listening
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(_POLL_SECONDS)
    raise RuntimeError(f"{what} did not happen within {timeout} seconds")


@dataclass(frozen=True)
class LocalBroker:
    """A running broker, loaded with the configuration this repository ships."""

    port: int
    log_path: Path
    process: subprocess.Popen

    def url(self, role: str = CONTROL_ROLE) -> str:
        """The broker URL for one role, credentials and all, as configuration carries it."""
        return f"mqtt://{role}:{ROLES[role]}@127.0.0.1:{self.port}"

    def log(self) -> str:
        return self.log_path.read_text(encoding="utf-8", errors="replace")


def _prepare(directory: Path, port: int) -> Path:
    """Copy the tracked configuration and rewrite only the three container-bound values."""
    directory.mkdir(parents=True, exist_ok=True)
    shutil.copy(BROKER_CONFIG / "acl", directory / "acl")
    # Mosquitto warns about a world-readable access control list and will refuse one
    # in a future version. The tracked file is 0644 for the container to read; here
    # the broker runs as this user, so it can be tighter.
    (directory / "acl").chmod(0o600)

    data = directory / "data"
    data.mkdir(exist_ok=True)

    lines: list[str] = []
    skipping_websockets = False
    for line in (BROKER_CONFIG / "mosquitto.conf").read_text(encoding="utf-8").splitlines():
        if line.strip() == "listener 9001":
            skipping_websockets = True
            lines.append("# listener 9001 omitted: ADR-0008's browser path, not a component's")
            continue
        if skipping_websockets and line.strip() == "protocol websockets":
            skipping_websockets = False
            continue
        if line.strip() == "listener 1883":
            lines.append(f"listener {port}")
            continue
        if line.startswith("persistence_location"):
            lines.append(f"persistence_location {data}/")
            continue
        if line.startswith("password_file"):
            lines.append(f"password_file {directory / 'passwd'}")
            continue
        if line.startswith("acl_file"):
            lines.append(f"acl_file {directory / 'acl'}")
            continue
        lines.append(line)

    lines.append("")
    lines.append("# Appended by the tests: see this module's docstring. Started as root,")
    lines.append("# mosquitto drops to its own user and cannot read a file under a private")
    lines.append(
        "# temporary directory; the deployed image settles this and a bare binary does not."
    )
    lines.append(f"user {pwd.getpwuid(os.getuid()).pw_name}")

    configuration = directory / "mosquitto.conf"
    configuration.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return configuration


def _write_credentials(directory: Path) -> None:
    """Produce the password file the way the deployment does: with the broker's own tool."""
    passwd = directory / "passwd"
    tool = _which("mosquitto_passwd")
    assert tool is not None
    first = True
    for role, secret in ROLES.items():
        flags = ["-c", "-b"] if first else ["-b"]
        result = subprocess.run([tool, *flags, str(passwd), role, secret], capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"mosquitto_passwd failed for {role}: "
                f"{result.stderr.decode('utf-8', errors='replace')}"
            )
        first = False
    passwd.chmod(0o600)


def start_broker(tmp_path: Path) -> Iterator[LocalBroker]:
    """Start a broker from the tracked configuration, and stop it afterwards."""
    support = broker_support()
    if not support.usable:
        pytest.skip(support.reason)

    directory = tmp_path / "broker"
    port = _free_port()
    configuration = _prepare(directory, port)
    _write_credentials(directory)

    log_path = directory / "mosquitto.log"
    binary = _which("mosquitto")
    assert binary is not None
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [binary, "-c", str(configuration)], stdout=log, stderr=subprocess.STDOUT
        )
        try:
            _wait_until(
                lambda: _listening(port) or process.poll() is not None,
                what=f"the broker listening on {port}",
            )
            if process.poll() is not None:
                raise RuntimeError(
                    "the broker exited before it listened: "
                    f"{log_path.read_text(encoding='utf-8', errors='replace')}"
                )
            yield LocalBroker(port=port, log_path=log_path, process=process)
        finally:
            process.terminate()
            process.wait(timeout=10)


@dataclass
class Collected:
    """Everything a subscriber has been delivered, in arrival order."""

    messages: list[tuple[str, bytes]] = field(default_factory=list)

    def on(self, topic: str) -> list[dict[str, Any]]:
        return [json.loads(payload) for name, payload in self.messages if name == topic]

    def components(self, topic: str) -> set[str]:
        return {message.get("component", "") for message in self.on(topic)}


class Subscriber:
    """A real subscriber on a real broker, for asserting what a component actually published.

    The viewer role reads the whole control namespace and can publish nowhere at all
    (``deploy/broker/acl``, ADR-0008), which is exactly what a test wants to be: it can see
    everything under ``ctl/`` and cannot itself put anything there, so nothing it observes
    could have come from it.
    """

    def __init__(self, broker: LocalBroker, *, topic: str, role: str = VIEWER_ROLE) -> None:
        self._broker = broker
        self._topic = topic
        self._role = role
        self._client: Any = None
        self.collected = Collected()

    def __enter__(self) -> Subscriber:
        from paho.mqtt import client as mqtt

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
        client.username_pw_set(self._role, ROLES[self._role])
        subscribed: list[int] = []

        def on_message(_client: Any, _userdata: Any, message: Any) -> None:
            self.collected.messages.append((message.topic, message.payload))

        def on_subscribe(*_args: Any, **_kwargs: Any) -> None:
            subscribed.append(1)

        client.on_message = on_message
        client.on_subscribe = on_subscribe
        client.connect("127.0.0.1", self._broker.port, keepalive=30)
        client.loop_start()
        client.subscribe(self._topic, qos=1)
        # Subscribed before the component runs, or a fast component publishes into nothing
        # and the test reads an empty list as "it published nothing".
        _wait_until(lambda: bool(subscribed), what=f"the subscription to {self._topic}")
        self._client = client
        return self

    def __exit__(self, *_exception: Any) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def wait_for(self, count: int = 1, *, timeout: float = 10.0) -> Collected:
        """Wait until at least ``count`` messages have arrived, then return them."""
        _wait_until(
            lambda: len(self.collected.messages) >= count,
            what=f"{count} message(s) on {self._topic}",
            timeout=timeout,
        )
        return self.collected


CONFIGS = REPO_ROOT / "config"


def _redirect_directories(node: Any, tmp_path: Path) -> Any:
    """Send every absolute directory the document names under ``tmp_path``.

    Only keys whose name ends in ``directory`` are touched, so a route or a URL that also
    begins with a slash is left exactly as the destination ships it. The point is that a
    test writes into its own scratch directory while every other value in the document is
    the real one — a test that rewrote the configuration wholesale would be checking a shape
    the deployed component does not carry.
    """
    if isinstance(node, dict):
        redirected: dict[str, Any] = {}
        for key, value in node.items():
            if key.endswith("directory") and isinstance(value, str) and value.startswith("/"):
                redirected[key] = str(tmp_path / value.lstrip("/"))
            else:
                redirected[key] = _redirect_directories(value, tmp_path)
        return redirected
    if isinstance(node, list):
        return [_redirect_directories(item, tmp_path) for item in node]
    return node


def component_configuration(
    component: str,
    tmp_path: Path,
    *,
    broker: LocalBroker | None = None,
    role: str = CONTROL_ROLE,
) -> dict[str, Any]:
    """The tracked local configuration for one component, ready for a test to run it from.

    Read from ``config/local/`` rather than written out here, so a test cannot pass against
    a shape the deployed component does not carry. Two things change and no others: every
    absolute directory moves under ``tmp_path``, and the broker URL gains this test's host,
    port and credentials — or the whole ``broker`` section is dropped where ``broker`` is
    ``None``, which is the configuration Constitution VII's silent case describes.

    Dropping the section is deliberately not the same as pointing it at a closed port. Those
    are two different states and the components tell them apart, so the tests do too.
    """
    document = json.loads((CONFIGS / "local" / f"{component}.json").read_text(encoding="utf-8"))
    document = _redirect_directories(document, tmp_path)
    if broker is None:
        document.pop("broker", None)
    else:
        document["broker"] = {**document["broker"], "url": broker.url(role)}
    return document


def written(tmp_path: Path, document: dict[str, Any], *, name: str = "component") -> dict[str, str]:
    """Write a configuration and return the environment that names it, as a supervisor would."""
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {"HARNESS_CONFIG": str(path)}


def observed(
    broker: LocalBroker,
    run: Any,
    *,
    topic: str = "ctl/#",
    count: int = 1,
) -> Collected:
    """Run a component's entry point with a subscriber already listening, and return what arrived.

    The subscription is established before the component starts, because a component that
    publishes and exits faster than a subscriber can connect would leave the test reading an
    empty list and calling it "published nothing".
    """
    with Subscriber(broker, topic=topic) as watcher:
        assert run() == 0
        return watcher.wait_for(count)


def unreachable_broker(component: str) -> dict[str, Any]:
    """A broker section naming a port nothing listens on: the connection fails as it would live."""
    return {
        "url": f"mqtt://{CONTROL_ROLE}:secret@127.0.0.1:{free_port()}",
        "client_id": component,
        "keepalive_seconds": 30,
    }
