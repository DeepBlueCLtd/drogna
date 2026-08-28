"""The EDR provider over a coverage run: position and cube, forecast and uncertainty together.

One collection carries the forecast parameters and the uncertainty parameter, as FR-002
requires, rather than two collections that could disagree about the run they describe. The
run itself is resolved by the catalogue at request time, so no run is named in any
configuration file (FR-017).

Trajectory is not here. It is in :mod:`plugins.edr_trajectory`, whose provider subclasses
this one and re-declares ``position`` and ``cube`` for a reason set out there.

Two behaviours are decided here and stated because a response does not show them:

**A query with no time is not answered as "now".** There is no now. The default is the
current run's valid-time extent, read from its manifest, which is data. Reading a host clock
to decide what a forecast says would be Constitution I broken at the one place where the
answer would still look right.

**A cube is bounded before it is computed.** The number of cells the request implies is
counted first and refused with the limit named if it is too large, rather than being
truncated into a response that looks complete.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, ClassVar

from plugins.coverage_catalogue import CatalogueEntry, CoverageCatalogue, StoreLayout
from plugins.coveragejson import (
    Parameter,
    TimeAxisEncoding,
    grid_coverage,
    point_coverage,
)
from plugins.errors import (
    CoverageStoreError,
    QueryLayerError,
    RequestTooLargeError,
    as_provider_error,
)
from plugins.interpolation import Axis, Grid, interpolate
from plugins.netcdf_reader import NetcdfDataset, NetcdfVariableData, read_netcdf
from plugins.pygeoapi_version import base_edr_provider, require_pinned_pygeoapi

__all__ = [
    "CoverageSettings",
    "DrognaCoverageEDRProvider",
    "OpenRun",
    "open_run",
]

_UNITS = "units"

# Which of a run's two fields a parameter is read from, as the configuration spells it.
_FORECAST = "forecast"
_UNCERTAINTY = "uncertainty"


@dataclass(frozen=True)
class CoverageSettings:
    """What the query layer is configured to serve, and what it will not exceed."""

    axes: Mapping[str, str]
    parameters: tuple[Parameter, ...]
    cube_maximum_cells: int
    trajectory_maximum_vertices: int
    radius_maximum_cells: int
    area_maximum_cells: int
    corridor_maximum_samples: int
    locations_maximum_locations: int
    default_depth_metres: float

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> CoverageSettings:
        coverage = section["coverage"]
        limits = section["limits"]
        interpolation = section["interpolation"]
        return cls(
            axes=dict(coverage["axes"]),
            parameters=tuple(Parameter.from_config(entry) for entry in coverage["parameters"]),
            cube_maximum_cells=int(limits["cube_maximum_cells"]),
            trajectory_maximum_vertices=int(limits["trajectory_maximum_vertices"]),
            radius_maximum_cells=int(limits["radius_maximum_cells"]),
            area_maximum_cells=int(limits["area_maximum_cells"]),
            corridor_maximum_samples=int(limits["corridor_maximum_samples"]),
            locations_maximum_locations=int(limits["locations_maximum_locations"]),
            default_depth_metres=float(interpolation["default_depth_metres"]),
        )

    def select(self, names: Sequence[str] | None) -> tuple[Parameter, ...]:
        """The parameters a request asked for, or all of them when it asked for none."""
        if not names:
            return self.parameters
        wanted = [name for name in names if name]
        by_name = {parameter.name: parameter for parameter in self.parameters}
        unknown = [name for name in wanted if name not in by_name]
        if unknown:
            known = ", ".join(sorted(by_name))
            raise QueryLayerError(
                f"this collection has no parameter called {', '.join(unknown)}; it serves {known}"
            )
        return tuple(by_name[name] for name in wanted)


@dataclass(frozen=True)
class OpenRun:
    """One run's two fields, decoded, with the grid they share and the time encoding."""

    entry: CatalogueEntry
    settings: CoverageSettings
    grid: Grid
    time_encoding: TimeAxisEncoding
    _fields: Mapping[str, NetcdfDataset]

    def variable(self, parameter: Parameter) -> NetcdfVariableData:
        dataset = self._fields[parameter.source]
        source = f"{self.entry.run_id} {parameter.source}"
        variable = dataset.require(parameter.variable, source=source)
        expected = (
            self.settings.axes["time"],
            self.settings.axes["depth"],
            self.settings.axes["latitude"],
            self.settings.axes["longitude"],
        )
        if variable.dimensions != expected:
            raise CoverageStoreError(
                f"{source}: {parameter.variable!r} is stored on "
                f"{', '.join(variable.dimensions)} and the collection expects "
                f"{', '.join(expected)}"
            )
        return variable

    def extent(self) -> dict[str, Any]:
        """The domain, as an error naming it can quote and a collection can advertise."""
        return {
            "spatial": [
                self.grid.longitude.minimum,
                self.grid.latitude.minimum,
                self.grid.longitude.maximum,
                self.grid.latitude.maximum,
            ],
            "vertical": [self.grid.depth.minimum, self.grid.depth.maximum],
            "temporal": [
                self.time_encoding.to_iso(self.grid.time.minimum),
                self.time_encoding.to_iso(self.grid.time.maximum),
            ],
        }


