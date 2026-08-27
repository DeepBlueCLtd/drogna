"""The seam between what the model runner publishes and what the planner filters.

These two numbers live in different files, owned by different features — the ensemble
perturbations in `009-control-loop`'s `model_runner.json`, the threshold they are compared
against in `011-adaptive-planner`'s `planner.json` — and nothing in the repository put them
in the same room. Each side's own tests pass: the runner emits a spread, the planner filters
by a threshold, and the planner's fixtures supply uncertainty values chosen to exercise the
planner rather than taken from the runner.

The consequence, until 27 August 2026, was that the assembled system could never plan.
`usable_threshold` was 0.35 degrees and the runner's maximum per-cell spread at the shipped
settings and the tracked root seed is 0.2156, so `excess = max(0, u - threshold)` was zero
in every cell of every run and `select_route` returned an empty route with the reason
`nothing-worth-sampling`. That is correct behaviour for the code as written, which is why no
test caught it: the planner was doing exactly what it was told, about a field it was never
shown.

What is asserted here is the relationship rather than either number. A threshold is useful
only if it lies inside the distribution it filters — above the floor, so that not every cell
is worth visiting, and below the ceiling, so that some cell is. Pinning the numbers instead
would make this test a copy of the configuration, and a copy agrees with its original by
construction.

**On the seed.** The absolute level of this field moves with the root seed, because the
dominant perturbation is one draw per member applied to every cell rather than one per cell:
across five seeds the maximum ranged from 0.174 to 0.318 while the shape stayed much the
same. The harness fixes its root seed in `config/<destination>/common.json`, so the shipped
distribution is reproducible and an absolute threshold is a reasonable thing to state. It is
also, therefore, sensitive to a change of seed or of perturbation settings — and this test
failing is how that would be found, which is the whole reason it exists. ADR-0019 records
why the threshold stays absolute rather than becoming a quantile.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "services" / "model_runner" / "src"))
sys.path.insert(0, str(REPO_ROOT / "services" / "model_runner" / "tests"))

from harness_core.rng import RandomStreams  # noqa: E402
from harness_model_runner.analytic_kernel import AnalyticKernel  # noqa: E402
from harness_model_runner.ensemble import run_ensemble  # noqa: E402
from harness_model_runner.kernel import InitialisationState  # noqa: E402
from harness_model_runner.truth import (  # noqa: E402
    background_from,
    features_from,
    grid_for,
)
from runner_support import ground_truth  # noqa: E402

DESTINATION = "local"
STEP_SECONDS = 3600.0
STEPS = 6


def _configured(name: str) -> dict:
    path = REPO_ROOT / "config" / DESTINATION / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _root_seed() -> int:
    """The run's root seed, from the file the deployment reads it from and nowhere else."""
    return int(_configured("common")["seed"]["root"])


@pytest.fixture(scope="module")
def spread() -> list[float]:
    """The per-cell temperature spread the runner publishes, at the settings it ships with."""
    ensemble = _configured("model_runner")["model_runner"]["ensemble"]
    document = ground_truth()
    state = InitialisationState(
        grid=grid_for(document, initialisation_micros=0, step_seconds=STEP_SECONDS, steps=STEPS),
        background=background_from(document),
        features=features_from(document),
        initialisation_micros=0,
        noise_temperature_c=0.05,
        noise_salinity_psu=0.01,
    )
    outcome = run_ensemble(
        AnalyticKernel(),
        state,
        RandomStreams(_root_seed()),
        size=ensemble["maximum_size"],
        temperature_c=ensemble["perturbation_temperature_c"],
        salinity_psu=ensemble["perturbation_salinity_psu"],
        drift_fraction=ensemble["perturbation_drift_fraction"],
    )
    return sorted(outcome.temperature_spread_c)


def _threshold() -> float:
    return float(_configured("planner")["planner"]["uncertainty"]["usable_threshold"])


def test_the_planner_scores_the_variable_the_runner_publishes() -> None:
    """Before any number matters, the two must be talking about the same field."""
    scored = _configured("planner")["planner"]["uncertainty"]["variable"]
    assert scored == "temperature_spread", (
        f"the planner scores {scored!r}; this test drives the runner's temperature spread "
        "into it and would be comparing two different quantities"
    )


def test_some_cell_is_worth_sampling(spread: list[float]) -> None:
    """The failure this file was written for: a threshold above everything the runner emits."""
    threshold = _threshold()
    above = [value for value in spread if value > threshold]
    assert above, (
        f"no cell of {len(spread)} exceeds usable_threshold {threshold}; the runner's "
        f"maximum spread at the shipped settings is {spread[-1]:.4f}. excess = max(0, u - "
        "threshold) is therefore zero everywhere, select_route returns nothing-worth-"
        "sampling, and the assembled system can never plan"
    )


def test_not_every_cell_is_worth_sampling(spread: list[float]) -> None:
    """The other end. A threshold below the floor stops the planner discriminating at all."""
    threshold = _threshold()
    below = [value for value in spread if value <= threshold]
    assert below, (
        f"every cell of {len(spread)} exceeds usable_threshold {threshold}; the runner's "
        f"minimum spread is {spread[0]:.4f}. The threshold exists to stop the planner "
        "recommending motion for its own sake, and one below the whole field cannot"
    )


def test_the_threshold_discriminates_rather_than_barely_clearing_the_edge(
    spread: list[float],
) -> None:
    """A threshold one cell below the maximum passes both tests above and is still useless.

    The bounds are wide on purpose. This is not asserting that 0.172 is the right number —
    the requirements fix none, and ADR-0019 says how it was chosen — but that whatever it is
    leaves the planner a real choice to make.
    """
    threshold = _threshold()
    fraction = sum(1 for value in spread if value > threshold) / len(spread)
    assert 0.05 <= fraction <= 0.60, (
        f"{fraction:.1%} of cells exceed usable_threshold {threshold}, which leaves the "
        "planner either almost nothing to choose between or almost no constraint. The "
        f"distribution runs {spread[0]:.4f} to {spread[-1]:.4f}"
    )
