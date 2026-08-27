"""Reading observation traffic, and assembling the three measurements into one sounding.

Sensors publish temperature, salinity and pressure as three separate datastreams
(ADR-0005, feature 007's FR-023), one message each, on ``obs/<thing-id>/<datastream-id>``.
Sound speed needs all three at one place and one instant, so the monitor pairs them: the
three messages sharing a platform and a simulation instant become one
:class:`Sounding`, and until the third arrives there is nothing to score.

That pairing is the reason this module exists, and it is a consequence of ADR-0005 rather
than a decision taken here. A monitor that scored each message as it arrived would be
scoring temperature, which is exactly what FR-24 forbids.

**A dependency stated plainly.** ``contracts/schemas/observation.schema.json`` is feature
007's to author and does not exist yet, so the field names read here are this feature's
reading of that feature's specification and not a contract either can point at. They are
confined to :func:`measurement_from` — one function to reconcile when the master lands, and
a refusal rather than a silent misreading in the meantime.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

__all__ = [
    "Measurement",
    "ObservationError",
    "ObservedProperty",
    "Sounding",
    "SoundingAssembler",
    "measurement_from",
]


class ObservationError(ValueError):
    """An observation message the monitor cannot read. Reported, never guessed at."""


class ObservedProperty(StrEnum):
    """The three properties sensors publish. There is deliberately no fourth (ADR-0005)."""

    TEMPERATURE = "temperature"
    SALINITY = "salinity"
    PRESSURE = "pressure"


@dataclass(frozen=True)
class Measurement:
    """One published value: what was measured, where, when, and by which platform."""

    platform: str
    observed_property: ObservedProperty
    value: float
    sim_micros: int
    latitude: float
    longitude: float
    depth_m: float


@dataclass(frozen=True)
class Sounding:
    """The three measurements at one place and one instant, ready to be scored.

    Sound speed is not a member. It is derived at the point of use from the three values
    here (ADR-0005), so a sounding cannot carry a sound speed that disagrees with them.
    """

    platform: str
    sim_micros: int
    latitude: float
    longitude: float
    depth_m: float
    temperature_c: float
    salinity_psu: float
    pressure_dbar: float


def _number(payload: Mapping[str, Any], key: str) -> float:
    try:
        value = payload[key]
    except KeyError:
        raise ObservationError(f"observation carries no {key!r}") from None
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ObservationError(f"observation's {key!r} is not a number: {value!r}")
    return float(value)


def measurement_from(payload: Mapping[str, Any], *, sim_micros: int) -> Measurement:
    """Read one observation message.

    ``sim_micros`` is the message's phenomenon time already resolved to simulation
    microseconds by the caller, because parsing an ISO-8601 instant is
    :class:`~harness_core.clock.SimInstant`'s job and not this module's.
    """
    try:
        platform = str(payload["thing_id"])
        spelling = str(payload["observed_property"])
    except KeyError as exc:
        raise ObservationError(f"observation carries no {exc.args[0]!r}") from None
    try:
        observed = ObservedProperty(spelling)
    except ValueError:
        raise ObservationError(
            f"{spelling!r} is not one of the three published properties; sound speed is "
            "derived at the point of use and is not a datastream (ADR-0005)"
        ) from None
    location = payload.get("location")
    if not isinstance(location, Mapping):
        raise ObservationError("observation carries no location")
    return Measurement(
        platform=platform,
        observed_property=observed,
        value=_number(payload, "result"),
        sim_micros=sim_micros,
        latitude=_number(location, "latitude"),
        longitude=_number(location, "longitude"),
        depth_m=_number(location, "depth_m"),
    )


class SoundingAssembler:
    """Pairs the three datastreams into soundings, and sheds rather than falls behind.

    At a high clock rate observations arrive faster than they can be paired and scored. A
    part-assembled sounding that never completes — a lost message, a sensor that stopped —
    would otherwise accumulate for the length of the scenario. So the assembler is bounded
    like everything else here: past the bound the oldest incomplete group is dropped and
    counted, because a reported drop is honest and unbounded growth is not (SC-004).
    """

    def __init__(self, *, maximum_pending: int) -> None:
        if maximum_pending < 1:
            raise ValueError("the pending bound is at least one part-assembled sounding")
        self._maximum_pending = maximum_pending
        self._pending: dict[tuple[str, int], dict[ObservedProperty, Measurement]] = {}
        self._shed = 0

    @property
    def shed(self) -> int:
        """Part-assembled soundings dropped because the bound was reached."""
        return self._shed

    @property
    def pending(self) -> int:
        return len(self._pending)

    def accept(self, measurement: Measurement) -> Sounding | None:
        """Add a measurement, returning the sounding it completes if it completes one."""
        key = (measurement.platform, measurement.sim_micros)
        group = self._pending.get(key)
        if group is None:
            group = {}
            self._pending[key] = group
        group[measurement.observed_property] = measurement

        if len(group) < len(ObservedProperty):
            self._evict()
            return None

        del self._pending[key]
        temperature = group[ObservedProperty.TEMPERATURE]
        salinity = group[ObservedProperty.SALINITY]
        pressure = group[ObservedProperty.PRESSURE]
        return Sounding(
            platform=measurement.platform,
            sim_micros=measurement.sim_micros,
            latitude=temperature.latitude,
            longitude=temperature.longitude,
            depth_m=temperature.depth_m,
            temperature_c=temperature.value,
            salinity_psu=salinity.value,
            pressure_dbar=pressure.value,
        )

    def _evict(self) -> None:
        while len(self._pending) > self._maximum_pending:
            oldest = next(iter(self._pending))
            del self._pending[oldest]
            self._shed += 1
