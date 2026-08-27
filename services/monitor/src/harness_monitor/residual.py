"""The residual: measured sound speed minus forecast sound speed, and nothing else.

FR-24 is emphatic and this module is where the emphasis lands. The residual is defined on
**sound speed**, never on temperature. A sounding whose temperature has drifted well past
any sensible threshold but whose salinity has moved to compensate produces almost no
residual here, and that is correct: the forecast and the water agree about the quantity the
harness cares about, and raising a run for the disagreement in a term would be the
over-sensitivity this component exists not to have.

Both terms come from the one implementation in :mod:`harness_core.soundspeed` (ADR-0005) —
the same function the environment generator called when it made the world and the same one
telemetry will call when it scores skill. There is no copy of the equation in this package,
and a search for one is a success criterion (SC-012).

The measured term is derived from the three published quantities through the pressure form,
because pressure is what a sensor reports and depth is what the equation takes. The
forecast term is sampled through the coverage read port at the same four-dimensional
position. A position the forecast does not cover yields no residual at all rather than a
residual against a domain edge.
"""

from __future__ import annotations

from dataclasses import dataclass

from harness_core.soundspeed import EQUATION, sound_speed_from_pressure

from harness_monitor.coverage import ForecastField
from harness_monitor.observations import Sounding

__all__ = ["EQUATION", "ResidualSample", "measured_sound_speed", "residual_for"]


@dataclass(frozen=True)
class ResidualSample:
    """One scored sounding: the signed difference, and the run it was scored against."""

    forecast_run_id: str
    signed_m_per_s: float
    measured_m_per_s: float
    sim_micros: int
    latitude: float
    longitude: float
    depth_m: float
    platform: str

    @property
    def magnitude(self) -> float:
        return abs(self.signed_m_per_s)

    def exceeds(self, threshold_m_per_s: float) -> bool:
        return self.magnitude > threshold_m_per_s


def measured_sound_speed(sounding: Sounding) -> float:
    """Sound speed implied by one sounding's three measured quantities.

    Range checking is off: the harness's numerics are synthetic and a sounding a little
    outside the fit's range should be scored and seen, not refused into silence. The
    equation's validity range is documented where the equation is.
    """
    return sound_speed_from_pressure(
        sounding.temperature_c,
        sounding.salinity_psu,
        sounding.pressure_dbar,
        latitude_deg=sounding.latitude,
        check_range=False,
    )


def residual_for(sounding: Sounding, forecast: ForecastField) -> ResidualSample | None:
    """Score one sounding against the current forecast, or return nothing.

    Nothing is returned when the sounding falls outside the forecast's domain. The caller
    counts those separately: a sample that could not be scored is not a sample that agreed.
    """
    predicted = forecast.sound_speed_at(
        sounding.latitude, sounding.longitude, sounding.depth_m, sounding.sim_micros
    )
    if predicted is None:
        return None
    measured = measured_sound_speed(sounding)
    return ResidualSample(
        forecast_run_id=forecast.run_id,
        signed_m_per_s=measured - predicted,
        measured_m_per_s=measured,
        sim_micros=sounding.sim_micros,
        latitude=sounding.latitude,
        longitude=sounding.longitude,
        depth_m=sounding.depth_m,
        platform=sounding.platform,
    )
