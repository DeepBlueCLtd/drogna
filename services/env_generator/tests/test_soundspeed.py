"""Sound speed: derived by the one implementation, and checkable against it independently.

The equation itself is tested where it lives, in ``libs/harness_core``. What is tested here
is the generator's obligation under ADR-0005: that it calls that implementation and holds
no copy of its own, and that the sound speed written into the field is recomputable from
the temperature, salinity and depth written beside it.

The independent reimplementation below exists for exactly that check. A test may hold a
second copy of an equation — comparing an implementation against itself proves nothing —
but component source may not, because two implementations inside the boundary would make
the residual of SRD FR-24 a statement about which copy was used.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from harness_core.soundspeed import EQUATION
from harness_env_generator.manifest import SOUND_SPEED_IMPLEMENTATION

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "harness_env_generator"


def mackenzie(temperature_c: float, salinity_psu: float, depth_m: float) -> float:
    """The nine-term fit, written out here so the comparison is against something else."""
    t = temperature_c
    s = salinity_psu - 35.0
    d = depth_m
    return (
        1448.96
        + 4.591 * t
        - 5.304e-2 * t**2
        + 2.374e-4 * t**3
        + 1.340 * s
        + 1.630e-2 * d
        + 1.675e-7 * d**2
        - 1.025e-2 * t * s
        - 7.139e-13 * t * d**3
    )


def test_the_generator_holds_no_second_copy_of_the_equation() -> None:
    """ADR-0005: one implementation in drogna, and it is not in this package."""
    assert not (PACKAGE / "soundspeed.py").exists()
    assert importlib.util.find_spec("harness_env_generator.soundspeed") is None


def test_the_manifest_names_the_equation_and_the_module_that_implements_it(manifest) -> None:
    assert manifest["sound_speed"]["method"] == EQUATION
    assert manifest["sound_speed"]["implementation"] == SOUND_SPEED_IMPLEMENTATION
    assert SOUND_SPEED_IMPLEMENTATION.startswith("harness_core")


def test_written_sound_speed_recomputes_from_the_written_measurands(manifest, stored) -> None:
    """SC-006. Recomputed by an independent implementation of the named equation."""
    tolerance = {entry["name"]: entry["tolerance_absolute"] for entry in manifest["variables"]}[
        "speed_of_sound_in_sea_water"
    ]

    temperature = stored.variables["sea_water_temperature"]["values"]
    salinity = stored.variables["sea_water_practical_salinity"]["values"]
    written = stored.variables["speed_of_sound_in_sea_water"]["values"]
    depths = stored.variables["depth"]["values"]
    longitudes = len(stored.variables["longitude"]["values"])
    latitudes = len(stored.variables["latitude"]["values"])
    per_level = latitudes * longitudes

    for index in range(0, len(written), 97):  # a stride, because every point is 40 000 points
        depth = depths[(index // per_level) % len(depths)]
        expected = mackenzie(temperature[index], salinity[index], depth)
        # The stored measurands are themselves rounded to the stored width, so the
        # recomputation inherits that rounding through the equation's slope in T and S.
        assert written[index] == pytest.approx(expected, abs=tolerance + 1e-2)


def test_the_manifest_records_whether_the_equation_was_used_outside_its_range(manifest) -> None:
    """The numerics are fake, but using them out of range must not be invisible."""
    outside = manifest["sound_speed"]["outside_validity"]
    assert outside["count"] == 0
    assert outside["first_point"] is None
    validity = manifest["sound_speed"]["validity"]
    assert validity["min_temperature_c"] < validity["max_temperature_c"]
