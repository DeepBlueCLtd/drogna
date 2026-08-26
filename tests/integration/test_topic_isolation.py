"""The broker refuses what the access control lists say it must refuse.

This is FR-14 and C-03's named failure mode, tested where it is enforced. Every assertion
here goes through a running Mosquitto loaded with ``deploy/broker/mosquitto.conf`` and
``deploy/broker/acl``: a forbidden publish is attempted and the refusal observed, rather
than a configuration file being read back and found to contain a string. A test of the
second kind passes just as happily against a broker that is not enforcing anything, which
is exactly the failure this file exists to catch.

One mechanical detail decides how these tests are written. Mosquitto grants every
subscription and filters at delivery, so a denied subscription is not visible in the
SUBACK; it is visible in the fact that nothing arrives. So the subscription assertions are
delivery assertions: an authorised publisher sends, and the subscriber under test either
receives it or does not.
"""

from __future__ import annotations

import socket
from collections.abc import Iterator
from pathlib import Path

import observation_path as support
import pytest

pytestmark = pytest.mark.skipif(
    not support.docker_available(),
    reason="no container runtime is reachable: the broker in these tests is a real one",
)

CLOCK_SAMPLE = '{"run_id": "run-0001", "tick": 1, "sim_time": "2026-09-01T00:00:00.000000Z"}'


@pytest.fixture(scope="module")
def broker(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Broker]:
    yield from support.start_broker(tmp_path_factory.mktemp("broker"))


@pytest.fixture(scope="module")
def control_broker(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Broker]:
    """The second broker of the documented fallback, from its own tracked configuration."""
    yield from support.start_broker(
        tmp_path_factory.mktemp("control-broker"),
        configuration=support.BROKER_CONFIG / "two-broker",
    )


def received(broker: support.Broker, role: str, topic: str, publish: tuple[str, str, str]) -> str:
    """What a subscriber sees while an authorised publisher sends one message."""
    subscriber = broker.background_subscriber(role, topic, seconds=4)
    try:
        support._wait_until(
            lambda: (
                subscriber
                in support._run(
                    ["docker", "ps", "--format", "{{.Names}}"], check=False
                ).stdout.decode("utf-8")
            ),
            what="the subscriber",
        )
        publisher_role, publish_topic, message = publish
        broker.publish(publisher_role, publish_topic, message)
        support._run(["docker", "wait", subscriber], check=False)
        return support._run(["docker", "logs", subscriber], check=False).stdout.decode("utf-8")
    finally:
        support._run(["docker", "rm", "-f", subscriber], check=False)


# Sensors -----------------------------------------------------------------------------


def test_a_sensor_may_publish_on_the_observation_branch(broker: support.Broker) -> None:
    result = broker.publish("drogna_sensor", "obs/platform-a/ds-temperature", "{}")
    assert b"Not authorized" not in result.stderr


def test_a_sensor_may_not_publish_a_control_event(broker: support.Broker) -> None:
    """A sensor that could publish here could forge a heartbeat or a run request."""
    for topic in ("ctl/heartbeat", "ctl/telemetry", "ctl/run-request", "ctl/clock", "ctl/plan"):
        result = broker.publish("drogna_sensor", topic, "{}")
        assert b"Not authorized" in result.stderr, f"{topic} was not refused"


def test_a_sensor_may_not_publish_outside_the_two_namespaces(broker: support.Broker) -> None:
    result = broker.publish("drogna_sensor", "anything/else", "{}")
    assert b"Not authorized" in result.stderr


def test_a_sensor_subscribed_to_the_control_branch_receives_no_control_traffic(
    broker: support.Broker,
) -> None:
    """The substance of FR-14's subscription half, asserted at delivery."""
    log = received(
        broker,
        "drogna_sensor",
        "ctl/#",
        ("drogna_control", "ctl/heartbeat", "a-heartbeat"),
    )
    assert "a-heartbeat" not in log


def test_a_sensor_receives_the_clock_and_only_the_clock(broker: support.Broker) -> None:
    """The one control topic a sensor is given, argued for in deploy/broker/README.md."""
    log = received(broker, "drogna_sensor", "ctl/#", ("drogna_control", "ctl/clock", CLOCK_SAMPLE))
    assert CLOCK_SAMPLE in log


def test_a_sensor_cannot_read_the_observation_branch(broker: support.Broker) -> None:
    """Publish only. A sensor has no business reading what other sensors published."""
    log = received(
        broker,
        "drogna_sensor",
        "obs/#",
        ("drogna_sensor", "obs/platform-b/ds-salinity", "another-sensor"),
    )
    assert "another-sensor" not in log


# The ingest client ---------------------------------------------------------------------


def test_the_ingest_client_reads_the_observation_branch(broker: support.Broker) -> None:
    log = received(
        broker,
        "drogna_ingest",
        "obs/#",
        ("drogna_sensor", "obs/platform-a/ds-temperature", "an-observation"),
    )
    assert "an-observation" in log


def test_the_ingest_client_publishes_its_liveness_and_its_degradation(
    broker: support.Broker,
) -> None:
    for topic in ("ctl/heartbeat", "ctl/telemetry"):
        result = broker.publish("drogna_ingest", topic, "{}")
        assert b"Not authorized" not in result.stderr, f"{topic} was refused"


