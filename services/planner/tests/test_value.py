"""A distant objective is worth less once the sampling on the way has resolved the water.

This is User Story 1's independent test and SC-001. The bench is the one the specification
names: a near objective and a far objective on the same bearing, with overlapping sensing
footprints. Three things have to hold, and the third is the one that catches the value
function everybody writes first.

1. The far objective's marginal contribution, when the near one has already been visited, is
   strictly less than what it is worth on its own.
2. The collapse-aware total is strictly less than the naive sum of the two standalone values.
3. **The size of that difference is reported**, because a claim about diminishing returns
   without the figure beside it is the thing Constitution IX exists to forbid.

The field here does not move, deliberately. The near/far behaviour is a property of the
sensing footprint and the collapse, and it must hold on a field that stands perfectly still;
the separate question of scoring against the field at arrival has its own bench.
"""

from __future__ import annotations

import pytest
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import evaluate_route
from planner_support import EPOCH_MICROS, HandField, footprint, gentle_tau, geometry, traversal

THRESHOLD = 0.05
PLATFORM = Position(latitude=48.94, longitude=-4.50, depth_m=25.0)


def uniform(level: float):
    """A field that is the same everywhere and at every instant. Nothing here moves."""

    def spread(_latitude: float, _longitude: float, _depth_m: float, _seconds: float) -> float:
        return level

    return spread


def bench(*, level: float = 0.8, decay_m: float = 12000.0):
    """Two objectives on one bearing from the platform, near and far, footprints overlapping."""
    grid = geometry(resolution=6, bands=1)
    near = grid.cell_at(48.98, -4.50, 25.0)
    far = grid.cell_at(49.04, -4.50, 25.0)
    assert near != far

    field = HandField(grid=grid, spread=uniform(level), tau=gentle_tau())
    sensing = footprint(grid, horizontal_decay_m=decay_m, maximum_rings=2, peak_reduction=0.85)
    cost = traversal(grid)

    informed_by_near = {influence.cell for influence in sensing.influences(near)}
    informed_by_far = {influence.cell for influence in sensing.influences(far)}
    assert informed_by_near & informed_by_far, (
        "the bench is only about diminishing returns if the two footprints overlap"
    )
    return grid, field, near, far, sensing, cost


def value_of(cells, *, field, sensing, cost):
    return evaluate_route(
        cells,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
    )


def test_the_far_objective_is_worth_less_once_the_near_one_has_been_visited() -> None:
    _, field, near, far, sensing, cost = bench()

    far_alone = value_of([far], field=field, sensing=sensing, cost=cost)
    both = value_of([near, far], field=field, sensing=sensing, cost=cost)

    marginal_far = both.vertices[1].marginal_value

    assert marginal_far < far_alone.value, (
        "a distant objective must decay in value as nearer sampling resolves the water "
        f"between; it is worth {far_alone.value:.4f} alone and {marginal_far:.4f} after"
    )


def test_the_collapse_aware_total_is_less_than_the_naive_sum_and_the_gap_is_reported() -> None:
    """SC-001. The figure is printed because a claim without its figure is not a claim."""
    _, field, near, far, sensing, cost = bench()

    near_alone = value_of([near], field=field, sensing=sensing, cost=cost).value
    far_alone = value_of([far], field=field, sensing=sensing, cost=cost).value
    both = value_of([near, far], field=field, sensing=sensing, cost=cost)

    naive = near_alone + far_alone
    gap = naive - both.value

    print(
        f"near {near_alone:.4f} + far {far_alone:.4f} = naive {naive:.4f}; "
        f"collapse-aware {both.value:.4f}; the error avoided is {gap:.4f} "
        f"({gap / naive:.1%} of the naive sum)"
    )

    assert both.value < naive
    assert gap > 0.0
    assert both.value_without_collapse == pytest.approx(naive)


def test_the_marginal_values_sum_to_the_route_value() -> None:
    """The published per-vertex figures have to add up to the published total."""
    _, field, near, far, sensing, cost = bench()

    both = value_of([near, far], field=field, sensing=sensing, cost=cost)

    assert sum(vertex.marginal_value for vertex in both.vertices) == pytest.approx(both.value)


def test_visiting_the_far_one_first_is_a_different_and_comparable_number() -> None:
    """Order matters, which is the point: a sum of independent values would not notice."""
    _, field, near, far, sensing, cost = bench()

    near_first = value_of([near, far], field=field, sensing=sensing, cost=cost)
    far_first = value_of([far, near], field=field, sensing=sensing, cost=cost)

    assert near_first.vertices[1].marginal_value != far_first.vertices[1].marginal_value
    assert near_first.value == pytest.approx(far_first.value, rel=0.2)
    assert far_first.consumed_seconds > near_first.consumed_seconds


def test_a_revisit_collects_only_what_has_grown_back() -> None:
    """Acceptance scenario 4: the second visit is not worth the first visit's value again."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=uniform(0.8), tau=gentle_tau(background_seconds=3600.0))
    sensing = footprint(grid, maximum_rings=1, peak_reduction=0.85)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    state = UncertaintyState(field)
    first = state.visit(cell, EPOCH_MICROS, footprint=sensing, threshold=THRESHOLD)
    later = EPOCH_MICROS + 1800 * 1_000_000
    second = state.visit(cell, later, footprint=sensing, threshold=THRESHOLD)

    assert 0.0 < second < first


def test_a_route_through_water_already_below_the_threshold_gains_nothing() -> None:
    """Acceptance scenario 5: no prize, so no reason to make the detour."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=uniform(0.02), tau=gentle_tau())
    sensing = footprint(grid)
    cost = traversal(grid)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    valued = evaluate_route(
        [cell],
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=0.35,
    )

    assert valued.value == pytest.approx(0.0)


def test_the_evaluation_does_not_disturb_the_state_it_was_given() -> None:
    """Every candidate is evaluated against the same beliefs, or the search is meaningless."""
    _, field, near, far, sensing, cost = bench()
    state = UncertaintyState(field)

    before = state.informed_cells()
    evaluate_route(
        [near, far],
        state=state,
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
    )

    assert state.informed_cells() == before == ()


def test_an_empty_route_is_worth_nothing_and_consumes_nothing() -> None:
    _, field, _, _, sensing, cost = bench()

    valued = value_of([], field=field, sensing=sensing, cost=cost)

    assert valued.value == 0.0
    assert valued.consumed_seconds == 0.0
    assert valued.distance_m == 0.0
    assert valued.within(0.0)
