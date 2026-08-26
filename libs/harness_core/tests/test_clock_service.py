"""The clock engine: tick arithmetic, modes, the rate-zero pin, and the lockstep barrier."""

from __future__ import annotations

import pytest

from harness_core.clock import ClockControlError, ClockMode, ParticipantRole, SimInstant, Tick
from harness_core.clock_service import ClockEngine, ClockSettings, RealTimeDriver

EPOCH_ISO = "2026-01-01T00:00:00.000000Z"


def settings(**overrides: object) -> ClockSettings:
    base: dict[str, object] = {
        "run_id": "run-0001",
        "epoch": SimInstant.from_iso(EPOCH_ISO),
        "tick_interval_us": 100_000,
        "mode": ClockMode.REALTIME,
        "rate": 1.0,
        "min_rate": 0.0,
        "max_rate": 100.0,
    }
    base.update(overrides)
    return ClockSettings(**base)  # type: ignore[arg-type]


def drain(engine: ClockEngine, count: int) -> list[Tick]:
    emitted = []
    for _ in range(count):
        tick = engine.advance()
        assert tick is not None
        emitted.append(tick)
    return emitted


def test_tick_indices_are_strictly_increasing_without_gaps() -> None:
    engine = ClockEngine(settings())
    indices = [tick.index for tick in drain(engine, 10)]
    assert indices == list(range(10))


def test_tick_values_are_epoch_plus_index_times_interval() -> None:
    engine = ClockEngine(settings())
    epoch = SimInstant.from_iso(EPOCH_ISO)
    for tick in drain(engine, 5):
        assert tick.instant.micros == epoch.micros + tick.index * 100_000


def test_a_rate_change_alters_no_tick_value() -> None:
    at_one = [tick.instant for tick in drain(ClockEngine(settings()), 20)]

    accelerated = ClockEngine(settings())
    drain(accelerated, 5)
    accelerated.set_rate(50.0)
    at_fifty = [accelerated.tick_for(index).instant for index in range(20)]

    assert at_one == at_fifty


def test_a_mode_change_alters_no_tick_value() -> None:
    engine = ClockEngine(settings())
    before = engine.tick_for(99).instant
    engine.set_mode(ClockMode.LOCKSTEP)
    assert engine.tick_for(99).instant == before


def test_a_rate_outside_the_configured_bounds_is_refused_and_the_state_is_unchanged() -> None:
    engine = ClockEngine(settings(max_rate=50.0))
    with pytest.raises(ClockControlError, match="outside the configured bounds"):
        engine.set_rate(500.0)
    assert engine.rate == 1.0
    with pytest.raises(ClockControlError, match="outside the configured bounds"):
        engine.set_rate(-1.0)
    assert engine.rate == 1.0


def test_a_rate_that_is_not_a_finite_number_is_refused() -> None:
    engine = ClockEngine(settings())
    with pytest.raises(ClockControlError, match="finite"):
        engine.set_rate(float("inf"))
    with pytest.raises(ClockControlError, match="finite"):
        engine.set_rate(float("nan"))


def test_rate_zero_pins_the_clock_and_is_visible_as_both_rate_and_mode() -> None:
    """FR-53: capture pins the rate to zero, and the state says so plainly."""
    engine = ClockEngine(settings(rate=10.0, mode=ClockMode.ACCELERATED))
    drain(engine, 3)

    state = engine.set_rate(0.0)
    assert state.rate == 0.0
    assert state.mode is ClockMode.PAUSED
    assert engine.advance() is None
    assert engine.emission_interval_seconds() is None


def test_pin_and_release_are_idempotent_and_restore_the_interrupted_rate() -> None:
    engine = ClockEngine(settings(rate=10.0, mode=ClockMode.ACCELERATED))
    drain(engine, 2)

    engine.pin()
    engine.pin()
    assert engine.rate == 0.0
    assert engine.pinned

    engine.release()
    engine.release()
    assert engine.rate == 10.0
    assert engine.mode is ClockMode.ACCELERATED
    assert not engine.pinned


def test_a_pin_does_not_disturb_the_tick_sequence() -> None:
    engine = ClockEngine(settings(rate=10.0, mode=ClockMode.ACCELERATED))
    drain(engine, 4)
    engine.pin()
    assert engine.advance() is None
    engine.release()
    resumed = drain(engine, 2)
    assert [tick.index for tick in resumed] == [4, 5]


def test_a_free_running_mode_at_rate_zero_is_refused() -> None:
    engine = ClockEngine(settings())
    engine.pin()
    with pytest.raises(ClockControlError, match="needs a rate above zero"):
        engine.set_mode(ClockMode.REALTIME)


