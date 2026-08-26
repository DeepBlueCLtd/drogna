"""The forecast is the members' mean and the uncertainty field is their spread, cell by cell.

FR-029 and FR-007. The value of this component is not its numerics — they are deliberately
fake — but that it publishes a spread at all, and that the spread is what it says it is. So
the test recomputes both reductions from the members themselves rather than asserting a
property they happen to have.

The other half of FR-020 is asserted here too: the uncertainty field is ensemble spread and
nothing else. Nothing in this package reads an observation, so there is nothing to combine
it with; the planner holds that combination.
"""

from __future__ import annotations

import math

from harness_core.rng import RandomStreams
from harness_model_runner.analytic_kernel import AnalyticKernel
from harness_model_runner.ensemble import perturbed, run_ensemble
from harness_model_runner.kernel import GriddedField, InitialisationState
from harness_model_runner.truth import background_from, features_from, grid_for
from runner_support import ground_truth

ROOT_SEED = 20260826


def state_for(steps: int = 2) -> InitialisationState:
    document = ground_truth()
    return InitialisationState(
        grid=grid_for(document, initialisation_micros=0, step_seconds=3600.0, steps=steps),
        background=background_from(document),
        features=features_from(document),
        initialisation_micros=0,
        noise_temperature_c=0.05,
        noise_salinity_psu=0.01,
    )


def outcome_for(size: int = 5):
    return run_ensemble(
        AnalyticKernel(),
        state_for(),
        RandomStreams(ROOT_SEED),
        size=size,
        temperature_c=0.2,
        salinity_psu=0.05,
        drift_fraction=0.2,
    )


def test_the_two_fields_share_one_grid() -> None:
    outcome = outcome_for()

    assert len(outcome.temperature_spread_c) == outcome.mean.grid.cells
    assert len(outcome.salinity_spread_psu) == outcome.mean.grid.cells
    assert len(outcome.mean.temperature_c) == outcome.mean.grid.cells


def test_the_forecast_is_the_members_mean_and_the_spread_is_their_deviation() -> None:
    """Recomputed from the members, so the assertion is about the reduction and not the field."""
    size = 5
    state = state_for()
    randomness = RandomStreams(ROOT_SEED)
    outcome = run_ensemble(
        AnalyticKernel(),
        state,
        randomness,
        size=size,
        temperature_c=0.2,
        salinity_psu=0.05,
        drift_fraction=0.2,
    )

    members: list[GriddedField] = []
    replay = RandomStreams(ROOT_SEED)
    for ordinal in range(size):
        conditions = perturbed(
            state, replay, ordinal, temperature_c=0.2, salinity_psu=0.05, drift_fraction=0.2
        )
        members.append(
            AnalyticKernel().forecast(
                conditions, replay.rng_for(f"model_runner.member.{ordinal}.noise")
            )
        )

    for cell in (0, 7, outcome.mean.grid.cells - 1):
        values = [member.temperature_c[cell] for member in members]
        mean = sum(values) / size
        deviation = math.sqrt(sum((value - mean) ** 2 for value in values) / size)
        assert abs(outcome.mean.temperature_c[cell] - mean) < 1e-12
        assert abs(outcome.temperature_spread_c[cell] - deviation) < 1e-12


def test_the_spread_is_not_zero_where_the_members_were_perturbed() -> None:
    outcome = outcome_for()

    assert max(outcome.temperature_spread_c) > 0.0
    assert max(outcome.salinity_spread_psu) > 0.0


def test_an_ensemble_of_one_is_refused() -> None:
    """A spread over one member is not a spread, and publishing it would say otherwise."""
    try:
        outcome_for(size=1)
    except ValueError as error:
        assert "no spread" in str(error)
    else:  # pragma: no cover
        raise AssertionError("an ensemble of one was accepted")


def test_a_member_draws_only_from_its_own_stream() -> None:
    """One seed and one ordinal give one realisation; another ordinal gives another."""
    state = state_for()
    first = perturbed(
        state, RandomStreams(ROOT_SEED), 2, temperature_c=0.2, salinity_psu=0.05, drift_fraction=0.2
    )
    same = perturbed(
        state, RandomStreams(ROOT_SEED), 2, temperature_c=0.2, salinity_psu=0.05, drift_fraction=0.2
    )
    other = perturbed(
        state, RandomStreams(ROOT_SEED), 3, temperature_c=0.2, salinity_psu=0.05, drift_fraction=0.2
    )

    assert first.background == same.background
    assert first.background != other.background
    kernel = AnalyticKernel()
    generator = RandomStreams(ROOT_SEED).rng_for("test.kernel")
    again = RandomStreams(ROOT_SEED).rng_for("test.kernel")
    assert kernel.forecast(first, generator).temperature_c == (
        kernel.forecast(same, again).temperature_c
    )
