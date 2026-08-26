"""The background stratification: the base state every feature is composed onto.

Temperature relaxes exponentially from a surface value to a deep value, and salinity does
the same independently::

    T(z) = T_deep + (T_surface - T_deep) * exp(-z / H_T)
    S(z) = S_deep + (S_surface - S_deep) * exp(-z / H_S)

Two scale depths, because temperature and salinity do not stratify on one scale, and one
scale for both would be a claim the harness has no reason to make. Neither profile varies
horizontally or in time: everything that does is a feature, which is what makes a
feature's parameters the whole of what a recovery error is measured against.

The form is a modelling choice. It is smooth, monotonic, has no free surface layer to
argue about, and is exactly reproducible from four numbers in the manifest. It is not a
water column anybody measured, and the harness does not pretend otherwise (SRD 1.1).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

__all__ = ["BACKGROUND_RULE", "Background"]

BACKGROUND_RULE = "exponential-relaxation"
_DESCRIPTION = (
    "Temperature and salinity each relax exponentially from a surface value to a deep "
    "value, on their own scale depth. Uniform horizontally and in time: everything that "
    "varies is a feature."
)


@dataclass(frozen=True)
class Background:
    """The base state, as configuration gives it and as the manifest records it."""

    surface_temperature_c: float
    deep_temperature_c: float
    temperature_scale_depth_m: float
    surface_salinity_psu: float
    deep_salinity_psu: float
    salinity_scale_depth_m: float

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> Background:
        return cls(
            surface_temperature_c=float(section["surface_temperature_c"]),
            deep_temperature_c=float(section["deep_temperature_c"]),
            temperature_scale_depth_m=float(section["temperature_scale_depth_m"]),
            surface_salinity_psu=float(section["surface_salinity_psu"]),
            deep_salinity_psu=float(section["deep_salinity_psu"]),
            salinity_scale_depth_m=float(section["salinity_scale_depth_m"]),
        )

    @classmethod
    def from_manifest(cls, document: Mapping[str, Any]) -> Background:
        return cls.from_config(document["parameters"])

    def temperature_c(self, depth_m: float) -> float:
        span = self.surface_temperature_c - self.deep_temperature_c
        return self.deep_temperature_c + span * math.exp(-depth_m / self.temperature_scale_depth_m)

    def salinity_psu(self, depth_m: float) -> float:
        span = self.surface_salinity_psu - self.deep_salinity_psu
        return self.deep_salinity_psu + span * math.exp(-depth_m / self.salinity_scale_depth_m)

    def as_manifest(self) -> dict[str, Any]:
        return {
            "rule": BACKGROUND_RULE,
            "description": _DESCRIPTION,
            "parameters": {
                "surface_temperature_c": self.surface_temperature_c,
                "deep_temperature_c": self.deep_temperature_c,
                "temperature_scale_depth_m": self.temperature_scale_depth_m,
                "surface_salinity_psu": self.surface_salinity_psu,
                "deep_salinity_psu": self.deep_salinity_psu,
                "salinity_scale_depth_m": self.salinity_scale_depth_m,
            },
        }
