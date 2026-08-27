"""FR-42's subtler leakage path: the shape of the freshly updated region.

This is the test that is easiest to write vacuously, so what it does is worth stating
before the code.

A test that asserted "no leak" against a mask that could never have recovered anything
would pass forever and prove nothing. Three things stop that here.

**The control.** ``unmitigated_pair`` is the same run with the whole-domain rewrite
switched off, and the suite fails if its statistic is *not* at or above the discovery
bound. A gate that has stopped being able to see a leak it was built to see is not evidence
that there is no leak, and this is the assertion that says so.

**The inconclusive cases.** An empty change mask, a pair on different grids, a pair with
different variable sets and a platform that did not move are each reported as inconclusive
and each fail. None of them is a pass (FR-017).

**The anti-vacuity assertion.** The mitigated pair's mask is checked to be a non-empty
proper subset of the grid. A mask covering nothing, or covering everything, scores at
chance for reasons that have nothing to do with the mitigation working.

The figures are printed rather than asserted silently (SC-005): every case here writes its
statistic, its bounds and its cell counts into the assertion message, so a fixture drifting
towards a bound is visible before it crosses one.
"""

from __future__ import annotations

import dataclasses
import json
from collections.abc import Sequence
from pathlib import Path

import pytest
from settings import load_settings
from updated_region import (
    Assessment,
    Grid,
    Measurement,
    Product,
    assess,
    change_mask,
    load_geometry,
    load_product,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
COVERAGE = "drogna-forecast.nc"

SETTINGS = load_settings()


def pair(name: str) -> tuple[Product, Product, list[Measurement]]:
    root = FIXTURES / name
    return (
        load_product(root / "t0" / COVERAGE),
        load_product(root / "t1" / COVERAGE),
        load_geometry(root / "geometry.json"),
    )


def scored(name: str) -> Assessment:
    before, after, geometry = pair(name)
    return assess(
        before,
        after,
        geometry,
        radius_m=SETTINGS.identification_radius_m,
        step=SETTINGS.quantisation_step,
    )


def report(name: str, assessment: Assessment) -> str:
    """The figures, printed. A statistic asserted silently is a statistic nobody checks."""
    return (
        f"{name}: chance_bound={SETTINGS.chance_bound} "
        f"discovery_bound={SETTINGS.discovery_bound}\n"
        + json.dumps(assessment.as_document(), indent=2)
    )


# --- the two bounds (FR-016) -----------------------------------------------------------------


def test_the_mitigated_pair_is_at_chance() -> None:
    """A whole-domain rewrite discloses nothing about where the platform went."""
    assessment = scored("mitigated_pair")

    assert assessment.conclusive, report("mitigated_pair", assessment)
    assert assessment.worst <= SETTINGS.chance_bound, report("mitigated_pair", assessment)


def test_the_unmitigated_control_is_recovered() -> None:
    """The half of FR-016 that gives the other half its meaning.

    ``unmitigated_pair`` is the same run with the whole-domain rewrite disabled, so only the
    neighbourhood of recent measurements was refreshed. Its change mask is the sampling
    geometry. If this ever stops scoring at or above the discovery bound, the statistic has
    stopped working and every green result above it is worthless — so it fails the build
    rather than being noted.
    """
    assessment = scored("unmitigated_pair")

    assert assessment.conclusive, report("unmitigated_pair", assessment)
    assert assessment.worst >= SETTINGS.discovery_bound, report("unmitigated_pair", assessment)


def test_the_mitigated_mask_could_have_recovered_something() -> None:
    """The anti-vacuity assertion, and the reason the first test is worth running.

    An empty mask and a mask covering every cell both score at chance, and neither says
    anything about the mitigation. The mitigated fixture's mask has to be a non-empty proper
    subset of the grid for its statistic to mean what the first test reads it as meaning.
    """
    before, after, _geometry = pair("mitigated_pair")
    mask = change_mask(
        before.variables["sea_water_temperature"],
        after.variables["sea_water_temperature"],
        SETTINGS.quantisation_step,
    )

    assert 0 < len(mask) < before.grid.cells, (
        f"the mitigated mask covers {len(mask)} of {before.grid.cells} cells; a mask covering "
        "nothing or everything scores at chance for reasons that have nothing to do with the "
        "mitigation, and the pass above would mean nothing"
    )


# --- a variable that is a map of measurement locations (US4 scenario 3) -------------------------


def test_an_age_driven_variable_is_recovered_even_when_the_union_is_not() -> None:
    """The case the per-variable scoring exists for, and the reason a union is not enough.

    ``age_driven_pair`` applies the mitigation properly to the temperature field — the whole
    domain is rewritten — and releases an observation-age field beside it. The union of the
    two masks is dominated by the whole-domain one and scores below the chance bound, so a
    test that looked only at the union would pass. The age field on its own is the sampling
    geometry exactly.
    """
    assessment = scored("age_driven_pair")
    story = report("age_driven_pair", assessment)

    assert assessment.conclusive, story
    assert assessment.union is not None
    assert assessment.union.statistic <= SETTINGS.chance_bound, story
    assert assessment.worst >= SETTINGS.discovery_bound, story
    assert assessment.worst_variable == "observation_age", story


def test_the_age_driven_variable_is_not_on_the_released_list() -> None:
    """Which is why the fixture above is a control and not a bug report.

    A field driven by observation age is a map of measurement locations, so it is absent
    from ``proxy.released.variables`` by design. The provenance scanner is what refuses it in
    an artefact; this asserts the release policy has not quietly acquired it.
    """
    assert "observation_age" not in SETTINGS.released_variables


# --- everything that is not a pass (FR-017) ------------------------------------------------------


def test_an_empty_change_mask_is_inconclusive_and_not_a_pass() -> None:
    """Two products that are the same product cannot have shown that nothing was disclosed."""
    assessment = scored("unchanged_pair")

    assert not assessment.conclusive
    assert "empty" in assessment.reason


def test_a_pair_on_different_grids_is_inconclusive() -> None:
    before, after, geometry = pair("mitigated_pair")
    regridded = dataclasses.replace(
        after,
        grid=Grid(latitudes=after.grid.latitudes[:-1], longitudes=after.grid.longitudes),
        variables={
            name: values[: -len(after.grid.longitudes)] for name, values in after.variables.items()
        },
    )

    assessment = assess(
        before,
        regridded,
        geometry,
        radius_m=SETTINGS.identification_radius_m,
        step=SETTINGS.quantisation_step,
    )

    assert not assessment.conclusive
    assert "different grids" in assessment.reason


def test_a_pair_with_different_variable_sets_is_inconclusive() -> None:
    before, after, geometry = pair("mitigated_pair")
    extended = dataclasses.replace(
        after,
        variables={
            **after.variables,
            "sea_water_practical_salinity": after.variables["sea_water_temperature"],
        },
    )

    assessment = assess(
        before,
        extended,
        geometry,
        radius_m=SETTINGS.identification_radius_m,
        step=SETTINGS.quantisation_step,
    )

    assert not assessment.conclusive
    assert "different variables" in assessment.reason


def test_a_platform_that_did_not_move_is_inconclusive() -> None:
    """An immobile scenario must not be a way of obtaining a green result."""
    before, after, geometry = pair("unmitigated_pair")
    stationary: Sequence[Measurement] = [
        dataclasses.replace(geometry[0], simulation_seconds=measurement.simulation_seconds)
        for measurement in geometry
    ]

    assessment = assess(
        before,
        after,
        stationary,
        radius_m=SETTINGS.identification_radius_m,
        step=SETTINGS.quantisation_step,
    )

    assert not assessment.conclusive
    assert "did not move" in assessment.reason or "spans" in assessment.reason


def test_a_geometry_document_with_no_measurements_is_a_failure_not_an_empty_scan(
    tmp_path: Path,
) -> None:
    """A geometry that silently came out empty would make every comparison inconclusive."""
    empty = tmp_path / "geometry.json"
    empty.write_text(json.dumps({"measurements": []}), encoding="utf-8")

    with pytest.raises(Exception, match="nothing to score against"):
        load_geometry(empty)


# --- the bounds themselves -----------------------------------------------------------------------


def test_the_bounds_leave_room_between_them() -> None:
    """Two bounds that met would make every result a coin toss on one side of a line."""
    assert SETTINGS.chance_bound < SETTINGS.discovery_bound
    assert scored("mitigated_pair").worst < scored("unmitigated_pair").worst
