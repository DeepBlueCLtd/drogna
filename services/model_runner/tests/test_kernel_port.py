"""The kernel is a port because more than one thing satisfies it, and one of them is a fake.

Constitution VI's test for a genuine port is that a second implementation is conceivable; the
harness's test is stronger, because two exist in the tree and a third is written here in
fifteen lines. SC-011 asks that selecting one is a configuration change with no source edit
outside ``services/model_runner/``, which is what :func:`kernel_for` makes true.
"""

from __future__ import annotations

from random import Random

from harness_core.rng import RandomStreams
from harness_model_runner.analytic_kernel import AnalyticKernel, PersistenceKernel, kernel_for
from harness_model_runner.kernel import GriddedField, InitialisationState, ModelKernel
from harness_model_runner.truth import background_from, features_from, grid_for
from runner_support import HOUR_MICROS, ground_truth

ROOT_SEED = 20260826


class FlatKernel:
    """A substitute kernel: the same water everywhere. It satisfies the port and nothing else."""

    name = "flat"

    def forecast(self, state: InitialisationState, generator: Random) -> GriddedField:
        del generator
        cells = state.grid.cells
        return GriddedField(
            grid=state.grid, temperature_c=[10.0] * cells, salinity_psu=[35.0] * cells
        )


def state_for(steps: int = 2) -> InitialisationState:
    document = ground_truth()
    return InitialisationState(
        grid=grid_for(document, initialisation_micros=0, step_seconds=3600.0, steps=steps),
        background=background_from(document),
        features=features_from(document),
        initialisation_micros=0,
    )


def test_every_implementation_satisfies_the_port() -> None:
    for kernel in (AnalyticKernel(), PersistenceKernel(), FlatKernel()):
        assert isinstance(kernel, ModelKernel)
        field = kernel.forecast(state_for(), RandomStreams(ROOT_SEED).rng_for("test.kernel"))
        assert len(field.temperature_c) == field.grid.cells
        assert len(field.salinity_psu) == field.grid.cells


def test_configuration_selects_an_implementation_by_name() -> None:
    assert kernel_for("analytic").name == "analytic"
    assert kernel_for("persistence").name == "persistence"


def test_an_unknown_kernel_name_is_refused_rather_than_guessed_at() -> None:
    try:
        kernel_for("something_plausible")
    except ValueError as error:
        assert "no model kernel is registered" in str(error)
    else:  # pragma: no cover - the selector must refuse
        raise AssertionError("an unregistered kernel name was accepted")


def test_a_field_and_its_grid_must_agree() -> None:
    """A kernel returning the wrong number of values is a fault, not a shape to infer."""
    state = state_for()
    try:
        GriddedField(grid=state.grid, temperature_c=[0.0], salinity_psu=[0.0])
    except ValueError as error:
        assert "must agree" in str(error)
    else:  # pragma: no cover
        raise AssertionError("a field disagreeing with its grid was accepted")


def test_the_persistence_kernel_holds_conditions_still() -> None:
    """It is the reference a forecast has to beat, so it must not advect anything."""
    state = state_for(steps=3)
    field = PersistenceKernel().forecast(state, RandomStreams(ROOT_SEED).rng_for("test.kernel"))
    grid = state.grid
    per_step = len(grid.depths_m) * len(grid.latitudes) * len(grid.longitudes)

    first = list(field.temperature_c[:per_step])
    last = list(field.temperature_c[-per_step:])

    assert first == last


def test_the_analytic_kernel_does_not_hold_them_still() -> None:
    state = state_for(steps=3)
    field = AnalyticKernel().forecast(state, RandomStreams(ROOT_SEED).rng_for("test.kernel"))
    grid = state.grid
    per_step = len(grid.depths_m) * len(grid.latitudes) * len(grid.longitudes)

    assert list(field.temperature_c[:per_step]) != list(field.temperature_c[-per_step:])
    assert grid.sim_micros[1] - grid.sim_micros[0] == HOUR_MICROS
