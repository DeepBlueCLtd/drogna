"""The component as a whole: states, the publication interval, and degradation going loud.

The interval is the property most easily got wrong and hardest to notice: it is measured in
*simulation* time, so under clock acceleration the number of samples in each message rises
and the number of messages per second does not (SC-009). Measuring it in host seconds would
turn a fast replay into a flood, and a paused clock into a component that went on reporting
as though the world were still moving.

Degradation is the other half. When the residual stream stops, every affected statistic must
say ``stale`` within the configured window and keep saying when it was last really updated.
A statistic that went on presenting its last value as current would be worse than no
statistic at all, which is the whole reason this component exists.
"""

from __future__ import annotations

import pytest
from harness_telemetry.publish import TelemetryState
from harness_telemetry.scopes import ScopeLevel
from harness_telemetry.service import RUN_PUBLISHED_TOPIC, TELEMETRY_PREFIX, TelemetryService
from telemetry_support import (
    RecordingPublisher,
    StubForecasts,
    manual_clock,
    residual_point,
    run_published,
    sample_report,
    settings,
    summary_report,
    uniform_field,
)

INTERVAL = 60
STALENESS = 600


def build(
    *,
    minimum: int = 2,
    interval: float = float(INTERVAL),
    staleness: float = float(STALENESS),
    field: object | None = None,
):
    forecasts = StubForecasts(field)
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(
            minimum_sample_count=minimum,
            publication_interval_seconds=interval,
            staleness_window_seconds=staleness,
        ),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    return service, publisher, clock, forecasts


def test_with_nothing_published_the_state_is_no_forecast() -> None:
    service, publisher, clock, _ = build()

    assert service.state is TelemetryState.NO_FORECAST

    clock.advance(INTERVAL)
    service.publish_reports()
    message = publisher.of_kind("forecast-skill")[-1]

    assert message["state"] == "no-forecast"
    assert message["skill_score"] is None
    assert message["forecast_run_id"] is None


def test_a_first_publication_leaves_nothing_prior_to_hold_constant() -> None:
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    clock.advance(INTERVAL)
    service.publish_reports()

    message = publisher.of_kind("forecast-skill")[-1]

    assert message["state"] == "insufficient-reference"
    assert message["reference_run_id"] is None
    assert message["skill_score"] is None
    assert forecasts.reads >= 1


def test_the_state_moves_from_warming_to_reporting_at_the_minimum_count() -> None:
    service, _, _, forecasts = build(minimum=3, field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    assert service.state is TelemetryState.WARMING

    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=1.0 + index, residual_m_per_s=0.5) for index in range(3)],
            forecast_run_id="forecast-2",
        ),
    )

    assert service.state is TelemetryState.REPORTING


def test_nothing_is_published_before_the_interval_has_elapsed_in_simulation_time() -> None:
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    clock.advance(INTERVAL - 1)
    assert service.publish_reports() == []
    assert publisher.published == []

    clock.advance(1)
    assert service.publish_reports() != []


def test_the_message_rate_is_bounded_by_the_interval_and_not_by_the_sample_rate() -> None:
    """SC-009: acceleration raises samples per message, not messages per second."""
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    for step in range(4 * INTERVAL):
        service.handle(
            f"{TELEMETRY_PREFIX}/monitor",
            sample_report(
                [residual_point(minutes=step / 60.0, residual_m_per_s=0.25)],
                forecast_run_id="forecast-2",
            ),
        )
        clock.advance(1)
        service.publish_reports()

    assert len(publisher.of_kind("forecast-skill")) == 4


