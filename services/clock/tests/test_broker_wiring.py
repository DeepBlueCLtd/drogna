"""The clock connects to the broker its configuration names, and lights a box in the shell.

Until this feature the clock took an injected publisher and nothing supplied one, so the
answer to "what does a running stack look like?" was a shell with nothing lit and a capture
pair whose liveness assertion, in ``scripts/capture/README.md``'s own words, "has never had
a lit component to lose". The three states the entry point can start in are all asserted
here, because collapsing any two of them is how that happened.

The broker is a real one, started from ``deploy/broker/mosquitto.conf`` and
``deploy/broker/acl``. Nothing here is mocked: the clock authenticates as a real role, the
tracked access control list decides whether it may publish on ``ctl/``, and the heartbeat is
read back by a separate subscriber that is refused permission to publish anything at all.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import local_broker as lb
import pytest
from harness_clock.__main__ import main
from harness_core.clock import CLOCK_TOPIC
from harness_core.heartbeat import HEARTBEAT_TOPIC

COMPONENT = "clock"


def _configured(tmp_path: Path, broker: lb.LocalBroker | None) -> dict[str, str]:
    document = lb.component_configuration(COMPONENT, tmp_path, broker=broker)
    document["clock_service"]["bind"] = {"host": "127.0.0.1", "port": lb.free_port()}
    return lb.written(tmp_path, document, name=COMPONENT)


@pytest.fixture
def broker(tmp_path: Path) -> Iterator[lb.LocalBroker]:
    yield from lb.start_broker(tmp_path)


@lb.skip_without_broker()
def test_the_clock_publishes_to_the_broker_its_configuration_names(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """Nobody injects a publisher, so the component builds one — and the shell lights up."""
    with lb.Subscriber(broker, topic="ctl/#") as watcher:
        stderr = io.StringIO()
        assert main(env=_configured(tmp_path, broker), ticks=2, stderr=stderr) == 0
        collected = watcher.wait_for(2)

    assert COMPONENT in collected.components(HEARTBEAT_TOPIC)
    assert collected.on(CLOCK_TOPIC), "the clock published no time for anything to follow"
    assert "nothing lights up" not in stderr.getvalue()


@lb.skip_without_broker()
def test_the_heartbeat_that_arrives_is_the_one_the_schema_describes(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """What lights a box in the client is a message, and it has to be a valid one."""
    from harness_core.config import validate_document
    from harness_core.schemas import schema

    with lb.Subscriber(broker, topic=HEARTBEAT_TOPIC) as watcher:
        assert main(env=_configured(tmp_path, broker), ticks=2, stderr=io.StringIO()) == 0
        collected = watcher.wait_for(1)

    heartbeats = collected.on(HEARTBEAT_TOPIC)
    assert heartbeats
    for beat in heartbeats:
        validate_document(beat, schema("heartbeat.schema.json"), source=HEARTBEAT_TOPIC)
        assert beat["component"] == COMPONENT


def test_a_configuration_naming_no_broker_publishes_nothing_and_says_so(tmp_path: Path) -> None:
    """Constitution VII: no stub, no demo mode. Nothing lights up, which is true."""
    stderr = io.StringIO()
    assert main(env=_configured(tmp_path, None), ticks=1, stderr=stderr) == 0
    assert "nothing lights up" in stderr.getvalue()


def test_a_caller_that_supplies_no_publisher_still_means_publish_nothing(tmp_path: Path) -> None:
    """``publisher=None`` is a value, not an absence, and it has to keep meaning silence.

    The configuration here names a broker, and a reachable one. Passing ``None`` still
    publishes nothing and attempts no connection: the caller said what it wanted.
    """
    stderr = io.StringIO()
    assert main(env=_configured(tmp_path, None), publisher=None, ticks=1, stderr=stderr) == 0
    assert "nothing lights up" in stderr.getvalue()


def test_a_broker_that_is_named_and_unreachable_is_reported_and_the_clock_still_runs(
    tmp_path: Path,
) -> None:
    """The third state, and the one that is neither of the other two.

    A port nothing is listening on, so the connection fails as it would live. The failure is
    reported in full — not swallowed, and not confused with having no broker configured —
    and the clock still serves time, because a broker that is slow to come up should not be
    a clock that refused to start.
    """
    document = lb.component_configuration(COMPONENT, tmp_path, broker=None)
    document["broker"] = {
        "url": f"mqtt://{lb.CONTROL_ROLE}:secret@127.0.0.1:{lb.free_port()}",
        "client_id": COMPONENT,
        "keepalive_seconds": 30,
    }
    document["clock_service"]["bind"] = {"host": "127.0.0.1", "port": lb.free_port()}

    stderr = io.StringIO()
    code = main(env=lb.written(tmp_path, document, name=COMPONENT), ticks=1, stderr=stderr)

    assert code == 0
    report = stderr.getvalue()
    assert "the broker is not reachable" in report
    assert "greyed out in the client rather than falsely lit" in report
