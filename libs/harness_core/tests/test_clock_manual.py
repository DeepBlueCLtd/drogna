"""The deterministic fake: simulation time moves only when told to."""

from __future__ import annotations

import pytest

from harness_core.clock import ClockMode, ManualClock, SimInstant, TickNotReachedError
from harness_core.ports import Clock

EPOCH_ISO = "2026-01-01T00:00:00.000000Z"


def manual() -> ManualClock:
    return ManualClock(
        run_id="run-0001",
        epoch=SimInstant.from_iso(EPOCH_ISO),
        tick_interval_us=100_000,
        mode=ClockMode.LOCKSTEP,
    )


def test_the_manual_clock_satisfies_the_clock_port() -> None:
    assert isinstance(manual(), Clock)


def test_it_does_not_move_on_its_own() -> None:
    clock = manual()
    first = clock.now()
    for _ in range(100):
        assert clock.now() == first
    assert clock.tick().index == 0


def test_advancing_moves_it_by_exactly_the_tick_interval() -> None:
    clock = manual()
    start = clock.now()
    clock.advance()
    assert clock.now() - start == 100_000
    clock.advance(4)
    assert clock.tick().index == 5
    assert clock.now() - start == 500_000


def test_it_advances_forwards_only() -> None:
    clock = manual()
    with pytest.raises(ValueError, match="forwards"):
        clock.advance(0)
    with pytest.raises(ValueError, match="forwards"):
        clock.advance(-3)


def test_awaiting_a_tick_it_has_not_reached_is_refused_rather_than_fabricated() -> None:
    clock = manual()
    clock.advance(2)
    assert clock.await_tick(1).index == 1
    with pytest.raises(TickNotReachedError, match="explicit advance"):
        clock.await_tick(3)


def test_awaiting_a_simulation_time_it_has_not_reached_is_refused() -> None:
    clock = manual()
    clock.advance()
    assert clock.await_sim_time(SimInstant.from_iso(EPOCH_ISO)).index == 1
    with pytest.raises(TickNotReachedError, match="explicit advance"):
        clock.await_sim_time(SimInstant.from_iso("2026-01-01T00:00:05.000000Z"))


def test_it_is_never_stale_because_nothing_can_interrupt_it() -> None:
    clock = manual()
    clock.advance()
    status = clock.status()
    assert status.stale is False
    assert status.last_tick is not None
    assert status.last_tick.index == 1
