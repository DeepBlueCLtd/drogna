"""When each region's confidence will lapse, stated in advance rather than on arrival.

SRD FR-34 is what separates this planner from a reactive one. A reactive planner notices
that a region has gone blind; this one says when it will, so a consumer can reason about a
stated future instant instead of waiting for a present condition to arrive. That is what
makes the output schedulable, and it is the requirement that makes the loiter phase of the
scenario interesting at all.

Three decisions, each of which is visible in the published projection.

**Every region appears.** Omission is not permitted, because an absent region reads as a
healthy one. A region that does not lapse inside the horizon says so explicitly, with a
named state rather than by not being there (FR-020).

**A region is decided by its worst band.** A region usable at the surface and blind at depth
is not a usable region, so the band that lapses first is the one reported, and it is named
so that a reader can see which part of the water column decided it.

**The forward march is stepped, not solved.** The growth law here has a closed form and the
crossing could be computed exactly. It is marched instead, at a configured step, and the
accuracy is stated against that step rather than claimed exact. The reason is that a growth
law without a closed form — a different regrowth model, a tau that varies along the march —
would then need no new machinery here, only a different call inside the same loop. That is
also why tau is re-evaluated at each step rather than taken once: a moving feature's
timescale advects with it (ADR-0002), so a region can be quiet at the start of the march and
fast by the end of it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from harness_planner.cells import CellGeometry, PlanningCell
from harness_planner.uncertainty_state import UncertaintyState

__all__ = ["ALREADY_LAPSED", "CROSSING", "NO_CROSSING", "ProjectedRegion", "project"]

CROSSING = "crossing"
ALREADY_LAPSED = "already-lapsed"
NO_CROSSING = "no-crossing-within-horizon"

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class ProjectedRegion:
    """One region's projection: which band decided it, and when it lapses."""

    h3_index: str
    depth_band: int
    state: str
    crossing_micros: int | None
    uncertainty_now: float
    saturated_uncertainty: float
    timescale_seconds: float


def project(
    indices: Sequence[str],
    *,
    state: UncertaintyState,
    geometry: CellGeometry,
    micros: int,
    step_seconds: float,
    horizon_seconds: float,
    threshold: float,
) -> tuple[ProjectedRegion, ...]:
    """March every region forward and report when each one's confidence lapses.

    Returned in H3 index order, so two replays produce the same bytes. Ties between regions
    are therefore broken by the index rather than by the order a dictionary happened to
    yield, which is the whole of the tie-breaking requirement for this output.
    """
    if step_seconds <= 0:
        raise ValueError("a forward march advances by a positive step of simulation time")
    if horizon_seconds <= 0:
        raise ValueError("a projection over no simulation time projects nothing")

    step_micros = max(1, round(step_seconds * _MICROS_PER_SECOND))
    steps = max(1, round(horizon_seconds / step_seconds))

    return tuple(
        _region(
            index,
            state=state,
            geometry=geometry,
            micros=micros,
            step_micros=step_micros,
            steps=steps,
            threshold=threshold,
        )
        for index in sorted(indices)
    )


def _region(
    index: str,
    *,
    state: UncertaintyState,
    geometry: CellGeometry,
    micros: int,
    step_micros: int,
    steps: int,
    threshold: float,
) -> ProjectedRegion:
    """The band of one region that lapses first, or the worst band where none does."""
    lapsing: list[tuple[int, int, int]] = []  # (crossing micros, band, rank of state)
    enduring: list[tuple[float, int]] = []  # (uncertainty at the horizon's end, band)

    for band in geometry.bands:
        cell = PlanningCell(h3_index=index, depth_band=band.index)
        now = state.uncertainty(cell, micros)
        if now > threshold:
            # Already blind. Reported with the instant asked about rather than with nothing:
            # the crossing is in the past, and the projection resolves a crossing to one
            # step, so the earliest step it can name is this one.
            lapsing.append((micros, band.index, 0))
            continue
        crossing = _crossing(
            cell,
            state=state,
            micros=micros,
            step_micros=step_micros,
            steps=steps,
            threshold=threshold,
        )
        if crossing is None:
            enduring.append((state.uncertainty(cell, micros + step_micros * steps), band.index))
        else:
            lapsing.append((crossing, band.index, 1))

    if lapsing:
        crossing_micros, band_index, rank = min(lapsing)
        cell = PlanningCell(h3_index=index, depth_band=band_index)
        return ProjectedRegion(
            h3_index=index,
            depth_band=band_index,
            state=ALREADY_LAPSED if rank == 0 else CROSSING,
            crossing_micros=crossing_micros,
            uncertainty_now=state.uncertainty(cell, micros),
            saturated_uncertainty=state.field.saturated(cell, micros),
            timescale_seconds=state.field.timescale(cell, micros),
        )

    _, band_index = max(enduring)
    cell = PlanningCell(h3_index=index, depth_band=band_index)
    return ProjectedRegion(
        h3_index=index,
        depth_band=band_index,
        state=NO_CROSSING,
        crossing_micros=None,
        uncertainty_now=state.uncertainty(cell, micros),
        saturated_uncertainty=state.field.saturated(cell, micros),
        timescale_seconds=state.field.timescale(cell, micros),
    )


def _crossing(
    cell: PlanningCell,
    *,
    state: UncertaintyState,
    micros: int,
    step_micros: int,
    steps: int,
    threshold: float,
) -> int | None:
    """The first step at which this cell's uncertainty rises above the threshold."""
    for step in range(1, steps + 1):
        instant = micros + step * step_micros
        if state.uncertainty(cell, instant) > threshold:
            return instant
    return None