def test_when_the_residual_stream_stops_every_statistic_says_stale() -> None:
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=index / 60.0, residual_m_per_s=0.5) for index in range(4)],
            forecast_run_id="forecast-2",
        ),
    )

    clock.advance(INTERVAL)
    service.publish_reports()
    assert all(
        message["freshness"] == "fresh" for message in publisher.of_kind("residual-statistics")
    )

    before = len(publisher.of_kind("residual-statistics"))
    clock.advance(STALENESS + INTERVAL)
    service.publish_reports()
    after = publisher.of_kind("residual-statistics")[before:]

    assert after, "nothing was published after the stream stopped"
    for message in after:
        assert message["freshness"] == "stale"
        assert message["last_updated_sim_time"] is not None
        assert message["count"] > 0, "the last real figures are kept, not blanked"


def test_no_statistic_is_ever_fresh_with_an_update_older_than_the_window() -> None:
    """SC-007 as the count it is: zero."""
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=index / 60.0, residual_m_per_s=0.5) for index in range(4)],
            forecast_run_id="forecast-2",
        ),
    )
    for _ in range(20):
        clock.advance(INTERVAL)
        service.publish_reports()

    from harness_core.clock import SimInstant

    offending = [
        message
        for message in publisher.of_kind("residual-statistics")
        if message["freshness"] == "fresh"
        and SimInstant.from_iso(message["sim_time"]).micros
        - SimInstant.from_iso(message["last_updated_sim_time"]).micros
        > STALENESS * 1_000_000
    ]

    assert offending == []


def test_a_statistic_that_revives_records_the_span_it_was_stale_for() -> None:
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=0.0, residual_m_per_s=0.5)], forecast_run_id="forecast-2"
        ),
    )
    gap_seconds = STALENESS + 300
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=gap_seconds / 60.0, residual_m_per_s=0.5)],
            forecast_run_id="forecast-2",
        ),
    )
    clock.advance(gap_seconds + INTERVAL)
    service.publish_reports()

    scenario = [
        message
        for message in publisher.of_kind("residual-statistics")
        if message["scope"]["level"] == "scenario"
    ][-1]

    assert scenario["stale_span_seconds"] == pytest.approx(300.0)


def test_a_superseded_run_is_published_as_a_closed_record() -> None:
    service, publisher, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=index / 60.0, residual_m_per_s=2.0) for index in range(4)],
            forecast_run_id="forecast-2",
        ),
    )
    forecasts.set(uniform_field("forecast-3"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-3", minutes=5.0))
    clock.advance(INTERVAL)
    service.publish_reports()

    closed = [
        message for message in publisher.of_kind("residual-statistics") if message["closed"] is True
    ]

    assert closed
    assert {message["forecast_run_id"] for message in closed} == {"forecast-2"}


def test_the_component_ignores_the_echo_of_its_own_output() -> None:
    service, _, clock, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor",
        sample_report(
            [residual_point(minutes=index / 60.0, residual_m_per_s=1.0) for index in range(4)],
            forecast_run_id="forecast-2",
        ),
    )
    clock.advance(INTERVAL)
    published = service.publish_reports()

    for message in published:
        service.handle(f"{TELEMETRY_PREFIX}/telemetry", message)

    assert service.unreadable == 0
    record = service.book.record_for("forecast-2")
    assert record is not None
    scope = record.scope(ScopeLevel.SCENARIO, None)
    assert scope is not None
    assert scope.statistic.count == 4


def test_a_summary_without_attribution_lands_on_the_run_open_when_it_arrived() -> None:
    service, _, _, forecasts = build(field=uniform_field("forecast-1"))
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))
    service.handle(
        f"{TELEMETRY_PREFIX}/monitor", summary_report(scored=9, mean_absolute_m_per_s=1.5)
    )

    record = service.book.record_for("forecast-2")

    assert record is not None
    scenario = record.scope(ScopeLevel.SCENARIO, None)
    assert service.unattributable == 0
    assert scenario is not None
    assert scenario.statistic.count == 9


def test_a_message_that_is_not_telemetry_at_all_is_counted_and_not_believed() -> None:
    service, _, _, _ = build(field=uniform_field("forecast-1"))
    service.handle(f"{TELEMETRY_PREFIX}/monitor", {"kind": "residual-sample"})

    assert service.unreadable == 1
