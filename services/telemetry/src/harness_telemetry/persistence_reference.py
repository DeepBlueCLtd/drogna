"""The baseline every skill score is measured against: conditions stay the same.

The persistence reference is the forecast field that was current *immediately before the
latest publication*, held constant. That is a claim about the world — that nothing has
changed since the last time the model spoke — and it is the claim a forecast has to beat
before it is worth its compute (Constitution IX, SRD FR-38).

Holding it costs nothing extra. This component already has the field it was scoring
against; when a new run is published, that field becomes the reference and the new one
becomes current. No historical run is ever looked up, no run directory is resolved by name,
and the coverage store is read only at a publication boundary — which is what keeps FR-001
and SC-003 true: telemetry issues no query to the observation store and nothing at all to
the query layer.

Sound speed for the reference is derived from the reference field's own temperature and
salinity by the single implementation in ``harness_core`` (ADR-0005), reached through the
coverage read port's own sampling. There is no copy of the equation here, and there is no
stored sound-speed datastream to read instead: sound speed is derived at the point of use.

The port is expressed as a protocol so that the arithmetic above can be tested without a
file, and so that the only thing this module knows about NetCDF is that it does not know
anything about NetCDF.
"""

from __future__ import annotations

from typing import Protocol

__all__ = ["ForecastSource", "PersistenceReference", "ReferenceField"]


class ReferenceField(Protocol):
    """A published forecast field, sampled where a measurement was taken."""

    @property
    def run_id(self) -> str: ...

    def sound_speed_at(
        self, latitude: float, longitude: float, depth_m: float, when: int
    ) -> float | None:
        """Forecast sound speed here, or nothing when here is outside the domain."""
        ...


class ForecastSource(Protocol):
    """The coverage read port's current-forecast side. One method, because that is all."""

    def current(self) -> ReferenceField | None: ...


class PersistenceReference:
    """The current field, the field before it, and the error of a measurement against it."""

    def __init__(self, forecasts: ForecastSource) -> None:
        self._forecasts = forecasts
        self._current: ReferenceField | None = None
        self._reference: ReferenceField | None = None

    def start(self) -> None:
        """Take whatever is current. Nothing prior exists yet, so nothing is held."""
        self._current = self._forecasts.current()

    def published(self) -> bool:
        """A new run was announced: the field held becomes the reference. Was it a change?

        A repeated announcement of the run already current is not a boundary. Treating it
        as one would make a field its own persistence reference, and a model always ties
        with itself.
        """
        taken = self._forecasts.current()
        if taken is None:
            return False
        if self._current is not None and taken.run_id == self._current.run_id:
            return False
        self._reference = self._current
        self._current = taken
        return True

    @property
    def has_forecast(self) -> bool:
        return self._current is not None

    @property
    def has_reference(self) -> bool:
        """Whether a prior field is held. False after the first ever publication."""
        if self._reference is None or self._current is None:
            return False
        return self._reference.run_id != self._current.run_id

    @property
    def current_run_id(self) -> str | None:
        return None if self._current is None else self._current.run_id

    @property
    def reference_run_id(self) -> str | None:
        return None if self._reference is None else self._reference.run_id

    def error_against_reference(
        self,
        *,
        latitude: float,
        longitude: float,
        depth_m: float,
        when_micros: int,
        measured: float,
    ) -> float | None:
        """Measured sound speed minus the held field's, or nothing where it does not reach.

        Nothing rather than a substitute. A measurement the reference cannot cover is a
        measurement the two fields cannot be compared over, and scoring it against one of
        them would put a sample in one mean-square error that is missing from the other.
        """
        if self._reference is None:
            return None
        predicted = self._reference.sound_speed_at(latitude, longitude, depth_m, when_micros)
        if predicted is None:
            return None
        return measured - predicted
