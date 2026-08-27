"""The planning cell: an H3 index in the horizontal, a depth band in the vertical.

SRD FR-35 fixes the horizontal index as H3 and requires a separate index in depth, and this
module is the pairing. A planning cell is the unit over which uncertainty, prize and collapse
are all expressed; nothing in this package works over a latitude and a longitude once the
domain has been indexed, because two visits to the same cell must be the same visit and
floating-point coordinates cannot promise that.

The two shapes that cross the language boundary are imported rather than declared. A depth
band is part of the plan contract — every recommendation publishes its vertical index so the
granularity of the claim is visible — and the domain's extent is part of the run
announcement, which is how the planner learns where the domain is in the first place. Writing
either of them out again here would be a second definition that nothing regenerates and
nothing diffs (Constitution III). :class:`PlanningCell` itself is declared here because it is
not a boundary shape: what crosses the boundary is a vertex, which pairs a cell with an
arrival instant and a value.

Two things are deliberately absent.

There is no interpolation between cells. The resolution is configuration and is published in
every recommendation, so the granularity of a recommendation is visible rather than implied;
smoothing across cells here would hide the resolution the recommendation makes its claim at.

There is no ordering by anything but the index itself. Two regions with equal projected
crossing times, or two candidate cells with equal prizes, are separated by their index and
then by their band, never by the order a dictionary happened to hand them back. That is what
makes a replay produce the same bytes (Constitution II), and it is why every sequence this
module returns is sorted before it is returned.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import h3
from harness_types.messages.plan import DepthBand
from harness_types.messages.run_published import GridBounds

__all__ = [
    "CellGeometry",
    "DepthBand",
    "GridBounds",
    "PlanningCell",
    "band_centre_m",
    "band_contains",
    "corners_of",
    "depth_bands_from",
]


@dataclass(frozen=True, order=True)
class PlanningCell:
    """One planning cell: an H3 index at the geometry's resolution, and a depth band.

    Ordered, and ordered on the index first, so that sorting a collection of cells gives the
    same sequence in every process without anybody remembering to say so.
    """

    h3_index: str
    depth_band: int


def band_centre_m(band: DepthBand) -> float:
    """The band's centre, which is the depth a vertex in this band is reported at."""
    return 0.5 * (band.minimum_depth_m + band.maximum_depth_m)


def band_contains(band: DepthBand, depth_m: float) -> bool:
    """Whether a depth falls in this band. The shallow edge belongs to the band above."""
    return band.minimum_depth_m <= depth_m < band.maximum_depth_m


def corners_of(bounds: GridBounds) -> tuple[tuple[float, float], ...]:
    """The domain's four horizontal corners, as H3 wants a ring: latitude then longitude."""
    if bounds.maximum_latitude <= bounds.minimum_latitude:
        raise ValueError("a domain's northern edge lies north of its southern edge")
    if bounds.maximum_longitude <= bounds.minimum_longitude:
        raise ValueError("a domain's eastern edge lies east of its western edge")
    return (
        (bounds.minimum_latitude, bounds.minimum_longitude),
        (bounds.minimum_latitude, bounds.maximum_longitude),
        (bounds.maximum_latitude, bounds.maximum_longitude),
        (bounds.maximum_latitude, bounds.minimum_longitude),
    )


def depth_bands_from(entries: Iterable[object]) -> tuple[DepthBand, ...]:
    """Build the vertical index from configuration, shallowest first.

    Bands are checked for order here rather than where they are used. A vertical index whose
    bands overlap would let one visit inform the same water twice and the collapse would
    double-count it, which is the failure this whole component exists to avoid; finding it at
    startup is better than finding it in a route value nobody can check.
    """
    bands: list[DepthBand] = []
    for index, entry in enumerate(entries):
        minimum = float(entry.minimum_depth_m)
        maximum = float(entry.maximum_depth_m)
        if maximum <= minimum:
            raise ValueError(
                "a depth band's deep edge lies below its shallow edge; "
                f"band {index} runs from {minimum} to {maximum}"
            )
        if bands and minimum < bands[-1].maximum_depth_m:
            raise ValueError(
                "the vertical index is not ordered shallowest first, or two bands overlap: "
                f"band {index} starts at {minimum} where band {index - 1} ends at "
                f"{bands[-1].maximum_depth_m}"
            )
        bands.append(DepthBand(index=index, minimum_depth_m=minimum, maximum_depth_m=maximum))
    if not bands:
        raise ValueError("a vertical index with no bands indexes nothing")
    return tuple(bands)


