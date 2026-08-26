"""The front: a step in temperature and salinity across a line, fading with depth.

Ground truth is its position and sharpness (SRD FR-03). Position is an anchor point and a
bearing — the direction the front runs — rather than two end points, because a line
through the domain has no natural ends and inventing some would put two numbers in the
manifest that mean nothing. Sharpness is the half-width of the transition, in kilometres.

With ``s`` the signed distance from the line, positive to the right of the bearing::

    dT = amplitude * tanh(s / sharpness) * exp(-z / depth_scale)
    dS = salinity_amplitude * tanh(s / sharpness) * exp(-z / depth_scale)

The anomaly is odd across the line: one water mass on each side, and zero exactly on it.
That is why the membership weight cannot be the anomaly's own kernel — it would be zero
where the front is most itself. The weight is the step's envelope,
``1 - tanh(s/sharpness)^2``, which is one on the line and falls away over the same
half-width, so both are functions of the same ``s / sharpness`` and describe one geometry
(see :mod:`.kernels`).

A sharpness finer than the grid spacing is not refused. The field under-resolves it, which
is a real and interesting case, and the manifest records the ratio so a recovery error can
be interpreted rather than merely reported.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from harness_env_generator.features.base import Anomaly, Draws, Feature
from harness_env_generator.features.kernels import (
    LocalPlane,
    depth_decay,
    tanh_envelope,
    tanh_step,
)

__all__ = ["Front"]


class Front(Feature):
    """A straight front of stated position, bearing and sharpness."""

    kind = "front"

    def __init__(
        self,
        *,
        identifier: str,
        anchor_latitude: float,
        anchor_longitude: float,
        bearing_degrees: float,
        sharpness_km: float,
        amplitude_c: float,
        salinity_amplitude_psu: float,
        depth_scale_m: float,
        timescale_seconds: float,
    ) -> None:
        super().__init__(identifier, timescale_seconds)
        self.anchor_latitude = anchor_latitude
        self.anchor_longitude = anchor_longitude
        self.bearing_degrees = bearing_degrees
        self.sharpness_km = sharpness_km
        self.amplitude_c = amplitude_c
        self.salinity_amplitude_psu = salinity_amplitude_psu
        self.depth_scale_m = depth_scale_m
        self.plane = LocalPlane(anchor_latitude)
        bearing = math.radians(bearing_degrees)
        # The unit normal to the front, to the right of the bearing. The along-front
        # direction is (sin b, cos b) in (east, north); this is that turned a quarter
        # turn clockwise, so a positive distance is the warm side by convention.
        self._normal_east = math.cos(bearing)
        self._normal_north = -math.sin(bearing)

    # Authoring ---------------------------------------------------------------------

    @classmethod
    def author(cls, section: Mapping[str, Any], draws: Draws) -> Front:
        """Build from configuration. Draw order: anchor, bearing, sharpness, amplitude, tau."""
        jitter = section["jitter"]
        identifier = str(section["id"])
        anchor_km = float(jitter["anchor_km"])
        north_km = draws.symmetric(f"{identifier}.anchor_north_km", anchor_km)
        east_km = draws.symmetric(f"{identifier}.anchor_east_km", anchor_km)
        bearing_offset = draws.symmetric(
            f"{identifier}.bearing_degrees", float(jitter["bearing_degrees"])
        )
        sharpness_fraction = draws.symmetric(
            f"{identifier}.sharpness_fraction", float(jitter["sharpness_fraction"])
        )
        amplitude_fraction = draws.symmetric(
            f"{identifier}.amplitude_fraction", float(jitter["amplitude_fraction"])
        )
        timescale_fraction = draws.symmetric(
            f"{identifier}.timescale_fraction", float(jitter["timescale_fraction"])
        )
        latitude = float(section["anchor_latitude"])
        longitude = float(section["anchor_longitude"])
        plane = LocalPlane(latitude)
        return cls(
            identifier=identifier,
            anchor_latitude=plane.latitude_at(latitude, north_km),
            anchor_longitude=plane.longitude_at(longitude, east_km),
            bearing_degrees=(float(section["bearing_degrees"]) + bearing_offset) % 360.0,
            sharpness_km=float(section["sharpness_km"]) * (1.0 + sharpness_fraction),
            amplitude_c=float(section["amplitude_c"]) * (1.0 + amplitude_fraction),
            salinity_amplitude_psu=float(section["salinity_amplitude_psu"]),
            depth_scale_m=float(section["depth_scale_m"]),
            timescale_seconds=float(section["timescale_seconds"]) * (1.0 + timescale_fraction),
        )

    @classmethod
    def from_parameters(
        cls, identifier: str, timescale_seconds: float, parameters: Mapping[str, Any]
    ) -> Front:
        return cls(
            identifier=identifier,
            anchor_latitude=float(parameters["anchor_latitude"]),
            anchor_longitude=float(parameters["anchor_longitude"]),
            bearing_degrees=float(parameters["bearing_degrees"]),
            sharpness_km=float(parameters["sharpness_km"]),
            amplitude_c=float(parameters["amplitude_c"]),
            salinity_amplitude_psu=float(parameters["salinity_amplitude_psu"]),
            depth_scale_m=float(parameters["depth_scale_m"]),
            timescale_seconds=timescale_seconds,
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "anchor_latitude": self.anchor_latitude,
            "anchor_longitude": self.anchor_longitude,
            "bearing_degrees": self.bearing_degrees,
            "sharpness_km": self.sharpness_km,
            "amplitude_c": self.amplitude_c,
            "salinity_amplitude_psu": self.salinity_amplitude_psu,
            "depth_scale_m": self.depth_scale_m,
        }

    def characteristic_scale(self) -> tuple[float, str]:
        return self.sharpness_km, "km"

    # Evaluation --------------------------------------------------------------------

    def cross_front_km(self, latitude: float, longitude: float) -> float:
        """Signed distance from the front, positive to the right of the bearing."""
        east = self.plane.east_km(longitude, self.anchor_longitude)
        north = self.plane.north_km(latitude, self.anchor_latitude)
        return east * self._normal_east + north * self._normal_north

    def membership(
        self, latitude: float, longitude: float, depth_m: float, time_s: float
    ) -> float:
        del time_s  # a front does not move; its position is ground truth for the whole axis
        offset = self.cross_front_km(latitude, longitude)
        return tanh_envelope(offset, self.sharpness_km) * depth_decay(depth_m, self.depth_scale_m)

    def anomaly(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Anomaly:
        del time_s
        offset = self.cross_front_km(latitude, longitude)
        shape = tanh_step(offset, self.sharpness_km) * depth_decay(depth_m, self.depth_scale_m)
        return Anomaly(
            temperature_c=self.amplitude_c * shape,
            salinity_psu=self.salinity_amplitude_psu * shape,
        )