def _read(path: Path) -> NetcdfDataset:
    try:
        payload = path.read_bytes()
    except OSError as error:
        raise CoverageStoreError(f"{path.name}: cannot be read ({error})") from error
    return read_netcdf(payload, source=path.name)


@lru_cache(maxsize=8)
def _read_cached(path: str, size: int, mtime_ns: int) -> NetcdfDataset:
    """Decode a coverage file once, keyed on the file's own identity rather than on time.

    ``size`` and ``mtime_ns`` are arguments so that a file replaced in place is decoded
    again; they are the store's state, not an interval measured by a host clock.
    """
    return _read(Path(path))


def _cached(path: Path) -> NetcdfDataset:
    stat = path.stat()
    return _read_cached(str(path), stat.st_size, stat.st_mtime_ns)


def open_run(entry: CatalogueEntry, settings: CoverageSettings) -> OpenRun:
    """Decode a run's fields and build the grid its variables share."""
    fields = {
        _FORECAST: _cached(entry.forecast_path),
        _UNCERTAINTY: _cached(entry.uncertainty_path),
    }
    forecast = fields[_FORECAST]
    source = f"{entry.run_id} {_FORECAST}"
    axes = settings.axes
    grid = Grid(
        time=Axis(axes["time"], tuple(forecast.axis(axes["time"], source=source))),
        depth=Axis(axes["depth"], tuple(forecast.axis(axes["depth"], source=source))),
        latitude=Axis(axes["latitude"], tuple(forecast.axis(axes["latitude"], source=source))),
        longitude=Axis(axes["longitude"], tuple(forecast.axis(axes["longitude"], source=source))),
    )
    units = forecast.require(axes["time"], source=source).attributes.get(_UNITS, "")
    return OpenRun(
        entry=entry,
        settings=settings,
        grid=grid,
        time_encoding=TimeAxisEncoding.from_units(str(units), source=source),
        _fields=fields,
    )


def parse_interval(text: str | None, *, name: str) -> tuple[str | None, str | None]:
    """An EDR interval parameter: a single value, or ``begin/end``, or nothing."""
    if text is None or text == "":
        return None, None
    if "/" not in text:
        return text, text
    begin, _, end = text.partition("/")
    begin = begin.strip()
    end = end.strip()
    if not begin or not end or begin == ".." or end == "..":
        raise QueryLayerError(
            f"{name} is an interval written begin/end, and open ends are not served here "
            f"because a query layer with no bound is a query layer with no limit"
        )
    return begin, end


def _numbers(text: str, *, name: str) -> list[float]:
    try:
        return [float(part) for part in text.split(",") if part.strip()]
    except ValueError as error:
        raise QueryLayerError(f"{name} is not a number: {text!r}") from error


