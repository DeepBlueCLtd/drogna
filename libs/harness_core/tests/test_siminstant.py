"""Simulation instants: exact integers in, ISO-8601 UTC out."""

from __future__ import annotations

import pytest

from harness_core.clock import ClockMode, SimInstant, Tick, tick_at

EPOCH_ISO = "2026-01-01T00:00:00.000000Z"


def test_microseconds_are_exact_integers() -> None:
    instant = SimInstant.from_iso(EPOCH_ISO)
    assert instant.plus_micros(100_000).micros - instant.micros == 100_000


@pytest.mark.parametrize("bad", [0.5, 1.0, True, "0"])
def test_float_and_bool_construction_is_refused(bad: object) -> None:
    with pytest.raises(TypeError):
        SimInstant(bad)  # type: ignore[arg-type]


def test_iso_rendering_is_always_microsecond_precision() -> None:
    instant = SimInstant.from_iso(EPOCH_ISO).plus_micros(1)
    assert instant.iso() == "2026-01-01T00:00:00.000001Z"
    assert SimInstant.from_iso(EPOCH_ISO).iso() == EPOCH_ISO


def test_iso_round_trip_is_lossless() -> None:
    original = SimInstant.from_iso("2026-08-26T13:45:59.123456Z")
    assert SimInstant.from_iso(original.iso()) == original


def test_offsets_other_than_utc_are_refused() -> None:
    with pytest.raises(ValueError, match="UTC only"):
        SimInstant.from_iso("2026-01-01T01:00:00.000000+01:00")


def test_a_timestamp_without_an_offset_is_refused() -> None:
    with pytest.raises(ValueError, match="no offset"):
        SimInstant.from_iso("2026-01-01T00:00:00.000000")


def test_ordering_and_difference() -> None:
    first = SimInstant.from_iso(EPOCH_ISO)
    second = first.plus_micros(250)
    assert first < second
    assert second - first == 250
    assert sorted([second, first]) == [first, second]


def test_tick_value_is_epoch_plus_index_times_interval() -> None:
    epoch = SimInstant.from_iso(EPOCH_ISO)
    tick = tick_at(
        7, epoch=epoch, tick_interval_us=100_000, mode=ClockMode.REALTIME, rate=1.0, run_id="run"
    )
    assert tick.instant.micros == epoch.micros + 7 * 100_000
    assert tick.instant.iso() == "2026-01-01T00:00:00.700000Z"


def test_tick_crosses_a_boundary_as_iso_utc_beside_its_index() -> None:
    epoch = SimInstant.from_iso(EPOCH_ISO)
    tick = tick_at(
        3, epoch=epoch, tick_interval_us=100_000, mode=ClockMode.LOCKSTEP, rate=1.0, run_id="run"
    )
    message = tick.as_message()
    assert message["tick"] == 3
    assert message["sim_time"] == "2026-01-01T00:00:00.300000Z"
    assert Tick.from_message(message) == tick


def test_a_negative_tick_index_is_refused() -> None:
    with pytest.raises(ValueError, match="start at zero"):
        Tick(
            index=-1,
            instant=SimInstant.from_iso(EPOCH_ISO),
            mode=ClockMode.REALTIME,
            rate=1.0,
            run_id="run",
        )
