"""Helpers for the sensors' tests: a closed-form field and a configuration to sample it with.

The field is linear in each of its four arguments, so the value at any point is arithmetic
rather than a second interpolation. That matters for the noise tests: the difference between
what the array published and what the field holds is then the seeded draw and nothing else,
which is the figure the test asserts on.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from harness_core.clock import SimInstant
from harness_sensors.sensor import Instrument, Platform, Position

EPOCH = SimInstant.from_iso("2026-09-01T00:00:00.000000Z")
ROOT_SEED = 20260826


@dataclass(frozen=True)
class LinearField:
    """A world with a closed form: temperature, salinity and pressure and nothing else."""

    def at(
        self, *, latitude: float, longitude: float, depth_m: float, instant: SimInstant
    ) -> Mapping[str, float]:
        hours = (instant - EPOCH) / 3_600_000_000
        return {
            "temperature": 15.0 - 0.01 * depth_m + 0.1 * latitude - 0.05 * longitude - 0.2 * hours,
            "salinity": 35.0 + 0.001 * depth_m + 0.01 * latitude,
            "pressure": 1.0051 * depth_m,
        }


def instrument(
    measured: str,
    *,
    standard_deviation: float = 0.0,
    distribution: str = "gaussian",
) -> Instrument:
    """One configured datastream, in the shape the configuration schema describes."""
    units = {
        "temperature": ("degree Celsius", "degC", "degree_C", "sea_water_temperature"),
        "salinity": ("practical salinity unit", "psu", "1e-3", "sea_water_practical_salinity"),
        "pressure": ("decibar", "dbar", "dbar", "sea_water_pressure"),
    }
    name, symbol, definition, cf_name = units.get(
        measured, ("metre per second", "m/s", "m s-1", f"sea_water_{measured}")
    )
    return Instrument.from_config(
        {
            "id": f"ds-{measured}",
            "name": f"{measured} at platform A",
            "description": f"Simulated {measured} series.",
            "observed_property": {
                "measured": measured,
                "id": cf_name,
                "name": cf_name.replace("_", " "),
                "definition": cf_name,
                "description": f"{measured.capitalize()} of sea water.",
            },
            "observation_type": "OM_Measurement",
            "unit_of_measurement": {"name": name, "symbol": symbol, "definition": definition},
            "sensor": {
                "id": f"sensor-{measured}",
                "name": f"simulated {measured} sensor",
                "description": f"Simulated {measured} instrument with a seeded noise model.",
                "encoding_type": "text/plain",
            },
            "noise": {
                "distribution": distribution,
                "standard_deviation": standard_deviation,
            },
        }
    )


def instruments(standard_deviation: float = 0.0) -> list[Instrument]:
    """The three, in the order the configuration lists them."""
    return [
        instrument("temperature", standard_deviation=standard_deviation),
        instrument("salinity", standard_deviation=standard_deviation),
        instrument("pressure", standard_deviation=standard_deviation),
    ]


def platform() -> Platform:
    return Platform(
        id="platform-a",
        name="sampling platform A",
        description="A simulated sampling platform. A coordinate and a sampler.",
    )


def positions() -> list[Position]:
    return [Position(latitude=49.0, longitude=-4.5), Position(latitude=49.2, longitude=-4.3)]
