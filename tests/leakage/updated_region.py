"""The second leakage path in SRD FR-42: what the shape of the change discloses.

Two successive released products contain no coordinate, no attribute naming a place, and
nothing the provenance scanner would flag. Subtract one from the other and the cells that
moved are a picture. If only the neighbourhood of recent measurements was refreshed, that
picture is where the platform went, and everything the first gate withheld has been given
back by arithmetic.

This module computes the picture and scores it.

**The change mask** is the set of cells whose released value differs by more than the
released quantisation step. Below the step, two released values are the same value; without
that rule the mask would be a map of floating-point noise and would cover everything.

**The recovery statistic** is Youden's J: the true-positive rate of the mask against the
buffered measurement geometry, minus its false-positive rate. It is zero when mask
membership says nothing about whether a cell is near a measurement, and one when the mask
is exactly the buffered geometry. Zero-at-chance is what makes a bound meaningful without
knowing how large the mask happens to be — a bare overlap fraction would rise simply
because a mask covered more of the domain.

**Every variable is scored, and so is the union.** FR-015 asks for the union of the
per-variable masks, and the union is what is reported first. But a union can hide a leak:
a field rewritten across the whole domain and a field driven by observation age union to a
mask at chance, and the age field is a map of measurement locations all the same. So each
variable is scored on its own as well, and the worst of them is what the gate acts on. That
is a deliberate strengthening of FR-015 rather than a reading of it, and
``tests/leakage/fixtures/age_driven_pair/`` is the control that shows why it is needed.

**Nothing is a pass by default.** An empty mask, a pair on different grids, a pair with
different variable sets, and a run whose geometry does not span more than the identification
radius are all reported as inconclusive, and inconclusive fails (FR-017). A comparison that
could not have found anything is not evidence that there was nothing to find.
"""

from __future__ import annotations

import json
import math
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

# The query layer's own classic-NetCDF reader, used here rather than copied: a third decoder
# would be a third opinion about a file format, which is how readers come to disagree about
# what a coverage says. It is not the same reader as `harness_core.netcdf.read_netcdf` — the
# encoder moved to harness_core when it acquired a third consumer and the reader followed it
# out of the monitor — and it stays separate for a stated reason: the query layer's image
# installs pygeoapi, which pins a Pydantic major version this workspace cannot carry, so a
# plugin that imported a workspace package would not run in the image it ships in. This
# scanner reads what the query layer serves, so it reads it the way the query layer does.
if str(REPOSITORY_ROOT / "query") not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT / "query"))

from plugins.netcdf_reader import read_netcdf  # noqa: E402

__all__ = [
    "METRES_PER_DEGREE_LATITUDE",
    "Assessment",
    "Grid",
    "Measurement",
    "Product",
    "assess",
    "buffered_geometry",
    "change_mask",
    "load_geometry",
    "load_product",
    "recovery",
]

METRES_PER_DEGREE_LATITUDE = 111_320.0
"""One degree of latitude, in metres. A constant of the sphere, not a configured value."""

LATITUDE_AXIS = "latitude"
LONGITUDE_AXIS = "longitude"


class InvalidGeometryError(Exception):
    """The measurement geometry document is unusable. Names the field rather than the symptom."""


@dataclass(frozen=True)
class Measurement:
    """One place a measurement was taken, in the interval between two released products."""

    longitude: float
    latitude: float
    simulation_seconds: int


@dataclass(frozen=True)
class Grid:
    """The axes a product is on. Two products on different grids cannot be compared."""

    latitudes: tuple[float, ...]
    longitudes: tuple[float, ...]

    @property
    def cells(self) -> int:
        return len(self.latitudes) * len(self.longitudes)

    def index(self, latitude_index: int, longitude_index: int) -> int:
        return latitude_index * len(self.longitudes) + longitude_index


@dataclass(frozen=True)
class Product:
    """One released product: where it came from, the grid it is on, and its fields."""

    source: str
    grid: Grid
    variables: Mapping[str, tuple[float, ...]]


@dataclass(frozen=True)
class Score:
    """One recovery statistic, with the counts it was computed from.

    The counts travel with the figure because a statistic printed alone is a number nobody
    can argue with. SC-005 asks for the figures to be reported rather than asserted
    silently, and a true-positive rate of one over a mask of three cells is a different
    claim from the same rate over a mask of three hundred.
    """

    statistic: float
    mask_cells: int
    buffered_cells: int
    total_cells: int
    true_positive_rate: float
    false_positive_rate: float


