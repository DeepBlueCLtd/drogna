"""Helpers for the monitor's tests: a forecast to score against, and soundings to score.

The forecast here is uniform in space and time, which makes every assertion in these tests
a statement about the monitor rather than about interpolation. The one test that is about
interpolation builds its own field with structure in it.
"""

from __future__ import annotations

from harness_core.soundspeed import sound_speed
from harness_monitor.coverage import ForecastField
from harness_monitor.observations import Sounding

BACKGROUND_TEMPERATURE_C = 12.0
BACKGROUND_SALINITY_PSU = 35.0
MINUTE_MICROS = 60 * 1_000_000


def uniform_field(
    run_id: str = "run-a",
    *,
    temperature_c: float = BACKGROUND_TEMPERATURE_C,
    salinity_psu: float = BACKGROUND_SALINITY_PSU,
    origin_micros: int = 0,
    hours: int = 1,
) -> ForecastField:
    """A field with the same water everywhere, over a domain the soundings sit inside.

    ``origin_micros`` is where the field's time axis begins. It is zero for the unit tests,
    whose soundings count from zero, and the scenario epoch for the tests that drive the
    whole loop, whose soundings carry real simulation instants.
    """
    latitudes = (48.0, 49.0, 50.0)
    longitudes = (-6.0, -5.0, -4.0)
    depths = (0.0, 50.0, 100.0)
    times = (origin_micros, origin_micros + hours * 60 * MINUTE_MICROS)
    size = len(latitudes) * len(longitudes) * len(depths) * len(times)
    return ForecastField(
        run_id=run_id,
        latitudes=latitudes,
        longitudes=longitudes,
        depths_m=depths,
        sim_micros=times,
        temperature_c=[temperature_c] * size,
        salinity_psu=[salinity_psu] * size,
    )


def sounding(
    *,
    minutes: float = 0.0,
    latitude: float = 49.0,
    longitude: float = -5.0,
    depth_m: float = 50.0,
    temperature_c: float = BACKGROUND_TEMPERATURE_C,
    salinity_psu: float = BACKGROUND_SALINITY_PSU,
    platform: str = "platform_a",
) -> Sounding:
    """One sounding, whose pressure follows its depth as the generated world's does."""
    return Sounding(
        platform=platform,
        sim_micros=int(minutes * MINUTE_MICROS),
        latitude=latitude,
        longitude=longitude,
        depth_m=depth_m,
        temperature_c=temperature_c,
        salinity_psu=salinity_psu,
        pressure_dbar=depth_m * 1.0051,
    )


def temperature_for_offset(offset_m_per_s: float, *, depth_m: float = 50.0) -> float:
    """The temperature whose sound speed sits ``offset_m_per_s`` above the background.

    Found by bisection rather than by a sensitivity constant, so the test does not carry a
    second, coarser model of the equation beside the one under test.
    """
    background = sound_speed(BACKGROUND_TEMPERATURE_C, BACKGROUND_SALINITY_PSU, depth_m)
    target = background + offset_m_per_s
    low, high = -2.0, 30.0
    for _ in range(200):
        middle = (low + high) / 2
        if sound_speed(middle, BACKGROUND_SALINITY_PSU, depth_m) < target:
            low = middle
        else:
            high = middle
    return (low + high) / 2
