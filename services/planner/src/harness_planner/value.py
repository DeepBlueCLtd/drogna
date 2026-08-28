"""What a candidate route is worth, with the sampling it does on the way already in it.

This is FR-32 and it is the part of the planner that is easy to get wrong in a way that
looks right. A value function that adds up per-cell uncertainty along a route double-counts
the water two nearby stops both inform, prefers routes that stay inside one dense blob, and
produces recommendations that are confidently useless. Nothing downstream can detect it: a
wrong value produces a plausible route, and a plausible route is what a reader sees.

So the route is *walked*. Each vertex is reached at a stated simulation instant; the field
is asked what it looks like **at that instant**; the visit collects the excess uncertainty
its footprint removes; the collapse is written into a forked state; and the next vertex is
valued against what is left. Two errors are avoided by the same walk, and they are worth
separating because only one of them is visible on a field that stands still:

- **Earlier sampling has already resolved the water.** A distant objective is worth less
  once the stops on the way to it have collapsed the region in between. This shows on any
  field, moving or not, and it is what acceptance scenarios 2 and 3 of User Story 1 assert.
- **The field itself has moved.** tau advects with the feature that authored it and the
  published spread evolves across the forecast's valid time, so the cell a route reaches in
  two hours is not the cell it is now. On a static field a planner that scored every vertex
  against the present would agree exactly with one that scored against the arrival, which
  is why that error survives most tests and fails the moment a feature drifts.

Both are the same discipline — value at the instant of arrival, against the state as it will
then be — and the second is why every read in this module passes an instant rather than
taking one from anywhere.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from functools import cache

from harness_planner.cells import PlanningCell
from harness_planner.sensing import SensingFootprint
from harness_planner.traversal import Position, TraversalCost
from harness_planner.uncertainty_state import UncertaintyState

__all__ = ["RouteValue", "ValuedVertex", "evaluate_route"]

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class ValuedVertex:
    """One stop on a valued route: where, how deep, when reached, and what it added."""

    sequence: int
    cell: PlanningCell
    arrival_micros: int
    latitude: float
    longitude: float
    depth_m: float
    marginal_value: float


@dataclass(frozen=True)
class RouteValue:
    """A candidate route, walked.

    ``value`` is collapse-aware and is what the recommendation publishes.
    ``value_without_collapse`` is what the same route would have been worth had each vertex
    been scored against the field as it stood at the start with nothing collapsed. The gap
    between them is the size of the error being avoided, and it is carried because a number
    nobody can see is a number nobody checks.

    The naive figure is computed on demand rather than during the walk. A search evaluates
    thousands of candidates and publishes one, and the naive figure is a second walk of the
    whole route: computing it eagerly made it most of the cost of a search that never looked
    at it. Deferring it changes no published number, only when it is worked out.
    """

    vertices: tuple[ValuedVertex, ...]
    value: float
    consumed_seconds: float
    distance_m: float
    _standalone: Callable[[], float] = dataclass_field(repr=False, compare=False)

    @property
    def value_without_collapse(self) -> float:
        """The naive sum: every vertex scored alone, against the field at the horizon's start."""
        return self._standalone()

    @property
    def cells(self) -> tuple[PlanningCell, ...]:
        return tuple(vertex.cell for vertex in self.vertices)

    def within(self, budget_seconds: float) -> bool:
        """Whether this route fits its budget. A route that does not is a defect."""
        return self.consumed_seconds <= budget_seconds + 1e-9


def evaluate_route(
    cells: Sequence[PlanningCell],
    *,
    state: UncertaintyState,
    start: Position,
    start_micros: int,
    traversal: TraversalCost,
    footprint: SensingFootprint,
    threshold: float,
    budget_seconds: float | None = None,
) -> RouteValue:
    """Walk a candidate route and report what it is worth.

    ``state`` is not modified: the walk runs on a fork, so a caller may evaluate as many
    candidates as it likes against the same beliefs without undoing anything.

    The walk stops as soon as the budget is spent, and the reported ``consumed_seconds`` is
    then already past it — so :meth:`RouteValue.within` still answers false and the caller
    still discards the route, which is what it did before. What changes is that the vertices
    beyond the budget are not scored, and this is not an optimisation.

    Arrival times only increase, so a route that has overrun its budget cannot come back
    under it by acquiring more vertices: everything past that point was value the search
    computed and could never use. It was also a question about the world at instants the
    platform will never reach — and the search proposes routes far longer than the budget,
    so those instants ran hours past the extent the ground-truth manifest describes. The
    generator's evaluator refuses such a point, correctly and by design (ADR-0002: there is
    no constant to substitute for a decorrelation timescale), and the refusal came back as
    ``OutOfDomainError`` out of ``handle`` and stopped the process. Found by running the
    planner against a real environment rather than against a test double whose timescale
    has no domain, which is why no test saw it.
    """
    scratch = state.fork()
    position = start
    micros = start_micros
    distance_m = 0.0
    total = 0.0
    vertices: list[ValuedVertex] = []
    spent = (
        None
        if budget_seconds is None
        else start_micros + round(budget_seconds * _MICROS_PER_SECOND)
    )

    for sequence, cell in enumerate(cells):
        target = traversal.position_of(cell)
        distance_m += traversal.distance_m(position, target)
        micros += traversal.micros(position, target)
        if spent is not None and micros > spent:
            break
        marginal = scratch.visit(cell, micros, footprint=footprint, threshold=threshold)
        total += marginal
        vertices.append(
            ValuedVertex(
                sequence=sequence,
                cell=cell,
                arrival_micros=micros,
                latitude=target.latitude,
                longitude=target.longitude,
                depth_m=target.depth_m,
                marginal_value=marginal,
            )
        )
        position = target

    ordered = tuple(vertex.cell for vertex in vertices)

    @cache
    def standalone() -> float:
        return _standalone_total(
            ordered,
            state=state,
            start_micros=start_micros,
            footprint=footprint,
            threshold=threshold,
        )

    return RouteValue(
        vertices=tuple(vertices),
        value=total,
        consumed_seconds=(micros - start_micros) / _MICROS_PER_SECOND,
        distance_m=distance_m,
        _standalone=standalone,
    )


def _standalone_total(
    cells: Sequence[PlanningCell],
    *,
    state: UncertaintyState,
    start_micros: int,
    footprint: SensingFootprint,
    threshold: float,
) -> float:
    """The naive sum: every vertex scored alone, against the field at the horizon's start.

    Each vertex gets its own fork, so no vertex sees another's collapse. This is exactly the
    number a consumer would reach by adding up standalone per-cell values, and publishing it
    beside the honest one is what makes the difference between them checkable.
    """
    total = 0.0
    for cell in cells:
        scratch = state.fork()
        total += scratch.visit(cell, start_micros, footprint=footprint, threshold=threshold)
    return total
