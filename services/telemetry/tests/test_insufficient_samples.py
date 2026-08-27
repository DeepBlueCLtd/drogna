"""Below the minimum count there is no score. No default, no zero, no last known value.

FR-009 and Constitution IX. The three ways a quality figure quietly becomes a decoration are
a default, a zero, and a value carried forward from when there was one; all three are
refused, and the message says ``insufficient-samples`` and carries the count and the
threshold so a reader can see the rule that was applied.

The carried-forward case is the one worth testing hardest, because it is the one that looks
like continuity rather than like a lie.
"""

from __future__ import annotations

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
INTERVAL = 60


def scored_service(
    minimum: int,
) -> tuple[TelemetryService, RecordingPublisher, object, StubForecasts]:
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=12.1))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(minimum_sample_count=minimum, publication_interval_seconds=float(INTERVAL)),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2", temperature_c=16.0))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    return service, publisher, clock, forecasts


def feed(service: TelemetryService, *, count: int, first_minute: float = 1.0) -> None:
    measured = measured_sound_speed(DEPTH_M)
    residual = measured - sound_speed(16.0, TRUE_SALINITY_PSU, DEPTH_M)
    points = [
        residual_point(minutes=first_minute + index, residual_m_per_s=residual, depth_m=DEPTH_M)
        for index in range(count)
    ]
    if not points:
        return
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(points, forecast_run_id="forecast-2"),
    )


def test_no_score_is_published_below_the_minimum_count() -> None:
    service, publisher, clock, _ = scored_service(minimum=10)
    feed(service, count=3)
    clock.advance(INTERVAL)
    service.publish_reports()

    message = publisher.of_kind("forecast-skill")[-1]

    assert message["state"] == "insufficient-samples"
    assert message["skill_score"] is None
    assert message["model_mean_square_error"] is None
    assert message["persistence_mean_square_error"] is None
    assert message["sample_count"] == 3
    assert message["minimum_sample_count"] == 10


def test_a_previous_score_is_never_carried_forward_when_the_count_resets() -> None:
    """A change of reference restarts the reduction, and the score goes with it."""
    service, publisher, clock, forecasts = scored_service(minimum=6)
    feed(service, count=8)
    clock.advance(INTERVAL)
    service.publish_reports()

    scored = publisher.of_kind("forecast-skill")[-1]
    assert scored["skill_score"] is not None

    forecasts.set(uniform_field("forecast-3", temperature_c=12.5))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-3", minutes=20.0))
    clock.advance(INTERVAL)
    service.publish_reports()

    after = publisher.of_kind("forecast-skill")[-1]

    assert after["state"] == "insufficient-samples"
    assert after["skill_score"] is None
    assert after["sample_count"] == 0


def test_the_count_of_scores_published_below_the_minimum_is_zero() -> None:
    """SC-006 stated as the count it is."""
    service, publisher, clock, _ = scored_service(minimum=5)
    for step in range(6):
        feed(service, count=1, first_minute=1.0 + step)
        clock.advance(INTERVAL)
        service.publish_reports()

    offending = [
        message
        for message in publisher.of_kind("forecast-skill")
        if message["skill_score"] is not None
        and message["sample_count"] < message["minimum_sample_count"]
    ]

    assert offending == []


def test_a_scope_below_the_minimum_is_reported_per_scope_and_not_folded_away() -> None:
    service, publisher, clock, _ = scored_service(minimum=3)
    measured = measured_sound_speed(DEPTH_M)
    residual = measured - sound_speed(16.0, TRUE_SALINITY_PSU, DEPTH_M)
    points = [
        residual_point(minutes=1.0, residual_m_per_s=residual, latitude=48.5, longitude=-5.5),
        residual_point(minutes=2.0, residual_m_per_s=residual, latitude=48.5, longitude=-5.5),
        residual_point(minutes=3.0, residual_m_per_s=residual, latitude=48.5, longitude=-5.5),
        residual_point(minutes=4.0, residual_m_per_s=residual, latitude=49.5, longitude=-4.5),
    ]
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor", sample_report(points, forecast_run_id="forecast-2")
    )
    clock.advance(INTERVAL)
    service.publish_reports()

    by_region = {
        message["scope"]["region_id"]: message
        for message in publisher.of_kind("residual-statistics")
        if message["scope"]["level"] == "region"
    }

    assert by_region["r0c0"]["state"] == "reporting"
    assert by_region["r1c1"]["state"] == "insufficient-samples"
    assert by_region["r1c1"]["count"] == 1
