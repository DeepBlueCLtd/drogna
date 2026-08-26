"""Sampling: the world at a point, plus the noise the instrument declares.

An instrument here is a unit of measurement, a name and a noise model. It has no logic of
its own — it asks the field for the truth at a position and an instant, adds a seeded
draw, and hands back an observation in the shape ``contracts/schemas/observation.schema.json``
defines. Everything that could vary between runs comes from configuration or from the run's
root seed, and nothing comes from the host.

Sound speed is not sampled. The field can derive it and the monitor will, but this
component publishes the three measured quantities and no more: a derived value stored
beside its inputs is a second source of truth that can disagree with them (ADR-0005).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from random import Random
from typing import Any, Protocol

from harness_core.clock import SimInstant, Tick
from harness_core.rng import rng_for

from harness_sensors.identifiers import feature_of_interest_id, observation_id

__all__ = [
    "MEASURED_PROPERTIES",
    "Field",
    "Instrument",
    "Platform",
    "Position",
    "SensorArray",
    "noise_stream",
]

MEASURED_PROPERTIES: tuple[str, ...] = ("temperature", "salinity", "pressure")
"""The three, closed by ADR-0005. A fourth needs that decision amended, not a config key."""

_GAUSSIAN = "gaussian"


def noise_stream(prefix: str, measured: str) -> str:
    """The stream one instrument's noise is drawn from.

    One stream per instrument rather than one for the array: adding a fourth instrument
    would otherwise shift every later draw of the other three, and a run that was meant to
    be comparable would not be.
    """
    return f"{prefix}.noise.{measured}"


class Field(Protocol):
    """The world, as something that can be asked what it holds at a point.

    Implemented over the environment generator's ground-truth manifest
    (:mod:`harness_sensors.field`). Declared as a protocol because a test wants a closed
    form it can check an answer against, not because the environment is a port.
    """

    def at(
        self, *, latitude: float, longitude: float, depth_m: float, instant: SimInstant
    ) -> Mapping[str, float]:
        """The three measured quantities at a point, keyed as they appear on the wire."""


@dataclass(frozen=True)
class Position:
    """Somewhere a sample is taken. Two of these in sequence make no claim about travel."""

    latitude: float
    longitude: float


@dataclass(frozen=True)
class Platform:
    """The SensorThings Thing: a coordinate and a sampler."""

    id: str
    name: str
    description: str

    def as_context(self) -> dict[str, str]:
        return {"name": self.name, "description": self.description}


@dataclass(frozen=True)
class Instrument:
    """One datastream: what is measured, in what unit, by what, with what noise."""

    datastream_id: str
    name: str
    description: str
    observation_type: str
    measured: str
    observed_property: Mapping[str, str]
    unit_of_measurement: Mapping[str, str]
    sensor_id: str
    sensor_name: str
    sensor_description: str
    sensor_encoding_type: str
    noise_distribution: str
    noise_standard_deviation: float

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> Instrument:
        observed = section["observed_property"]
        sensor = section["sensor"]
        noise = section["noise"]
        measured = str(observed["measured"])
        if measured not in MEASURED_PROPERTIES:
            raise ValueError(
                f"{measured!r} is not one of the three published properties; sound speed is "
                "derived at the point of use and is not a datastream (ADR-0005)"
            )
        return cls(
            datastream_id=str(section["id"]),
            name=str(section["name"]),
            description=str(section["description"]),
            observation_type=str(section["observation_type"]),
            measured=measured,
            observed_property={
                "id": str(observed["id"]),
                "name": str(observed["name"]),
                "definition": str(observed["definition"]),
                "description": str(observed["description"]),
            },
            unit_of_measurement={
                "name": str(section["unit_of_measurement"]["name"]),
                "symbol": str(section["unit_of_measurement"]["symbol"]),
                "definition": str(section["unit_of_measurement"]["definition"]),
            },
            sensor_id=str(sensor["id"]),
            sensor_name=str(sensor["name"]),
            sensor_description=str(sensor["description"]),
            sensor_encoding_type=str(sensor["encoding_type"]),
            noise_distribution=str(noise["distribution"]),
            noise_standard_deviation=float(noise["standard_deviation"]),
        )

    @property
    def noise_metadata(self) -> str:
        """What the instrument says about itself, composed from what it actually does."""
        if self.noise_distribution == _GAUSSIAN and self.noise_standard_deviation > 0:
            return (
                f"Gaussian noise, standard deviation {self.noise_standard_deviation} "
                f"{self.unit_of_measurement['symbol']}, drawn from a seeded stream."
            )
        return "No noise: the instrument reports the field value unchanged."

    def disturb(self, value: float, generator: Random) -> float:
        """Apply the declared noise. The draw is taken whether or not it changes anything."""
        if self.noise_distribution != _GAUSSIAN or self.noise_standard_deviation <= 0:
            return value
        return value + generator.gauss(0.0, self.noise_standard_deviation)

    def as_context(self) -> dict[str, Any]:
        return {
            "sensor": {
                "name": self.sensor_name,
                "description": self.sensor_description,
                "encoding_type": self.sensor_encoding_type,
                "metadata": self.noise_metadata,
            },
            "observed_property": dict(self.observed_property),
            "datastream": {
                "name": self.name,
                "description": self.description,
                "observation_type": self.observation_type,
                "unit_of_measurement": dict(self.unit_of_measurement),
            },
        }


class SensorArray:
    """The platform, its instruments and the pattern it samples on.

    One sampling event is one position, every configured depth, every instrument. The order
    is fixed — depth, then instrument — because the ordinal that fixes each observation's
    identifier is that order's index, and an ordering that varied would make the store
    depend on something other than the seed.
    """

    def __init__(
        self,
        *,
        platform: Platform,
        instruments: Sequence[Instrument],
        positions: Sequence[Position],
        depths_m: Sequence[float],
        field: Field,
        seed_stream: str,
        feature_description: str = "Where an observation pertains to. Not a location history.",
        feature_encoding_type: str = "application/geo+json",
    ) -> None:
        if not instruments:
            raise ValueError("a sensor array with no instruments would publish nothing")
        if len(instruments) != len(MEASURED_PROPERTIES):
            raise ValueError(
                f"there are exactly {len(MEASURED_PROPERTIES)} datastreams — "
                f"{', '.join(MEASURED_PROPERTIES)} — and this configuration declares "
                f"{len(instruments)} (ADR-0005)"
            )
        measured = [instrument.measured for instrument in instruments]
        if sorted(measured) != sorted(MEASURED_PROPERTIES):
            raise ValueError(
                f"the three datastreams are {', '.join(MEASURED_PROPERTIES)}; this "
                f"configuration declares {', '.join(measured)}"
            )
        if not positions:
            raise ValueError("a sensor array with nowhere to sample would publish nothing")
        if not depths_m:
            raise ValueError("a sensor array with no depths would publish nothing")
        self._platform = platform
        self._instruments = tuple(instruments)
        self._positions = tuple(positions)
        self._depths = tuple(depths_m)
        self._field = field
        self._seed_stream = seed_stream
        self._feature_description = feature_description
        self._feature_encoding_type = feature_encoding_type
        self._generators = {
            instrument.measured: rng_for(noise_stream(seed_stream, instrument.measured))
            for instrument in instruments
        }
        self._ordinal = 0
        self._event = 0

    @property
    def ordinal(self) -> int:
        """How many observations this array has produced. The next one's logical position."""
        return self._ordinal

    @property
    def messages_per_event(self) -> int:
        return len(self._depths) * len(self._instruments)

    def position_for(self, event: int) -> Position:
        """Where the platform is on the ``event``-th sampling event."""
        return self._positions[event % len(self._positions)]

    def sample(self, tick: Tick) -> list[dict[str, Any]]:
        """One sampling event: every depth, every instrument, at this tick's instant."""
        event = self._event
        self._event += 1
        position_index = event % len(self._positions)
        position = self._positions[position_index]
        observations: list[dict[str, Any]] = []
        for depth_index, depth in enumerate(self._depths):
            truth = self._field.at(
                latitude=position.latitude,
                longitude=position.longitude,
                depth_m=depth,
                instant=tick.instant,
            )
            feature_id = feature_of_interest_id(
                self._seed_stream, position_index, depth_index, len(self._depths)
            )
            for instrument in self._instruments:
                observations.append(
                    self._observation(instrument, tick, position, depth, truth, feature_id)
                )
        return observations

    def events(self, ticks: Iterator[Tick]) -> Iterator[list[dict[str, Any]]]:
        """Sampling events for a stream of ticks, for a caller that has one."""
        for tick in ticks:
            yield self.sample(tick)

    def _observation(
        self,
        instrument: Instrument,
        tick: Tick,
        position: Position,
        depth_m: float,
        truth: Mapping[str, float],
        feature_id: str,
    ) -> dict[str, Any]:
        try:
            value = float(truth[instrument.measured])
        except KeyError:
            raise ValueError(
                f"the field holds no {instrument.measured!r} at this point; the three "
                "measured quantities are what a sensor may publish"
            ) from None
        measured = instrument.disturb(value, self._generators[instrument.measured])
        identifier = observation_id(self._seed_stream, self._ordinal)
        self._ordinal += 1
        context = instrument.as_context()
        context["thing"] = self._platform.as_context()
        context["feature_of_interest"] = {
            "name": f"sampling location {feature_id}",
            "description": self._feature_description,
            "encoding_type": self._feature_encoding_type,
        }
        return {
            "observation_id": identifier,
            "scenario_run_id": tick.run_id,
            "sim_time": tick.instant.iso(),
            "tick": tick.index,
            "thing_id": self._platform.id,
            "datastream_id": instrument.datastream_id,
            "sensor_id": instrument.sensor_id,
            "feature_of_interest_id": feature_id,
            "observed_property": instrument.measured,
            "result": measured,
            "location": {
                "latitude": position.latitude,
                "longitude": position.longitude,
                "depth_m": depth_m,
            },
            "context": context,
        }
