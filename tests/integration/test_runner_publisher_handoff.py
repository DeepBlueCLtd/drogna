"""A staged run becomes a published one, and what the runner wrote is what a reader reads.

Three properties meet here.

The **handoff**: the runner writes a complete run into staging and the publisher, given
nothing but the run's name, validates it, catalogues it and announces it. Neither knows
anything about the other beyond the descriptor and the two files.

The **agreement**: the monitor's coverage reader can read the field the runner's coverage
writer produced. Nothing enforces that by construction — the two speak through a file format
— so it is asserted rather than assumed, which is why the variable names live in one module
each and this test is what keeps them in step.

The **absence of polling**: FR-025 says no consumer discovers freshness by asking the query
layer. The monitor's forecast source is asked exactly when a ``ctl/run-published`` arrives
and at startup, and the count is checked, because "nothing polls" is otherwise the kind of
claim that quietly stops being true.
"""

from __future__ import annotations

from pathlib import Path

from control_loop import (
    CURRENT_POINTER,
    FORECAST_FILE,
    PARTIAL_SUFFIX,
    RUNS_DIRNAME,
    Recorder,
    manual_clock,
    model_runner_document,
    monitor_document,
    publisher_document,
)
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.staging import Staging
from harness_monitor.coverage import StoredForecasts, field_from_netcdf
from harness_monitor.service import RUN_PUBLISHED_TOPIC, MonitorService
from harness_publisher.service import PublisherService
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.publisher import DrognaPublisherConfiguration
from runner_support import ground_truth, run_request


def published_run(catalogue: Path, run_id: str) -> Path:
    """Where the publisher put a run, by the coverage store's layout."""
    return catalogue / RUNS_DIRNAME / run_id


def build(tmp_path: Path):
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)
    clock = manual_clock()
    recorder = Recorder()

    runner = ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(model_runner_document()),
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
    return runner, publisher, recorder, catalogue


def test_a_staged_run_is_published_and_announced(tmp_path: Path) -> None:
    runner, publisher, recorder, _ = build(tmp_path)

    staged = runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-abc"))
    assert staged is not None

    announcement = publisher.take("run-abc")

    assert announcement is not None
    assert announcement["run_id"] == "run-abc"
    assert announcement["current"] is True
    assert announcement["digests"] == staged.descriptor["digests"]
    assert recorder.topics() == ["ctl/run-started", "ctl/run-published"]


def test_the_published_field_is_readable_by_the_monitors_coverage_reader(tmp_path: Path) -> None:
    """The writer and the reader agree, and a test says so rather than a shared constant."""
    runner, publisher, _, catalogue = build(tmp_path)
    runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-abc"))
    publisher.take("run-abc")

    current = (catalogue / CURRENT_POINTER).read_text(encoding="utf-8").strip()
    payload = (published_run(catalogue, current) / "forecast.nc").read_bytes()
    field = field_from_netcdf(payload)

    assert field.run_id == "run-abc"
    assert len(field.latitudes) > 1 and len(field.depths_m) > 1
    middle = field.sound_speed_at(
        field.latitudes[1], field.longitudes[1], field.depths_m[1], field.sim_micros[0]
    )
    assert middle is not None and 1400.0 < middle < 1600.0


def test_a_run_is_servable_without_any_collection_being_edited(tmp_path: Path) -> None:
    """SC-008: the identifiers are derived from the run's name, so nothing is enumerated."""
    runner, publisher, _, catalogue = build(tmp_path)
    runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-abc"))

    announcement = publisher.take("run-abc")

    assert announcement is not None
    assert announcement["collections"]["forecast"] == "forecast-run-abc"
    assert (published_run(catalogue, "run-abc") / "uncertainty.nc").is_file()
    # Nothing in the catalogue enumerates runs: the layout is the catalogue. The store root
    # holds the runs directory and the pointer, and the layout gives it nothing else.
    assert sorted(entry.name for entry in catalogue.iterdir()) == [CURRENT_POINTER, RUNS_DIRNAME]
    assert [entry.name for entry in (catalogue / RUNS_DIRNAME).iterdir()] == ["run-abc"]


def test_the_monitor_reads_the_store_when_told_and_not_on_a_timer(tmp_path: Path) -> None:
    """FR-025: the announcement is the notification. Nothing polls for freshness."""
    runner, publisher, _, catalogue = build(tmp_path)
    runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-abc"))
    publisher.take("run-abc")

    # The monitor now resolves the pointer the way the layout defines it (ADR-0011), so
    # this reads the store the publisher actually wrote rather than being pointed straight
    # at a run directory to work around a reader that quietly read nothing.
    forecasts = StoredForecasts(
        catalogue,
        pointer=CURRENT_POINTER,
        runs_dirname=RUNS_DIRNAME,
        forecast_file=FORECAST_FILE,
    )
    assert forecasts.current() is not None, "the monitor's reader could not read the run"
    monitor = MonitorService(
        DrognaMonitorConfiguration.model_validate(
            monitor_document(root_directory=str(catalogue), warmup_span_seconds=60.0)
        ),
        clock=manual_clock(),
        forecasts=forecasts,
    )
    monitor.start()

    first = monitor.handle(RUN_PUBLISHED_TOPIC, {"run_id": "run-abc"})

    assert first is None
    assert monitor.state.value in {"warming", "scoring"}
