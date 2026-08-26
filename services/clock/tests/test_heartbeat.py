"""drogna's first liveness signal, and the shape every later component copies.

Constitution VII: a component is lit in the client because a message from it arrived, and
for nothing else. There is no demo mode, no fixture mode and no populate-for-the-screenshot
path, so what is asserted here is that the message is real, that it validates against the
neutral master, and that it carries the two declarations the client reads.
"""

from __future__ import annotations

import json
from pathlib import Path

from clock_support import HostClock, Recorder
from harness_clock.heartbeat import ClockHeartbeat
from harness_core.clock import ClockMode, SimInstant, tick_at
from harness_core.heartbeat import HEARTBEAT_TOPIC, HeartbeatStatus, validate_heartbeat

EPOCH = SimInstant.from_iso("2026-01-01T00:00:00.000000Z")
DIGEST = "sha256:" + "a" * 64


def tick(index: int = 0, *, mode: ClockMode = ClockMode.ACCELERATED, rate: float = 10.0):
    return tick_at(
        index, epoch=EPOCH, tick_interval_us=100_000, mode=mode, rate=rate, run_id="run-0001"
    )


def build(recorder: Recorder | None, host: HostClock) -> ClockHeartbeat:
    return ClockHeartbeat(
        recorder,
        component="clock",
        interval_seconds=5.0,
        window_seconds=15.0,
        config_digest=DIGEST,
        monotonic=host.monotonic,
    )


def test_the_first_heartbeat_validates_against_the_master() -> None:
    recorder, host = Recorder(), HostClock()

    message = build(recorder, host).beat(tick(), status=HeartbeatStatus.STARTING)

    assert message is not None
    validate_heartbeat(message)
    topic, published = recorder.messages[0]
    assert topic == HEARTBEAT_TOPIC
    assert published["component"] == "clock"
    assert published["status"] == "starting"
    assert published["sim_time"] == "2026-01-01T00:00:00.000000Z"
    assert published["tick"] == 0
    assert published["run_id"] == "run-0001"
    assert published["config_digest"] == DIGEST


def test_the_sender_declares_its_own_cadence_and_window() -> None:
    """The receiver holds no table of expected intervals; that would be a list of
    components that ought to exist, which is what Constitution VII forbids."""
    recorder, host = Recorder(), HostClock()

    build(recorder, host).beat(tick())

    published = recorder.on(HEARTBEAT_TOPIC)[0]
    assert published["heartbeat_interval_seconds"] == 5.0
    assert published["liveness_window_seconds"] == 15.0
    validate_heartbeat(published)


def test_cadence_is_host_time_and_not_ticks() -> None:
    """ADR-0006. The same tick, published twice, only once the interval has elapsed."""
    recorder, host = Recorder(), HostClock()
    heartbeat = build(recorder, host)

    assert heartbeat.maybe_beat(tick()) is not None
    host.value += 1.0
    assert heartbeat.maybe_beat(tick(5)) is None
    host.value += 5.0
    assert heartbeat.maybe_beat(tick(5)) is not None

    assert len(recorder.on(HEARTBEAT_TOPIC)) == 2


def test_a_pinned_clock_still_beats_with_the_time_it_is_holding() -> None:
    recorder, host = Recorder(), HostClock()
    heartbeat = build(recorder, host)

    heartbeat.beat(tick(7, mode=ClockMode.PAUSED, rate=0.0), detail="pinned")
    host.value += 6.0
    heartbeat.maybe_beat(tick(7, mode=ClockMode.PAUSED, rate=0.0), detail="pinned")

    published = recorder.on(HEARTBEAT_TOPIC)
    assert len(published) == 2
    assert {beat["tick"] for beat in published} == {7}
    assert {beat["sim_time"] for beat in published} == {"2026-01-01T00:00:00.700000Z"}


def test_no_publisher_means_no_heartbeat_and_it_says_so() -> None:
    """A component with no broker does not invent one and does not publish to a stub."""
    heartbeat = build(None, HostClock())

    assert heartbeat.publishing is False
    assert heartbeat.beat(tick()) is None
    assert heartbeat.maybe_beat(tick()) is None


def test_the_declarations_are_validated_after_they_are_added(tmp_path: Path) -> None:
    """The master closes the message, so a key added after validation is unchecked."""
    recorder, host = Recorder(), HostClock()

    build(recorder, host).beat(tick())

    _, published = recorder.messages[0]
    round_tripped = json.loads(json.dumps(published))
    validate_heartbeat(round_tripped)
    assert set(round_tripped) <= {
        "component",
        "sim_time",
        "tick",
        "status",
        "run_id",
        "config_digest",
        "heartbeat_interval_seconds",
        "liveness_window_seconds",
        "detail",
    }
