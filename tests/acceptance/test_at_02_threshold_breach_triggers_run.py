"""AT-02: a threshold breach in the observation stream triggers a model run, visibly.

The acceptance test the control loop exists to pass. A forecast is published, observations
establish a sustained sound-speed residual against it, and the four control messages appear
in order —

    ctl/divergence -> ctl/run-request -> ctl/run-started -> ctl/run-published

— each carrying the same run identifier from the request onward, within the configured
budget of simulation time. Then the whole scenario is replayed from the same seeds and the
sequence, the identifiers, the payloads and both field outputs are compared byte for byte.

The four services are wired here in one process, with one manual clock and one recorder
standing in for the broker. That is not a mock of the loop: every component is the real one,
every message is the real message validated by its master, and the transport is the one thing
being stood in for. What is being asserted is the ordering and the identity of what the
components produce, and neither depends on the broker.

Clock mode is lockstep, because that is the mode in which drogna claims byte-identical
replay (ADR-0009). The clock is advanced explicitly between steps, so the budget assertion
is a statement about simulation time and not about how fast this machine runs a test.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from control_loop import (
    CURRENT_POINTER,
    FORECAST_FILE,
    PARTIAL_SUFFIX,
    RUNS_DIRNAME,
    Recorder,
    manual_clock,
    model_runner_document,
    monitor_document,
    observation_messages,
    publisher_document,
    scheduler_document,
    temperature_for_bias,
)
from harness_core.clock import SimInstant
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.staging import Staging
from harness_monitor.coverage import StoredForecasts
from harness_monitor.service import RUN_PUBLISHED_TOPIC, MonitorService
from harness_publisher.service import PublisherService
from harness_scheduler.service import DIVERGENCE_TOPIC, SchedulerService
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.publisher import DrognaPublisherConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from runner_support import ground_truth, run_request

LOOP_TOPICS = ("ctl/divergence", "ctl/run-request", "ctl/run-started", "ctl/run-published")
BUDGET_SECONDS = 3600.0
BIAS_M_PER_S = 3.5
SAMPLE_MINUTES = (2, 8, 14, 20, 26)
LATITUDE = 49.0
LONGITUDE = -5.0
DEPTH_M = 50.0
MINUTE_MICROS = 60 * 1_000_000


def scenario(tmp_path: Path) -> tuple[list[tuple[str, dict[str, Any]]], bytes, bytes]:
    """Drive the whole loop once, and hand back everything it said and everything it wrote."""
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)
    clock = manual_clock()
    recorder = Recorder()

    runner = ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(model_runner_document(step_count=4)),
        clock=clock,
        ground_truth=ground_truth(),
        staging=Staging(
            staging,
            forecast_file="forecast.nc",
            uncertainty_file="uncertainty.nc",
            manifest_file="run.json",
            partial_suffix=PARTIAL_SUFFIX,
        ),
        publisher=recorder,
    )
    publisher = PublisherService(
        DrognaPublisherConfiguration.model_validate(
            publisher_document(staging=str(staging), catalogue=str(catalogue))
        ),
        clock=clock,
        publisher=recorder,
    )
    scheduler = SchedulerService(
        DrognaSchedulerConfiguration.model_validate(
            scheduler_document(minimum_interval_seconds=0.0)
        ),
        clock=clock,
        publisher=recorder,
    )
    forecasts = StoredForecasts(
        catalogue, pointer="current", runs_dirname=RUNS_DIRNAME, forecast_file="forecast.nc"
    )
    monitor = MonitorService(
        DrognaMonitorConfiguration.model_validate(
            monitor_document(root_directory=str(catalogue), warmup_span_seconds=60.0)
        ),
        clock=clock,
        forecasts=forecasts,
        publisher=recorder,
    )

    # A forecast the observations can disagree with. Nothing can diverge from nothing, and a
    # monitor with no published field reports no-forecast and raises nothing.
    runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-initial", ensemble_size=3))
    publisher.take("run-initial")
    recorder.published.clear()

    monitor.start()
    field = forecasts.current()
    assert field is not None, "the loop cannot start without a published forecast"

    for minute in SAMPLE_MINUTES:
        clock.advance(minute - clock.tick().index)
        temperature = temperature_for_bias(
            field,
            latitude=LATITUDE,
            longitude=LONGITUDE,
            depth_m=DEPTH_M,
            when_micros=clock.now().micros,
            bias_m_per_s=BIAS_M_PER_S,
        )
        for topic, payload in observation_messages(
            platform="platform_a",
            minutes=minute,
            latitude=LATITUDE,
            longitude=LONGITUDE,
            depth_m=DEPTH_M,
            temperature_c=temperature,
            salinity_psu=35.0,
        ):
            divergence = monitor.handle(topic, payload)
            if divergence is None:
                continue
            request = scheduler.handle(DIVERGENCE_TOPIC, divergence)
            if request is None:
                continue
            staged = runner.handle(RUN_REQUEST_TOPIC, request)
            assert staged is not None, "the run the loop asked for did not complete"
            clock.advance(1)  # the run takes a minute of simulation time
            announcement = publisher.take(staged.descriptor["run_id"])
            assert announcement is not None
            scheduler.handle(RUN_PUBLISHED_TOPIC, announcement)
            monitor.handle(RUN_PUBLISHED_TOPIC, announcement)

    # Resolve the pointer the way the layout says a reader must (ADR-0011): read one run
    # identifier out of a text file, then open that run under `runs/`. Joining the pointer
    # into a path was how this test read a store the publisher had stopped writing.
    current_run = (catalogue / CURRENT_POINTER).read_text(encoding="utf-8").strip()
    run_directory = catalogue / RUNS_DIRNAME / current_run
    return (
        list(recorder.published),
        (run_directory / FORECAST_FILE).read_bytes(),
        (run_directory / "uncertainty.nc").read_bytes(),
    )


def loop_messages(published: list[tuple[str, dict[str, Any]]]) -> list[tuple[str, dict[str, Any]]]:
    return [(topic, message) for topic, message in published if topic in LOOP_TOPICS]


def test_the_four_control_messages_appear_in_order(tmp_path: Path) -> None:
    published, _, _ = scenario(tmp_path)

    sequence = loop_messages(published)

    assert [topic for topic, _ in sequence] == list(LOOP_TOPICS)


def test_the_run_identifier_is_the_same_from_the_request_onward(tmp_path: Path) -> None:
    published, _, _ = scenario(tmp_path)
    sequence = dict(loop_messages(published))

    run_id = sequence["ctl/run-request"]["run_id"]

    assert run_id.startswith("run-")
    assert sequence["ctl/run-started"]["run_id"] == run_id
    assert sequence["ctl/run-published"]["run_id"] == run_id
    assert sequence["ctl/run-published"]["current"] is True


def test_the_divergence_that_justified_the_run_travels_with_it(tmp_path: Path) -> None:
    published, _, _ = scenario(tmp_path)
    sequence = dict(loop_messages(published))

    divergence_id = sequence["ctl/divergence"]["divergence_id"]

    assert sequence["ctl/run-request"]["divergence"]["divergence_id"] == divergence_id
    assert sequence["ctl/run-started"]["divergence_id"] == divergence_id
    assert sequence["ctl/divergence"]["residual"]["sample_count"] >= 2
    assert sequence["ctl/divergence"]["persistence"]["rule"] in {"spatial", "temporal"}


def test_the_loop_closes_inside_the_configured_budget_of_simulation_time(tmp_path: Path) -> None:
    published, _, _ = scenario(tmp_path)
    sequence = dict(loop_messages(published))

    raised = SimInstant.from_iso(sequence["ctl/divergence"]["sim_time"])
    visible = SimInstant.from_iso(sequence["ctl/run-published"]["sim_time"])
    elapsed = (visible - raised) / 1_000_000

    assert 0 < elapsed <= BUDGET_SECONDS


def test_the_scenario_replays_identically(tmp_path: Path) -> None:
    """SC-010: the sequence, the identifiers, the payloads and both fields are the same."""
    first_messages, first_forecast, first_uncertainty = scenario(tmp_path / "first")
    second_messages, second_forecast, second_uncertainty = scenario(tmp_path / "second")

    assert loop_messages(first_messages) == loop_messages(second_messages)
    assert first_forecast == second_forecast
    assert first_uncertainty == second_uncertainty


def test_nothing_was_published_that_the_loop_did_not_account_for(tmp_path: Path) -> None:
    """Every message on the control namespace is one of the loop's or is telemetry."""
    published, _, _ = scenario(tmp_path)

    assert {topic for topic, _ in published} <= {*LOOP_TOPICS, "ctl/telemetry", "ctl/heartbeat"}
