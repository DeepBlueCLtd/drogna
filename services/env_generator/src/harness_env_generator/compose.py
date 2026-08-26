"""How features reach the background, and the bounds a composed world must stay inside.

**The composition rule is additive.** Each feature's anomaly is added to the background
independently of the others::

    T(x) = T_background(z) + sum_f  dT_f(x)
    S(x) = S_background(z) + sum_f  dS_f(x)

Additive because it is the only rule under which the manifest's parameters reproduce the
field without also recording an interaction between every pair of features. It is a
modelling choice and it has a consequence worth naming: where an eddy sits inside a front,
the two anomalies simply sum, and there is no physics in this harness that would stop them
summing to something unphysical. That is what the bounds are for.

**Bounds are checked before anything is written.** SRD FR-02 gives temperature, salinity
and pressure; a composition that drives salinity below zero, or temperature outside the
stated range, is a configuration error and the generator refuses. It refuses rather than
clipping, because a clipped field is one the manifest no longer describes: the parameters
would say one thing and the array another, and a recovery error computed against it would
be measuring the clip.

The bounds are checked on the composed grid, in memory, before any file is opened. There
is no half-written world to clean up.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_env_generator.background import Background
from harness_env_generator.errors import BoundsBreachedError
from harness_env_generator.features.base import Feature

__all__ = ["COMPOSITION_RULE", "Bound", "Bounds", "compose", "composition_manifest"]

COMPOSITION_RULE = "additive-anomaly"
_COMPOSITION_DESCRIPTION = (
    "Each feature's temperature and salinity anomaly is added to the background "
    "independently of the others; nothing in the composition couples two features. "
    "Pressure is not composed: it is derived from depth by the recorded relation."
)


def composition_manifest() -> dict[str, Any]:
    """The composition rule as the manifest records it."""
    return {"rule": COMPOSITION_RULE, "description": _COMPOSITION_DESCRIPTION}


def compose(
    background: Background,
    features: Sequence[Feature],
    latitude: float,
    longitude: float,
    depth_m: float,
    time_s: float,
) -> tuple[float, float]:
    """Temperature and salinity at a point: the background plus every feature's anomaly."""
    temperature = background.temperature_c(depth_m)
    salinity = background.salinity_psu(depth_m)
    for feature in features:
        anomaly = feature.anomaly(latitude, longitude, depth_m, time_s)
        temperature += anomaly.temperature_c
        salinity += anomaly.salinity_psu
    return temperature, salinity


@dataclass(frozen=True)
class Bound:
    """A closed interval a composed variable must stay inside."""

    minimum: float
    maximum: float

    def contains(self, value: float) -> bool:
        return self.minimum <= value <= self.maximum

    def describe(self) -> str:
        return f"[{self.minimum}, {self.maximum}]"


@dataclass(frozen=True)
class Bounds:
    """The physical bounds for the three composed quantities."""

    temperature_c: Bound
    salinity_psu: Bound
    pressure_dbar: Bound

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> Bounds:
        return cls(
            temperature_c=_bound(section["temperature_c"]),
            salinity_psu=_bound(section["salinity_psu"]),
            pressure_dbar=_bound(section["pressure_dbar"]),
        )

    def check(
        self,
        *,
        temperature_c: float,
        salinity_psu: float,
        pressure_dbar: float,
        point: Mapping[str, float],
    ) -> None:
        """Raise if any of the three is outside its bound, naming the point."""
        for name, value, bound in (
            ("temperature_c", temperature_c, self.temperature_c),
            ("salinity_psu", salinity_psu, self.salinity_psu),
            ("pressure_dbar", pressure_dbar, self.pressure_dbar),
        ):
            if bound.contains(value):
                continue
            raise BoundsBreachedError(
                f"composed {name} is {value:.6g} at {dict(point)}, outside the stated "
                f"bound {bound.describe()}; the world is not written, because a clipped "
                f"field is one its manifest no longer describes",
                variable=name,
                value=value,
                point=dict(point),
            )


def _bound(section: Mapping[str, Any]) -> Bound:
    return Bound(minimum=float(section["minimum"]), maximum=float(section["maximum"]))