class CellGeometry:
    """The domain's index: one H3 resolution and one vertical index, and the geometry on it.

    Every horizontal distance in this package comes from here, so that the cost of a
    traversal and the reach of a sensing footprint are measured by the same function. A
    second distance somewhere else would be a second geometry, and the two would disagree
    about a budget on the day the difference mattered.
    """

    def __init__(self, *, resolution: int, bands: Sequence[DepthBand]) -> None:
        if not 0 <= resolution <= 15:
            raise ValueError("an H3 resolution lies between 0 and 15")
        if not bands:
            raise ValueError("a vertical index with no bands indexes nothing")
        self._resolution = int(resolution)
        self._bands = tuple(bands)

    @property
    def resolution(self) -> int:
        return self._resolution

    @property
    def bands(self) -> tuple[DepthBand, ...]:
        return self._bands

    def band(self, index: int) -> DepthBand:
        return self._bands[index]

    def band_for(self, depth_m: float) -> int:
        """The band a depth falls in. Below the deepest edge is the deepest band."""
        for band in self._bands:
            if band_contains(band, depth_m):
                return band.index
        if depth_m < self._bands[0].minimum_depth_m:
            return self._bands[0].index
        return self._bands[-1].index

    def cell_at(self, latitude: float, longitude: float, depth_m: float) -> PlanningCell:
        """The planning cell a position falls in."""
        return PlanningCell(
            h3_index=h3.latlng_to_cell(latitude, longitude, self._resolution),
            depth_band=self.band_for(depth_m),
        )

    def centre(self, cell: PlanningCell) -> tuple[float, float, float]:
        """The cell's centre: latitude, longitude, and the centre of its band."""
        latitude, longitude = h3.cell_to_latlng(cell.h3_index)
        return latitude, longitude, band_centre_m(self._bands[cell.depth_band])

    def horizontal_distance_m(self, first: str, second: str) -> float:
        """Great-circle distance between two cells' centres, in metres."""
        if first == second:
            return 0.0
        return self.distance_between(h3.cell_to_latlng(first), h3.cell_to_latlng(second))

    @staticmethod
    def distance_between(first: tuple[float, float], second: tuple[float, float]) -> float:
        """Great-circle distance between two coordinates, in metres.

        The one horizontal distance in this package. A traversal leg starts from wherever the
        platform is rather than from a cell centre, so it cannot go through the cell-to-cell
        form above; routing it through an index lookup and back would be a second geometry
        wearing the first one's clothes, and the two would disagree about a budget on the day
        the difference mattered.
        """
        return float(h3.great_circle_distance(first, second, unit="m"))

    def neighbourhood(self, h3_index: str, rings: int) -> tuple[str, ...]:
        """The cells within ``rings`` of this one, the cell itself included, sorted."""
        if rings < 0:
            raise ValueError("a neighbourhood reaches out a whole number of rings")
        return tuple(sorted(h3.grid_disk(h3_index, rings)))

    def cover(self, bounds: GridBounds, *, maximum_cells: int) -> tuple[str, ...]:
        """Every H3 cell of this resolution that any part of the domain falls in, sorted.

        **Overlap, not centre containment.** H3's ordinary cover takes a cell when the cell's
        *centre* lies inside the polygon, which leaves the water along the domain's edge in
        cells the cover does not contain. That is invisible until a projection claims to
        cover every region in the domain and does not (FR-020), or until an observation
        arrives from a cell the planner has never scored. The overlap mode is marked
        experimental by the library and is pinned by the lock file; the property it delivers
        is a requirement, and the stable mode cannot deliver it, so the experimental call is
        made deliberately and named here rather than worked around with a ring of extra cells
        that would put water outside the domain into the projection.

        Bounded, and the bound is a refusal rather than a truncation. A resolution one step
        too fine multiplies the cover by seven; truncating it would quietly plan over part of
        the domain while the projection claimed to cover all of it. A cover that does not fit
        is a configuration error and is reported as one.
        """
        shape = h3.LatLngPoly(list(corners_of(bounds)))
        cells = sorted(h3.h3shape_to_cells_experimental(shape, self._resolution, "overlap"))
        if not cells:
            # A domain the cover finds no cell for is still a domain, and reporting nothing
            # here would make it look like an empty one. The cell its centre falls in is the
            # smallest honest answer.
            centre_latitude = 0.5 * (bounds.minimum_latitude + bounds.maximum_latitude)
            centre_longitude = 0.5 * (bounds.minimum_longitude + bounds.maximum_longitude)
            cells = [h3.latlng_to_cell(centre_latitude, centre_longitude, self._resolution)]
        if len(cells) > maximum_cells:
            raise ValueError(
                f"the domain covers {len(cells)} cells at resolution {self._resolution}, "
                f"above the configured bound of {maximum_cells}; either the resolution is "
                "finer than the domain warrants or the bound is too low to plan over it"
            )
        return tuple(cells)

    def cells(self, indices: Sequence[str]) -> tuple[PlanningCell, ...]:
        """The full planning cell set over these horizontal indices, sorted."""
        return tuple(
            sorted(
                PlanningCell(h3_index=index, depth_band=band.index)
                for index in indices
                for band in self._bands
            )
        )
