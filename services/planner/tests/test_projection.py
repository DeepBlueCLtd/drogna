"""Projected crossing times, checked against the analytic answer rather than each other.

SC-008: the marched crossing time matches the time derived from the growth law, to within one
projection step, for every region with a known growth rate. That is Constitution IX applied to
this component's second output — the claim comes with its figure, and the figure is a
comparison against something computed independently.

The growth law has a closed form, so the analytic crossing is written out here::

    u(t) = u_sat - d * exp(-t / tau) = threshold
        =>  t = -tau * ln((u_sat - threshold) / d)

with ``d`` the deficit a visit left. The projection does not use that; it marches. The point
of the test is that the two agree.
"""

from __future__ import annotations

from math import exp, log

import pytest
from harness_planner.cells import GridBounds, PlanningCell
from harness_planner.projection import ALREADY_LAPSED, CROSSING, NO_CROSSING, project
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, geometry

SECOND = 1_000_000
STEP_SECONDS = 60.0


def constant(level: float):
    def value(*_args: float) -> float:
        return level

    return value


def domain(grid, *, span: float = 0.05):
    return grid.cover(
        GridBounds(
            minimum_latitude=49.0,
            maximum_latitude=49.0 + span,
            minimum_longitude=-4.55,
            maximum_longitude=-4.55 + span,
            minimum_depth_m=0.0,
            maximum_depth_m=50.0,
        ),
        maximum_cells=4096,
    )


def analytic_crossing_seconds(*, saturated: float, deficit: float, threshold: float, tau: float):
    """When the growth law says confidence lapses. Null where it never does."""
    if saturated <= threshold:
        return None
    return -tau * log((saturated - threshold) / deficit)


def test_a_marched_crossing_matches_the_analytic_one_to_within_one_step() -> None:
    """SC-008, with the two numbers printed so the agreement is visible rather than asserted."""
    grid = geometry(resolution=6, bands=1)
    saturated, tau, threshold, weight = 0.80, 3600.0, 0.35, 0.95
    field = HandField(grid=grid, spread=constant(saturated), tau=constant(tau))
    state = UncertaintyState(field)
    sensing = footprint(grid, peak_reduction=weight, maximum_rings=0)

    indices = domain(grid)
    for index in indices:
        state.measured(PlanningCell(h3_index=index, depth_band=0), EPOCH_MICROS, footprint=sensing)

    regions = project(
        indices,
        state=state,
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=STEP_SECONDS,
        horizon_seconds=10800.0,
        threshold=threshold,
    )

    expected = analytic_crossing_seconds(
        saturated=saturated,
        deficit=saturated - saturated * (1.0 - weight),
        threshold=threshold,
        tau=tau,
    )
    assert expected is not None

    for region in regions:
        assert region.state == CROSSING
        assert region.crossing_micros is not None
        marched = (region.crossing_micros - EPOCH_MICROS) / SECOND
        assert abs(marched - expected) <= STEP_SECONDS, (
            f"marched {marched:.0f}s against analytic {expected:.0f}s, step {STEP_SECONDS:.0f}s"
        )
    print(f"analytic crossing {expected:.1f}s; marched to within one {STEP_SECONDS:.0f}s step")


def test_a_region_already_above_the_threshold_is_reported_as_already_lapsed() -> None:
    """Arriving cold looks exactly like this, and it is not a crossing in the future."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=constant(0.9), tau=constant(3600.0))
    indices = domain(grid)

    regions = project(
        indices,
        state=UncertaintyState(field),
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=STEP_SECONDS,
        horizon_seconds=3600.0,
        threshold=0.35,
    )

    assert regions
    for region in regions:
        assert region.state == ALREADY_LAPSED
        assert region.crossing_micros == EPOCH_MICROS
        assert region.uncertainty_now == pytest.approx(0.9)


def test_a_region_whose_spread_never_reaches_the_threshold_never_lapses() -> None:
    """A saturated uncertainty below the threshold is a region that stays usable for ever."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=constant(0.20), tau=constant(600.0))
    indices = domain(grid)

    regions = project(
        indices,
        state=UncertaintyState(field),
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=STEP_SECONDS,
        horizon_seconds=86400.0,
        threshold=0.35,
    )

    for region in regions:
        assert region.state == NO_CROSSING
        assert region.crossing_micros is None
        assert region.saturated_uncertainty == pytest.approx(0.20)


