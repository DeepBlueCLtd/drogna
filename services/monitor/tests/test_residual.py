"""The residual is defined on sound speed, and by the one implementation of it.

Two properties are asserted here, and both are requirements rather than preferences.

FR-24 says the residual is computed on sound speed and not on temperature. The test that
proves the difference is worth having is the compensating one: a sounding whose temperature
has moved far past any sensible threshold, and whose salinity has moved to cancel it, is a
sounding the water agrees with the forecast about. A monitor scoring temperature would raise
a run for it.

ADR-0005 says there is one implementation of the equation and it is in ``harness_core``.
That is checked twice: by agreement, and by searching this package for a second copy of the
coefficients (SC-012). The equation's own correctness is scored beside the implementation,
in ``libs/harness_core``, because there is only one of it.
"""

from __future__ import annotations

from pathlib import Path

from harness_core.soundspeed import sound_speed, sound_speed_from_pressure
from harness_monitor.residual import measured_sound_speed, residual_for
from monitor_support import (
    BACKGROUND_SALINITY_PSU,
    BACKGROUND_TEMPERATURE_C,
    sounding,
    uniform_field,
)

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "harness_monitor"


def test_the_measured_value_is_the_shared_implementations_value() -> None:
    """Agreement by construction: the monitor calls the function, it does not model it."""
    sample = sounding(temperature_c=13.25, salinity_psu=35.4, depth_m=120.0)

    assert measured_sound_speed(sample) == sound_speed_from_pressure(
        13.25, 35.4, sample.pressure_dbar, latitude_deg=sample.latitude, check_range=False
    )


def test_the_package_holds_no_second_copy_of_the_equation() -> None:
    """SC-012: a search of the monitor for the equation's coefficients returns nothing."""
    coefficients = ("1448.96", "4.591", "5.304e-2", "1.675e-7")
    found = [
        f"{path.name}: {coefficient}"
        for path in PACKAGE.rglob("*.py")
        for coefficient in coefficients
        if coefficient in path.read_text(encoding="utf-8")
    ]

    assert found == []


def test_salinity_compensating_for_temperature_raises_no_residual() -> None:
    """The case FR-24 exists for: a large temperature excursion that sound speed does not see."""
    depth_m = 50.0
    warmer = BACKGROUND_TEMPERATURE_C + 1.5
    compensating = _salinity_holding_sound_speed(warmer, depth_m)
    field = uniform_field()

    compensated = residual_for(
        sounding(temperature_c=warmer, salinity_psu=compensating, depth_m=depth_m), field
    )
    uncompensated = residual_for(
        sounding(temperature_c=warmer, salinity_psu=BACKGROUND_SALINITY_PSU, depth_m=depth_m),
        field,
    )

    assert compensated is not None and uncompensated is not None
    # The temperature excursion is the same in both. Only one of them is a divergence.
    assert compensated.magnitude < 0.01
    assert uncompensated.magnitude > 4.0


def test_a_sounding_outside_the_domain_yields_no_residual() -> None:
    """Outside the field's domain there is nothing to disagree with, so nothing is scored."""
    field = uniform_field()

    assert residual_for(sounding(latitude=60.0), field) is None
    assert residual_for(sounding(minutes=10_000.0), field) is None
    assert residual_for(sounding(depth_m=4000.0), field) is None


def test_the_residual_is_signed_measured_minus_forecast() -> None:
    field = uniform_field()
    warmer = residual_for(sounding(temperature_c=BACKGROUND_TEMPERATURE_C + 1.0), field)
    cooler = residual_for(sounding(temperature_c=BACKGROUND_TEMPERATURE_C - 1.0), field)

    assert warmer is not None and cooler is not None
    assert warmer.signed_m_per_s > 0 > cooler.signed_m_per_s


def _salinity_holding_sound_speed(temperature_c: float, depth_m: float) -> float:
    """The salinity that keeps sound speed at the background value despite the warming."""
    target = sound_speed(BACKGROUND_TEMPERATURE_C, BACKGROUND_SALINITY_PSU, depth_m)
    low, high = 25.0, 40.0
    for _ in range(200):
        middle = (low + high) / 2
        if sound_speed(temperature_c, middle, depth_m) < target:
            low = middle
        else:
            high = middle
    return (low + high) / 2
