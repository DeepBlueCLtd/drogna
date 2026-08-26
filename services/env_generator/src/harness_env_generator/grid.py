"""The four axes, and the relation that gets pressure from depth.

Axes are given as extent and count, and the spacing is derived. Given as spacing and
count, the far end of the axis would accumulate rounding and would not be the number the
configuration named, which matters here because two runs must be byte-identical and
because the manifest states the extent a consumer will check against.

Depth is positive downwards and says so, in the axis's ``direction`` and in the CF
``positive`` attribute of the written variable. A vertical axis whose direction is left
implicit will be read upside down by somebody, and the reading will look plausible.

Time is not an extent. The generator has no time origin of its own: it takes one from the
clock port at the moment of generation and lays offsets from it (FR-027). So the time axis
is an origin in simulation time, a start offset, a step and a count, and the evaluator
takes seconds from that origin — which is what lets it answer at a time between two steps
as readily as on one.

**Pressure comes from depth.** SRD FR-02 has the generator produce temperature, salinity
and pressure, and ADR-0005 has sound speed derived from them. A pressure generated
independently of depth would be unphysical, and the sound speed derived from the three
would then be a number with no meaning. So::

    p = surface_dbar + dbar_per_metre * z

named ``linear-hydrostatic`` and recorded in the manifest with its coefficient. The
coefficient stands for a constant seawater density and a constant gravity; both vary in
the real ocean and neither varies here, which is a modelling decision and not a fact.
"""

from __future__ import annotations

import math
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from typing import Any

from harness_env_generator.features.kernels import KM_PER_DEGREE

__all__ = [
    "PRESSURE_RELATION",
    "Axis",
    "Grid",
    "PressureRelation",
    "TimeAxis",
    "pressure_from_depth",
]

PRESSURE_RELATION = "linear-hydrostatic"
_PRESSURE_EXPRESSION = "pressure_dbar = surface_dbar + dbar_per_metre * depth_m"


@dataclass(frozen=True)
class Axis:
    """One spatial axis: extent, count, derived spacing, units and direction."""

    minimum: float
    maximum: float
    count: int
    units: str
    direction: str

    @classmethod
    def from_config(cls, section: Mapping[str, Any], *, units: str, direction: str) -> Axis:
        return cls(
            minimum=float(section["minimum"]),
            maximum=float(section["maximum"]),
            count=int(section["count"]),
            units=units,
            direction=direction,
        )

    @property
    def spacing(self) -> float:
        return (self.maximum - self.minimum) / (self.count - 1)

    def values(self) -> list[float]:
        """The axis, computed from the extent so the last value is exactly the maximum."""
        step = self.spacing
        return [self.minimum + step * index for index in range(self.count - 1)] + [self.maximum]

    def contains(self, value: float) -> bool:
        return self.minimum <= value <= self.maximum

    def as_manifest(self) -> dict[str, Any]:
        return {
            "minimum": self.minimum,
            "maximum": self.maximum,
            "count": self.count,
            "spacing": self.spacing,
            "units": self.units,
            "direction": self.direction,
        }

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> Axis:
        return cls(
            minimum=float(document["minimum"]),
            maximum=float(document["maximum"]),
            count=int(document["count"]),
            units=str(document["units"]),
            direction=str(document["direction"]),
        )


