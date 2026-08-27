"""Liveness: real-time cadence, simulation time as payload (ADR-0006, FR-52)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_core.clock import CLOCK_TOPIC, ClockMode, SimInstant, Tick
from harness_core.clock_service import ClockSamplePublisher
from harness_core.config import ConfigInvalidError, validate_document
from harness_core.heartbeat import (
    HEARTBEAT_TOPIC,
    HeartbeatPublisher,
    HeartbeatStatus,
    heartbeat_schema,
    validate_heartbeat,
)
from harness_core.schemas import schema

REPO_ROOT = Path(__file__).resolve().parents[3]


class RecordingPublisher:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, json.loads(payload.decode("utf-8"))))


class FakeHostClock:
    def __init__(self) -> None:
        self.value = 0.0

    def monotonic(self) -> float:
        return self.value


def tick(index: int, *, mode: ClockMode = ClockMode.REALTIME, rate: float = 1.0) -> Tick:
    return Tick(
        index=index,
        instant=SimInstant.from_iso("2026-01-01T00:00:00.000000Z").plus_micros(index * 100_000),
        mode=mode,
        rate=rate,
        run_id="run-0001",
    )


def test_the_heartbeat_carries_component_simulation_time_and_status() -> None:
    publisher = RecordingPublisher()
    heartbeat = HeartbeatPublisher(
        publisher, component="clock", interval_seconds=1.0, config_digest="sha256:" + "b" * 64
    )

    message = heartbeat.publish(tick(7))

    topic, published = publisher.published[0]
    assert topic == HEARTBEAT_TOPIC
    assert published == message
    assert published["component"] == "clock"
    assert published["sim_time"] == "2026-01-01T00:00:00.700000Z"
    assert published["tick"] == 7
    assert published["status"] == HeartbeatStatus.OK.value
    assert published["run_id"] == "run-0001"
    assert published["config_digest"].startswith("sha256:")


def test_cadence_is_real_time_not_simulation_time() -> None:
    """ADR-0006: measured in simulation time, a pinned clock would grey out the system."""
    host = FakeHostClock()
    publisher = RecordingPublisher()
    heartbeat = HeartbeatPublisher(
        publisher, component="clock", interval_seconds=2.0, monotonic=host.monotonic
    )

    assert heartbeat.maybe_publish(tick(0)) is not None
    assert heartbeat.maybe_publish(tick(1)) is None  # host time has not moved

    host.value = 2.5
    assert heartbeat.maybe_publish(tick(1)) is not None
    assert len(publisher.published) == 2


def test_a_pinned_clock_keeps_beating_because_a_rate_of_zero_stops_nothing_else() -> None:
    """FR-53 with ADR-0006: simulation time stops, the process does not."""
    host = FakeHostClock()
    publisher = RecordingPublisher()
    heartbeat = HeartbeatPublisher(
        publisher, component="clock", interval_seconds=1.0, monotonic=host.monotonic
    )
    pinned = tick(42, mode=ClockMode.PAUSED, rate=0.0)

    heartbeat.maybe_publish(pinned)
    for elapsed in (1.0, 2.0, 3.0):
        host.value = elapsed
        heartbeat.maybe_publish(pinned)

    assert len(publisher.published) == 4
    assert {published["tick"] for _, published in publisher.published} == {42}
    assert {published["sim_time"] for _, published in publisher.published} == {
        "2026-01-01T00:00:04.200000Z"
    }


def test_a_malformed_heartbeat_is_refused_before_it_is_published() -> None:
    with pytest.raises(ConfigInvalidError):
        validate_heartbeat({"component": "clock", "status": "ok"})
    with pytest.raises(ConfigInvalidError):
        validate_heartbeat(
            {"component": "clock", "sim_time": "2026-01-01T00:00:00.000000Z", "status": "alive"}
        )


def test_the_heartbeat_schema_carries_no_host_timestamp() -> None:
    """Liveness cadence is real time; the message says nothing about the host's clock."""
    properties = heartbeat_schema()["properties"]
    assert "sim_time" in properties
    assert not any("host" in name or name == "timestamp" for name in properties)


def test_a_heartbeat_interval_must_be_a_positive_number_of_host_seconds() -> None:
    with pytest.raises(ValueError, match="host seconds"):
        HeartbeatPublisher(RecordingPublisher(), component="clock", interval_seconds=0)


def test_clock_samples_are_published_on_the_control_namespace_and_validated() -> None:
    """ADR-0009: consumers receive simulation time by subscribing to ctl/clock."""
    publisher = RecordingPublisher()
    samples = ClockSamplePublisher(publisher)

    message = samples.publish(tick(3, mode=ClockMode.ACCELERATED, rate=50.0))

    topic, published = publisher.published[0]
    assert topic == CLOCK_TOPIC == "ctl/clock"
    assert published == message
    assert published["tick"] == 3
    assert published["sim_time"] == "2026-01-01T00:00:00.300000Z"
    assert published["rate"] == 50.0


def test_a_rate_of_zero_is_a_valid_clock_sample() -> None:
    validate_document(
        tick(3, mode=ClockMode.PAUSED, rate=0.0).as_message(),
        schema("clock.schema.json"),
        source=CLOCK_TOPIC,
    )


def test_the_packaged_clock_schema_matches_the_master_in_contracts() -> None:
    master = REPO_ROOT / "contracts" / "schemas" / "clock.schema.json"
    packaged = (
        Path(__file__).resolve().parents[1]
        / "src"
        / "harness_core"
        / "schemas"
        / "clock.schema.json"
    )
    assert packaged.read_bytes() == master.read_bytes()


def test_the_publisher_declares_its_own_cadence() -> None:
    """A component tells the receiver how often to expect it (ADR-0006).

    The receiver holds no table of expected intervals, so a component that heartbeats
    slowly is judged dead by a default tolerance unless it says otherwise. Declaring the
    interval is the publisher's job because the publisher is the only thing that knows it.
    """
    beat = HeartbeatPublisher(
        RecordingPublisher(),
        component="widget",
        interval_seconds=2.5,
        liveness_window_seconds=9.0,
        monotonic=iter([0.0, 0.0]).__next__,
    )

    message = beat.publish(tick(0))

    assert message["heartbeat_interval_seconds"] == 2.5
    assert message["liveness_window_seconds"] == 9.0
    validate_heartbeat(message)


def test_a_publisher_may_decline_to_declare_its_interval() -> None:
    """Opting out is explicit, and then neither declaration is sent at all."""
    beat = HeartbeatPublisher(
        RecordingPublisher(),
        component="widget",
        interval_seconds=2.5,
        declare_interval=False,
        monotonic=iter([0.0, 0.0]).__next__,
    )

    message = beat.publish(tick(0))

    assert "heartbeat_interval_seconds" not in message
    assert "liveness_window_seconds" not in message
    validate_heartbeat(message)


def test_a_liveness_window_must_be_positive() -> None:
    with pytest.raises(ValueError, match="positive number of host seconds"):
        HeartbeatPublisher(
            RecordingPublisher(),
            component="widget",
            interval_seconds=1.0,
            liveness_window_seconds=0.0,
        )
