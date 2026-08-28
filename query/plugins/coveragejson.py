"""Assembling CoverageJSON: Point, Grid and Trajectory domains, and the referencing.

One module builds every response so that the three domain types cannot disagree about what
a parameter is called, what a unit says or which way the vertical axis points. The last of
those is the one that hides: WKT Z is elevation and positive up, the coverage's axis is
depth and positive down, and a sign error between them is invisible in a response and
entirely plausible in a plot.

Times are rendered as simulation time, through :class:`harness_core.clock.SimInstant`. The
coverage file stores its time axis as seconds since an origin recorded in the variable's
``units`` attribute, which is where the origin comes from — never from a host clock, and
never from the moment the query arrived.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_core.clock import SimInstant

from plugins.errors import CoverageStoreError

__all__ = [
    "TIME_UNITS_PREFIX",
    "Parameter",
    "TimeAxisEncoding",
    "coverage_collection",
    "grid_coverage",
    "multipoint_series_coverage",
    "parameter_block",
    "point_coverage",
    "referencing",
    "trajectory_coverage",
]

TIME_UNITS_PREFIX = "seconds since "
"""How CF spells a time axis origin, and how the harness's generator writes one."""

_MICROS_PER_SECOND = 1_000_000

# harness:allow-literal-path a CRS identifier, which is a name and not an address
CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84"


@dataclass(frozen=True)
class Parameter:
    """One served parameter: how it is addressed, where it is read from, what it means."""

    name: str
    variable: str
    source: str
    unit: str
    label: str
    standard_name: str | None = None

    @classmethod
    def from_config(cls, entry: Mapping[str, Any]) -> Parameter:
        return cls(
            name=str(entry["name"]),
            variable=str(entry["variable"]),
            source=str(entry["source"]),
            unit=str(entry["unit"]),
            label=str(entry["label"]),
            standard_name=(
                str(entry["standard_name"]) if entry.get("standard_name") is not None else None
            ),
        )


@dataclass(frozen=True)
class TimeAxisEncoding:
    """Seconds since an origin in simulation time, as the coverage file states it."""

    origin: SimInstant

    @classmethod
    def from_units(cls, units: str, *, source: str) -> TimeAxisEncoding:
        if not units.startswith(TIME_UNITS_PREFIX):
            raise CoverageStoreError(
                f"{source}: the time axis says its units are {units!r}; this reader "
                f"understands {TIME_UNITS_PREFIX!r} followed by a simulation instant"
            )
        text = units[len(TIME_UNITS_PREFIX) :].strip()
        try:
            return cls(SimInstant.from_iso(text))
        except ValueError as error:
            raise CoverageStoreError(
                f"{source}: the time axis origin {text!r} — {error}"
            ) from error

    def to_instant(self, seconds: float) -> SimInstant:
        return self.origin.plus_micros(round(seconds * _MICROS_PER_SECOND))

    def to_iso(self, seconds: float) -> str:
        return self.to_instant(seconds).iso()

    def from_iso(self, text: str) -> float:
        return (SimInstant.from_iso(text) - self.origin) / _MICROS_PER_SECOND


def referencing() -> list[dict[str, Any]]:
    """The three reference systems every response here uses, stated in every response.

    Depth is positive down and says so. A vertical axis whose direction is left implicit
    will be read upside down by somebody, and the reading will look plausible.
    """
    return [
        {
            "coordinates": ["x", "y"],
            "system": {
                "type": "GeographicCRS",
                # harness:allow-literal-path a CRS identifier, not an address
                "id": CRS84,
            },
        },
        {
            "coordinates": ["z"],
            "system": {
                "type": "VerticalCRS",
                "cs": {
                    "csAxes": [
                        {
                            "name": {"en": "depth below sea surface"},
                            "direction": "down",
                            "unit": {"symbol": "m"},
                        }
                    ]
                },
            },
        },
        {
            "coordinates": ["t"],
            "system": {"type": "TemporalRS", "calendar": "Gregorian"},
        },
    ]


def parameter_block(parameters: Sequence[Parameter]) -> dict[str, Any]:
    """The ``parameters`` object: what each range is, in units a reader can check."""
    block: dict[str, Any] = {}
    for parameter in parameters:
        observed: dict[str, Any] = {"label": {"en": parameter.label}}
        if parameter.standard_name is not None:
            observed["id"] = parameter.standard_name
        block[parameter.name] = {
            "type": "Parameter",
            "description": {"en": parameter.label},
            "unit": {"symbol": parameter.unit},
            "observedProperty": observed,
        }
    return block


def _range(values: Sequence[float | None], axis_names: Sequence[str], shape: Sequence[int]):
    return {
        "type": "NdArray",
        "dataType": "float",
        "axisNames": list(axis_names),
        "shape": list(shape),
        "values": list(values),
    }


def _coverage(domain: Mapping[str, Any], parameters, ranges) -> dict[str, Any]:
    return {
        "type": "Coverage",
        "domain": dict(domain),
        "parameters": parameter_block(parameters),
        "ranges": dict(ranges),
    }