@dataclass(frozen=True)
class TimeAxis:
    """Offsets in seconds from an origin in simulation time."""

    origin_sim_time: str
    start_offset_seconds: float
    step_seconds: float
    count: int
    units: str = "s"

    @classmethod
    def from_config(cls, section: Mapping[str, Any], *, origin_sim_time: str) -> TimeAxis:
        return cls(
            origin_sim_time=origin_sim_time,
            start_offset_seconds=float(section["start_offset_seconds"]),
            step_seconds=float(section["step_seconds"]),
            count=int(section["count"]),
        )

    @property
    def minimum(self) -> float:
        return self.start_offset_seconds

    @property
    def maximum(self) -> float:
        return self.start_offset_seconds + self.step_seconds * (self.count - 1)

    def values(self) -> list[float]:
        return [self.start_offset_seconds + self.step_seconds * index for index in range(self.count)]

    def contains(self, value: float) -> bool:
        return self.minimum <= value <= self.maximum

    def as_manifest(self) -> dict[str, Any]:
        return {
            "origin_sim_time": self.origin_sim_time,
            "start_offset_seconds": self.start_offset_seconds,
            "step_seconds": self.step_seconds,
            "count": self.count,
            "units": self.units,
        }

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> TimeAxis:
        return cls(
            origin_sim_time=str(document["origin_sim_time"]),
            start_offset_seconds=float(document["start_offset_seconds"]),
            step_seconds=float(document["step_seconds"]),
            count=int(document["count"]),
            units=str(document["units"]),
        )


@dataclass(frozen=True)
class PressureRelation:
    """Pressure from depth, by name and coefficient."""

    name: str
    dbar_per_metre: float
    surface_dbar: float

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> PressureRelation:
        return cls(
            name=str(section["relation"]),
            dbar_per_metre=float(section["dbar_per_metre"]),
            surface_dbar=float(section["surface_dbar"]),
        )

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> PressureRelation:
        return cls(
            name=str(document["name"]),
            dbar_per_metre=float(document["dbar_per_metre"]),
            surface_dbar=float(document["surface_dbar"]),
        )

    def at(self, depth_m: float) -> float:
        return self.surface_dbar + self.dbar_per_metre * depth_m

    def as_manifest(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "expression": _PRESSURE_EXPRESSION,
            "dbar_per_metre": self.dbar_per_metre,
            "surface_dbar": self.surface_dbar,
        }


def pressure_from_depth(depth_m: float, relation: PressureRelation) -> float:
    """Pressure in decibars at a depth in metres, by the named relation."""
    return relation.at(depth_m)


@dataclass(frozen=True)
class Grid:
    """The four axes together, with the horizontal spacing a resolution ratio needs."""

    latitude: Axis
    longitude: Axis
    depth: Axis
    time: TimeAxis

    @property
    def centre_latitude(self) -> float:
        return 0.5 * (self.latitude.minimum + self.latitude.maximum)

    @property
    def horizontal_spacing_km(self) -> float:
        """The coarser of the two horizontal spacings, at the domain's centre latitude.

        The coarser one, because a feature is resolved only as well as the worse axis
        resolves it, and a ratio that quoted the better one would flatter the field.
        """
        north = self.latitude.spacing * KM_PER_DEGREE
        east = self.longitude.spacing * KM_PER_DEGREE * math.cos(math.radians(self.centre_latitude))
        return max(north, east)

    @property
    def vertical_spacing_m(self) -> float:
        return self.depth.spacing

    def points(self) -> Iterator[tuple[float, float, float, float]]:
        """Every grid point, in the order the field is written: time, depth, latitude, longitude."""
        for time_s in self.time.values():
            for depth_m in self.depth.values():
                for latitude in self.latitude.values():
                    for longitude in self.longitude.values():
                        yield latitude, longitude, depth_m, time_s

    @property
    def size(self) -> int:
        return self.time.count * self.depth.count * self.latitude.count * self.longitude.count

    def as_manifest(self) -> dict[str, Any]:
        return {
            "latitude": self.latitude.as_manifest(),
            "longitude": self.longitude.as_manifest(),
            "depth": self.depth.as_manifest(),
            "time": self.time.as_manifest(),
        }

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> Grid:
        return cls(
            latitude=Axis.from_manifest(document["latitude"]),
            longitude=Axis.from_manifest(document["longitude"]),
            depth=Axis.from_manifest(document["depth"]),
            time=TimeAxis.from_manifest(document["time"]),
        )
