"""The same inputs produce the same messages, byte for byte. SC-008.

Telemetry draws no random numbers, so its determinism obligation is narrow and total: given
the same ordered stream and the same clock, it must publish the same ordered sequence of
payloads. Anything that leaked in from outside — a host clock, an iteration order that
depends on hashing, a set where a list was meant — would show up here as a diff, which is
the only place it would ever be cheap to find.

The comparison is on the serialised bytes rather than on the parsed dictionaries, because
the bytes are what a subscriber receives and what a replay is compared on.
"""

from __future__ import annotations

import json

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


def run_once() -> list[tuple[str, bytes]]:
    """One whole scenario, from an empty component to a published skill score."""
    forecasts = StubForecasts(uniform_field("forecast-1", temperature_c=12.2))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(minimum_sample_count=3, publication_interval_seconds=float(INTERVAL)),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    service.beat(force=True)

    forecasts.set(uniform_field("forecast-2", temperature_c=15.0))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-2"))

    for step in range(5):
        service.handle(
            f"{TELEMETRY_PREFIX}/monitor",
            sample_report(
                [
                    residual_point(
                        minutes=step + index / 4.0,
                        residual_m_per_s=(index % 7) - 3.0,
                        latitude=48.5 + (index % 2),
                        longitude=-5.5 + (index % 2),
                    )
                    for index in range(4)
                ],
                forecast_run_id="forecast-2",
                minutes=float(step),
                tick=step,
            ),
        )
        service.handle(
            f"{TELEMETRY_PREFIX}/scheduler",
            {
                "component": "scheduler",
                "scenario_run_id": "run-test-a",
                "sim_time": "1970-01-01T00:00:00.000000Z",
                "tick": step,
                "kind": "scheduler-decision",
                "divergence_id": f"divergence-{step}",
                "decision": "minimum-interval",
                "detail": "a run was requested too recently",
                "run_id": None,
            },
        )
        clock.advance(INTERVAL)
        service.publish_reports()

    service.handle(
        f"{TELEMETRY_PREFIX}/monitor", summary_report(scored=4, mean_absolute_m_per_s=1.25)
    )
    forecasts.set(uniform_field("forecast-3", temperature_c=12.3))
    service.handle(RUN_PUBLISHED_TOPIC, run_published("forecast-3", minutes=6.0))
    clock.advance(INTERVAL)
    service.publish_reports()

    return [
        (topic, json.dumps(message, sort_keys=True).encode("utf-8"))
        for topic, message in publisher.published
    ]


def test_two_runs_of_the_same_scenario_publish_identical_bytes() -> None:
    first = run_once()
    second = run_once()

    assert first == second


def test_the_run_actually_published_something_worth_comparing() -> None:
    """A replay test over an empty sequence passes and proves nothing."""
    published = run_once()

    kinds = {json.loads(payload).get("kind") for _, payload in published}

    assert "residual-statistics" in kinds
    assert "forecast-skill" in kinds
    assert len(published) > 10
