"""The mesoscale eddy: a radial Gaussian anomaly with a Gaussian extent in depth.

Ground truth is its centre, radius and strength (SRD FR-03), which are the three figures
AT-03 reports a recovery error against. The anomaly is::

    dT = sign * strength * exp(-(r/radius)^2 / 2) * exp(-((z - z0)/h)^2 / 2)
    dS = salinity_strength * (the same weight)

with ``r`` the horizontal distance from the centre on the feature's local plane, ``z0``
the depth of greatest anomaly and ``h`` the half-thickness. Salinity carries the same
weight rather than its own, because an eddy that changed temperature and salinity on
different geometries would be two features wearing one name.

``sign`` is minus one for a cold core and plus one for a warm core. It is configuration
rather than a sign folded into ``strength`` so that the manifest can report a strength as
a magnitude with units, which is what a recovery error needs to be quotable.

The membership weight is the weight above, without ``strength`` and without ``sign``: one
at the centre, decaying to zero, and the same geometry the anomaly uses.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from harness_env_generator.features.base import Anomaly, Draws, Feature
from harness_env_generator.features.kernels import LocalPlane, gaussian

__all__ = ["Eddy"]


class Eddy(Feature):
    """A stationary eddy. The moving feature of FR-03 is this shape, advected."""

    kind = "eddy"

    def __init__(
        self,
        *,
        identifier: str,
        centre_latitude: float,
        centre_longitude: float,
        radius_km: float,
        strength_c: float,
        salinity_strength_psu: float,
        sign: int,
        depth_centre_m: float,
        depth_half_thickness_m: float,
        timescale_seconds: float,
    ) -> None:
        super().__init__(identifier, timescale_seconds)
        self.centre_latitude = centre_latitude
        self.centre_longitude = centre_longitude
        self.radius_km = radius_km
        self.strength_c = strength_c
        self.salinity_strength_psu = salinity_strength_psu
        self.sign = sign
        self.depth_centre_m = depth_centre_m
        self.depth_half_thickness_m = depth_half_thickness_m
        self.plane = LocalPlane(centre_latitude)

    # Authoring ---------------------------------------------------------------------

    @classmethod
    def author(cls, section: Mapping[str, Any], draws: Draws) -> Eddy:
        """Build from configuration, drawing jitter in the order the keys are listed."""
        jitter = section["jitter"]
        identifier = str(section["id"])
        centre_km = float(jitter["centre_km"])
        north_km = draws.symmetric(f"{identifier}.centre_north_km", centre_km)
        east_km = draws.symmetric(f"{identifier}.centre_east_km", centre_km)
        radius = float(section["radius_km"]) * (
            1.0 + draws.symmetric(f"{identifier}.radius_fraction", float(jitter["radius_fraction"]))
        )
        strength = float(section["strength_c"]) * (
            1.0
            + draws.symmetric(f"{identifier}.strength_fraction", float(jitter["strength_fraction"]))
        )
        timescale = float(section["timescale_seconds"]) * (
            1.0
            + draws.symmetric(
                f"{identifier}.timescale_fraction", float(jitter["timescale_fraction"])
            )
        )
        latitude = float(section["centre_latitude"])
        longitude = float(section["centre_longitude"])
        plane = LocalPlane(latitude)
        return cls(
            identifier=identifier,
            centre_latitude=plane.latitude_at(latitude, north_km),
            centre_longitude=plane.longitude_at(longitude, east_km),
            radius_km=radius,
            strength_c=strength,
            salinity_strength_psu=float(section["salinity_strength_psu"]),
            sign=int(section["sign"]),
            depth_centre_m=float(section["depth_centre_m"]),
            depth_half_thickness_m=float(section["depth_half_thickness_m"]),
            timescale_seconds=timescale,
        )

    @classmethod
    def from_parameters(
        cls, identifier: str, timescale_seconds: float, parameters: Mapping[str, Any]
    ) -> Eddy:
        """Rebuild from a manifest entry, which is all a consumer ever has."""
        return cls(
            identifier=identifier,
            centre_latitude=float(parameters["centre_latitude"]),
            centre_longitude=float(parameters["centre_longitude"]),
            radius_km=float(parameters["radius_km"]),
            strength_c=float(parameters["strength_c"]),
            salinity_strength_psu=float(parameters["salinity_strength_psu"]),
            sign=int(parameters["sign"]),
            depth_centre_m=float(parameters["depth_centre_m"]),
            depth_half_thickness_m=float(parameters["depth_half_thickness_m"]),
            timescale_seconds=timescale_seconds,
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "centre_latitude": self.centre_latitude,
            "centre_longitude": self.centre_longitude,
            "radius_km": self.radius_km,
            "strength_c": self.strength_c,
            "salinity_strength_psu": self.salinity_strength_psu,
            "sign": self.sign,
            "depth_centre_m": self.depth_centre_m,
            "depth_half_thickness_m": self.depth_half_thickness_m,
        }

    def characteristic_scale(self) -> tuple[float, str]:
        return self.radius_km, "km"

    # Evaluation --------------------------------------------------------------------

    def centre_at(self, time_s: float) -> tuple[float, float]:
        """Where the feature is at a time. A stationary eddy is where it always was."""
        del time_s
        return self.centre_latitude, self.centre_longitude

    def distance_km(self, latitude: float, longitude: float, time_s: float) -> float:
        centre_latitude, centre_longitude = self.centre_at(time_s)
        east = self.plane.east_km(longitude, centre_longitude)
        north = self.plane.north_km(latitude, centre_latitude)
        return math.hypot(east, north)

    def membership(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> float:
        horizontal = gaussian(self.distance_km(latitude, longitude, time_s), self.radius_km)
        vertical = gaussian(depth_m - self.depth_centre_m, self.depth_half_thickness_m)
        return horizontal * vertical

    def anomaly(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Anomaly:
        weight = self.membership(latitude, longitude, depth_m, time_s)
        return Anomaly(
            temperature_c=self.sign * self.strength_c * weight,
            salinity_psu=self.sign * self.salinity_strength_psu * weight,
        )