def resolve_depths(z: str | None, run: OpenRun) -> list[float]:
    """The depths a query names, defaulting to the whole vertical extent of the run."""
    if z is None or z == "":
        return list(run.grid.depth.values)
    if "/" in z:
        lower, upper = parse_interval(z, name="z")
        low = float(str(lower))
        high = float(str(upper))
        return [value for value in run.grid.depth.values if low <= value <= high] or [low]
    return _numbers(z, name="z")


def resolve_times(datetime_: str | None, run: OpenRun) -> list[float]:
    """The times a query names, in the axis's own units.

    With none named the answer is the run's own valid-time extent, from its manifest. Never
    "now": there is no now, and inventing one is a host clock deciding what a forecast says.
    """
    if datetime_ is None or datetime_ == "":
        begin, end = run.entry.valid_time
        seconds = [run.time_encoding.from_iso(begin), run.time_encoding.from_iso(end)]
        return [value for value in run.grid.time.values if seconds[0] <= value <= seconds[1]] or [
            run.grid.time.minimum
        ]
    begin, end = parse_interval(datetime_, name="datetime")
    low = run.time_encoding.from_iso(str(begin))
    high = run.time_encoding.from_iso(str(end))
    if low == high:
        return [low]
    return [value for value in run.grid.time.values if low <= value <= high] or [low]


