"""The thermocline: a step down in temperature with depth, at a stated depth.

Ground truth is the depth (SRD FR-03); thickness and drop are recorded with it because a
depth without a thickness is not enough to reconstruct the field, and FR-013 requires the
manifest to be sufficient. With ``z`` depth positive downwards::

    dT = -(drop / 2) * (1 + tanh((z - depth) / thickness))
    dS = +(rise / 2) * (1 + tanh((z - depth) / thickness))

The step is centred on the stated depth, so half the drop has happened there. It is not
zero at the surface — a hyperbolic tangent reaches its asymptote only in the limit — and
the surface offset is small but real. It is recorded implicitly in the parameters rather
than corrected for: the manifest's job is to reproduce the field exactly, not to describe
a tidier field than the one that was written.

The membership weight is the step's envelope, ``1 - tanh((z - depth)/thickness)^2``: one
at the stated depth, falling away over the same thickness. So a location in the
thermocline decorrelates on the thermocline's timescale, and one well above or below it
does not, which is the behaviour ADR-0002 requires of an authored-per-feature field.

A thermocline is horizontally uniform here. That is a simplification, and it is the honest
one to make: a thermocline that varied horizontally would need a second geometry that
nothing in SRD FR-03 asks for, and inventing one would put parameters in the manifest that
no requirement scores.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from harness_env_generator.features.base import Anomaly, Draws, Feature
from harness_env_generator.features.kernels import tanh_envelope, tanh_step

__all__ = ["Thermocline"]


class Thermocline(Feature):
    """A horizontally uniform step in temperature and salinity at a stated depth."""

    kind = "thermocline"

    def __init__(
        self,
        *,
        identifier: str,
        depth_m: float,
        thickness_m: float,
        temperature_drop_c: float,
        salinity_rise_psu: float,
        timescale_seconds: float,
    ) -> None:
        super().__init__(identifier, timescale_seconds)
        self.depth_m = depth_m
        self.thickness_m = thickness_m
        self.temperature_drop_c = temperature_drop_c
        self.salinity_rise_psu = salinity_rise_psu

    @classmethod
    def author(cls, section: Mapping[str, Any], draws: Draws) -> Thermocline:
        """Build from configuration. Draw order: depth, thickness, drop, timescale."""
        jitter = section["jitter"]
        identifier = str(section["id"])
        depth_offset = draws.symmetric(f"{identifier}.depth_m", float(jitter["depth_m"]))
        thickness_fraction = draws.symmetric(
            f"{identifier}.thickness_fraction", float(jitter["thickness_fraction"])
        )
        drop_fraction = draws.symmetric(
            f"{identifier}.drop_fraction", float(jitter["drop_fraction"])
        )
        timescale_fraction = draws.symmetric(
            f"{identifier}.timescale_fraction", float(jitter["timescale_fraction"])
        )
        return cls(
            identifier=identifier,
            depth_m=float(section["depth_m"]) + depth_offset,
            thickness_m=float(section["thickness_m"]) * (1.0 + thickness_fraction),
            temperature_drop_c=float(section["temperature_drop_c"]) * (1.0 + drop_fraction),
            salinity_rise_psu=float(section["salinity_rise_psu"]),
            timescale_seconds=float(section["timescale_seconds"]) * (1.0 + timescale_fraction),
        )

    @classmethod
    def from_parameters(
        cls, identifier: str, timescale_seconds: float, parameters: Mapping[str, Any]
    ) -> Thermocline:
        return cls(
            identifier=identifier,
            depth_m=float(parameters["depth_m"]),
            thickness_m=float(parameters["thickness_m"]),
            temperature_drop_c=float(parameters["temperature_drop_c"]),
            salinity_rise_psu=float(parameters["salinity_rise_psu"]),
            timescale_seconds=timescale_seconds,
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "depth_m": self.depth_m,
            "thickness_m": self.thickness_m,
            "temperature_drop_c": self.temperature_drop_c,
            "salinity_rise_psu": self.salinity_rise_psu,
        }

    def characteristic_scale(self) -> tuple[float, str]:
        return self.thickness_m, "m"

    def membership(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> float:
        del latitude, longitude, time_s  # horizontally uniform, and it does not move
        return tanh_envelope(depth_m - self.depth_m, self.thickness_m)

    def anomaly(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> Anomaly:
        del latitude, longitude, time_s
        step = 0.5 * (1.0 + tanh_step(depth_m - self.depth_m, self.thickness_m))
        return Anomaly(
            temperature_c=-self.temperature_drop_c * step,
            salinity_psu=self.salinity_rise_psu * step,
        )
