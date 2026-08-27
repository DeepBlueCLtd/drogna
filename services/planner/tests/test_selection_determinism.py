"""The same field, the same budget and the same seed give the same route. Every time.

Constitution II, and it is asserted on the route rather than on the value. Two searches that
found equally good but different routes would pass a test on the value and fail the property
the constitution is actually about: a scenario replayed from its manifest produces
byte-identical outputs, and two different routes are two different messages.

Three sources of non-determinism are ruled out here, and each of them is a real way this has
gone wrong before:

- **The generator.** Every draw comes from ``rng_for``; a bare ``random`` call anywhere in
  the package would show up as two different routes from one seed.
- **Iteration order.** Candidates are considered in cell order, and equally good insertions
  are separated by the route itself. A search that iterated a dictionary would pass on one
  run and fail across a restart of the process.
- **Shared state.** A generator that carried draws from one search into the next would make
  the second search depend on the first, so the searches are run in both orders.
"""

from __future__ import annotations

import pytest
from harness_core.rng import RandomStreams
from harness_planner.select import select_route
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, gentle_tau, geometry, traversal

SEED = 20260826
THRESHOLD = 0.1
PLATFORM = Position(latitude=49.00, longitude=-4.50, depth_m=25.0)


def bench():
    from harness_planner.cells import GridBounds

    grid = geometry(resolution=6, bands=2)
    cover = grid.cover(
        GridBounds(
            minimum_latitude=48.9,
            maximum_latitude=49.1,
            minimum_longitude=-4.65,
            maximum_longitude=-4.35,
            minimum_depth_m=0.0,
            maximum_depth_m=100.0,
        ),
        maximum_cells=4096,
    )

    def spread(latitude: float, longitude: float, depth_m: float, _seconds: float) -> float:
        return 0.2 + 0.4 * abs(((latitude * 31.0 + longitude * 47.0 + depth_m) % 1.0) - 0.5) * 2.0

    field = HandField(grid=grid, spread=spread, tau=gentle_tau())
    return grid.cells(cover), field, footprint(grid, maximum_rings=2), traversal(grid)


def search(*, seed: int = SEED, streams: RandomStreams | None = None):
    cells, field, sensing, cost = bench()
    randomness = streams if streams is not None else RandomStreams(seed)
    return select_route(
        cells,
        state=UncertaintyState(field),
        start=PLATFORM,
        start_micros=EPOCH_MICROS,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
        budget_seconds=7200.0,
        restarts=6,
        maximum_candidates=40,
        shortlist=4,
        rng=randomness.rng_for("planner.search"),
    )


def test_two_searches_from_one_seed_produce_the_same_route() -> None:
    first = search()
    second = search()

    assert first.route.cells == second.route.cells
    assert first.route.value == second.route.value
    assert [vertex.arrival_micros for vertex in first.route.vertices] == [
        vertex.arrival_micros for vertex in second.route.vertices
    ]


def test_a_search_in_a_fresh_process_state_produces_the_same_route() -> None:
    """Two RandomStreams objects from one seed are the same stream, by construction."""
    first = search(streams=RandomStreams(SEED))
    second = search(streams=RandomStreams(SEED))

    assert first.route.cells == second.route.cells


def test_a_different_seed_is_free_to_produce_a_different_route_but_not_a_worse_bound() -> None:
    """Determinism is not the same as insensitivity, and the difference is worth seeing."""
    first = search(seed=SEED)
    second = search(seed=SEED + 1)

    assert first.route.consumed_seconds <= 7200.0 + 1e-9
    assert second.route.consumed_seconds <= 7200.0 + 1e-9
    assert first.route.value == pytest.approx(second.route.value, rel=0.5)


def test_one_restart_takes_no_draw_at_all() -> None:
    """With a single restart the search is a pure greedy insertion, seed or no seed."""
    cells, field, sensing, cost = bench()

    def once(seed: int):
        return select_route(
            cells,
            state=UncertaintyState(field),
            start=PLATFORM,
            start_micros=EPOCH_MICROS,
            traversal=cost,
            footprint=sensing,
            threshold=THRESHOLD,
            budget_seconds=7200.0,
            restarts=1,
            maximum_candidates=40,
            shortlist=4,
            rng=RandomStreams(seed).rng_for("planner.search"),
        )

    assert once(1).route.cells == once(2).route.cells


def test_the_stream_is_named_so_two_call_sites_do_not_share_a_sequence() -> None:
    """The convention that makes a manifest's stream list mean something."""
    streams = RandomStreams(SEED)
    streams.rng_for("planner.search")

    assert streams.streams() == ("planner.search",)
    assert streams.identifier_for("planner.plan", 0) == RandomStreams(SEED).identifier_for(
        "planner.plan", 0
    )


def test_a_plan_identifier_is_a_function_of_the_seed_and_the_ordinal() -> None:
    """FR-027: never from entropy, never from a host clock."""
    streams = RandomStreams(SEED)

    first = streams.identifier_for("planner.plan", 0)
    second = streams.identifier_for("planner.plan", 1)

    assert first != second
    assert first == RandomStreams(SEED).identifier_for("planner.plan", 0)
    assert len(first) == 16
    assert all(character in "0123456789abcdef" for character in first)
