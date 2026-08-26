"""The feature of known drift velocity: an eddy-shaped anomaly that advects.

SRD FR-03 requires a feature whose drift velocity is known, and ADR-0002 requires its
decorrelation timescale to advect with it. Both follow from one thing: the centre is a
function of time, and everything else — the anomaly, the membership weight the timescale
is blended by — is evaluated about that centre. Nothing is stepped, integrated or cached::

    centre(t) = centre(0) + velocity * t

computed on the feature's local plane about its initial latitude, so the map from
kilometres to degrees is a constant and the position at any time is one multiplication
away from the manifest. A consumer holding only the manifest can say where the feature is
at any time on the axis, and at times off it, which is what AT-01's route vertices need.

Drifting out of the domain is allowed. The manifest records the initial centre and the
velocity, so the position stays computable; the field simply stops containing the feature.
Clamping it at the boundary would make the manifest describe a path the field does not
contain, which is worse than a feature that leaves.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from harness_env_generator.features.base import Draws
from harness_env_generator.features.eddy import Eddy
from harness_env_generator.features.kernels import LocalPlane

__all__ = ["MovingFeature"]

SECONDS_PER_DAY = 86400.0


class MovingFeature(Eddy):
    """An eddy-shaped anomaly with a drift velocity. The geometry is the eddy's."""

    kind = "moving"

    def __init__(
        self,
        *,
        drift_east_km_per_day: float,
        drift_north_km_per_day: float,
        reference_latitude: float | None = None,
        **eddy: Any,
    ) -> None:
        super().__init__(**eddy)
        self.drift_east_km_per_day = drift_east_km_per_day
        self.drift_north_km_per_day = drift_north_km_per_day
        self.reference_latitude = (
            self.centre_latitude if reference_latitude is None else reference_latitude
        )
        self.plane = LocalPlane(self.reference_latitude)

    @classmethod
    def author(cls, section: Mapping[str, Any], draws: Draws) -> MovingFeature:
        """Build from configuration. Draw order: centre, radius, strength, drift, timescale."""
        jitter = section["jitter"]
        identifier = str(section["id"])
        centre_km = float(jitter["centre_km"])
        north_km = draws.symmetric(f"{identifier}.centre_north_km", centre_km)
        east_km = draws.symmetric(f"{identifier}.centre_east_km", centre_km)
        radius_fraction = draws.symmetric(
            f"{identifier}.radius_fraction", float(jitter["radius_fraction"])
        )
        strength_fraction = draws.symmetric(
            f"{identifier}.strength_fraction", float(jitter["strength_fraction"])
        )
        drift_fraction = draws.symmetric(
            f"{identifier}.drift_fraction", float(jitter["drift_fraction"])
        )
        timescale_fraction = draws.symmetric(
            f"{identifier}.timescale_fraction", float(jitter["timescale_fraction"])
        )
        latitude = float(section["centre_latitude"])
        longitude = float(section["centre_longitude"])
        plane = LocalPlane(latitude)
        return cls(
            identifier=identifier,
            centre_latitude=plane.latitude_at(latitude, north_km),
            centre_longitude=plane.longitude_at(longitude, east_km),
            radius_km=float(section["radius_km"]) * (1.0 + radius_fraction),
            strength_c=float(section["strength_c"]) * (1.0 + strength_fraction),
            salinity_strength_psu=float(section["salinity_strength_psu"]),
            sign=int(section["sign"]),
            depth_centre_m=float(section["depth_centre_m"]),
            depth_half_thickness_m=float(section["depth_half_thickness_m"]),
            timescale_seconds=float(section["timescale_seconds"]) * (1.0 + timescale_fraction),
            drift_east_km_per_day=float(section["drift_east_km_per_day"]) * (1.0 + drift_fraction),
            drift_north_km_per_day=float(section["drift_north_km_per_day"])
            * (1.0 + drift_fraction),
            reference_latitude=latitude,
        )

    @classmethod
    def from_parameters(
        cls, identifier: str, timescale_seconds: float, parameters: Mapping[str, Any]
    ) -> MovingFeature:
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
            drift_east_km_per_day=float(parameters["drift_east_km_per_day"]),
            drift_north_km_per_day=float(parameters["drift_north_km_per_day"]),
            reference_latitude=float(parameters["reference_latitude"]),
        )

    def parameters(self) -> dict[str, Any]:
        return {
            **super().parameters(),
            "drift_east_km_per_day": self.drift_east_km_per_day,
            "drift_north_km_per_day": self.drift_north_km_per_day,
            "reference_latitude": self.reference_latitude,
        }

    def centre_at(self, time_s: float) -> tuple[float, float]:
        """The centre at ``time_s`` seconds after the field's time origin."""
        days = time_s / SECONDS_PER_DAY
        return (
            self.plane.latitude_at(self.centre_latitude, self.drift_north_km_per_day * days),
            self.plane.longitude_at(self.centre_longitude, self.drift_east_km_per_day * days),
        )
