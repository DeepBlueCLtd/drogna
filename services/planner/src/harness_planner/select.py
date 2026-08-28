"""Choosing one route: orienteering under a budget, not a tour.

SRD FR-35 names the formulation, and naming it is the substance rather than the ceremony.
Cells carry prizes, traversal carries cost, and a **subset** is chosen under a budget. There
is no requirement that every candidate be visited and no tour to close, so most candidates
are deliberately left unvisited and the counts of what was considered and what was chosen
are both published — the difference between them is what prize-collecting looks like from
outside, and a recommendation that visited everything would be a different component's
answer to a different question.

Orienteering is NP-hard and nothing in the requirements asks for optimality. What they ask
for is the right formulation and determinism (Constitution II). So:

**Greedy insertion.** Repeatedly consider putting each remaining candidate at each position
in the route so far, and keep the insertion with the best ratio of value added to time
added. Ratio rather than value, because a budget is what binds: an objective worth twice as
much and four times as far away is the wrong choice, and a greedy search on value alone
takes it.

**Seeded randomised restarts.** A pure greedy insertion has one answer and can be led into a
poor one by its first move. Each restart after the first draws its move from a shortlist of
the best few insertions rather than always taking the best, and every draw comes from
:func:`harness_core.rng.rng_for`. The best route across restarts is kept. With one restart
the search is exactly the pure greedy insertion and no draw is taken at all.

**Deterministic everywhere else.** Candidates are considered in cell order, never in the
order a dictionary handed them back. Routes of equal value are separated by their cost and
then by their cells, so two replays produce not merely equal values but the same route.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from random import Random

from harness_planner.cells import PlanningCell
from harness_planner.sensing import SensingFootprint
from harness_planner.traversal import Position, TraversalCost
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import RouteValue, evaluate_route

__all__ = [
    "FORMULATION",
    "HEURISTIC",
    "EmptyReason",
    "Selection",
    "select_route",
]

FORMULATION = "orienteering-prize-collecting"
HEURISTIC = "greedy-insertion-seeded-restarts"

_TIE = 1e-12


class EmptyReason:
    """The reasons a route may be empty, spelled as the plan contract spells them.

    An empty route is stated with its reason rather than replaced by the nearest cell as a
    consolation prize. A planner that always recommends motion is a planner nobody can trust
    when it recommends motion.
    """

    BUDGET_TOO_SMALL = "budget-too-small"
    NOTHING_WORTH_SAMPLING = "nothing-worth-sampling"


@dataclass(frozen=True)
class Selection:
    """The chosen route, what it is worth, and how it was arrived at."""

    route: RouteValue
    candidate_cell_count: int
    restarts: int
    empty_reason: str | None

    @property
    def visited_cell_count(self) -> int:
        return len(self.route.vertices)


def candidates(
    cells: Sequence[PlanningCell],
    *,
    state: UncertaintyState,
    micros: int,
    threshold: float,
    limit: int,
) -> tuple[PlanningCell, ...]:
    """The cells worth considering, most valuable first, bounded and then re-sorted.

    Bounded because a domain can carry more cells than a search can insert into in a
    planning budget, and the bound is published with the recommendation so that it is
    visible rather than hidden in a configuration file. Ranked by excess at the horizon's
    start, which is a shortlist rather than a decision: the value of actually visiting one
    is decided by the walk, at the arrival instant, with everything earlier already
    collapsed.

    The shortlist is re-sorted into cell order before it is returned, so that nothing
    downstream can come to depend on the ranking order and quietly stop being deterministic
    when two cells tie.
    """
    scored = [
        (state.excess(cell, micros, threshold), cell)
        for cell in sorted(cells)
        if state.excess(cell, micros, threshold) > 0.0
    ]
    scored.sort(key=lambda entry: (-entry[0], entry[1]))
    return tuple(sorted(cell for _, cell in scored[:limit]))


def select_route(
    cells: Sequence[PlanningCell],
    *,
    state: UncertaintyState,
    start: Position,
    start_micros: int,
    traversal: TraversalCost,
    footprint: SensingFootprint,
    threshold: float,
    budget_seconds: float,
    restarts: int,
    maximum_candidates: int,
    shortlist: int,
    rng: Random,
    prefix: Sequence[PlanningCell] = (),
) -> Selection:
    """Choose one route under the budget, optionally holding a committed prefix.

    ``prefix`` is the part of a previous recommendation that is being held to. It is placed
    at the head of every candidate route and never reordered or removed, which is what makes
    a commitment a commitment; the search then extends it with whatever the remaining budget
    affords.
    """
    if restarts < 1:
        raise ValueError("a search runs at least once")
    if shortlist < 1:
        raise ValueError("a shortlist of no entries is not a shortlist")

    shortlisted = candidates(
        cells, state=state, micros=start_micros, threshold=threshold, limit=maximum_candidates
    )
    considered = len(shortlisted)

    # One memo across every restart. A route's value is a pure function of its cells given
    # the state, the start and the horizon's beginning, and the restarts explore overlapping
    # neighbourhoods of the same space: without this the same prefix is walked from scratch
    # once per restart, which is most of the cost of the search and none of its answer.
    walked: dict[tuple[PlanningCell, ...], RouteValue] = {}

    def valued(route: Sequence[PlanningCell]) -> RouteValue:
        key = tuple(route)
        cached = walked.get(key)
        if cached is not None:
            return cached
        result = evaluate_route(
            key,
            state=state,
            start=start,
            start_micros=start_micros,
            traversal=traversal,
            footprint=footprint,
            threshold=threshold,
            budget_seconds=budget_seconds,
        )
        walked[key] = result
        return result

    held = tuple(prefix)
    best = valued(held)
    if not best.within(budget_seconds):
        # A prefix that no longer fits its own budget is not a prefix worth holding. The
        # caller sees an empty route and the reason, and the commitment rule above decides
        # what to do about it rather than this search silently dropping vertices.
        return Selection(
            route=valued(()),
            candidate_cell_count=considered,
            restarts=restarts,
            empty_reason=EmptyReason.BUDGET_TOO_SMALL,
        )

    if not shortlisted:
        return Selection(
            route=best,
            candidate_cell_count=0,
            restarts=restarts,
            empty_reason=None if held else EmptyReason.NOTHING_WORTH_SAMPLING,
        )

    for restart in range(restarts):
        route = _grow(
            held,
            shortlisted,
            valued=valued,
            budget_seconds=budget_seconds,
            shortlist=1 if restart == 0 else shortlist,
            rng=rng,
        )
        if _better(route, best):
            best = route

    empty_reason = None
    if not best.vertices:
        empty_reason = EmptyReason.BUDGET_TOO_SMALL
    return Selection(
        route=best,
        candidate_cell_count=considered,
        restarts=restarts,
        empty_reason=empty_reason,
    )


def _grow(
    prefix: Sequence[PlanningCell],
    shortlisted: Sequence[PlanningCell],
    *,
    valued,
    budget_seconds: float,
    shortlist: int,
    rng: Random,
) -> RouteValue:
    """One greedy insertion pass, drawing from a shortlist of the best moves."""
    route = list(prefix)
    remaining = list(shortlisted)
    current = valued(route)
    held = len(prefix)

    while remaining:
        moves: list[tuple[float, float, tuple[PlanningCell, ...], PlanningCell, RouteValue]] = []
        for cell in remaining:
            for position in range(held, len(route) + 1):
                proposal = (*route[:position], cell, *route[position:])
                candidate = valued(proposal)
                if not candidate.within(budget_seconds):
                    continue
                added_value = candidate.value - current.value
                added_cost = candidate.consumed_seconds - current.consumed_seconds
                if added_value <= _TIE:
                    continue
                ratio = added_value / added_cost if added_cost > _TIE else float("inf")
                moves.append((ratio, added_value, proposal, cell, candidate))
        if not moves:
            break
        # Rank by ratio, then by value added, then by the route itself. The last is what
        # makes two equally good insertions resolve the same way in every process.
        moves.sort(key=lambda move: (-move[0], -move[1], move[2]))
        chosen = moves[0]
        if shortlist > 1 and len(moves) > 1:
            chosen = moves[rng.randrange(min(shortlist, len(moves)))]
        route = list(chosen[2])
        remaining.remove(chosen[3])
        current = chosen[4]

    return current


def _better(candidate: RouteValue, incumbent: RouteValue) -> bool:
    """Whether one route beats another, with every tie broken deterministically."""
    if candidate.value > incumbent.value + _TIE:
        return True
    if candidate.value < incumbent.value - _TIE:
        return False
    if candidate.consumed_seconds < incumbent.consumed_seconds - _TIE:
        return True
    if candidate.consumed_seconds > incumbent.consumed_seconds + _TIE:
        return False
    return candidate.cells < incumbent.cells
