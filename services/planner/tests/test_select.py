"""Prize-collecting under a budget, and emphatically not a tour.

SRD FR-35 names the formulation and the name is the substance. What has to be visible from
outside is that most candidates are deliberately left unvisited, that the budget binds, and
that the counts of what was considered against what was chosen are both reported so that the
difference is checkable rather than asserted (SC-004).
"""

from __future__ import annotations

import pytest
from harness_core.rng import RandomStreams
from harness_planner.select import FORMULATION, HEURISTIC, EmptyReason, candidates, select_route
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, gentle_tau, geometry, traversal

THRESHOLD = 0.1
PLATFORM = Position(latitude=49.00, longitude=-4.50, depth_m=25.0)


def rng(stream: str = "planner.search"):
    return RandomStreams(20260826).rng_for(stream)


def scattered_field(grid):
    """Spread that varies over the domain, so cells differ in what they are worth."""

    def spread(latitude: float, longitude: float, _depth_m: float, _seconds: float) -> float:
        return 0.2 + 0.5 * abs(((latitude * 37.0 + longitude * 53.0) % 1.0) - 0.5) * 2.0

    return HandField(grid=grid, spread=spread, tau=gentle_tau())


def bench(*, resolution: int = 6, rings: int = 2):
    grid = geometry(resolution=resolution, bands=1)
    from harness_planner.cells import GridBounds

    cover = grid.cover(
        GridBounds(
            minimum_latitude=48.9,
            maximum_latitude=49.1,
            minimum_longitude=-4.65,
            maximum_longitude=-4.35,
            minimum_depth_m=0.0,
            maximum_depth_m=50.0,
        ),
        maximum_cells=4096,
    )
    cells = grid.cells(cover)
    field = scattered_field(grid)
    return grid, cells, field, footprint(grid, maximum_rings=rings), traversal(grid)


def choose(cells, *, field, sensing, cost, budget_seconds, **overrides):
    arguments = {
        "state": UncertaintyState(field),
        "start": PLATFORM,
        "start_micros": EPOCH_MICROS,
        "traversal": cost,
        "footprint": sensing,
        "threshold": THRESHOLD,
        "budget_seconds": budget_seconds,
        "restarts": 4,
        "maximum_candidates": 40,
        "shortlist": 3,
        "rng": rng(),
    }
    arguments.update(overrides)
    return select_route(cells, **arguments)


def test_the_route_respects_its_budget() -> None:
    """SC-003. A route exceeding its budget is a defect, not a suggestion."""
    _, cells, field, sensing, cost = bench()

    for budget in (600.0, 3600.0, 10800.0):
        selection = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=budget)
        assert selection.route.consumed_seconds <= budget + 1e-9, (
            f"a route consuming {selection.route.consumed_seconds:.0f}s was chosen under a "
            f"budget of {budget:.0f}s"
        )


def test_most_candidates_are_left_unvisited() -> None:
    """SC-004: the visited fraction is strictly below one, which is what prize-collecting is."""
    _, cells, field, sensing, cost = bench()

    selection = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=5400.0)

    assert selection.candidate_cell_count > 0
    assert selection.visited_cell_count < selection.candidate_cell_count
    print(
        f"considered {selection.candidate_cell_count}, visited "
        f"{selection.visited_cell_count} "
        f"({selection.visited_cell_count / selection.candidate_cell_count:.1%})"
    )


def test_a_larger_budget_never_buys_less() -> None:
    _, cells, field, sensing, cost = bench()

    small = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=1800.0)
    large = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=10800.0)

    assert large.route.value >= small.route.value
    assert len(large.route.vertices) >= len(small.route.vertices)


def test_the_route_is_ordered_with_arrival_times_and_depths() -> None:
    """A four-dimensional curve, not a line on a chart (FR-010)."""
    _, cells, field, sensing, cost = bench()

    selection = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=7200.0)
    vertices = selection.route.vertices

    assert vertices
    assert [vertex.sequence for vertex in vertices] == list(range(len(vertices)))
    arrivals = [vertex.arrival_micros for vertex in vertices]
    assert arrivals == sorted(arrivals)
    # Not strictly later than the horizon's start: the cell the platform is already in
    # costs nothing to reach, and sampling in place is a legitimate recommendation.
    assert arrivals[0] >= EPOCH_MICROS
    assert arrivals[-1] > EPOCH_MICROS
    for vertex in vertices:
        assert vertex.cell.depth_band >= 0
        assert vertex.depth_m >= 0.0


def test_the_formulation_and_the_heuristic_are_named_rather_than_implied() -> None:
    assert FORMULATION == "orienteering-prize-collecting"
    assert HEURISTIC == "greedy-insertion-seeded-restarts"


def test_no_cell_is_visited_twice_in_one_route() -> None:
    """Prize-collecting: a cell already collected carries no further prize to collect."""
    _, cells, field, sensing, cost = bench()

    selection = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=10800.0)
    visited = selection.route.cells

    assert len(visited) == len(set(visited))


def test_the_shortlist_of_candidates_comes_back_in_cell_order() -> None:
    """Nothing downstream may come to depend on the ranking and lose its determinism."""
    _, cells, field, _, _ = bench()
    state = UncertaintyState(field)

    shortlisted = candidates(cells, state=state, micros=EPOCH_MICROS, threshold=THRESHOLD, limit=25)

    assert shortlisted == tuple(sorted(shortlisted))
    assert len(shortlisted) <= 25
    for cell in shortlisted:
        assert state.excess(cell, EPOCH_MICROS, THRESHOLD) > 0.0


def test_a_committed_prefix_is_kept_at_the_head_and_never_reordered() -> None:
    _, cells, field, sensing, cost = bench()
    free = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=7200.0)
    prefix = free.route.cells[:2]

    held = choose(
        cells,
        field=field,
        sensing=sensing,
        cost=cost,
        budget_seconds=7200.0,
        prefix=prefix,
    )

    assert held.route.cells[: len(prefix)] == prefix


def test_a_search_that_cannot_run_is_refused_rather_than_guessed() -> None:
    _, cells, field, sensing, cost = bench()

    with pytest.raises(ValueError, match="at least once"):
        choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=3600.0, restarts=0)
    with pytest.raises(ValueError, match="shortlist"):
        choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=3600.0, shortlist=0)


def test_the_reported_counts_describe_the_route_that_was_chosen() -> None:
    _, cells, field, sensing, cost = bench()

    selection = choose(cells, field=field, sensing=sensing, cost=cost, budget_seconds=5400.0)

    assert selection.visited_cell_count == len(selection.route.vertices)
    assert selection.restarts == 4
    assert selection.empty_reason is None or selection.empty_reason in {
        EmptyReason.BUDGET_TOO_SMALL,
        EmptyReason.NOTHING_WORTH_SAMPLING,
    }