def test_paused_emits_nothing_and_the_last_tick_stays_readable() -> None:
    engine = ClockEngine(settings(mode=ClockMode.ACCELERATED, rate=50.0))
    drain(engine, 3)
    engine.set_mode(ClockMode.PAUSED)
    assert engine.advance() is None
    state = engine.state()
    assert state.mode is ClockMode.PAUSED
    assert state.tick is not None
    assert state.tick.index == 2


def test_lockstep_waits_for_every_registered_participant() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    engine.register("beta", ParticipantRole.LOCKSTEP)

    first = engine.advance()
    assert first is not None and first.index == 0

    assert engine.advance() is None
    engine.acknowledge("alpha", 0)
    assert engine.advance() is None
    engine.acknowledge("beta", 0)

    second = engine.advance()
    assert second is not None and second.index == 1


def test_a_silent_participant_stalls_the_clock_and_is_named() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    engine.register("beta", ParticipantRole.LOCKSTEP)
    engine.advance()
    engine.acknowledge("alpha", 0)

    stall = engine.stall()
    assert stall is not None
    assert stall.outstanding == ("beta",)
    assert "beta" in stall.message()
    assert engine.state().outstanding == ("beta",)


def test_a_stall_never_skips_a_tick() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    engine.advance()
    for _ in range(5):
        assert engine.advance() is None
    engine.acknowledge("alpha", 0)
    resumed = engine.advance()
    assert resumed is not None and resumed.index == 1


def test_an_observer_does_not_acknowledge_and_does_not_hold_the_clock() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP))
    engine.register("watcher", ParticipantRole.OBSERVER)
    engine.advance()
    with pytest.raises(ClockControlError, match="observer"):
        engine.acknowledge("watcher", 0)
    assert engine.advance() is not None


def test_acknowledging_an_unknown_participant_or_the_wrong_tick_is_refused() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    engine.advance()
    with pytest.raises(ClockControlError, match="not registered"):
        engine.acknowledge("ghost", 0)
    with pytest.raises(ClockControlError, match="the clock is at tick 0"):
        engine.acknowledge("alpha", 7)


def test_emission_interval_follows_the_rate_and_not_the_tick_value() -> None:
    engine = ClockEngine(settings())
    assert engine.emission_interval_seconds() == pytest.approx(0.1)
    engine.set_rate(50.0)
    assert engine.emission_interval_seconds() == pytest.approx(0.002)
    assert engine.tick_for(10).instant.micros == engine.settings.epoch.micros + 1_000_000


class FakeHostClock:
    """A stand-in for the host counter the driver reads, so the driver is testable."""

    def __init__(self) -> None:
        self.value = 0.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        return self.value

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.value += seconds


def test_the_driver_paces_emission_without_touching_tick_values() -> None:
    engine = ClockEngine(settings(rate=2.0, mode=ClockMode.ACCELERATED))
    host = FakeHostClock()
    driver = RealTimeDriver(engine, monotonic=host.monotonic, sleep=host.sleep)

    emitted: list[Tick] = []
    assert driver.run(emitted.append, ticks=4) == 4

    assert [tick.index for tick in emitted] == [0, 1, 2, 3]
    epoch = SimInstant.from_iso(EPOCH_ISO)
    assert [tick.instant.micros - epoch.micros for tick in emitted] == [0, 100_000, 200_000, 300_000]
    # 100 ms of simulation time at rate 2 is 50 ms of host time between emissions.
    assert host.slept == [pytest.approx(0.05)] * 3


def test_the_driver_emits_nothing_while_the_clock_is_pinned() -> None:
    engine = ClockEngine(settings())
    host = FakeHostClock()
    driver = RealTimeDriver(engine, monotonic=host.monotonic, sleep=host.sleep)
    engine.pin()

    emitted: list[Tick] = []
    assert driver.run(emitted.append, ticks=5) == 0
    assert emitted == []
    assert host.slept == []


def test_the_driver_stops_at_a_lockstep_stall_rather_than_skipping() -> None:
    engine = ClockEngine(settings(mode=ClockMode.LOCKSTEP, lockstep_deadline_seconds=0.5))
    engine.register("alpha", ParticipantRole.LOCKSTEP)
    host = FakeHostClock()
    driver = RealTimeDriver(engine, monotonic=host.monotonic, sleep=host.sleep)

    emitted: list[Tick] = []
    assert driver.run(emitted.append, ticks=5) == 1
    assert [tick.index for tick in emitted] == [0]
    assert engine.stall() is not None
    assert engine.stall().outstanding == ("alpha",)  # type: ignore[union-attr]
