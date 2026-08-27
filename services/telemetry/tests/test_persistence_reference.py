"""The persistence reference: the field that was current immediately before the last one.

The reference is the claim that conditions stay the same. Which field embodies that claim
is not a detail — a skill score against the wrong baseline is worse than no skill score,
because it looks like an answer. So these tests pin down exactly three things: the
reference is the field current immediately before the latest publication; it changes only
at a publication boundary and never between them; and until a second run has been published
there is nothing prior to hold, which is a state and not a zero.

Scoring against it derives sound speed from the field's own temperature and salinity
through the one implementation in ``harness_core`` (ADR-0005). There is no copy of the
equation in this package and no stored sound-speed datastream to read instead.
"""

from __future__ import annotations

import pytest
from harness_core.soundspeed import sound_speed
from harness_telemetry.persistence_reference import PersistenceReference
from telemetry_support import (
    MINUTE_MICROS,
    TRUE_SALINITY_PSU,
    TRUE_TEMPERATURE_C,
    StubForecasts,
    measured_sound_speed,
    uniform_field,
)


def test_before_any_publication_there_is_no_reference_to_hold() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    reference = PersistenceReference(forecasts)
    reference.start()

    assert reference.current_run_id == "forecast-1"
    assert reference.reference_run_id is None
    assert reference.has_reference is False


def test_the_first_publication_makes_the_field_before_it_the_reference() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    reference = PersistenceReference(forecasts)
    reference.start()

    forecasts.set(uniform_field("forecast-2"))
    changed = reference.published()

    assert changed is True
    assert reference.reference_run_id == "forecast-1"
    assert reference.current_run_id == "forecast-2"
    assert reference.has_reference is True


def test_the_reference_moves_only_at_a_publication_boundary() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    reference = PersistenceReference(forecasts)
    reference.start()
    forecasts.set(uniform_field("forecast-2"))
    reference.published()

    forecasts.set(uniform_field("forecast-3"))

    assert reference.reference_run_id == "forecast-1"
    assert reference.current_run_id == "forecast-2"

    reference.published()

    assert reference.reference_run_id == "forecast-2"
    assert reference.current_run_id == "forecast-3"


def test_a_repeated_announcement_of_the_current_run_moves_nothing() -> None:
    """Otherwise a republished announcement would make a field its own reference."""
    forecasts = StubForecasts(uniform_field("forecast-1"))
    reference = PersistenceReference(forecasts)
    reference.start()
    forecasts.set(uniform_field("forecast-2"))
    reference.published()

    changed = reference.published()

    assert changed is False
    assert reference.reference_run_id == "forecast-1"
    assert reference.current_run_id == "forecast-2"


def test_scoring_against_the_reference_derives_sound_speed_from_the_held_field() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=13.0))
    reference = PersistenceReference(forecasts)
    reference.start()
    forecasts.set(uniform_field("forecast-2"))
    reference.published()

    measured = measured_sound_speed(50.0)
    error = reference.error_against_reference(
        latitude=49.0, longitude=-5.0, depth_m=50.0, when_micros=MINUTE_MICROS, measured=measured
    )

    expected = measured - sound_speed(13.0, TRUE_SALINITY_PSU, 50.0)

    assert error is not None
    assert error == pytest.approx(expected)


def test_a_position_the_reference_does_not_cover_yields_no_error() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    reference = PersistenceReference(forecasts)
    reference.start()
    forecasts.set(uniform_field("forecast-2"))
    reference.published()

    error = reference.error_against_reference(
        latitude=80.0,
        longitude=0.0,
        depth_m=50.0,
        when_micros=MINUTE_MICROS,
        measured=measured_sound_speed(50.0),
    )

    assert error is None


def test_a_reference_reproducing_the_water_exactly_scores_zero_error() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=TRUE_TEMPERATURE_C))
    reference = PersistenceReference(forecasts)
    reference.start()
    forecasts.set(uniform_field("forecast-2"))
    reference.published()

    error = reference.error_against_reference(
        latitude=49.0,
        longitude=-5.0,
        depth_m=50.0,
        when_micros=MINUTE_MICROS,
        measured=measured_sound_speed(50.0),
    )

    assert error == pytest.approx(0.0, abs=1e-9)


def test_nothing_published_at_all_leaves_both_fields_absent() -> None:
    forecasts = StubForecasts(None)
    reference = PersistenceReference(forecasts)
    reference.start()

    assert reference.current_run_id is None
    assert reference.has_forecast is False
    assert reference.has_reference is False