@dataclass(frozen=True)
class Assessment:
    """What the comparison found, or why it could not find anything.

    ``conclusive`` is false for every case FR-017 names. The caller must treat that as a
    failure: a comparison that could not have recovered anything is not evidence that there
    was nothing to recover.
    """

    conclusive: bool
    reason: str = ""
    union: Score | None = None
    per_variable: dict[str, Score] = field(default_factory=dict)

    @property
    def worst(self) -> float:
        """The largest recovery statistic over the union and every variable on its own."""
        scores = [score.statistic for score in self.per_variable.values()]
        if self.union is not None:
            scores.append(self.union.statistic)
        return max(scores) if scores else 0.0

    @property
    def worst_variable(self) -> str:
        candidates = {name: score.statistic for name, score in self.per_variable.items()}
        if self.union is not None:
            candidates["<union>"] = self.union.statistic
        if not candidates:
            return ""
        return max(candidates, key=lambda name: candidates[name])

    def as_document(self) -> dict[str, Any]:
        """The assessment as it appears in the leakage report."""

        def rendered(score: Score | None) -> dict[str, Any] | None:
            if score is None:
                return None
            return {
                "statistic": round(score.statistic, 6),
                "mask_cells": score.mask_cells,
                "buffered_cells": score.buffered_cells,
                "total_cells": score.total_cells,
                "true_positive_rate": round(score.true_positive_rate, 6),
                "false_positive_rate": round(score.false_positive_rate, 6),
            }

        return {
            "conclusive": self.conclusive,
            "reason": self.reason,
            "union": rendered(self.union),
            "per_variable": {name: rendered(score) for name, score in self.per_variable.items()},
            "worst": round(self.worst, 6) if (self.union or self.per_variable) else None,
            "worst_variable": self.worst_variable,
        }


# --- reading -------------------------------------------------------------------------------


def load_product(path: Path) -> Product:
    """Decode one released product. A file that is not a coverage is a failure, not a skip."""
    dataset = read_netcdf(path.read_bytes(), source=str(path))
    for axis in (LATITUDE_AXIS, LONGITUDE_AXIS):
        if axis not in dataset.variables:
            raise InvalidGeometryError(
                f"{path}: carries no {axis!r} axis, so there is no grid to compare on"
            )
    grid = Grid(
        latitudes=tuple(dataset.axis(LATITUDE_AXIS, source=str(path))),
        longitudes=tuple(dataset.axis(LONGITUDE_AXIS, source=str(path))),
    )
    fields = {
        name: tuple(float(value) for value in variable.values)
        for name, variable in dataset.variables.items()
        if variable.dimensions == (LATITUDE_AXIS, LONGITUDE_AXIS)
    }
    return Product(source=str(path), grid=grid, variables=fields)


def load_geometry(path: Path) -> list[Measurement]:
    """The measurement geometry for the interval between two products.

    The specification says this is read from the run manifest. It is not there:
    ``contracts/schemas/run-manifest.schema.json`` is closed and holds seeds, clock
    configuration, participants and digests, and no geometry. So this reads the document the
    bundle carries beside its products, and fails loudly on a missing field rather than
    defaulting — a geometry that silently came out empty would make every comparison
    inconclusive, and an inconclusive run that nobody looked at is how a gate stops working.
    """
    document = json.loads(path.read_text(encoding="utf-8"))
    entries = document.get("measurements")
    if not isinstance(entries, list) or not entries:
        raise InvalidGeometryError(
            f"{path}: no 'measurements', so there is nothing to score against"
        )
    geometry = []
    for position, entry in enumerate(entries):
        for name in ("longitude", "latitude", "simulation_seconds"):
            if name not in entry:
                raise InvalidGeometryError(f"{path}: measurement {position} has no {name!r}")
        geometry.append(
            Measurement(
                longitude=float(entry["longitude"]),
                latitude=float(entry["latitude"]),
                simulation_seconds=int(entry["simulation_seconds"]),
            )
        )
    return geometry


# --- the mask and the statistic ---------------------------------------------------------------


def change_mask(before: Sequence[float], after: Sequence[float], step: float) -> frozenset[int]:
    """Cells whose released value differs by more than the released quantisation step."""
    return frozenset(
        index
        for index, (first, second) in enumerate(zip(before, after, strict=True))
        if abs(second - first) > step
    )


