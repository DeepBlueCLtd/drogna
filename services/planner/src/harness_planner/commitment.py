"""The receding horizon, and holding a commitment across it.

SRD FR-33 asks for a single committed route and for the horizon to recede. Those two pull
against each other, and this module is where the tension is resolved rather than left to
whichever code path runs last.

A plan computed once and never revisited is a static answer to a moving question, so the
horizon recedes: at the configured cadence in simulation time, when a new uncertainty field
is announced, and when measurements arrive, the route is recomputed from where the platform
now is. But a route recomputed from scratch every few minutes is not a commitment; it is a
sequence of opinions, and a consumer watching the recommendation change under it learns
nothing from any single one of them.

So the part of the route inside the commitment window is held, and it is abandoned only when
the freely replanned alternative beats it by more than a configured margin. **Commitment
without hysteresis is not commitment**: with a margin of zero the prefix would be dropped
for an improvement in the sixth decimal place, which is thrashing with extra steps. When the
prefix is abandoned the departure is recorded with its margin, so that a reader can see the
planner changed its mind and by how much rather than having to diff two recommendations.

The three triggers are stated as three, not folded into one timer, because they mean
different things. The cadence says how long a recommendation may stand; the field
announcement says the thing it was computed from no longer exists; the measurement says the
world has been sampled since. Only the first is a schedule, and none of them is a host
clock — simulation time throughout (Constitution I).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from harness_planner.cells import PlanningCell
from harness_planner.select import Selection
from harness_planner.value import ValuedVertex

__all__ = ["Commitment", "Trigger", "committed_prefix", "hold_or_depart"]

_MICROS_PER_SECOND = 1_000_000
_TIE = 1e-12


class Trigger(StrEnum):
    """Why a replan happened. Three reasons, because they are three different facts."""

    CADENCE = "cadence"
    NEW_FIELD = "new-field"
    MEASUREMENT = "measurement"


@dataclass(frozen=True)
class Commitment:
    """What was held to, what was abandoned, and by how much the alternative won."""

    selection: Selection
    window_seconds: float
    retained_vertex_count: int
    departed_from_previous: bool
    improvement_over_retained: float
    margin: float


def committed_prefix(
    vertices: Sequence[ValuedVertex], *, start_micros: int, window_seconds: float
) -> tuple[PlanningCell, ...]:
    """The part of a previous route that falls inside the commitment window.

    Vertices already in the past are not part of it. They have either been reached, in which
    case the measurement has collapsed the cell and the state knows it, or they have not, in
    which case holding to them would be holding to a plan the platform has already fallen
    behind. Either way the commitment is about what is still ahead.
    """
    if window_seconds <= 0:
        return ()
    horizon = start_micros + round(window_seconds * _MICROS_PER_SECOND)
    return tuple(
        vertex.cell for vertex in vertices if start_micros <= vertex.arrival_micros <= horizon
    )


def hold_or_depart(
    *, free: Selection, held: Selection, prefix_length: int, window_seconds: float, margin: float
) -> Commitment:
    """Choose between the free replan and the one that keeps the committed prefix.

    The free route has to beat the held one by more than the margin. Equality is not enough
    and neither is a hair's breadth: the margin is what stands between a receding horizon and
    a planner that changes its mind every cadence for no reason a reader could name.
    """
    if margin < 0:
        raise ValueError("an improvement margin is not negative")
    improvement = max(0.0, free.route.value - held.route.value)
    departed = prefix_length > 0 and improvement > margin + _TIE
    chosen = free if departed or prefix_length == 0 else held
    return Commitment(
        selection=chosen,
        window_seconds=window_seconds,
        retained_vertex_count=0 if departed else min(prefix_length, len(chosen.route.vertices)),
        departed_from_previous=departed,
        improvement_over_retained=improvement if prefix_length else 0.0,
        margin=margin,
    )
