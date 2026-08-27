"""The sensing footprint: which cells a visit informs, and by how much.

SRD FR-32 requires this to be an explicit, configured model rather than an implicit
consequence of the grid resolution, and the requirement is worth taking literally. If the
footprint were "the cell you are in", then changing the H3 resolution would change what a
visit is worth, the diminishing returns between two nearby objectives would appear and
disappear with the index, and no route value could be compared with another computed at a
different resolution. Here the reach is a distance in metres and a separation in metres,
both configuration, and the resolution only decides how finely that reach is sampled.

The model is a product of two decays about the visited cell::

    w(cell) = peak * exp(-d_horizontal / L_h) * exp(-|d_depth| / L_v)

with ``peak`` at most one, so a visit never claims to resolve a cell exactly. The kernel is
unbounded and the cover is not, so the extent it is evaluated over — rings in the
horizontal, bands in the vertical — is stated in configuration rather than left to a
tolerance nobody wrote down.

Two properties this shape is chosen for, both of which the tests assert rather than assume:

- **It overlaps.** Two objectives close together share informed cells, so visiting the near
  one collapses part of the far one's prize. That is the diminishing return of FR-003, and
  a footprint confined to one cell would not have it at any resolution.
- **It is symmetric and separable.** The weight between two cells does not depend on which
  of them was visited, and the horizontal and vertical reaches are independent. A route's
  value is then a function of the geometry rather than of the order the footprint happened
  to be evaluated in.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from math import exp

from harness_planner.cells import CellGeometry, PlanningCell, band_centre_m

__all__ = ["Influence", "SensingFootprint"]


@dataclass(frozen=True)
class Influence:
    """One cell a visit informs, and the fraction of its uncertainty the visit removes."""

    cell: PlanningCell
    weight: float


class SensingFootprint:
    """The configured sensing model, evaluated over the geometry it is indexed on."""

    def __init__(
        self,
        geometry: CellGeometry,
        *,
        horizontal_decay_m: float,
        vertical_decay_m: float,
        peak_reduction: float,
        maximum_rings: int,
        maximum_band_separation: int,
    ) -> None:
        if horizontal_decay_m <= 0 or vertical_decay_m <= 0:
            raise ValueError("a decay length is a positive distance in metres")
        if not 0.0 < peak_reduction <= 1.0:
            raise ValueError(
                "the peak reduction is the fraction of a cell's uncertainty a visit removes "
                "at the cell itself, so it lies above zero and at most one"
            )
        if maximum_rings < 0 or maximum_band_separation < 0:
            raise ValueError("a footprint's extent is a whole number of rings and of bands")
        self._geometry = geometry
        self._horizontal_decay_m = float(horizontal_decay_m)
        self._vertical_decay_m = float(vertical_decay_m)
        self._peak = float(peak_reduction)
        self._rings = int(maximum_rings)
        self._band_separation = int(maximum_band_separation)
        self._cache: dict[PlanningCell, tuple[Influence, ...]] = {}

    @property
    def peak_reduction(self) -> float:
        return self._peak

    def weight_between(self, visited: PlanningCell, informed: PlanningCell) -> float:
        """The fraction of ``informed``'s uncertainty a visit to ``visited`` removes."""
        horizontal = self._geometry.horizontal_distance_m(visited.h3_index, informed.h3_index)
        vertical = abs(
            band_centre_m(self._geometry.band(visited.depth_band))
            - band_centre_m(self._geometry.band(informed.depth_band))
        )
        return (
            self._peak
            * exp(-horizontal / self._horizontal_decay_m)
            * exp(-vertical / self._vertical_decay_m)
        )

    def influences(self, visited: PlanningCell) -> tuple[Influence, ...]:
        """Every cell this visit informs, with its weight, in cell order.

        Cached per visited cell. The footprint is a function of the geometry alone, so it
        does not change as a route is evaluated, and recomputing it inside the innermost
        loop of an insertion search would be the whole cost of that search.
        """
        cached = self._cache.get(visited)
        if cached is not None:
            return cached
        neighbourhood = self._geometry.neighbourhood(visited.h3_index, self._rings)
        bands = self._bands_near(visited.depth_band)
        influences = tuple(
            Influence(cell=cell, weight=self.weight_between(visited, cell))
            for cell in sorted(
                PlanningCell(h3_index=index, depth_band=band)
                for index in neighbourhood
                for band in bands
            )
        )
        self._cache[visited] = influences
        return influences

    def _bands_near(self, band: int) -> Sequence[int]:
        lowest = max(0, band - self._band_separation)
        highest = min(len(self._geometry.bands) - 1, band + self._band_separation)
        return range(lowest, highest + 1)