def test_the_ingest_client_publishes_nothing_else(broker: support.Broker) -> None:
    """The single ingestion seam has no business raising an event or commanding a run."""
    for topic in ("ctl/divergence", "ctl/run-request", "ctl/plan", "obs/platform-a/ds-made-up"):
        result = broker.publish("drogna_ingest", topic, "{}")
        assert b"Not authorized" in result.stderr, f"{topic} was not refused"


# The browser (ADR-0008) ------------------------------------------------------------------


def test_the_browser_subscribes_to_the_control_namespace(broker: support.Broker) -> None:
    log = received(
        broker, "drogna_viewer", "ctl/#", ("drogna_control", "ctl/heartbeat", "for-the-browser")
    )
    assert "for-the-browser" in log


def test_the_browser_can_publish_nowhere(broker: support.Broker) -> None:
    """ADR-0008: subscribe-only, and not confusable with a sensor identity."""
    for topic in ("ctl/clock", "ctl/heartbeat", "obs/platform-a/ds-temperature", "anything"):
        result = broker.publish("drogna_viewer", topic, "{}")
        assert b"Not authorized" in result.stderr, f"{topic} was not refused"


def test_the_browser_cannot_read_observation_traffic(broker: support.Broker) -> None:
    """Observations reach the client through the query layer, as FR-19 intends."""
    log = received(
        broker,
        "drogna_viewer",
        "obs/#",
        ("drogna_sensor", "obs/platform-a/ds-temperature", "not-for-the-browser"),
    )
    assert "not-for-the-browser" not in log


# Identity ---------------------------------------------------------------------------------


def test_an_unknown_identity_gets_nothing_at_all(broker: support.Broker) -> None:
    """Anonymous access is off, so a client with no credentials is not a client."""
    result = support._run(
        [
            "docker",
            "run",
            "--rm",
            "--network",
            f"container:{broker.container}",
            support.BROKER_IMAGE,
            "mosquitto_pub",
            "-V",
            "5",
            "-h",
            "localhost",
            "-t",
            "obs/platform-a/ds-temperature",
            "-m",
            "{}",
        ],
        check=False,
    )
    assert result.returncode != 0


def test_the_refusals_are_recorded_in_the_broker_log(broker: support.Broker) -> None:
    """A misconfigured component is visible, rather than merely failing quietly."""
    broker.publish("drogna_sensor", "ctl/run-request", "{}")
    log = broker.logs()
    assert "drogna_sensor" in log


# The WebSocket listener (ADR-0008) ---------------------------------------------------------


def test_the_websocket_listener_is_there_for_the_proxy_to_upgrade_to(
    broker: support.Broker,
) -> None:
    """The far end of ADR-0008's upgrade location. Without it the browser reaches nothing."""
    port = support.websocket_port(broker)
    request = (
        "GET /mqtt HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "Sec-WebSocket-Protocol: mqtt\r\n"
        "\r\n"
    )
    with socket.create_connection(("127.0.0.1", port), timeout=10) as connection:
        connection.sendall(request.encode("ascii"))
        response = connection.recv(4096).decode("ascii", errors="replace")
    assert response.startswith("HTTP/1.1 101"), response.splitlines()[:1]
    assert "upgrade: websocket" in response.lower()


def test_the_tracked_configuration_is_what_the_broker_is_running(
    broker: support.Broker, tmp_path: Path
) -> None:
    """The container was loaded from deploy/broker/, so these tests test that directory."""
    log = broker.logs()
    assert "Config loaded from /mosquitto/config/mosquitto.conf" in log
    assert "Opening websockets listen socket on port 9001" in log


# The two-broker fallback (FR-15) ------------------------------------------------------------


def test_the_fallback_runs_the_two_namespaces_on_two_brokers(
    broker: support.Broker, control_broker: support.Broker
) -> None:
    """FR-15 demonstrated once: two brokers, from two tracked configurations, no source change.

    The observation broker is the one every other test in this file uses, unchanged. The
    control broker is started from `deploy/broker/two-broker/`, and what makes this a
    configuration change rather than a code change is that both are reached by a URL a
    component reads from its own configuration file.
    """
    assert broker.port != control_broker.port

    observation = received(
        broker,
        "drogna_ingest",
        "obs/#",
        ("drogna_sensor", "obs/platform-a/ds-temperature", "on-the-observation-broker"),
    )
    assert "on-the-observation-broker" in observation

    control = received(
        control_broker,
        "drogna_viewer",
        "ctl/#",
        ("drogna_control", "ctl/heartbeat", "on-the-control-broker"),
    )
    assert "on-the-control-broker" in control


def test_the_control_broker_carries_no_observation_traffic(
    control_broker: support.Broker,
) -> None:
    """There is no obs/ branch on the control broker at all, so there is nothing to leak."""
    result = control_broker.publish("drogna_sensor", "obs/platform-a/ds-temperature", "{}")
    assert b"Not authorized" in result.stderr


def test_the_control_broker_offers_the_same_upgrade_location(
    control_broker: support.Broker,
) -> None:
    """ADR-0008 still holds in the fallback: the browser's connection moves, and works."""
    port = support.websocket_port(control_broker)
    request = (
        "GET /mqtt HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "Sec-WebSocket-Protocol: mqtt\r\n"
        "\r\n"
    )
    with socket.create_connection(("127.0.0.1", port), timeout=10) as connection:
        connection.sendall(request.encode("ascii"))
        response = connection.recv(4096).decode("ascii", errors="replace")
    assert response.startswith("HTTP/1.1 101")
