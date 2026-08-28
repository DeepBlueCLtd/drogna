"""The named-locations list, and the water column a named location answers with.

Two kinds of entry, distinguished in every response, because they come from two different
kinds of truth:

**Seeded features** are the harness's own placed entities with a fixed horizontal
position — the eddy's seeded centre, the front's seeded anchor — as configuration values.
Two of the four seeded features are deliberately absent, and the configuration schema
carries the argument: the thermocline has no horizontal position, and the drifting
feature's position is a function of time, so a static entry would advertise a place it
is not.

**Sensor positions** are derived from reported observations at request time: one entry
per platform, at the position of its latest observation by phenomenon time — which is
simulation time, so no host clock decides what "current" means. Current position only.
The harness holds no location history, this list never becomes one (Constitution V), and
the list refuses a ``datetime`` filter on itself for exactly that reason: a location list
filterable by time is a location history by another name. Each sensor entry carries the
instant its position is current *as of*, so the claim is bounded rather than implied.

**The list is budgeted, not truncated.** One entry per platform is the one answer here
that grows with the store, so the assembled list is counted against
``locations_maximum_locations`` and refused over it with the count and the limit named.

The shape served is ``contracts/schemas/edr-locations.schema.json``, generated into both
languages; this module builds instances of that shape and a test validates them against
the generated model, so the served list and the declared shape cannot drift.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from plugins.coveragejson import grid_coverage
from plugins.edr_coverage import OpenRun, resolve_depths, resolve_times
from plugins.errors import QueryLayerError, RequestTooLargeError
from plugins.interpolation import interpolate

__all__ = [
    "LocationsCatalogue",
    "NamedLocation",
    "PostgresSensorPositions",
    "location_column",
    "sensor_position_statement",
]

_KIND_FEATURE = "feature"
_KIND_SENSOR = "sensor"


@dataclass(frozen=True)
class NamedLocation:
    """One advertised queryable place. Never a history: one position, one optional instant."""

    identifier: str
    name: str
    kind: str
    longitude: float
    latitude: float
    as_of: str | None = None

    def as_geojson(self) -> dict[str, Any]:
        attributes: dict[str, Any] = {"name": self.name, "kind": self.kind}
        if self.as_of is not None:
            attributes["as_of"] = self.as_of
        return {
            "type": "Feature",
            "id": self.identifier,
            "geometry": {"type": "Point", "coordinates": [self.longitude, self.latitude]},
            "properties": attributes,
        }


def sensor_position_statement(schema: str, tables: Mapping[str, str]) -> str:
    """The one SELECT that derives current sensor positions, built for inspection.

    ``DISTINCT ON (thing)`` with a descending phenomenon-time order takes exactly one
    row per platform — its latest reported observation — so no query shape exists here
    that could return a platform's past positions. Ordering is on phenomenon time, which
    is simulation time; the schema holds no arrival or insertion time to leak into
    "latest". Table names come from configuration, as everywhere else.
    """
    observation = f"{schema}.{tables['observations']}"
    datastream = f"{schema}.{tables['datastreams']}"
    thing = f"{schema}.{tables['things']}"
    return (
        f"SELECT DISTINCT ON (d.thing_id) d.thing_id, t.name, "
        f"ST_X(o.location::geometry) AS longitude, "
        f"ST_Y(o.location::geometry) AS latitude, "
        f"o.phenomenon_time "
        f"FROM {observation} o "
        f"JOIN {datastream} d ON o.datastream_id = d.id "
        f"JOIN {thing} t ON d.thing_id = t.id "
        f"ORDER BY d.thing_id, o.phenomenon_time DESC"
    )


def _phenomenon_time_iso(value: Any) -> str:
    """The observation's phenomenon time as the ISO form served everywhere else."""
    if isinstance(value, str):
        return value
    # psycopg hands back a datetime; render it as UTC with microseconds, the spelling
    # every simulation instant in the harness uses.
    return value.strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


@dataclass(frozen=True)
class PostgresSensorPositions:
    """Current sensor positions from the observation store, through the select-only role."""

    dsn: str
    schema: str
    tables: Mapping[str, str]

    def current_positions(self) -> list[NamedLocation]:
        try:
            import psycopg
        except ImportError as error:  # pragma: no cover - the image installs it
            raise QueryLayerError(
                "no database driver is installed, so sensor positions cannot be derived "
                "from reported observations"
            ) from error
        statement = sensor_position_statement(self.schema, dict(self.tables))
        with psycopg.connect(self.dsn) as connection, connection.cursor() as cursor:
            cursor.execute(statement)
            rows = cursor.fetchall()
        return [
            NamedLocation(
                identifier=str(thing_id),
                name=str(name),
                kind=_KIND_SENSOR,
                longitude=float(longitude),
                latitude=float(latitude),
                as_of=_phenomenon_time_iso(phenomenon_time),
            )
            for thing_id, name, longitude, latitude, phenomenon_time in rows
        ]


