"""At a rate of zero the statistics stop and the heartbeat does not. SC-011, ADR-0006.

The two clocks in this component are separate on purpose and this is the test that keeps
them separate. The publication interval is simulation time, so pinning the rate to zero
stops simulated time and stops publication with it — correctly, because nothing has moved
and there is nothing new to say. Heartbeat cadence is *real* time, because liveness answers
"is this process alive?", which is a fact about the host; a running component must not grey
out during exactly the rate-zero capture FR-53 exists to make meaningful.

The simulation time a heartbeat carries is payload rather than schedule, so it is expected to
repeat unchanged while the clock is pinned. A heartbeat whose simulation time advanced at
rate zero would be a component inventing time, which is the failure Constitution I exists to
prevent.
"""

from __future__ import annotations

from harness_core.clock import ClockMode
from harness_telemetry.publish import TelemetryState
from harness_telemetry.service import RUN_PUBLISHED_TOPIC, TELEMETRY_PREFIX, TelemetryService
from telemetry_support import (
    RecordingPublisher,
    StubForecasts,
    manual_clock,
    residual_point,
    run_published,
    sample_report,
    settings,
    uniform_field,
)

INTERVAL = 60
LIVENESS_INTERVALS = 12


def pinned() -> tuple[TelemetryService, RecordingPublisher]:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    publisher = RecordingPublisher()
    clock = manual_clock(mode=ClockMode.PAUSED, rate=0.0)
    service = TelemetryService(
        settings(minimum_sample_count=2, publication_interval_seconds=float(INTERVAL)),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=index / 60.0, residual_m_per_s=0.75) for index in range(4)],
            forecast_run_id="forecast-2",
        ),
    )
    return service, publisher


def test_the_heartbeat_continues_while_simulation_time_is_pinned() -> None:
    service, publisher = pinned()

    for _ in range(LIVENESS_INTERVALS):
        service.beat(force=True)

    heartbeats = publisher.heartbeats()

    assert len(heartbeats) == LIVENESS_INTERVALS
    assert all(heartbeat["component"] == "telemetry" for heartbeat in heartbeats)
    assert all(heartbeat["detail"] == TelemetryState.REPORTING.value for heartbeat in heartbeats)


def test_the_simulation_time_a_heartbeat_carries_does_not_move_at_rate_zero() -> None:
    """Payload, not schedule. A component that advanced it here would be inventing time."""
    service, publisher = pinned()

    for _ in range(LIVENESS_INTERVALS):
        service.beat(force=True)

    instants = {heartbeat["sim_time"] for heartbeat in publisher.heartbeats()}

    assert len(instants) == 1


def test_statistics_publication_correctly_stops_at_rate_zero() -> None:
    service, publisher = pinned()

    for _ in range(LIVENESS_INTERVALS):
        service.beat(force=True)
        service.publish_reports()

    assert publisher.of_kind("residual-statistics") == []
    assert publisher.of_kind("forecast-skill") == []


def test_the_count_of_intervals_without_a_heartbeat_is_zero() -> None:
    """SC-011 as the count it is."""
    service, _ = pinned()

    missed = 0
    for _ in range(LIVENESS_INTERVALS):
        if service.beat(force=True) is None:
            missed += 1

    assert missed == 0
