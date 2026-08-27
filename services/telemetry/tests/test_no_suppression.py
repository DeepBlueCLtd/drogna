"""Nothing is suppressed for being unflattering, and nothing is asserted about what exists.

Two prohibitions, tested together because they are the same instinct refused twice.

FR-011: a poor skill score is published as computed. There is no smoothing, no floor and no
minimum-quality gate, and the test that proves it drives a run that loses badly and asserts
the published number is the computed one to the last bit.

FR-012 and Constitution VII: telemetry publishes no list of components that ought to exist,
no enabled flag and no configuration-derived claim about what is running. The client lights
components from ``ctl/heartbeat`` alone, and a component that also shipped a roster would
give the display a second, less honest, source to prefer.
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
INTERVAL = 60

FORBIDDEN_KEYS = frozenset(
    {"components", "component_list", "enabled", "expected_components", "services"}
)


def losing_run() -> tuple[TelemetryService, RecordingPublisher, float, float]:
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=12.05))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(minimum_sample_count=2, publication_interval_seconds=float(INTERVAL)),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2", temperature_c=20.0))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    measured = measured_sound_speed(DEPTH_M)
    model_error = measured - sound_speed(20.0, TRUE_SALINITY_PSU, DEPTH_M)
    persistence_error = measured - sound_speed(12.05, TRUE_SALINITY_PSU, DEPTH_M)
    points = [
        residual_point(minutes=1.0 + index, residual_m_per_s=model_error, depth_m=DEPTH_M)
        for index in range(6)
    ]
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor", sample_report(points, forecast_run_id="forecast-2")
    )
    clock.advance(INTERVAL)
    service.publish_reports()
    service.beat(force=True)
    return service, publisher, model_error, persistence_error


def test_a_very_poor_score_is_published_exactly_as_computed() -> None:
    _, publisher, model_error, persistence_error = losing_run()

    message = publisher.of_kind("forecast-skill")[-1]
    expected = 1.0 - (model_error * model_error) / (persistence_error * persistence_error)

    assert message["skill_score"] == pytest.approx(expected)
    assert message["skill_score"] < -1.0, "the run was built to lose badly and did"
    assert message["state"] == "not-beating-persistence"


def test_no_published_message_carries_a_claim_about_what_is_running() -> None:
    _, publisher, _, _ = losing_run()

    for topic, message in publisher.published:
        if topic == "ctl/heartbeat":
            continue
        assert FORBIDDEN_KEYS.isdisjoint(message), f"{topic} carries a configuration-derived claim"


def test_the_heartbeat_speaks_only_for_this_component() -> None:
    _, publisher, _, _ = losing_run()

    heartbeats = publisher.heartbeats()

    assert heartbeats, "no heartbeat was published"
    for heartbeat in heartbeats:
        assert heartbeat["component"] == "telemetry"
        assert FORBIDDEN_KEYS.isdisjoint(heartbeat)


def test_nothing_published_could_be_taken_for_a_run_request() -> None:
    """FR-013: telemetry cannot become a second trigger path into the control loop."""
    _, publisher, _, _ = losing_run()

    topics = {topic for topic, _ in publisher.published}

    assert topics <= {"ctl/telemetry/telemetry", "ctl/heartbeat"}
    assert not any(
        key in message
        for _, message in publisher.published
        for key in ("divergence_id", "run_request", "requested_run_id")
    )


def test_an_identically_zero_residual_stream_is_reported_and_flagged_not_hidden() -> None:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(minimum_sample_count=2, publication_interval_seconds=float(INTERVAL)),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    points = [residual_point(minutes=1.0 + index, residual_m_per_s=0.0) for index in range(6)]
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor", sample_report(points, forecast_run_id="forecast-2")
    )
    clock.advance(INTERVAL)
    service.publish_reports()

    scenario = [
        message
        for message in publisher.of_kind("residual-statistics")
        if message["scope"]["level"] == "scenario"
    ][-1]

    assert scenario["root_mean_square_m_per_s"] == 0.0
    assert scenario["implausible"] is True
    assert scenario["implausible_reason"] is not None
