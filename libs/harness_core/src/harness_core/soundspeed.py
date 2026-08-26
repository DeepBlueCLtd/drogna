"""Sound speed, derived at the point of use by the one implementation in drogna.

ADR-0005: sound speed is never published and never stored. Simulated sensors publish
temperature, salinity and pressure; the environment generator, the monitor (FR-24) and
telemetry (FR-37) each derive sound speed by calling this module. A copy of the equation
anywhere else would make a recovery error partly an artefact of the disagreement between
copies, which is the failure AT-03 exists to detect.

Equation
--------

Mackenzie (1981), the nine-term fit to the UNESCO equation of state, in terms of
temperature, salinity and depth::

    c = 1448.96
      + 4.591 T - 5.304e-2 T^2 + 2.374e-4 T^3
      + 1.340 (S - 35)
      + 1.630e-2 D + 1.675e-7 D^2
      - 1.025e-2 T (S - 35)
      - 7.139e-13 T D^3

with ``c`` in metres per second, ``T`` in degrees Celsius (ITS-90 is not distinguished
at this precision), ``S`` in practical salinity units and ``D`` as depth in metres.

Validity range: 0 to 30 degrees Celsius, 25 to 40 PSU, 0 to 8000 metres, which covers
every value drogna's synthetic environment generates. Outside it the fit is not
meaningful, so :func:`sound_speed` says so rather than returning a number that looks
usable.

The choice of formulation is a modelling decision, not a physical fact, and drogna's
numerics are deliberately fake (SRD 1.1): the point is the seam, not the oceanography.
ADR-0005 requires the chosen equation and its range to be written up in
``docs/algorithms/``; this docstring is the implementation's half of that.

The arithmetic is elementwise, so passing arrays rather than floats works and returns an
array. Range checking is skipped for non-scalars: use :func:`within_validity` on the
extremes of a field instead.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

__all__ = [
    "EQUATION",
    "VALIDITY",
    "ValidityRange",
    "depth_from_pressure",
    "sound_speed",
    "sound_speed_from_pressure",
    "within_validity",
]

EQUATION = "mackenzie-1981"
"""Named so a stored residual can say which equation produced it."""


@dataclass(frozen=True)
class ValidityRange:
    """Where the fit is meaningful. Outside it the equation is refused, not extrapolated."""

    min_temperature_c: float = 0.0
    max_temperature_c: float = 30.0
    min_salinity_psu: float = 25.0
    max_salinity_psu: float = 40.0
    min_depth_m: float = 0.0
    max_depth_m: float = 8000.0


VALIDITY = ValidityRange()


def within_validity(temperature_c: float, salinity_psu: float, depth_m: float) -> bool:
    """Whether these values sit inside the equation's validity range."""
    return (
        VALIDITY.min_temperature_c <= temperature_c <= VALIDITY.max_temperature_c
        and VALIDITY.min_salinity_psu <= salinity_psu <= VALIDITY.max_salinity_psu
        and VALIDITY.min_depth_m <= depth_m <= VALIDITY.max_depth_m
    )


def _is_scalar(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def sound_speed(
    temperature_c: Any,
    salinity_psu: Any,
    depth_m: Any,
    *,
    check_range: bool = True,
) -> Any:
    """Sound speed in metres per second, by the Mackenzie (1981) equation.

    Arguments are temperature in degrees Celsius, practical salinity, and depth in
    metres. Floats in, float out; arrays in, array out, because the arithmetic is
    elementwise.
    """
    scalars = _is_scalar(temperature_c) and _is_scalar(salinity_psu) and _is_scalar(depth_m)
    if check_range and scalars and not within_validity(temperature_c, salinity_psu, depth_m):
        raise ValueError(
            f"{EQUATION} is fitted for {VALIDITY.min_temperature_c} to "
            f"{VALIDITY.max_temperature_c} degrees Celsius, {VALIDITY.min_salinity_psu} to "
            f"{VALIDITY.max_salinity_psu} PSU and {VALIDITY.min_depth_m} to "
            f"{VALIDITY.max_depth_m} m; got T={temperature_c}, S={salinity_psu}, D={depth_m}"
        )

    temperature = temperature_c
    salinity_offset = salinity_psu - 35.0
    depth = depth_m
    return (
        1448.96
        + 4.591 * temperature
        - 5.304e-2 * temperature**2
        + 2.374e-4 * temperature**3
        + 1.340 * salinity_offset
        + 1.630e-2 * depth
        + 1.675e-7 * depth**2
        - 1.025e-2 * temperature * salinity_offset
        - 7.139e-13 * temperature * depth**3
    )


def depth_from_pressure(pressure_dbar: Any, *, latitude_deg: float = 45.0) -> Any:
    """Depth in metres from pressure in decibars, by the Saunders and Fofonoff form.

    Sensors report pressure; the equation above takes depth. The conversion is kept here
    so that the three consumers convert identically. Latitude enters through gravity and
    defaults to 45 degrees, which is the usual convention when latitude is not carried.
    """
    sin_squared = _sin_squared_latitude(latitude_deg)
    gravity = 9.780318 * (1.0 + 5.2788e-3 * sin_squared + 2.36e-5 * sin_squared**2)
    numerator = (
        ((-1.82e-15 * pressure_dbar + 2.279e-10) * pressure_dbar - 2.2512e-5) * pressure_dbar
        + 9.72659
    ) * pressure_dbar
    return numerator / (gravity + 1.092e-6 * pressure_dbar)


def _sin_squared_latitude(latitude_deg: float) -> float:
    return math.sin(math.radians(latitude_deg)) ** 2


def sound_speed_from_pressure(
    temperature_c: Any,
    salinity_psu: Any,
    pressure_dbar: Any,
    *,
    latitude_deg: float = 45.0,
    check_range: bool = True,
) -> Any:
    """Sound speed from the three quantities a sensor actually reports."""
    depth_m = depth_from_pressure(pressure_dbar, latitude_deg=latitude_deg)
    return sound_speed(temperature_c, salinity_psu, depth_m, check_range=check_range)
