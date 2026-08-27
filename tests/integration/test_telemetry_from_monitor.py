"""Telemetry consumes what feature 009's monitor actually publishes, and says what it cannot.

Two claims are tested here, and the second is the awkward one.

The first is conformance: the message the real :class:`~harness_monitor.service.MonitorService`
puts on ``ctl/telemetry`` validates against ``contracts/schemas/telemetry.schema.json``,
which this feature owns, and the telemetry component accepts it without a single unreadable
message. The contract was written by reading the monitor rather than by proposing a shape
for it to adopt, and this is the test that keeps that true.

The second is the gap. What the monitor publishes today is ``residual-summary``: a count and
a mean of *magnitudes*, reset each run boundary. A mean of magnitudes is not a bias, and a
second moment cannot be recovered from a first, so the statistics telemetry can build from
it are a count and a mean magnitude — and the published message says so through ``basis``
and reports null for the moments it cannot honestly claim. The contract carries
``residual-sample`` for the day the monitor is ready to publish per-residual reports; until
then this test pins the honest degradation rather than letting a zero stand in for a number
nobody computed.

Telemetry issues nothing to the observation store and nothing to the query layer over any
of it (SC-003).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from control_loop import (
    EPOCH,
    Recorder,
    monitor_document,
    observation_messages,
    temperature_for_bias,
)
from control_loop import manual_clock as loop_clock
from harness_core.config import validate_document
from harness_monitor.coverage import ForecastField
from harness_monitor.service import MonitorService
from harness_telemetry.publish import TELEMETRY_BRANCH
from harness_telemetry.scopes import ScopeLevel
from harness_telemetry.service import RUN_PUBLISHED_TOPIC, TelemetryService
from harness_types.config.monitor import DrognaMonitorConfiguration
from monitor_support import uniform_field as monitor_field
from telemetry_support import (
    RecordingPublisher,
    StubForecasts,
    manual_clock,
    settings,
    uniform_field,
)

MINUTE_MICROS = 60 * 1_000_000
TELEMETRY_SCHEMA = "telemetry.schema.json"


class OneForecast:
    """The coverage read port, holding one field."""

    def __init__(self, field: ForecastField) -> None:
        self._field = field
        self.reads = 0

    def current(self) -> ForecastField:
        self.reads += 1
        return self._field


def monitor_telemetry() -> list[dict[str, Any]]:
    """Everything the real monitor publishes on the telemetry branch over a short run."""
    field = monitor_field(origin_micros=EPOCH.micros, hours=2)
    recorder = Recorder()
    configuration = DrognaMonitorConfiguration.model_validate(
        monitor_document(warmup_span_seconds=60.0)
    )
    service = MonitorService(
        configuration,
        clock=loop_clock(),
        forecasts=OneForecast(field),
        publisher=recorder,
    )
    service.start()
    for minute in (0.0, 4.0, 8.0, 12.0):
        temperature = temperature_for_bias(
            field,
            latitude=49.0,
            longitude=-5.0,
            depth_m=50.0,
            when_micros=EPOCH.micros + int(minute * MINUTE_MICROS),
            bias_m_per_s=2.5,
        )
        for topic, payload in observation_messages(
            platform="platform_a",
            minutes=minute,
            latitude=49.0,
            longitude=-5.0,
            depth_m=50.0,
            temperature_c=temperature,
            salinity_psu=35.0,
        ):
            service.handle(topic, payload)
    service.report()
    return recorder.on(TELEMETRY_BRANCH)


SCHEMAS = Path(__file__).resolve().parents[2] / "contracts" / "schemas"


def schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def test_the_monitor_publishes_against_the_contract_this_feature_owns() -> None:
    published = monitor_telemetry()

    assert published, "the monitor published nothing on the telemetry branch"
    for message in published:
        validate_document(
            message,
            schema(TELEMETRY_SCHEMA),
            source=TELEMETRY_BRANCH,
            referenced_schemas=[
                schema("ingest-telemetry.schema.json"),
                schema("offload-telemetry.schema.json"),
            ],
        )


def telemetry_over(messages: list[dict[str, Any]]) -> tuple[TelemetryService, RecordingPublisher]:
    forecasts = StubForecasts(uniform_field("forecast-1"))
    publisher = RecordingPublisher()
    clock = manual_clock()
    service = TelemetryService(
        settings(minimum_sample_count=2, publication_interval_seconds=60.0),
        clock=clock,
        forecasts=forecasts,
        publisher=publisher,
    )
    service.start()
    forecasts.set(uniform_field("forecast-2"))
    service.handle(RUN_PUBLISHED_TOPIC, {"run_id": "forecast-2"})
    for message in messages:
        service.handle(TELEMETRY_BRANCH, message)
    clock.advance(60)
    service.publish_reports()
    return service, publisher


def test_telemetry_takes_the_monitor_message_without_a_single_unreadable() -> None:
    service, _ = telemetry_over(monitor_telemetry())

    assert service.unreadable == 0
    assert service.unattributable == 0


def test_a_summary_yields_a_count_and_a_mean_magnitude_and_null_moments() -> None:
    """The honest degradation: what a summary cannot carry is published as null, not zero."""
    published = monitor_telemetry()
    scored = sum(message["scored"] for message in published)
    _, publisher = telemetry_over(published)

    statistics = [
        message
        for message in publisher.of_kind("residual-statistics")
        if message["scope"]["level"] == ScopeLevel.SCENARIO.value
    ]

    assert statistics, "no scenario statistics were published"
    latest = statistics[-1]
    assert latest["basis"] == "summaries"
    assert latest["count"] == scored
    assert latest["mean_absolute_m_per_s"] is not None
    assert latest["mean_m_per_s"] is None
    assert latest["root_mean_square_m_per_s"] is None
    assert latest["minimum_m_per_s"] is None
    assert latest["maximum_m_per_s"] is None


def test_telemetry_asks_the_observation_store_and_the_query_layer_for_nothing() -> None:
    """SC-003, as a number rather than as a claim."""
    service, _ = telemetry_over(monitor_telemetry())

    assert service.store_queries == 0
