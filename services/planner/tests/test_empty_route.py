"""An empty route is stated with its reason, never replaced by a consolation prize.

A planner that always recommends motion is a planner nobody can trust when it recommends
motion. That sentence is the whole of this file: there are three ways for there to be nothing
worth recommending, and in each of them the honest answer is an empty route and a reason a
reader can act on, rather than the nearest cell offered as though it were a finding.
"""

from __future__ import annotations

from harness_core.rng import RandomStreams
from harness_planner.select import EmptyReason, select_route
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, gentle_tau, geometry, traversal

PLATFORM = Position(latitude=49.00, longitude=-4.50, depth_m=25.0)


def constant(level: float):
    def spread(*_args: float) -> float:
        return level

    return spread


def bench(*, level: float):
    from harness_planner.cells import GridBounds

    grid = geometry(resolution=6, bands=1)
    cover = grid.cover(
        GridBounds(
            minimum_latitude=48.95,
            maximum_latitude=49.05,
            minimum_longitude=-4.60,
            maximum_longitude=-4.40,
            minimum_depth_m=0.0,
            maximum_depth_m=50.0,
        ),
        maximum_cells=4096,
    )
    field = HandField(grid=grid, spread=constant(level), tau=gentle_tau())
    return grid.cells(cover), field, footprint(grid, maximum_rings=1), traversal(grid)


def choose(cells, *, field, sensing, cost, budget_seconds, threshold):
    return select_route(
        cells,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=threshold,
        budget_seconds=budget_seconds,
        restarts=3,
        maximum_candidates=40,
        shortlist=2,
        rng=RandomStreams(20260826).rng_for("planner.search"),
    )


def test_every_cell_below_the_threshold_gives_an_empty_route_with_its_reason() -> None:
    cells, field, sensing, cost = bench(level=0.05)

    selection = choose(
        cells, field=field, sensing=sensing, cost=cost, budget_seconds=10800.0, threshold=0.35
    )

    assert selection.route.vertices == ()
    assert selection.empty_reason == EmptyReason.NOTHING_WORTH_SAMPLING
    assert selection.candidate_cell_count == 0
    assert selection.visited_cell_count == 0
    assert selection.route.value == 0.0


def test_a_budget_too_small_for_any_candidate_gives_an_empty_route_with_its_reason() -> None:
    """Not the nearest cell as a consolation: the budget genuinely buys nothing."""
    cells, field, sensing, cost = bench(level=0.8)
    far = Position(latitude=52.0, longitude=-2.0, depth_m=25.0)

    selection = select_route(
        cells,
        state=UncertaintyState(field),
        start=far,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=0.1,
        budget_seconds=1.0,
        restarts=2,
        maximum_candidates=40,
        shortlist=2,
        rng=RandomStreams(20260826).rng_for("planner.search"),
    )

    assert selection.route.vertices == ()
    assert selection.empty_reason == EmptyReason.BUDGET_TOO_SMALL
    assert selection.candidate_cell_count > 0, (
        "there was plenty worth sampling; what there was not was the budget to reach it, "
        "and the two reasons must not be confused"
    )


def test_the_two_empty_reasons_are_distinguished_rather_than_collapsed() -> None:
    """A reader has to be able to tell 'nothing to do' from 'no way to do it'."""
    assert EmptyReason.NOTHING_WORTH_SAMPLING != EmptyReason.BUDGET_TOO_SMALL


def test_a_route_is_recommended_when_there_is_something_worth_recommending() -> None:
    """The control: the same bench with a threshold the field exceeds does produce a route."""
    cells, field, sensing, cost = bench(level=0.8)

    selection = choose(
        cells, field=field, sensing=sensing, cost=cost, budget_seconds=10800.0, threshold=0.35
    )

    assert selection.route.vertices
    assert selection.empty_reason is None
