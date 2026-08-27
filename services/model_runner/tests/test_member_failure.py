"""A member that fails fails the run. A spread over the survivors is a different quantity.

The specification's edge case, and FR-021's second sentence. The temptation is to publish
what completed — eight members were asked for, six finished, the spread is nearly right. It
is not nearly right: it is the spread of a smaller ensemble published under the name of a
larger one, and nothing downstream could tell.

Also tested here: a request for more members than this runner is configured for is refused
in the same way, and for the same reason.
"""

from __future__ import annotations

from pathlib import Path
from random import Random

from control_loop import Recorder, manual_clock, model_runner_document
from harness_model_runner.ensemble import MemberFailedError, run_ensemble
from harness_model_runner.kernel import GriddedField, InitialisationState
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.staging import Staging
from harness_model_runner.truth import background_from, features_from, grid_for
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from runner_support import ground_truth, run_request


class FailingKernel:
    """A kernel that fails on one member, as a machine running out of memory would."""

    name = "failing"

    def __init__(self, fails_on: int) -> None:
        self._fails_on = fails_on
        self.calls = 0

    def forecast(self, state: InitialisationState, generator: Random) -> GriddedField:
        del generator
        self.calls += 1
        if self.calls == self._fails_on:
            raise RuntimeError("the member ran out of memory")
        cells = state.grid.cells
        return GriddedField(
            grid=state.grid, temperature_c=[12.0] * cells, salinity_psu=[35.0] * cells
        )


def state_for() -> InitialisationState:
    document = ground_truth()
    return InitialisationState(
        grid=grid_for(document, initialisation_micros=0, step_seconds=3600.0, steps=2),
        background=background_from(document),
        features=features_from(document),
        initialisation_micros=0,
    )


def test_a_failed_member_invalidates_the_whole_run() -> None:
    from harness_core.rng import RandomStreams

    try:
        run_ensemble(
            FailingKernel(fails_on=3),
            state_for(),
            RandomStreams(1),
            size=5,
            temperature_c=0.1,
            salinity_psu=0.02,
            drift_fraction=0.1,
        )
    except MemberFailedError as error:
        assert "member 2 of 5" in str(error)
        assert "subset" in str(error)
    else:  # pragma: no cover
        raise AssertionError("a run with a failed member produced an outcome")


def test_nothing_is_staged_when_a_member_fails(tmp_path: Path) -> None:
    recorder = Recorder()
    settings = DrognaModelRunnerConfiguration.model_validate(model_runner_document())
    staging = Staging(
        tmp_path / "staging",
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run.json",
    )
    service = ModelRunnerService(
        settings,
        clock=manual_clock(),
        ground_truth=ground_truth(),
        staging=staging,
        kernel=FailingKernel(fails_on=2),
        publisher=recorder,
    )

    staged = service.handle(RUN_REQUEST_TOPIC, run_request(ensemble_size=4))

    assert staged is None
    assert service.failed == 1
    assert not (tmp_path / "staging" / "run-abc").exists()
    assert recorder.on("ctl/run-started"), "a run that fails must still have been announced"
    assert [message["kind"] for message in recorder.on("ctl/telemetry")] == ["run-failed"]


def test_a_run_larger_than_this_runner_admits_is_refused(tmp_path: Path) -> None:
    recorder = Recorder()
    settings = DrognaModelRunnerConfiguration.model_validate(model_runner_document(maximum_size=4))
    staging = Staging(
        tmp_path / "staging",
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run.json",
    )
    service = ModelRunnerService(
        settings,
        clock=manual_clock(),
        ground_truth=ground_truth(),
        staging=staging,
        publisher=recorder,
    )

    staged = service.handle(RUN_REQUEST_TOPIC, run_request(ensemble_size=16))

    assert staged is None
    assert "truncating" in recorder.on("ctl/telemetry")[0]["detail"]


def test_the_runner_writes_only_into_staging(tmp_path: Path) -> None:
    """FR-021: nothing this component writes is anywhere a reader can reach."""
    catalogue = tmp_path / "coverage"
    catalogue.mkdir()
    staging = Staging(
        tmp_path / "staging",
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run.json",
    )
    settings = DrognaModelRunnerConfiguration.model_validate(model_runner_document())
    service = ModelRunnerService(
        settings, clock=manual_clock(), ground_truth=ground_truth(), staging=staging
    )

    service.handle(RUN_REQUEST_TOPIC, run_request())

    assert list(catalogue.iterdir()) == []
    assert (tmp_path / "staging" / "run-abc" / "forecast.nc").is_file()