class CoverageQuery:
    """Position and cube over one open run. Plain Python; pygeoapi is not in this file's way."""

    def __init__(self, run: OpenRun) -> None:
        self.run = run

    def position(
        self,
        *,
        longitude: float,
        latitude: float,
        depth: float | None = None,
        time_iso: str | None = None,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        run = self.run
        chosen = run.settings.select(parameters)
        at_depth = run.settings.default_depth_metres if depth is None else depth
        seconds = (
            resolve_times(None, run)[0]
            if time_iso is None
            else run.time_encoding.from_iso(time_iso)
        )
        coordinate = (seconds, at_depth, latitude, longitude)
        outside = run.grid.outside(coordinate)
        if outside:
            raise QueryLayerError(
                f"the position is outside this run's domain: {'; '.join(outside)}. The run "
                f"covers {run.extent()}. Nothing is returned rather than an empty coverage, "
                f"which would read as a measurement of nothing."
            )
        values = {
            parameter.name: interpolate(run.variable(parameter), run.grid, coordinate)
            for parameter in chosen
        }
        return point_coverage(
            longitude=longitude,
            latitude=latitude,
            depth=at_depth,
            time_iso=run.time_encoding.to_iso(seconds),
            parameters=chosen,
            values=values,
        )

    def cube(
        self,
        *,
        bbox: Sequence[float],
        z: str | None = None,
        datetime_: str | None = None,
        parameters: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        run = self.run
        chosen = run.settings.select(parameters)
        if len(bbox) != 4:
            raise QueryLayerError(
                "a cube's bbox is four numbers: minimum longitude, minimum latitude, "
                "maximum longitude, maximum latitude"
            )
        west, south, east, north = (float(value) for value in bbox)
        longitudes = [value for value in run.grid.longitude.values if west <= value <= east]
        latitudes = [value for value in run.grid.latitude.values if south <= value <= north]
        depths = resolve_depths(z, run)
        times = resolve_times(datetime_, run)
        if not longitudes or not latitudes:
            raise QueryLayerError(
                f"the bounding box {list(bbox)} selects no grid node inside this run's "
                f"domain, which is {run.extent()}"
            )

        cells = len(times) * len(depths) * len(latitudes) * len(longitudes)
        budget = run.settings.cube_maximum_cells
        if cells > budget:
            raise RequestTooLargeError(
                f"this cube covers {cells} cells and the configured limit is {budget}. "
                f"Narrow the bounding box, the depth range or the time range. The limit "
                f"exists because the destination is small, and it is stated rather than "
                f"applied by truncating the response into something that looks complete."
            )

        values: dict[str, list[float | None]] = {}
        for parameter in chosen:
            variable = run.variable(parameter)
            column: list[float | None] = []
            for time_value in times:
                for depth_value in depths:
                    for latitude in latitudes:
                        for longitude in longitudes:
                            column.append(
                                interpolate(
                                    variable,
                                    run.grid,
                                    (time_value, depth_value, latitude, longitude),
                                )
                            )
            values[parameter.name] = column

        return grid_coverage(
            longitudes=longitudes,
            latitudes=latitudes,
            depths=depths,
            times_iso=[run.time_encoding.to_iso(value) for value in times],
            parameters=chosen,
            values=values,
        )


class DrognaCoverageEDRProvider(base_edr_provider()):  # type: ignore[misc]
    """pygeoapi's EDR provider for the coverage store, resolved by run rather than by path.

    ``data`` in the provider definition is the coverage store root, not a file. The run a
    request is answered from is the catalogue's current one, or the instance the request
    names — which is how FR-021 is met: publishing a run changes what this provider serves
    without anything in the configuration changing.

    ``query_types`` is set on this class rather than appended to the base's, and every type
    is also a method in this class's own ``__dict__``. Both are needed: pygeoapi has spelt
    the registration two different ways across releases and the failure mode of getting it
    wrong is a collection that quietly stops advertising what it can do. See
    :mod:`plugins.pygeoapi_version`.
    """

    query_types: ClassVar[list[str]] = ["position", "cube", "instances"]

    def __init__(self, provider_def: Mapping[str, Any]) -> None:
        require_pinned_pygeoapi()
        super().__init__(dict(provider_def))
        options = dict(provider_def.get("options") or {})
        self.settings = CoverageSettings.from_config(options)
        self.catalogue = CoverageCatalogue(StoreLayout.from_config(options["coverage_store"]))
        self.axes = [
            self.settings.axes["longitude"],
            self.settings.axes["latitude"],
            self.settings.axes["depth"],
            self.settings.axes["time"],
        ]

    # -- what the framework asks about the collection ------------------------------------

    def get_fields(self) -> dict[str, Any]:
        """The parameters, in the shape pygeoapi validates ``parameter-name`` against."""
        self._fields = {
            parameter.name: {
                "type": "number",
                "title": parameter.label,
                "x-ogc-unit": parameter.unit,
            }
            for parameter in self.settings.parameters
        }
        return self._fields

    def get_query_types(self) -> list[str]:
        return list(self.query_types)

    def instances(self, **kwargs: Any) -> Any:
        """Every catalogued run, so a superseded one stays addressable by its identifier."""
        return self.catalogue.identifiers()

    def get_instance(self, instance: str) -> bool:
        return instance in self.catalogue.entries_by_id()

    # -- the queries ----------------------------------------------------------------------

    def _open(self, instance: str | None) -> OpenRun:
        entry = self.catalogue.entry(instance) if instance else self.catalogue.current()
        return open_run(entry, self.settings)

    def position(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            geometry = kwargs.get("wkt")
            if geometry is None:
                raise QueryLayerError("a position query needs a coords parameter")
            longitude, latitude = float(geometry.x), float(geometry.y)
            depth = None
            z = kwargs.get("z")
            if z:
                depth = _numbers(str(z), name="z")[0]
            elif getattr(geometry, "has_z", False):
                depth = -float(geometry.z)
            return CoverageQuery(run).position(
                longitude=longitude,
                latitude=latitude,
                depth=depth,
                time_iso=kwargs.get("datetime_"),
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error

    def cube(self, **kwargs: Any) -> Any:
        try:
            run = self._open(kwargs.get("instance"))
            bbox = kwargs.get("bbox")
            if not bbox:
                raise QueryLayerError("a cube query needs a bbox parameter")
            return CoverageQuery(run).cube(
                bbox=bbox,
                z=kwargs.get("z"),
                datetime_=kwargs.get("datetime_"),
                parameters=kwargs.get("select_properties"),
            )
        except QueryLayerError as error:
            raise as_provider_error(error) from error
