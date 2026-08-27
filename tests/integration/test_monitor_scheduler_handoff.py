"""Fifty divergences inside one interval buy one run, and fifty recorded decisions.

SC-005 and SC-006, and the failure mode C-12 owns. The monitor is deliberately not throttled:
it says what it sees, and the scheduler is where the policy lives. This test drives the two
together — real divergences from a real monitor, into a real scheduler — because the property
being asserted is a property of the pair.
"""

from __future__ import annotations

from control_loop import (
    EPOCH,
    Recorder,
    divergence_payload,
    manual_clock,
    monitor_document,
    observation_messages,
    scheduler_document,
    temperature_for_bias,
)
from harness_monitor.service import MonitorService
from harness_scheduler.policy import Decision
from harness_scheduler.service import DIVERGENCE_TOPIC, SchedulerService
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from monitor_support import uniform_field

MINUTE_MICROS = 60 * 1_000_000


class OneForecast:
    def __init__(self, field) -> None:
        self._field = field

    def current(self):
        return self._field


def test_a_burst_of_fifty_divergences_buys_one_run_and_fifty_decisions() -> None:
    clock = manual_clock()
    settings = DrognaSchedulerConfiguration.model_validate(
        scheduler_document(minimum_interval_seconds=1800.0, outstanding_timeout_seconds=7200.0)
    )
    recorder = Recorder()
    scheduler = SchedulerService(settings, clock=clock, publisher=recorder)

    for index in range(50):
        scheduler.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id=f"d{index}"))

    assert len(recorder.on("ctl/run-request")) == 1
    assert len(scheduler.decisions) == 50
    reasons = {record["decision"] for record in scheduler.decisions}
    assert reasons == {Decision.ACCEPTED.value, Decision.DUPLICATE_OUTSTANDING.value}


def test_the_scheduler_declines_on_the_interval_once_the_run_is_published() -> None:
    """With nothing outstanding the other rule takes over, and it is the interval."""
    clock = manual_clock()
    settings = DrognaSchedulerConfiguration.model_validate(
        scheduler_document(minimum_interval_seconds=1800.0)
    )
    recorder = Recorder()
    scheduler = SchedulerService(settings, clock=clock, publisher=recorder)

    for index in range(50):
        scheduler.handle(DIVERGENCE_TOPIC, divergence_payload(divergence_id=f"d{index}"))
        published = recorder.on("ctl/run-request")
        scheduler.handle_run_published({"run_id": published[-1]["run_id"]})

    assert len(recorder.on("ctl/run-request")) == 1
    assert scheduler.decisions[-1]["decision"] == Decision.MINIMUM_INTERVAL.value


def test_a_monitor_and_a_scheduler_together_produce_one_request() -> None:
    """End to end over the first two components: observations in, one run request out."""
    field = uniform_field(origin_micros=EPOCH.micros, hours=4)
    clock = manual_clock()
    monitor = MonitorService(
        DrognaMonitorConfiguration.model_validate(monitor_document(warmup_span_seconds=60.0)),
        clock=clock,
        forecasts=OneForecast(field),
    )
    scheduler = SchedulerService(
        DrognaSchedulerConfiguration.model_validate(
            scheduler_document(minimum_interval_seconds=3600.0)
        ),
        clock=clock,
        publisher=Recorder(),
    )
    monitor.start()

    requests = []
    for minute in range(0, 120, 6):
        temperature = temperature_for_bias(
            field,
            latitude=49.0,
            longitude=-5.0,
            depth_m=50.0,
            when_micros=EPOCH.micros + minute * MINUTE_MICROS,
            bias_m_per_s=3.5,
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
            divergence = monitor.handle(topic, payload)
            if divergence is not None:
                request = scheduler.handle_divergence(divergence)
                if request is not None:
                    requests.append(request)

    assert monitor.raised >= 1
    assert len(requests) == 1
    assert requests[0]["divergence"]["persistence"]["sample_count"] >= 2
