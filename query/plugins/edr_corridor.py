"""The corridor query: a route with a width, answered as parallel trajectories.

A corridor's answer must genuinely depend on its width — a width that changed nothing
would make the query type an alias with a parameter to ignore, which is the silently
dropped option this component refuses everywhere else. It is discretised as **parallel
routes at cross-track offsets**: the centreline, the two corridor edges at exactly
±width/2, and interior offsets spaced by the run's own horizontal grid resolution, so
nothing the grid could distinguish across the corridor is skipped and nothing finer than
the grid is invented. Each offset route displaces every vertex perpendicular to the local
route direction (:func:`plugins.edr_geometry.perpendicular_offsets`; positive offsets are
port — left of travel) and is then sampled exactly as a trajectory: the same per-vertex
arrival times, the same depth rules, the same declined-vertex honesty, the same vertex
budget per route.

The response is a CoverageJSON ``CoverageCollection`` of Trajectory coverages, members
ordered starboard to port, each labelled ``drogna:cross_track_km`` with its signed offset,
under a ``drogna:corridor`` block naming the width, the step and the offsets — so a reader
need not rederive the discretisation from the coordinates. Nothing is aggregated; the
harness aggregates nowhere.

**The budget is counted before anything is computed**: ``offset routes x route vertices``
against ``corridor_maximum_samples``, refused with both factors and the limit named,
never truncated.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from itertools import pairwise
from typing import Any

from plugins.coveragejson import coverage_collection
from plugins.edr_coverage import OpenRun
from plugins.edr_geometry import KM_PER_DEGREE_LATITUDE, perpendicular_offsets
from plugins.edr_trajectory import TrajectoryQuery, Vertex
from plugins.errors import QueryLayerError, RequestTooLargeError

__all__ = ["CorridorQuery", "cross_track_offsets_km", "cross_track_step_km"]


def _finest_step(values: Sequence[float]) -> float | None:
    steps = [abs(later - earlier) for earlier, later in pairwise(values)]
    return min(steps) if steps else None


def cross_track_step_km(run: OpenRun) -> float:
    """The grid's horizontal resolution, as the corridor's cross-track step.

    The finer of the two horizontal spacings, measured at the domain's mid-latitude — a
    bound derived from what is on disk, not a number typed into code. Finer sampling than
    this would ask the interpolation to invent structure the grid does not hold; coarser
    would skip nodes the corridor genuinely covers.
    """
    grid = run.grid
    mid_latitude = (grid.latitude.minimum + grid.latitude.maximum) / 2.0
    latitude_step = _finest_step(grid.latitude.values)
    longitude_step = _finest_step(grid.longitude.values)
    candidates = [
        step
        for step in (
            latitude_step * KM_PER_DEGREE_LATITUDE if latitude_step is not None else None,
            longitude_step * KM_PER_DEGREE_LATITUDE * math.cos(math.radians(mid_latitude))
            if longitude_step is not None
            else None,
        )
        if step is not None
    ]
    if not candidates:
        raise QueryLayerError(
            "this run's grid has a single horizontal node, so a corridor has no "
            "cross-track resolution to sample at"
        )
    return min(candidates)


def cross_track_offsets_km(width_km: float, step_km: float) -> list[float]:
    """The signed offsets a corridor of this width is sampled at, starboard to port.

    Always the centreline and both edges, so every width changes the answer; interior
    offsets at the grid's own step. Offsets are exact multiples and the exact half-width,
    deduplicated where they coincide.
    """
    half = width_km / 2.0
    offsets = {0.0, half, -half}
    multiples = 1
    while multiples * step_km < half:
        offsets.add(multiples * step_km)
        offsets.add(-multiples * step_km)
        multiples += 1
    return sorted(offsets)


class CorridorQuery:
    """Sampling a route's corridor against one open run. Plain Python, no framework."""

    def __init__(self, run: OpenRun) -> None:
        self.run = run

    def sample(
        self,
        vertices: Sequence[Vertex],
        *,
        width_km: float,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        trajectory = TrajectoryQuery(self.run)
        # The centre route's own refusals come first — vertex order, vertex budget — so a
        # broken route is named before any arithmetic about widths.
        trajectory.validate(vertices)

        step_km = cross_track_step_km(self.run)
        offsets = cross_track_offsets_km(width_km, step_km)

        samples = len(offsets) * len(vertices)
        budget = self.run.settings.corridor_maximum_samples
        if samples > budget:
            raise RequestTooLargeError(
                f"this corridor covers {samples} samples — {len(offsets)} offset routes "
                f"({width_km} km wide at a {step_km:.1f} km cross-track step) x "
                f"{len(vertices)} route vertices — and the configured limit "
                f"corridor_maximum_samples is {budget}. Narrow the width or shorten the "
                f"route. Refused rather than truncated: a corridor answered thinner than "
                f"it was drawn would look complete."
            )

        centreline = [(vertex.longitude, vertex.latitude) for vertex in vertices]
        members: list[dict[str, Any]] = []
        for offset in offsets:
            displaced = perpendicular_offsets(centreline, offset)
            route = [
                Vertex(
                    index=vertex.index,
                    longitude=longitude,
                    latitude=latitude,
                    depth=vertex.depth,
                    unix_seconds=vertex.unix_seconds,
                )
                for vertex, (longitude, latitude) in zip(vertices, displaced, strict=True)
            ]
            member = trajectory.sample(route, parameters=parameters)
            member["drogna:cross_track_km"] = offset
            members.append(member)

        document = coverage_collection(members, domain_type="Trajectory")
        document["drogna:corridor"] = {
            "width_km": width_km,
            "cross_track_step_km": step_km,
            "offsets_km": offsets,
            "note": (
                "The corridor is sampled as parallel routes at these signed cross-track "
                "offsets (positive to port), each vertex at its own arrival time. "
                "Nothing is aggregated."
            ),
        }
        return document
