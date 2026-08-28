"""The search never asks the world about an instant the platform cannot reach.

The defect this is the regression test for was found by running the planner against a real
environment for the first time, and it killed the process on the first `ctl/run-published`
it received:

    OutOfDomainError: time 161583 is outside [0, 43200]

The search proposes routes far longer than the budget and rejects them afterwards, and the
rejection came *after* the route had been walked. Walking it asks the field for a
decorrelation timescale at each vertex's arrival instant, and the arrival instants of a
128-vertex route at two metres a second run tens of hours past the start — hours past the
extent the ground-truth manifest describes. The generator's evaluator refuses such a point,
correctly and by design: ADR-0002 gives this component the right to assume a defined tau
inside the domain, and the price of that right is that outside it there is nothing to
answer with.

No test saw it because every timescale double in this suite — `gentle_tau`, `Timescales` —
is defined at every instant, which the real one is not. So this file supplies one that is
not: it refuses beyond a stated horizon, exactly as the evaluator does, and it records every
instant it is asked about.

Arrival times only increase, so a route past its budget cannot come back under it. The walk
therefore stops there, which changes no accepted route and no published number: it stops the
search computing value it could never use, and stops it asking about a world it does not
have.
"""

from __future__ import annotations

import pytest
from harness_core.rng import RandomStreams
from harness_planner.select import select_route
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import evaluate_route
from planner_support import EPOCH_MICROS, HandField, footprint, geometry, traversal

MICROS_PER_SECOND = 1_000_000
BUDGET_SECONDS = 10800.0
THRESHOLD = 0.1
PLATFORM = Position(latitude=49.00, longitude=-4.50, depth_m=25.0)


class OutOfDomainError(Exception):
    """What the generator's evaluator raises, and what reached the entry point unhandled."""


def bounded_tau(horizon_seconds: float, asked: list[float]):
    """A timescale with a domain, like the real one, and a record of what it was asked."""

    def tau(_latitude: float, _longitude: float, depth_m: float, seconds: float) -> float:
        asked.append(seconds)
        if seconds > horizon_seconds:
            raise OutOfDomainError(
                f"time {seconds:.6g} is outside [0, {horizon_seconds:.6g}]; outside the "
                "domain the analytic form is still arithmetic but is no longer the world "
                "this manifest describes"
            )
        return 5400.0 + 0.5 * depth_m

    return tau


def bench(asked: list[float], *, horizon_seconds: float):
    from harness_planner.cells import GridBounds

    grid = geometry(resolution=6, bands=1)
    cells = grid.cells(
        grid.cover(
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
    )

    def spread(latitude: float, longitude: float, _depth_m: float, _seconds: float) -> float:
        return 0.2 + 0.5 * abs(((latitude * 37.0 + longitude * 53.0) % 1.0) - 0.5) * 2.0

    field = HandField(grid=grid, spread=spread, tau=bounded_tau(horizon_seconds, asked))
    return cells, field, footprint(grid, maximum_rings=2), traversal(grid)


def search(cells, field, sensing, cost):
    return select_route(
        cells,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
        budget_seconds=BUDGET_SECONDS,
        restarts=4,
        maximum_candidates=40,
        shortlist=3,
        rng=RandomStreams(20260826).rng_for("planner.search"),
    )


def test_the_search_never_asks_about_an_instant_past_the_budget() -> None:
    """The property, stated directly: the budget bounds what the world is asked about."""
    asked: list[float] = []
    cells, field, sensing, cost = bench(asked, horizon_seconds=12 * 3600.0)

    search(cells, field, sensing, cost)

    assert asked, "the search asked the field nothing at all, so this proves nothing"
    assert max(asked) <= BUDGET_SECONDS, (
        f"the search reached {max(asked):.0f}s, {max(asked) - BUDGET_SECONDS:.0f}s past a "
        f"budget of {BUDGET_SECONDS:.0f}s"
    )


def test_a_world_that_ends_at_the_budget_is_enough_to_plan_in() -> None:
    """The live failure, reduced: a domain no larger than the budget must not stop a plan."""
    asked: list[float] = []
    cells, field, sensing, cost = bench(asked, horizon_seconds=BUDGET_SECONDS)

    selection = search(cells, field, sensing, cost)

    assert selection.route.within(BUDGET_SECONDS)
    assert selection.candidate_cell_count > 0


def test_a_route_past_its_budget_is_still_reported_as_past_it() -> None:
    """Stopping the walk must not turn an inadmissible route into an admissible one."""
    asked: list[float] = []
    cells, field, sensing, cost = bench(asked, horizon_seconds=12 * 3600.0)
    far = tuple(cells[:40])

    walked = evaluate_route(
        far,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
        budget_seconds=BUDGET_SECONDS,
    )

    assert not walked.within(BUDGET_SECONDS)
    assert len(walked.vertices) < len(far)


def test_an_unbounded_walk_is_still_available_and_still_walks_the_whole_route() -> None:
    """The parameter is optional, and without it nothing about the old behaviour changes."""
    asked: list[float] = []
    cells, field, sensing, cost = bench(asked, horizon_seconds=12 * 3600.0)
    far = tuple(cells[:40])

    with pytest.raises(OutOfDomainError):
        evaluate_route(
            far,
            state=UncertaintyState(field),
            start=PLATFORM,
            start_micros=EPOCH_MICROS,
            traversal=cost,
            footprint=sensing,
            threshold=THRESHOLD,
        )


def test_a_cell_centred_outside_the_domain_is_asked_about_inside_it() -> None:
    """The other half of the same defect, on the horizontal axes rather than on time.

    A cover by overlap contains cells whose centre lies outside the domain — deliberately,
    because taking cells by centre containment would leave the water along the edge in no
    cell at all (FR-020). ``SpreadField.at`` clamps such a point and says why; the timescale
    refused it, and the refusal stopped the process:

        OutOfDomainError: latitude 47.9743 is outside [48, 50]

    Both halves now ask about the same point, which is the nearest water the field describes.
    """
    from harness_planner.cells import GridBounds, PlanningCell
    from harness_planner.field import GriddedPlanningField

    bounds = GridBounds(
        minimum_latitude=48.0,
        maximum_latitude=50.0,
        minimum_longitude=-6.0,
        maximum_longitude=-4.0,
        minimum_depth_m=0.0,
        maximum_depth_m=150.0,
    )
    asked: list[tuple[float, float, float]] = []

    class _Spread:
        run_id = "run-000000-7f80b47c7b91"
        variable = "temperature_spread"

        def bounds(self) -> GridBounds:
            return bounds

        def at(self, *_args: float) -> float:
            return 0.5

    class _Refusing:
        """A timescale with a domain, exactly as the generator's evaluator has one."""

        def timescale_at(self, *, latitude, longitude, depth_m, micros) -> float:
            asked.append((latitude, longitude, depth_m))
            if not bounds.minimum_latitude <= latitude <= bounds.maximum_latitude:
                raise OutOfDomainError(f"latitude {latitude} is outside the domain")
            return 5400.0

    class _Outside:
        """Geometry whose cell centre is just outside the domain, as an edge cell's is."""

        def centre(self, _cell: PlanningCell) -> tuple[float, float, float]:
            return (47.9743, -5.0, 25.0)

    field = GriddedPlanningField(
        _Spread(), geometry=_Outside(), timescales=_Refusing(), digest=None
    )
    cell = PlanningCell(h3_index="861f8d64fffffff", depth_band=0)

    assert field.timescale(cell, 0) == 5400.0
    assert asked == [(48.0, -5.0, 25.0)]
    assert field.saturated(cell, 0) == 0.5
