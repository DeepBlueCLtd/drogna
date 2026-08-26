"""Starting and restarting: nothing is raised before the window exists, and the store is asked once.

FR-022 and FR-023 together. The monitor holds its window in memory and does not query the
observation store during normal operation; the single exception is one catch-up query at
startup, and the count of queries after that is zero (SC-003). A monitor that queried on
every reconnection would be querying during normal operation by another name, so a
reconnection restarts warm-up without re-querying.
"""

from __future__ import annotations

from collections.abc import Sequence

from control_loop import (
    EPOCH,
    manual_clock,
    monitor_document,
    observation_messages,
    temperature_for_bias,
)
from harness_core.clock import ManualClock
from harness_monitor.coverage import ForecastField
from harness_monitor.observations import Sounding
from harness_monitor.publish import MonitorState
from harness_monitor.service import MonitorService
from harness_types.config.monitor import DrognaMonitorConfiguration
from monitor_support import uniform_field

MINUTE_MICROS = 60 * 1_000_000


class OneForecast:
    """A forecast source holding one field, counting how often it is asked."""

    def __init__(self, field: ForecastField | None) -> None:
        self._field = field
        self.reads = 0

    def current(self) -> ForecastField | None:
        self.reads += 1
        return self._field


class CountingCatchup:
    """The observation store, as far as the monitor is concerned: one query, counted."""

    def __init__(self, soundings: Sequence[Sounding] = ()) -> None:
        self._soundings = soundings
        self.calls = 0

    def soundings(self, *, since_micros: int, until_micros: int, limit: int) -> Sequence[Sounding]:
        del since_micros, until_micros, limit
        self.calls += 1
        return self._soundings


def monitor(clock: ManualClock, forecasts: OneForecast, **overrides) -> MonitorService:
    settings = DrognaMonitorConfiguration.model_validate(monitor_document(**overrides))
    return MonitorService(settings, clock=clock, forecasts=forecasts)


def biased_stream(field: ForecastField, *, minutes: Sequence[float], bias: float = 3.5):
    """Observations at one place carrying a sustained sound-speed bias."""
    messages = []
    for minute in minutes:
        temperature = temperature_for_bias(
            field,
            latitude=49.0,
            longitude=-5.0,
            depth_m=50.0,
            when_micros=EPOCH.micros + int(minute * MINUTE_MICROS),
            bias_m_per_s=bias,
        )
        messages.extend(
            observation_messages(
                platform="platform_a",
                minutes=minute,
                latitude=49.0,
                longitude=-5.0,
                depth_m=50.0,
                temperature_c=temperature,
                salinity_psu=35.0,
            )
        )
    return messages


def test_nothing_is_raised_before_warm_up_completes() -> None:
    clock = manual_clock()
    field = uniform_field(origin_micros=EPOCH.micros, hours=2)
    forecasts = OneForecast(field)
    service = monitor(clock, forecasts, warmup_span_seconds=900.0)
    service.start()

    assert service.state is MonitorState.WARMING

    raised = [
        service.handle(topic, payload)
        for topic, payload in biased_stream(field, minutes=(0.0, 2.0, 4.0, 6.0))
    ]

    assert [message for message in raised if message is not None] == []
    assert service.state is MonitorState.WARMING


def test_a_divergence_is_raised_once_warm_up_has_elapsed() -> None:
    field = uniform_field(origin_micros=EPOCH.micros, hours=2)
    forecasts = OneForecast(field)
    service = monitor(manual_clock(), forecasts, warmup_span_seconds=60.0)
    service.start()

    raised = [
        service.handle(topic, payload)
        for topic, payload in biased_stream(field, minutes=(0.0, 2.0, 8.0, 14.0, 20.0))
    ]

    assert service.state is MonitorState.SCORING
    assert len([message for message in raised if message is not None]) == 1


def test_catch_up_asks_the_store_exactly_once_and_never_again() -> None:
    field = uniform_field(origin_micros=EPOCH.micros, hours=2)
    forecasts = OneForecast(field)
    settings = DrognaMonitorConfiguration.model_validate(
        monitor_document(warmup_mode="catchup", warmup_span_seconds=600.0)
    )
    catchup = CountingCatchup()
    service = MonitorService(settings, clock=manual_clock(), forecasts=forecasts, catchup=catchup)

    service.start()
    assert catchup.calls == 1
    assert service.store_queries == 1

    for topic, payload in biased_stream(field, minutes=(0.0, 6.0, 12.0, 18.0)):
        service.handle(topic, payload)

    assert catchup.calls == 1, "the store was queried during normal operation"
    assert service.store_queries == 1


def test_a_reconnection_restarts_warm_up_without_asking_the_store_again() -> None:
    field = uniform_field(origin_micros=EPOCH.micros, hours=2)
    settings = DrognaMonitorConfiguration.model_validate(
        monitor_document(warmup_mode="catchup", warmup_span_seconds=600.0)
    )
    catchup = CountingCatchup()
    service = MonitorService(
        settings, clock=manual_clock(), forecasts=OneForecast(field), catchup=catchup
    )
    service.start()

    service.reconnected()

    assert service.state is MonitorState.WARMING
    assert catchup.calls == 1


def test_a_monitor_with_no_forecast_says_so_rather_than_scoring_nothing() -> None:
    service = monitor(manual_clock(), OneForecast(None), warmup_span_seconds=60.0)
    service.start()

    for topic, payload in observation_messages(
        platform="platform_a",
        minutes=0.0,
        latitude=49.0,
        longitude=-5.0,
        depth_m=50.0,
        temperature_c=12.0,
        salinity_psu=35.0,
    ):
        service.handle(topic, payload)
    for topic, payload in observation_messages(
        platform="platform_a",
        minutes=30.0,
        latitude=49.0,
        longitude=-5.0,
        depth_m=50.0,
        temperature_c=12.0,
        salinity_psu=35.0,
    ):
        service.handle(topic, payload)

    assert service.state is MonitorState.NO_FORECAST
