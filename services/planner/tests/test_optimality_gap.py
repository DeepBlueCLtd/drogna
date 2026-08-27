"""The heuristic's optimality gap, measured against exhaustive search and reported.

Constitution IX: no claim without its figure. The plan says the selection is a greedy
insertion with seeded restarts and that orienteering is NP-hard so optimality is not
required. What is required is that "good enough" be a measurement rather than an assumption,
so this file enumerates every feasible route on instances small enough to enumerate, finds
the best, and prints the gap.

The instances are small because exhaustive search is factorial. That is a real limitation and
it is stated rather than hidden: the figure below is the gap on instances of five to seven
candidate cells, not a bound on the gap at scenario scale. What it rules out is the case that
matters — a heuristic that is *systematically* poor rather than occasionally suboptimal would
show a gap on small instances too.
"""

from __future__ import annotations

from itertools import permutations

from harness_core.rng import RandomStreams
from harness_planner.cells import GridBounds
from harness_planner.select import select_route
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import evaluate_route
from planner_support import EPOCH_MICROS, HandField, footprint, gentle_tau, geometry, traversal

THRESHOLD = 0.1
PLATFORM = Position(latitude=49.00, longitude=-4.50, depth_m=25.0)
BUDGET_SECONDS = 5400.0
WORST_ACCEPTABLE_GAP = 0.15


def instance(seed: int):
    """A small domain whose spread varies, so the cells are genuinely worth different amounts."""
    grid = geometry(resolution=6, bands=1)
    indices = grid.cover(
        GridBounds(
            minimum_latitude=48.95,
            maximum_latitude=49.10,
            minimum_longitude=-4.60,
            maximum_longitude=-4.40,
            minimum_depth_m=0.0,
            maximum_depth_m=50.0,
        ),
        maximum_cells=64,
    )
    draw = RandomStreams(seed).rng_for("planner.instance")
    levels = {index: 0.15 + 0.7 * draw.random() for index in sorted(indices)}

    def spread(latitude: float, longitude: float, _depth_m: float, _seconds: float) -> float:
        """A spread defined everywhere, including outside the cover.

        The sensing footprint reaches past the domain's edge, and a field that had nothing to
        say there would make the reach a special case. Cells outside the cover carry the
        background level: they are real water, they are simply not being planned over.
        """
        import h3

        return levels.get(h3.latlng_to_cell(latitude, longitude, 6), 0.15)

    field = HandField(grid=grid, spread=spread, tau=gentle_tau())
    return grid, grid.cells(indices), field, footprint(grid, maximum_rings=1), traversal(grid)


def best_by_exhaustive_search(cells, *, field, sensing, cost) -> float:
    """Every ordered subset within the budget. Factorial, and only run on tiny instances."""
    state = UncertaintyState(field)

    def value(route):
        return evaluate_route(
            route,
            state=state,
            start=PLATFORM,
            start_micros=EPOCH_MICROS,
            traversal=cost,
            footprint=sensing,
            threshold=THRESHOLD,
        )

    best = 0.0
    for length in range(1, len(cells) + 1):
        for route in permutations(cells, length):
            valued = value(route)
            if valued.within(BUDGET_SECONDS) and valued.value > best:
                best = valued.value
    return best


def heuristic_value(cells, *, field, sensing, cost, seed: int) -> float:
    return select_route(
        cells,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
        budget_seconds=BUDGET_SECONDS,
        restarts=6,
        maximum_candidates=8,
        shortlist=3,
        rng=RandomStreams(seed).rng_for("planner.search"),
    ).route.value


def test_the_optimality_gap_is_measured_and_reported_rather_than_assumed() -> None:
    """The figure this test prints is the one the algorithm document quotes."""
    gaps = []
    for seed in (20260826, 20260827, 20260828):
        _, cells, field, sensing, cost = instance(seed)
        assert len(cells) >= 7, "an instance smaller than it claims measures less than it claims"
        small = cells[:7]

        optimal = best_by_exhaustive_search(small, field=field, sensing=sensing, cost=cost)
        found = heuristic_value(small, field=field, sensing=sensing, cost=cost, seed=seed)

        assert optimal > 0.0, "an instance where nothing is worth visiting measures nothing"
        gap = (optimal - found) / optimal
        gaps.append(gap)
        print(f"seed {seed}: optimal {optimal:.4f}, heuristic {found:.4f}, gap {gap:.2%}")

    worst = max(gaps)
    mean = sum(gaps) / len(gaps)
    print(
        f"greedy insertion with seeded restarts over {len(gaps)} instances of 7 candidate "
        f"cells: mean gap {mean:.2%}, worst {worst:.2%}"
    )

    assert worst <= WORST_ACCEPTABLE_GAP, (
        f"the heuristic's worst gap was {worst:.2%}, above the {WORST_ACCEPTABLE_GAP:.0%} this "
        "component is prepared to claim; that is a systematically poor search rather than an "
        "occasionally suboptimal one"
    )


def test_the_heuristic_never_beats_the_exhaustive_optimum() -> None:
    """A heuristic scoring above the optimum is a value function with two implementations."""
    _, cells, field, sensing, cost = instance(20260826)
    small = cells[:5]

    optimal = best_by_exhaustive_search(small, field=field, sensing=sensing, cost=cost)
    found = heuristic_value(small, field=field, sensing=sensing, cost=cost, seed=20260826)

    assert found <= optimal + 1e-9
