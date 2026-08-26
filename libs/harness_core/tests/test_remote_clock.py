"""The clock port as a client: last tick only, no interpolation, staleness reported."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from typing import Any

import pytest
from harness_core.clock import (
    ClockControlError,
    ClockEndpoint,
    ClockMode,
    ClockStaleError,
    ClockState,
    ParticipantRole,
    RemoteClock,
    SimInstant,
    Tick,
)

EPOCH = SimInstant.from_iso("2026-01-01T00:00:00.000000Z")
INTERVAL_US = 100_000


def tick(index: int, *, mode: ClockMode = ClockMode.REALTIME, rate: float = 1.0) -> Tick:
    return Tick(
        index=index,
        instant=EPOCH.plus_micros(index * INTERVAL_US),
        mode=mode,
        rate=rate,
        run_id="run-0001",
    )


class FakeTransport:
    """A clock service that emits exactly the ticks a test lists, then stops."""

    def __init__(self, ticks: list[Tick], *, state_tick: Tick | None = None) -> None:
        self._ticks = ticks
        self._state_tick = state_tick
        self.control_calls: list[tuple[str, Mapping[str, Any]]] = []

    def snapshot(self) -> ClockState:
        return ClockState(
            run_id="run-0001",
            mode=ClockMode.REALTIME,
            rate=1.0,
            epoch=EPOCH,
            tick_interval_us=INTERVAL_US,
            tick=self._state_tick,
        )

    def ticks(self) -> Iterator[Tick]:
        yield from self._ticks

    def control(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        self.control_calls.append((operation, dict(payload)))
        return {"accepted": True}


def endpoint(**overrides: Any) -> ClockEndpoint:
    base: dict[str, Any] = {
        "endpoint": "https://clock.invalid/",
        "snapshot_route": "state",
        "stream_route": "ticks",
        "control_route": "control/clock",
    }
    base.update(overrides)
    return ClockEndpoint(**base)


def test_it_reports_the_last_tick_received_and_never_interpolates() -> None:
    clock = RemoteClock(FakeTransport([tick(0), tick(1)]), endpoint())
    clock.start()
    clock.receive()
    first = clock.now()
    for _ in range(50):
        assert clock.now() == first
    clock.receive()
    assert clock.now() - first == INTERVAL_US


def test_before_the_first_tick_it_refuses_rather_than_guessing() -> None:
    clock = RemoteClock(FakeTransport([]), endpoint())
    with pytest.raises(ClockStaleError, match="no tick has been observed"):
        clock.now()


def test_a_joiner_catches_up_from_the_snapshot() -> None:
    clock = RemoteClock(FakeTransport([tick(11)], state_tick=tick(10)), endpoint())
    state = clock.start()
    assert state.tick is not None and state.tick.index == 10
    assert clock.tick().index == 10
    assert clock.receive().index == 11


def test_an_interrupted_stream_is_reported_stale_with_the_last_tick() -> None:
    clock = RemoteClock(FakeTransport([tick(0)]), endpoint())
    clock.start()
    clock.receive()

    with pytest.raises(ClockStaleError) as raised:
        clock.receive()

    assert raised.value.last_tick is not None
    assert raised.value.last_tick.index == 0
    status = clock.status()
    assert status.stale is True
    assert status.last_tick is not None and status.last_tick.index == 0
    assert "ended" in status.reason


def test_a_stale_clock_stops_operational_work_rather_than_falling_back_to_host_time() -> None:
    clock = RemoteClock(FakeTransport([tick(0)]), endpoint())
    clock.start()
    clock.receive()
    with pytest.raises(ClockStaleError):
        clock.receive()

    with pytest.raises(ClockStaleError, match="clock is stale"):
        clock.require_fresh()
    # The port still knows where it stopped, which is what a component reports.
    assert clock.tick().index == 0


def test_a_gap_is_reported_explicitly_and_not_filled_in() -> None:
    clock = RemoteClock(FakeTransport([tick(0), tick(7)]), endpoint(stale_after_gap=10))
    clock.start()
    clock.receive()
    received = clock.receive()

    assert received.index == 7
    status = clock.status()
    assert status.gap == 6
    assert status.stale is False  # within the configured tolerance
    assert clock.tick().index == 7  # the missing ticks are not invented


def test_a_gap_beyond_the_configured_tolerance_is_stale() -> None:
    clock = RemoteClock(FakeTransport([tick(0), tick(7)]), endpoint(stale_after_gap=2))
    clock.start()
    clock.receive()
    clock.receive()

    status = clock.status()
    assert status.stale is True
    assert status.gap == 6
    with pytest.raises(ClockStaleError):
        clock.require_fresh()


def test_awaiting_a_tick_pulls_until_it_arrives() -> None:
    clock = RemoteClock(FakeTransport([tick(index) for index in range(6)]), endpoint())
    clock.start()
    assert clock.await_tick(4).index == 4
    assert clock.await_sim_time(EPOCH.plus_micros(5 * INTERVAL_US)).index == 5


def test_a_rate_change_does_not_change_the_tick_values_the_port_sees() -> None:
    ticks = [tick(0), tick(1, mode=ClockMode.ACCELERATED, rate=50.0)]
    clock = RemoteClock(FakeTransport(ticks), endpoint())
    clock.start()
    first = clock.receive()
    second = clock.receive()
    assert second.instant - first.instant == INTERVAL_US
    assert second.rate == 50.0


def test_only_a_registered_lockstep_participant_acknowledges() -> None:
    observer = RemoteClock(FakeTransport([tick(0)]), endpoint(), participant_id="watcher")
    observer.start()
    observer.receive()
    with pytest.raises(ClockControlError, match="lockstep participant"):
        observer.acknowledge()

    transport = FakeTransport([tick(0)])
    participant = RemoteClock(
        transport, endpoint(), participant_id="alpha", role=ParticipantRole.LOCKSTEP
    )
    participant.start()
    participant.receive()
    participant.acknowledge()

    assert ("register", {"participant": "alpha", "role": "lockstep"}) in transport.control_calls
    assert ("acknowledge", {"participant": "alpha", "tick": 0}) in transport.control_calls


def test_following_acknowledges_each_tick_and_ends_when_the_stream_does() -> None:
    transport = FakeTransport([tick(0), tick(1), tick(2)])
    clock = RemoteClock(
        transport, endpoint(), participant_id="alpha", role=ParticipantRole.LOCKSTEP
    )
    clock.start()
    observed = [seen.index for seen in clock.follow(acknowledge=True)]

    assert observed == [0, 1, 2]
    acknowledged = [call for call in transport.control_calls if call[0] == "acknowledge"]
    assert [call[1]["tick"] for call in acknowledged] == [0, 1, 2]
    assert clock.status().stale is True