def test_a_region_just_sampled_lapses_later_than_one_left_alone() -> None:
    """Acceptance scenario 3 of User Story 4, as a comparison between two states."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=constant(0.80), tau=constant(3600.0))
    sensing = footprint(grid, peak_reduction=0.95, maximum_rings=0)
    indices = domain(grid)

    untouched = UncertaintyState(field)
    sampled = UncertaintyState(field)
    for index in indices:
        sampled.measured(
            PlanningCell(h3_index=index, depth_band=0), EPOCH_MICROS, footprint=sensing
        )

    def crossings(state):
        return [
            region.crossing_micros
            for region in project(
                indices,
                state=state,
                geometry=grid,
                micros=EPOCH_MICROS,
                step_seconds=STEP_SECONDS,
                horizon_seconds=10800.0,
                threshold=0.35,
            )
        ]

    for left_alone, just_sampled in zip(crossings(untouched), crossings(sampled), strict=True):
        assert just_sampled > left_alone


def test_the_band_that_lapses_first_is_the_one_reported_and_it_is_named() -> None:
    """A region usable at the surface and blind at depth is not a usable region."""
    grid = geometry(resolution=6, bands=2, band_thickness_m=50.0)

    def by_depth(_latitude: float, _longitude: float, depth_m: float, _seconds: float) -> float:
        return 0.20 if depth_m < 50.0 else 0.90

    field = HandField(grid=grid, spread=by_depth, tau=constant(3600.0))
    indices = domain(grid)

    regions = project(
        indices,
        state=UncertaintyState(field),
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=STEP_SECONDS,
        horizon_seconds=3600.0,
        threshold=0.35,
    )

    for region in regions:
        assert region.depth_band == 1
        assert region.state == ALREADY_LAPSED


def test_the_timescale_reported_is_the_field_evaluated_at_that_region() -> None:
    """ADR-0002: every region has one, background water included, and it is published."""
    grid = geometry(resolution=6, bands=1)

    def by_place(latitude: float, _longitude: float, _depth_m: float, _seconds: float) -> float:
        return 1800.0 if latitude > 49.02 else 43_200.0

    field = HandField(grid=grid, spread=constant(0.20), tau=by_place)
    indices = domain(grid)

    regions = project(
        indices,
        state=UncertaintyState(field),
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=STEP_SECONDS,
        horizon_seconds=3600.0,
        threshold=0.35,
    )

    for region in regions:
        latitude, _, _ = grid.centre(PlanningCell(h3_index=region.h3_index, depth_band=0))
        assert region.timescale_seconds == pytest.approx(1800.0 if latitude > 49.02 else 43_200.0)
        assert region.timescale_seconds > 0.0


def test_a_march_over_no_time_or_no_step_is_refused() -> None:
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=constant(0.5), tau=constant(3600.0))

    with pytest.raises(ValueError, match="positive step"):
        project(
            domain(grid),
            state=UncertaintyState(field),
            geometry=grid,
            micros=EPOCH_MICROS,
            step_seconds=0.0,
            horizon_seconds=3600.0,
            threshold=0.35,
        )
    with pytest.raises(ValueError, match="projects nothing"):
        project(
            domain(grid),
            state=UncertaintyState(field),
            geometry=grid,
            micros=EPOCH_MICROS,
            step_seconds=60.0,
            horizon_seconds=0.0,
            threshold=0.35,
        )


def test_the_growth_law_the_march_walks_is_the_one_written_in_the_docstring() -> None:
    """A direct check on the state, so the analytic comparison above rests on something."""
    grid = geometry(resolution=6, bands=1)
    saturated, tau, weight = 0.8, 3600.0, 0.95
    field = HandField(grid=grid, spread=constant(saturated), tau=constant(tau))
    state = UncertaintyState(field)
    sensing = footprint(grid, peak_reduction=weight, maximum_rings=0)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    state.measured(cell, EPOCH_MICROS, footprint=sensing)
    deficit = saturated - saturated * (1.0 - weight)
    elapsed = 1234.0

    assert state.uncertainty(cell, EPOCH_MICROS + round(elapsed * SECOND)) == pytest.approx(
        saturated - deficit * exp(-elapsed / tau)
    )
