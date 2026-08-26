"""The coverage read port: sampling the current forecast where an observation was taken.

The monitor reads the published forecast through this port and not through the query layer.
The query layer is the external read path; the monitor is inside the boundary SRD §2.2
draws, and routing an internal consumer out through pygeoapi and back would claim a seam
that is not there. The coverage output is a genuine port under Constitution VI, and this is
its read side.

Sound speed is not stored in the field either (ADR-0005). The forecast holds temperature
and salinity on a grid; the forecast's sound speed at a point is derived from those two and
the depth by the same implementation the measured value comes from, so the residual is a
difference between two numbers produced by one equation rather than by two.

Sampling is multilinear in latitude, longitude, depth and time. A position outside the
field's domain returns nothing at all: such a sample belongs in the window and in the
counters, and it must not be turned into a residual against a field that does not cover it.
"""

from __future__ import annotations

from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from harness_core.clock import SimInstant
from harness_core.soundspeed import sound_speed

from harness_monitor.netcdf import NetcdfError, read_netcdf

__all__ = [
    "FORECAST_AXES",
    "FORECAST_VARIABLES",
    "ForecastField",
    "ForecastSource",
    "StoredForecasts",
    "field_from_netcdf",
]

# The names the coverage store's fields use. The layout itself belongs to the query layer
# feature; what is recorded here is only what this component must read, and an integration
# test asserts the runner's writer and this reader agree rather than a shared constant
# asserting it by construction.
FORECAST_AXES = ("time", "depth", "latitude", "longitude")
FORECAST_VARIABLES = ("temperature", "salinity")

_TIME_ORIGIN_ATTRIBUTE = "time_origin_sim_time"
_RUN_ATTRIBUTE = "run_id"
_MICROS_PER_SECOND = 1_000_000


class ForecastSource(Protocol):
    """Where the current forecast comes from. One method, because that is all this needs."""

    def current(self) -> ForecastField | None:
        """The current forecast field, or nothing if none has been published yet."""
        ...


@dataclass(frozen=True)
class ForecastField:
    """One published forecast, sampled at a four-dimensional position.

    Held in memory because the monitor scores every observation against it and re-reading
    per sample would be a file open per observation. A new publication replaces the whole
    object, which is also what invalidates the persistence evidence gathered against the
    old one.
    """

    run_id: str
    latitudes: tuple[float, ...]
    longitudes: tuple[float, ...]
    depths_m: tuple[float, ...]
    sim_micros: tuple[int, ...]
    temperature_c: Sequence[float]
    salinity_psu: Sequence[float]

    def covers(self, latitude: float, longitude: float, depth_m: float, when: int) -> bool:
        """Whether this position is inside the field's domain on all four axes."""
        return (
            _inside(self.latitudes, latitude)
            and _inside(self.longitudes, longitude)
            and _inside(self.depths_m, depth_m)
            and _inside(self.sim_micros, when)
        )

    def sound_speed_at(
        self, latitude: float, longitude: float, depth_m: float, when: int
    ) -> float | None:
        """Forecast sound speed here, or nothing if here is outside the domain."""
        if not self.covers(latitude, longitude, depth_m, when):
            return None
        temperature = self._interpolate(self.temperature_c, latitude, longitude, depth_m, when)
        salinity = self._interpolate(self.salinity_psu, latitude, longitude, depth_m, when)
        return sound_speed(temperature, salinity, depth_m, check_range=False)

    def _interpolate(
        self,
        values: Sequence[float],
        latitude: float,
        longitude: float,
        depth_m: float,
        when: int,
    ) -> float:
        time_index, time_weight = _bracket(self.sim_micros, when)
        depth_index, depth_weight = _bracket(self.depths_m, depth_m)
        latitude_index, latitude_weight = _bracket(self.latitudes, latitude)
        longitude_index, longitude_weight = _bracket(self.longitudes, longitude)

        depth_count = len(self.depths_m)
        latitude_count = len(self.latitudes)
        longitude_count = len(self.longitudes)

        total = 0.0
        for time_step, time_share in ((0, 1.0 - time_weight), (1, time_weight)):
            if time_share == 0.0:
                continue
            for depth_step, depth_share in ((0, 1.0 - depth_weight), (1, depth_weight)):
                if depth_share == 0.0:
                    continue
                for lat_step, lat_share in ((0, 1.0 - latitude_weight), (1, latitude_weight)):
                    if lat_share == 0.0:
                        continue
                    for lon_step, lon_share in (
                        (0, 1.0 - longitude_weight),
                        (1, longitude_weight),
                    ):
                        if lon_share == 0.0:
                            continue
                        offset = (
                            (
                                ((time_index + time_step) * depth_count + depth_index + depth_step)
                                * latitude_count
                                + latitude_index
                                + lat_step
                            )
                            * longitude_count
                            + longitude_index
                            + lon_step
                        )
                        total += values[offset] * time_share * depth_share * lat_share * lon_share
        return total


