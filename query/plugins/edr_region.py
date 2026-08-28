"""Radius and area over one open run: the grid's own nodes inside a drawn geometry.

Both query types are one computation with a different membership test — a great-circle
distance for radius, ring membership for area — over the run's own grid nodes, answered at
the requested depths and times exactly as a cube answers its nodes. What differs from cube
is the response's shape, and the reason is stated on
:func:`plugins.coveragejson.multipoint_series_coverage`: a ``Grid`` domain cannot carry
"the nodes inside the drawn geometry" without either misstating the shape or nulling the
nodes outside it, and a null in these responses must keep meaning exactly one thing.

**The budget is counted before anything is computed**, in the unit cube already uses:
``times x depths x selected nodes``. Over budget is refused with the measured count and the
limit named, never truncated — a neighbourhood quietly answered smaller than it was drawn
would look complete, which is the failure this whole component is arranged to avoid.

**An empty selection is refused, not answered.** A circle or polygon that selects no grid
node gets an error naming the geometry and the run's domain, exactly as cube's empty bbox
does; an empty coverage reads as a measurement of nothing.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from plugins.coveragejson import multipoint_series_coverage
from plugins.edr_coverage import OpenRun, resolve_depths, resolve_times
from plugins.edr_geometry import haversine_km, point_in_ring
from plugins.errors import QueryLayerError, RequestTooLargeError
from plugins.interpolation import interpolate

__all__ = ["RegionQuery"]


class RegionQuery:
    """Radius and area over one open run. Plain Python; pygeoapi is not in this file's way."""

    def __init__(self, run: OpenRun) -> None:
        self.run = run

    def radius(
        self,
        *,
        longitude: float,
        latitude: float,
        within_km: float,
        z: str | None = None,
        datetime_: str | None = None,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        nodes = self._nodes(
            lambda node_longitude, node_latitude: (
                haversine_km(longitude, latitude, node_longitude, node_latitude) <= within_km
            )
        )
        described = f"the circle of {within_km} km around ({longitude}, {latitude})"
        return self._answer(
            nodes,
            described,
            budget=self.run.settings.radius_maximum_cells,
            budget_name="radius_maximum_cells",
            z=z,
            datetime_=datetime_,
            parameters=parameters,
        )

    def area(
        self,
        *,
        ring: Sequence[Sequence[float]],
        z: str | None = None,
        datetime_: str | None = None,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        nodes = self._nodes(
            lambda node_longitude, node_latitude: point_in_ring(node_longitude, node_latitude, ring)
        )
        described = f"the drawn polygon of {len(ring)} vertices"
        return self._answer(
            nodes,
            described,
            budget=self.run.settings.area_maximum_cells,
            budget_name="area_maximum_cells",
            z=z,
            datetime_=datetime_,
            parameters=parameters,
        )

    def _nodes(self, member: Any) -> list[tuple[float, float]]:
        """The grid nodes the geometry selects, in latitude-major grid order."""
        grid = self.run.grid
        return [
            (longitude, latitude)
            for latitude in grid.latitude.values
            for longitude in grid.longitude.values
            if member(longitude, latitude)
        ]

    def _answer(
        self,
        nodes: list[tuple[float, float]],
        described: str,
        *,
        budget: int,
        budget_name: str,
        z: str | None,
        datetime_: str | None,
        parameters: Sequence[str] | None,
    ) -> dict[str, Any]:
        run = self.run
        chosen = run.settings.select(parameters)
        if not nodes:
            raise QueryLayerError(
                f"{described} selects no grid node inside this run's domain, which is "
                f"{run.extent()}. Nothing is returned rather than an empty coverage, "
                f"which would read as a measurement of nothing."
            )
        depths = resolve_depths(z, run)
        times = resolve_times(datetime_, run)

        cells = len(times) * len(depths) * len(nodes)
        if cells > budget:
            raise RequestTooLargeError(
                f"this query covers {cells} cells — {len(times)} times x {len(depths)} "
                f"depths x {len(nodes)} grid nodes inside {described} — and the "
                f"configured limit {budget_name} is {budget}. Narrow the geometry, the "
                f"depth range or the time range. Refused rather than truncated: a "
                f"neighbourhood answered smaller than it was drawn would look complete."
            )

        positions = [
            (longitude, latitude, depth) for longitude, latitude in nodes for depth in depths
        ]
        values: dict[str, list[float | None]] = {}
        for parameter in chosen:
            variable = run.variable(parameter)
            column: list[float | None] = []
            for time_value in times:
                for longitude, latitude, depth in positions:
                    column.append(
                        interpolate(variable, run.grid, (time_value, depth, latitude, longitude))
                    )
            values[parameter.name] = column

        return multipoint_series_coverage(
            positions=positions,
            times_iso=[run.time_encoding.to_iso(value) for value in times],
            parameters=chosen,
            values=values,
        )
