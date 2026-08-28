"""Two runs from one manifest produce identical bytes. That is the claim, so it is tested.

SC-010 and AT-04. Byte-identity is not a nicety here: the coverage store holds the run under
a name derived from the seed, and a replay that produced the same name with different bytes
would be worse than one that failed. The NetCDF the harness writes carries no creation time
and no library version for exactly this reason.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from control_loop import PARTIAL_SUFFIX, manual_clock, model_runner_document
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.staging import Staging
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from runner_support import ground_truth, run_request


def runner(directory: Path, **overrides: Any) -> ModelRunnerService:
    settings = DrognaModelRunnerConfiguration.model_validate(model_runner_document(**overrides))
    staging = Staging(
        directory,
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run.json",
        partial_suffix=PARTIAL_SUFFIX,
    )
    return ModelRunnerService(
        settings, clock=manual_clock(), ground_truth=ground_truth(), staging=staging
    )


def test_two_runs_from_one_manifest_are_byte_identical(tmp_path: Path) -> None:
    first = runner(tmp_path / "one").handle(RUN_REQUEST_TOPIC, run_request())
    second = runner(tmp_path / "two").handle(RUN_REQUEST_TOPIC, run_request())

    assert first is not None and second is not None
    for name in ("forecast.nc", "uncertainty.nc"):
        assert (first.directory / name).read_bytes() == (second.directory / name).read_bytes()
    assert first.descriptor["digests"] == second.descriptor["digests"]


def test_a_run_is_a_function_of_its_own_name_and_not_of_what_preceded_it(tmp_path: Path) -> None:
    """A restart must not change a run's field, so member streams are scoped to the run."""
    together = runner(tmp_path / "together")
    together.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-first"))
    second_of_two = together.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-second"))

    alone = runner(tmp_path / "alone").handle(RUN_REQUEST_TOPIC, run_request(run_id="run-second"))

    assert second_of_two is not None and alone is not None
    assert (second_of_two.directory / "forecast.nc").read_bytes() == (
        alone.directory / "forecast.nc"
    ).read_bytes()


def test_a_different_seed_produces_a_different_field(tmp_path: Path) -> None:
    """Otherwise the seed is not doing anything and the replay claim is vacuous."""
    settings = DrognaModelRunnerConfiguration.model_validate(model_runner_document())
    other = model_runner_document()
    other["seed"]["root"] = settings.seed.root + 1

    first = runner(tmp_path / "one").handle(RUN_REQUEST_TOPIC, run_request())
    staging = Staging(
        tmp_path / "two",
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run.json",
        partial_suffix=PARTIAL_SUFFIX,
    )
    second = ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(other),
        clock=manual_clock(),
        ground_truth=ground_truth(),
        staging=staging,
    ).handle(RUN_REQUEST_TOPIC, run_request())

    assert first is not None and second is not None
    assert (first.directory / "forecast.nc").read_bytes() != (
        second.directory / "forecast.nc"
    ).read_bytes()
