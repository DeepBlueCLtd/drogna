"""What the planner believes about each planning cell, and when it last learned it.

The state is thin on purpose: per cell, the instant it was last informed, what the visit or
the measurement left behind, and the saturation at that moment. Everything else —
uncertainty now, uncertainty at some future arrival, the prize a visit would collect — is
computed from those three and the field, at the instant asked about. Nothing is cached
against simulation time, because a cached uncertainty is an uncertainty evaluated at the
wrong instant waiting to happen, and that is precisely the error this component exists to
avoid.

Two things this holds and two things it deliberately does not.

It holds the **combination** of ensemble spread and observation age. The SRD does not say
which component combines them, and this one is chosen because it is the only consumer that
needs the combination: putting it in the model runner would make the runner depend on an
observation stream it does not otherwise read, and putting it in telemetry would give the
planner a second producer of its primary input. Features 009 and 010 record the same
decision from their side.

It holds a **last-informed instant per cell** and nothing more of the observation traffic.
Measurements reach the planner on ``obs/#`` in the same manner as the monitor; it does not
query the observation store, and it keeps no observation, no sounding and no history.

It does not hold **tau**, which is re-evaluated at every use. A moving feature's timescale
advects with it (ADR-0002), so a cell that is quiet at one replan can be inside a fast
feature at the next; caching tau for the life of the scenario would freeze the feature in
place while the water it describes moved away.

It does not hold **anything about a platform** beyond what a caller passes in. A position,
a depth and a budget is the whole of a sampling platform in drogna (Constitution V).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from harness_planner.cells import PlanningCell
from harness_planner.collapse import collapsed, excess, regrown
from harness_planner.field import PlanningField
from harness_planner.sensing import SensingFootprint

__all__ = ["Informed", "UncertaintyState"]

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class Informed:
    """What a cell was left at, when, and what it would have saturated to then."""

    micros: int
    uncertainty: float
    saturated: float


class UncertaintyState:
    """The planner's working field over planning cells.

    Forkable, and cheaply: the selection evaluates many candidate routes and each has to
    start from the same beliefs, so a candidate works on a fork and the fork is discarded.
    A search that mutated the real state and undid its changes afterwards would be one
    forgotten undo away from a recommendation computed against a field nobody published.
    """

    def __init__(
        self,
        field: PlanningField,
        *,
        informed: Mapping[PlanningCell, Informed] | None = None,
    ) -> None:
        self._field = field
        self._informed: dict[PlanningCell, Informed] = dict(informed or {})

    @property
    def field(self) -> PlanningField:
        return self._field

    def fork(self) -> UncertaintyState:
        """A copy to evaluate a candidate against, sharing the field and nothing else."""
        return UncertaintyState(self._field, informed=self._informed)

    def rebased(self, field: PlanningField) -> UncertaintyState:
        """The same beliefs about what has been sampled, over a newly published field.

        A new uncertainty field replaces what the ensemble says; it does not undo what the
        platform has measured. Carrying the last-informed instants across is what makes a
        replan reflect what has actually been sampled rather than what was intended.
        """
        return UncertaintyState(field, informed=self._informed)

    def last_informed(self, cell: PlanningCell) -> Informed | None:
        return self._informed.get(cell)

    def informed_cells(self) -> tuple[PlanningCell, ...]:
        """Every cell something is known about, in cell order."""
        return tuple(sorted(self._informed))

    # ------------------------------------------------------------------ reading

    def uncertainty(self, cell: PlanningCell, micros: int) -> float:
        """The cell's uncertainty at this instant.

        A cell never informed sits at the published spread — the cold-arrival phase, where
        uncertainty is ensemble spread alone and the absence of data is emphatically not
        treated as low uncertainty (SRD FR-07). A cell informed at some earlier instant has
        regrown towards the spread at its own timescale since (SRD FR-08).
        """
        saturated = self._field.saturated(cell, micros)
        record = self._informed.get(cell)
        if record is None:
            return saturated
        if micros <= record.micros:
            return record.uncertainty
        return regrown(
            saturated=saturated,
            previous=record.uncertainty,
            previous_saturated=record.saturated,
            elapsed_seconds=(micros - record.micros) / _MICROS_PER_SECOND,
            timescale_seconds=self._field.timescale(cell, micros),
        )

    def excess(self, cell: PlanningCell, micros: int, threshold: float) -> float:
        """How far above the usable-confidence threshold the cell is at this instant."""
        return excess(self.uncertainty(cell, micros), threshold)

    # ------------------------------------------------------------------ writing

    def inform(self, cell: PlanningCell, micros: int, weight: float) -> float:
        """Collapse one cell, and return the prize that collapse collected.

        The prize is the excess removed, not the uncertainty removed. A cell taken from just
        above the threshold to just below it is worth the sliver between them; a cell
        already below it is worth approximately nothing, which is what stops a route
        detouring through water the harness already understands.
        """
        return self._inform(cell, micros, weight, threshold=0.0, prize=False)

    def visit(
        self,
        cell: PlanningCell,
        micros: int,
        *,
        footprint: SensingFootprint,
        threshold: float,
    ) -> float:
        """Apply one visit's whole footprint at this instant, and return what it collected.

        This is the operation the value function is a sum of. The footprint may inform many
        cells at the configured resolution, and the collapse is applied across all of them,
        which is why the resolution is published with every recommendation: at a coarser
        resolution the same footprint is the same reach over fewer, larger cells.
        """
        collected = 0.0
        for influence in footprint.influences(cell):
            collected += self._inform(
                influence.cell, micros, influence.weight, threshold=threshold, prize=True
            )
        return collected

    def measured(self, cell: PlanningCell, micros: int, *, footprint: SensingFootprint) -> None:
        """Record that a measurement was actually taken here, at this simulation instant.

        The same collapse a planned visit would have applied, applied for real. Its prize is
        not returned because nothing collects it: a measurement that has happened is not a
        recommendation, and the value of the route that led to it was published when the
        route was.
        """
        self.visit(cell, micros, footprint=footprint, threshold=0.0)

    def _inform(
        self, cell: PlanningCell, micros: int, weight: float, *, threshold: float, prize: bool
    ) -> float:
        before = self.uncertainty(cell, micros)
        after = collapsed(before, weight)
        saturated = self._field.saturated(cell, micros)
        self._informed[cell] = Informed(
            micros=micros, uncertainty=after, saturated=max(saturated, after)
        )
        if not prize:
            return 0.0
        return excess(before, threshold) - excess(after, threshold)

    def forget(self, cells: Iterable[PlanningCell]) -> None:
        """Drop what is known about these cells. For a state that has outgrown its domain."""
        for cell in cells:
            self._informed.pop(cell, None)