def point_coverage(
    *,
    longitude: float,
    latitude: float,
    depth: float,
    time_iso: str,
    parameters: Sequence[Parameter],
    values: Mapping[str, float | None],
) -> dict[str, Any]:
    """One position at one instant. Shape ``[1]`` rather than a scalar, as the format asks."""
    domain = {
        "type": "Domain",
        "domainType": "Point",
        "axes": {
            "x": {"values": [longitude]},
            "y": {"values": [latitude]},
            "z": {"values": [depth]},
            "t": {"values": [time_iso]},
        },
        "referencing": referencing(),
    }
    ranges = {
        parameter.name: _range([values.get(parameter.name)], ["t", "z", "y", "x"], [1, 1, 1, 1])
        for parameter in parameters
    }
    return _coverage(domain, parameters, ranges)


def grid_coverage(
    *,
    longitudes: Sequence[float],
    latitudes: Sequence[float],
    depths: Sequence[float],
    times_iso: Sequence[str],
    parameters: Sequence[Parameter],
    values: Mapping[str, Sequence[float | None]],
) -> dict[str, Any]:
    """A cube: the requested extent and nothing beyond it, in ``t, z, y, x`` order."""
    shape = [len(times_iso), len(depths), len(latitudes), len(longitudes)]
    domain = {
        "type": "Domain",
        "domainType": "Grid",
        "axes": {
            "x": {"values": list(longitudes)},
            "y": {"values": list(latitudes)},
            "z": {"values": list(depths)},
            "t": {"values": list(times_iso)},
        },
        "referencing": referencing(),
    }
    ranges = {
        parameter.name: _range(values[parameter.name], ["t", "z", "y", "x"], shape)
        for parameter in parameters
    }
    return _coverage(domain, parameters, ranges)


def multipoint_series_coverage(
    *,
    positions: Sequence[tuple[float, float, float]],
    times_iso: Sequence[str],
    parameters: Sequence[Parameter],
    values: Mapping[str, Sequence[float | None]],
) -> dict[str, Any]:
    """Selected points through time: radius and area answers.

    A ``Grid`` domain cannot carry "the nodes inside the drawn geometry" without either
    misstating the shape or nulling the nodes outside it — and a null in these responses
    must keep meaning exactly one thing, the refusal to extrapolate. So the spatial axis
    is composite: one ``(x, y, z)`` tuple per selected node and depth, with time as its
    own axis. The response contains the geometry's nodes and nothing else, which is what
    "answer only with data inside the geometry" means. One domain type serves both a
    single instant and a series, rather than two shapes that could disagree.

    Values are ordered time-major: for each time, every position in the composite order.
    """
    domain: dict[str, Any] = {
        "type": "Domain",
        "domainType": "MultiPointSeries",
        "axes": {
            "composite": {
                "dataType": "tuple",
                "coordinates": ["x", "y", "z"],
                "values": [list(position) for position in positions],
            },
            "t": {"values": list(times_iso)},
        },
        "referencing": referencing(),
    }
    shape = [len(times_iso), len(positions)]
    ranges = {
        parameter.name: _range(values[parameter.name], ["t", "composite"], shape)
        for parameter in parameters
    }
    return _coverage(domain, parameters, ranges)


def coverage_collection(
    coverages: Sequence[Mapping[str, Any]],
    *,
    domain_type: str,
) -> dict[str, Any]:
    """Several coverages as one CoverageJSON document: the corridor's shape.

    Each member is a complete coverage carrying its own parameters and ranges; the
    collection adds nothing but the grouping, so nothing here can disagree with a member.
    """
    return {
        "type": "CoverageCollection",
        "domainType": domain_type,
        "coverages": [dict(coverage) for coverage in coverages],
    }


def trajectory_coverage(
    *,
    vertices: Sequence[tuple[str, float, float, float]],
    parameters: Sequence[Parameter],
    values: Mapping[str, Sequence[float | None]],
    declined: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """A route: one ``(t, x, y, z)`` tuple per vertex on a composite axis.

    This is the shape FR-006 requires and the shape the browser client's centrepiece needs:
    a list of ``(t, x, y, z, value)`` rows, in the order they were asked for, with no
    reshaping to do.

    ``declined`` names the vertices that fell outside the forecast's extent. Their values are
    null in the ranges, and they are listed here as well, because a null in an array is
    indistinguishable from a missing measurement and this one is neither — it is a refusal to
    extrapolate, which the caller is entitled to see stated (FR-008).
    """
    domain: dict[str, Any] = {
        "type": "Domain",
        "domainType": "Trajectory",
        "axes": {
            "composite": {
                "dataType": "tuple",
                "coordinates": ["t", "x", "y", "z"],
                "values": [list(vertex) for vertex in vertices],
            }
        },
        "referencing": referencing(),
    }
    ranges = {
        parameter.name: _range(values[parameter.name], ["composite"], [len(vertices)])
        for parameter in parameters
    }
    coverage = _coverage(domain, parameters, ranges)
    coverage["drogna:declined"] = [dict(entry) for entry in declined]
    return coverage