def _inside(axis: Sequence[float] | Sequence[int], value: float) -> bool:
    return bool(axis) and axis[0] <= value <= axis[-1]


def _bracket(axis: Sequence[float] | Sequence[int], value: float) -> tuple[int, float]:
    """The lower index and the fractional weight towards the next one along an axis."""
    if len(axis) == 1:
        return 0, 0.0
    position = bisect_right(axis, value) - 1
    position = max(0, min(position, len(axis) - 2))
    lower = axis[position]
    upper = axis[position + 1]
    if upper == lower:
        return position, 0.0
    return position, (value - lower) / (upper - lower)


def field_from_netcdf(payload: bytes) -> ForecastField:
    """Read a forecast field written into the coverage store.

    A field missing an axis, a variable or the two global attributes that say which run it
    is and where its time axis begins is refused. A field the monitor half-understands
    would produce residuals nobody could interpret.
    """
    document = read_netcdf(payload)
    missing = [
        name for name in (*FORECAST_AXES, *FORECAST_VARIABLES) if name not in document.variables
    ]
    if missing:
        raise NetcdfError(f"the forecast field has no {', '.join(missing)}")
    for attribute in (_RUN_ATTRIBUTE, _TIME_ORIGIN_ATTRIBUTE):
        if attribute not in document.attributes:
            raise NetcdfError(f"the forecast field declares no {attribute}")

    origin = SimInstant.from_iso(str(document.attributes[_TIME_ORIGIN_ATTRIBUTE]))
    offsets = document.variables["time"].values
    return ForecastField(
        run_id=str(document.attributes[_RUN_ATTRIBUTE]),
        latitudes=tuple(document.variables["latitude"].values),
        longitudes=tuple(document.variables["longitude"].values),
        depths_m=tuple(document.variables["depth"].values),
        sim_micros=tuple(
            origin.plus_micros(round(offset * _MICROS_PER_SECOND)).micros for offset in offsets
        ),
        temperature_c=document.variables["temperature"].values,
        salinity_psu=document.variables["salinity"].values,
    )


class StoredForecasts:
    """The coverage store's read side: resolve the current pointer, read the field once.

    Every name here — the root, the pointer, the file inside a run's directory — arrives
    from configuration. Nothing in this module knows where a coverage store is
    (Constitution IV).

    The field is re-read only when the pointer resolves somewhere new, which is what makes
    ``ctl/run-published`` a notification rather than a poll: the monitor asks this object
    for the current field when it is told a new run exists, and not on a timer.
    """

    def __init__(self, root: Path, *, pointer: str, runs_dirname: str, forecast_file: str) -> None:
        self._root = root
        self._pointer = pointer
        self._runs_dirname = runs_dirname
        self._forecast_file = forecast_file
        self._resolved: Path | None = None
        self._field: ForecastField | None = None

    def _resolve(self) -> Path | None:
        """The run directory the pointer names, or nothing when it names none.

        The pointer is a text file holding one run identifier on one line (ADR-0011). It
        was a symlink once, and this reader resolved it as one; the two ends of the seam
        disagreed and nothing published was ever visible here. Resolving it as a path
        again would silently return nothing rather than fail, which is how that went
        unnoticed, so the failure modes below are distinguished rather than collapsed.

        Two identifiers is the state the text form exists to make representable: two runs
        claim to be current, and a reader that picked the first would be choosing one
        arbitrarily. Nothing is returned, and the caller reports no current forecast.
        """
        try:
            text = (self._root / self._pointer).read_text(encoding="utf-8")
        except OSError:
            return None
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if len(lines) != 1:
            return None
        return self._root / self._runs_dirname / lines[0]

    def current(self) -> ForecastField | None:
        """The current forecast, or nothing when no run has been published yet."""
        resolved = self._resolve()
        if resolved is None:
            return None
        if self._field is not None and resolved == self._resolved:
            return self._field
        try:
            payload = (resolved / self._forecast_file).read_bytes()
        except OSError:
            return None
        self._field = field_from_netcdf(payload)
        self._resolved = resolved
        return self._field

    def refresh(self) -> ForecastField | None:
        """Forget what was read and resolve the pointer again."""
        self._field = None
        self._resolved = None
        return self.current()