def _metres_per_degree_longitude(latitude: float) -> float:
    return METRES_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude))


def _distance_m(longitude: float, latitude: float, measurement: Measurement) -> float:
    northing = (latitude - measurement.latitude) * METRES_PER_DEGREE_LATITUDE
    easting = (longitude - measurement.longitude) * _metres_per_degree_longitude(latitude)
    return math.hypot(northing, easting)


def buffered_geometry(
    grid: Grid, geometry: Sequence[Measurement], radius_m: float
) -> frozenset[int]:
    """The cells within the identification radius of any measurement in the interval."""
    inside = set()
    for latitude_index, latitude in enumerate(grid.latitudes):
        for longitude_index, longitude in enumerate(grid.longitudes):
            for measurement in geometry:
                if _distance_m(longitude, latitude, measurement) <= radius_m:
                    inside.add(grid.index(latitude_index, longitude_index))
                    break
    return frozenset(inside)


def geometry_span_m(geometry: Sequence[Measurement]) -> float:
    """The largest distance between any two measurements in the interval."""
    return max(
        (
            _distance_m(other.longitude, other.latitude, measurement)
            for measurement in geometry
            for other in geometry
        ),
        default=0.0,
    )


def recovery(mask: frozenset[int], buffered: frozenset[int], total: int) -> Score:
    """Youden's J: how much better than chance the mask predicts nearness to a measurement.

    Zero when the mask says nothing about the geometry; one when it is the geometry. It is
    signed, and a negative value means the mask avoided the geometry — which is not a leak
    and is reported as the small number it is rather than folded into a magnitude.
    """
    positives = len(buffered)
    negatives = total - positives
    true_positives = len(mask & buffered)
    false_positives = len(mask - buffered)
    true_positive_rate = true_positives / positives if positives else 0.0
    false_positive_rate = false_positives / negatives if negatives else 0.0
    return Score(
        statistic=true_positive_rate - false_positive_rate,
        mask_cells=len(mask),
        buffered_cells=positives,
        total_cells=total,
        true_positive_rate=true_positive_rate,
        false_positive_rate=false_positive_rate,
    )


def assess(
    before: Product,
    after: Product,
    geometry: Sequence[Measurement],
    *,
    radius_m: float,
    step: float,
) -> Assessment:
    """Score one pair of successive released products, or say why it cannot be scored."""
    if before.grid != after.grid:
        return Assessment(
            False,
            "the two products are on different grids, so the change mask is not defined; "
            f"{before.source} has {before.grid.cells} cells and {after.source} has "
            f"{after.grid.cells}",
        )
    if set(before.variables) != set(after.variables):
        missing = set(before.variables) ^ set(after.variables)
        return Assessment(
            False,
            "the two products carry different variables, so the change mask is not defined; "
            f"{sorted(missing)} appears in one and not the other",
        )
    if not before.variables:
        return Assessment(False, "neither product carries a field on the grid")

    span = geometry_span_m(geometry)
    if span <= radius_m:
        return Assessment(
            False,
            f"the measurement geometry spans {span:.0f} m, which is not more than the "
            f"{radius_m:.0f} m identification radius. A platform that did not move cannot be "
            "recovered by any mask, so a low statistic here would say nothing about the "
            "mitigation and must not be read as a pass.",
        )

    grid = before.grid
    buffered = buffered_geometry(grid, geometry, radius_m)
    if not buffered:
        return Assessment(False, "no cell is within the identification radius of any measurement")
    if len(buffered) == grid.cells:
        return Assessment(
            False,
            "every cell is within the identification radius of some measurement, so no mask "
            "can distinguish one from another",
        )

    masks = {
        name: change_mask(before.variables[name], after.variables[name], step)
        for name in sorted(before.variables)
    }
    union: frozenset[int] = frozenset().union(*masks.values()) if masks else frozenset()
    if not union:
        return Assessment(
            False,
            "the change mask is empty: no released value moved by more than the quantisation "
            f"step of {step}. Two identical products cannot have disclosed anything, and they "
            "cannot have shown that nothing was disclosed either.",
        )

    return Assessment(
        True,
        union=recovery(union, buffered, grid.cells),
        per_variable={
            name: recovery(mask, buffered, grid.cells) for name, mask in masks.items() if mask
        },
    )