class LocationsCatalogue:
    """The advertised list: seeded features from configuration, sensors from the store."""

    def __init__(
        self,
        features: Sequence[Mapping[str, Any]],
        sensor_source: Any,
        *,
        maximum_locations: int,
    ) -> None:
        self._features = [
            NamedLocation(
                identifier=str(entry["id"]),
                name=str(entry["name"]),
                kind=_KIND_FEATURE,
                longitude=float(entry["longitude"]),
                latitude=float(entry["latitude"]),
            )
            for entry in features
        ]
        self._sensor_source = sensor_source
        self._maximum = maximum_locations

    def _assembled(self) -> list[NamedLocation]:
        entries = [*self._features, *self._sensor_source.current_positions()]
        if len(entries) > self._maximum:
            raise RequestTooLargeError(
                f"the named-locations list holds {len(entries)} entries and the "
                f"configured limit locations_maximum_locations is {self._maximum}. "
                f"Refused rather than truncated: a shortened list would advertise an "
                f"interface that quietly cannot be enumerated."
            )
        return entries

    def list(
        self,
        *,
        bbox: Sequence[float] | None = None,
        datetime_: str | None = None,
    ) -> dict[str, Any]:
        if datetime_:
            raise QueryLayerError(
                "the locations list takes no datetime: every entry is a current position "
                "or a seeded place, and a location list filterable by time would be a "
                "location history by another name. The harness holds none "
                "(Constitution V). A datetime on the per-location data query itself is "
                "served, and selects the answered column's times."
            )
        entries = self._assembled()
        if bbox:
            if len(bbox) != 4:
                raise QueryLayerError(
                    "a locations bbox is four numbers: minimum longitude, minimum "
                    "latitude, maximum longitude, maximum latitude"
                )
            west, south, east, north = (float(value) for value in bbox)
            entries = [
                entry
                for entry in entries
                if west <= entry.longitude <= east and south <= entry.latitude <= north
            ]
        return {
            "type": "FeatureCollection",
            "features": [entry.as_geojson() for entry in entries],
        }

    def find(self, identifier: str) -> NamedLocation:
        entries = self._assembled()
        for entry in entries:
            if entry.identifier == identifier:
                return entry
        known = ", ".join(sorted(entry.identifier for entry in entries)) or "none"
        raise QueryLayerError(
            f"there is no named location called {identifier!r}; this interface "
            f"advertises {known}. The list is served at the locations query type."
        )


def location_column(
    run: OpenRun,
    location: NamedLocation,
    *,
    z: str | None = None,
    datetime_: str | None = None,
    parameters: Sequence[str] | None = None,
) -> dict[str, Any]:
    """The water column at a named location: every requested depth and time, one point.

    Answered as a grid over the single advertised point, so the cells are counted and
    bounded exactly as any other gridded answer: against ``cube_maximum_cells``, with
    the limit named in the refusal — the same measure and the same limit, rather than a
    second budget for the same shape of work.
    """
    chosen = run.settings.select(parameters)
    grid = run.grid
    outside = []
    if not grid.longitude.minimum <= location.longitude <= grid.longitude.maximum:
        outside.append("longitude")
    if not grid.latitude.minimum <= location.latitude <= grid.latitude.maximum:
        outside.append("latitude")
    if outside:
        raise QueryLayerError(
            f"the named location {location.identifier!r} at ({location.longitude}, "
            f"{location.latitude}) is outside this run's domain in {' and '.join(outside)}. "
            f"The run covers {run.extent()}. Nothing is returned rather than an "
            f"extrapolation."
        )

    depths = resolve_depths(z, run)
    times = resolve_times(datetime_, run)
    cells = len(times) * len(depths)
    budget = run.settings.cube_maximum_cells
    if cells > budget:
        raise RequestTooLargeError(
            f"this location's column covers {cells} cells and the configured limit "
            f"cube_maximum_cells is {budget}. Narrow the depth range or the time range."
        )

    values: dict[str, list[float | None]] = {}
    for parameter in chosen:
        variable = run.variable(parameter)
        values[parameter.name] = [
            interpolate(variable, grid, (time_value, depth, location.latitude, location.longitude))
            for time_value in times
            for depth in depths
        ]
    return grid_coverage(
        longitudes=[location.longitude],
        latitudes=[location.latitude],
        depths=depths,
        times_iso=[run.time_encoding.to_iso(value) for value in times],
        parameters=chosen,
        values=values,
    )
