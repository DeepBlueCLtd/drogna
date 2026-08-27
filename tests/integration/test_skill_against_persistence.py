"""A deliberately degraded forecast is reported as degraded, within one telemetry interval.

This is SC-005, and it is the test that decides whether the skill figure is telemetry or
decoration. A number that can only ever flatter the model is not a measurement of anything.
So the scenario here is built to lose: the persistence reference is close to the water and
the current forecast is a long way from it, both by construction, and the component is
required to publish a negative score, the ``not-beating-persistence`` state, and the
sentence that says the run is not earning its compute.

The score is checked twice over — once against the value recomputed by hand from the two
mean-square errors the same message carries, which is SC-004, and once against the
arithmetic the test itself does from the fields it built.
"""

from __future__ import annotations

import pytest
from harness_core.soundspeed import sound_speed
from harness_telemetry.service import RUN_PUBLISHED_TOPIC, TELEMETRY_PREFIX, TelemetryService
from telemetry_support import (
    TRUE_SALINITY_PSU,
    RecordingPublisher,
    StubForecasts,
    manual_clock,
    measured_sound_speed,
    residual_point,
    run_published,
    sample_report,
    settings,
    uniform_field,
)

DEPTH_M = 50.0
REFERENCE_TEMPERATURE_C = 12.1
DEGRADED_TEMPERATURE_C = 16.0
MINIMUM_SAMPLES = 4
INTERVAL_SECONDS = 300.0


def degraded_run() -> tuple[TelemetryService, RecordingPublisher, list[float], list[float]]:
    """A run whose forecast is worse than standing still, and the errors that make it so."""
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=REFERENCE_TEMPERATURE_C))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(
            minimum_sample_count=MINIMUM_SAMPLES,
            publication_interval_seconds=INTERVAL_SECONDS,
        ),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()

    forecasts.set(uniform_field("forecast-2", temperature_c=DEGRADED_TEMPERATURE_C))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    measured = measured_sound_speed(DEPTH_M)
    model_error = measured - sound_speed(DEGRADED_TEMPERATURE_C, TRUE_SALINITY_PSU, DEPTH_M)
    persistence_error = measured - sound_speed(REFERENCE_TEMPERATURE_C, TRUE_SALINITY_PSU, DEPTH_M)

    points = [
        residual_point(minutes=index, residual_m_per_s=model_error, depth_m=DEPTH_M)
        for index in range(1, 11)
    ]
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(points, forecast_run_id="forecast-2", minutes=10.0),
    )

    clock.advance(int(INTERVAL_SECONDS))
    service.publish_reports()
    return service, publisher, [model_error] * len(points), [persistence_error] * len(points)


def test_a_forecast_worse_than_standing_still_is_published_as_worse() -> None:
    _, publisher, model_errors, persistence_errors = degraded_run()

    skill = publisher.of_kind("forecast-skill")
    assert len(skill) == 1
    message = skill[0]

    expected_model = sum(error * error for error in model_errors) / len(model_errors)
    expected_persistence = sum(error * error for error in persistence_errors) / len(
        persistence_errors
    )

    assert message["state"] == "not-beating-persistence"
    assert message["sample_count"] == len(model_errors)
    assert message["model_mean_square_error"] == pytest.approx(expected_model)
    assert message["persistence_mean_square_error"] == pytest.approx(expected_persistence)
    assert message["skill_score"] < 0
    assert message["skill_score"] == pytest.approx(1.0 - expected_model / expected_persistence)


def test_the_message_says_in_words_that_the_run_is_not_earning_its_compute() -> None:
    _, publisher, _, _ = degraded_run()

    message = publisher.of_kind("forecast-skill")[0]

    assert "not beating persistence" in message["statement"]
    assert "earning its compute" in message["statement"]


def test_the_score_is_recomputable_from_the_figures_in_the_same_message() -> None:
    """SC-004: a reader checks the number rather than believing it."""
    _, publisher, _, _ = degraded_run()

    message = publisher.of_kind("forecast-skill")[0]
    recomputed = 1.0 - (
        message["model_mean_square_error"] / message["persistence_mean_square_error"]
    )

    assert message["skill_score"] == pytest.approx(recomputed)
    assert message["formula"] == "1 - model_mean_square_error / persistence_mean_square_error"


def test_both_run_identifiers_travel_so_the_comparison_is_never_ambiguous() -> None:
    _, publisher, _, _ = degraded_run()

    message = publisher.of_kind("forecast-skill")[0]

    assert message["forecast_run_id"] == "forecast-2"
    assert message["reference_run_id"] == "forecast-1"
    assert message["reference_changed"] is True


def test_the_poor_score_is_published_within_one_telemetry_interval() -> None:
    """SC-005 is a deadline as well as a value."""
    service, publisher, _, _ = degraded_run()

    ticks = [message["tick"] for message in publisher.of_kind("forecast-skill")]

    assert ticks == [int(INTERVAL_SECONDS)]
    assert service.store_queries == 0


def test_a_forecast_closer_to_the_water_than_the_reference_wins() -> None:
    """The same machinery must be able to say the opposite, or it is saying nothing."""
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=DEGRADED_TEMPERATURE_C))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(
            minimum_sample_count=MINIMUM_SAMPLES, publication_interval_seconds=INTERVAL_SECONDS
        ),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2", temperature_c=REFERENCE_TEMPERATURE_C))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    measured = measured_sound_speed(DEPTH_M)
    model_error = measured - sound_speed(REFERENCE_TEMPERATURE_C, TRUE_SALINITY_PSU, DEPTH_M)
    points = [
        residual_point(minutes=index, residual_m_per_s=model_error, depth_m=DEPTH_M)
        for index in range(1, 11)
    ]
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(points, forecast_run_id="forecast-2", minutes=10.0),
    )
    clock.advance(int(INTERVAL_SECONDS))
    service.publish_reports()

    message = publisher.of_kind("forecast-skill")[0]

    assert message["state"] == "beating-persistence"
    assert message["skill_score"] > 0
