# DO NOT EDIT.
# Generated from contracts/schemas/config.sensors.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import IntEnum, StrEnum

from pydantic import BaseModel, ConfigDict, Field, RootModel

from ..messages import observation
from . import common


class Platform(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='The Thing identifier, and the first segment of every topic these sensors publish on.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(..., description='One line saying what the platform is.')


class Field1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(
        ..., description='Directory holding the generated field and its manifest.'
    )
    manifest_file: str = Field(
        ..., description='File name of the ground-truth manifest within that directory.'
    )


class DepthsMItem(RootModel[float]):
    root: float = Field(..., ge=0.0)


class Position(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class Sampling(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    interval_seconds: float = Field(
        ...,
        description='Simulation seconds between samples. Simulation time, not host time: under an accelerated clock the sensors publish faster in real terms, which is the point of compressing time.',
        gt=0.0,
    )
    depths_m: list[DepthsMItem] = Field(
        ...,
        description='The depths sampled at each position, in metres below the surface.',
    )
    positions: list[Position] = Field(
        ...,
        description='The positions visited, in order and then repeated. A list of places a sample is taken, not a route anything travels.',
    )
    maximum_samples: int | None = Field(
        None,
        description='Stop after this many samples. Absent means run until the clock stops, which is what a scenario does; a fixed count is what a demonstration of a fixed length needs.',
        ge=1,
    )


class Qos(IntEnum):
    integer_0 = 0
    integer_1 = 1
    integer_2 = 2


class Publication(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    qos: Qos = Field(
        ...,
        description='MQTT quality of service. Level 1, at-least-once, is the default: duplicate suppression rests on the deterministic observation identifier rather than on the broker. Level 2 is available if level 1 proves troublesome, and is this value and nothing else.',
    )
    retain: bool | None = Field(
        None,
        description='Whether observations are retained by the broker. False for a stream of measurements; a retained observation would be delivered again to every new subscriber and would say a stale value is current.',
    )


class Reconnect(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    initial_seconds: float = Field(
        ...,
        description='First wait, in simulation seconds. The host clock is not consulted, here or anywhere else in this component but the heartbeat.',
        gt=0.0,
    )
    maximum_seconds: float = Field(
        ...,
        description='Ceiling on the wait, in simulation seconds. Bounded so a sensor keeps trying rather than backing off into silence.',
        gt=0.0,
    )


class UnitOfMeasurement(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='The unit in words.')
    symbol: str = Field(..., description="The unit's symbol.")
    definition: str = Field(
        ...,
        description='The unit as the coverage store spells it, so a stored observation and a forecast field compare without a conversion table.',
    )


class Sensor(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ..., description='The Sensor identifier.', pattern='^[a-z0-9][a-z0-9_.-]*$'
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(
        ..., description='One line saying what the instrument simulates.'
    )
    encoding_type: str = Field(
        ...,
        description="SensorThings encodingType of the instrument's metadata. The metadata itself is composed from the noise model, so an instrument cannot describe a noise it does not add.",
    )


class Distribution(StrEnum):
    gaussian = 'gaussian'
    none = 'none'


class Noise(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    distribution: Distribution = Field(
        ...,
        description='gaussian adds a seeded draw; none publishes the field value unchanged, which is what a test that wants an exact comparison asks for.',
    )
    standard_deviation: float = Field(
        ...,
        description="One standard deviation, in the datastream's unit. Zero is the same as no noise and is stated rather than implied.",
        ge=0.0,
    )


class ObservedPropertyConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    measured: observation.ObservedProperty = Field(
        ...,
        description='Which of the three quantities this series carries, as it appears on the wire.',
    )
    id: str = Field(
        ...,
        description='The CF-style name, for example sea_water_temperature.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    name: str = Field(..., description='The quantity in words.')
    definition: str = Field(
        ..., description='What the name means, as a definition a consumer can resolve.'
    )
    description: str = Field(..., description='One line for a reader.')


class Datastream(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='The Datastream identifier, and the second segment of the topic.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(..., description='One line saying what the series is.')
    observed_property: ObservedPropertyConfiguration
    observation_type: str = Field(
        ...,
        description='SensorThings observationType. Every series here is a measurement.',
    )
    unit_of_measurement: UnitOfMeasurement = Field(..., title='Unit of measurement')
    sensor: Sensor = Field(..., title='The simulated instrument')
    noise: Noise = Field(
        ...,
        description="Drawn from the seeded generator for this component's stream, so the observations are reproducible from the run manifest and two runs from one root seed produce identical stores.",
        title='Instrument noise',
    )


class Sensors(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    platform: Platform = Field(
        ...,
        description='The SensorThings Thing these sensors are mounted on. A coordinate and a sampler: it carries no history and nothing is carried between its positions.',
        title='Sampling platform',
    )
    field: Field1 = Field(
        ...,
        description="Where the environment generator's ground-truth manifest is. The sensors evaluate the analytic form the manifest describes rather than reading the stored field file, so a sampled value is the truth at a point rather than the truth plus an interpolation.",
        title='The world being sampled',
    )
    sampling: Sampling = Field(
        ...,
        description='The rate and the positions. The sampling pattern of a scenario — arrive cold, then loiter, revisiting at the local decorrelation timescale — belongs to the scenario and planner features; these sensors sample where and when they are told to.',
        title='Where and when to sample',
    )
    datastreams: list[Datastream] = Field(
        ...,
        description="Exactly three: temperature, salinity and pressure. There is no sound-speed datastream and adding one would need ADR-0005 amended. The observed property of each is an enumeration this schema closes at three; that there are three entries and that they are distinct is checked by the component at startup, because the deployment's own configuration checker runs on the standard library alone and implements no cardinality keyword.",
        title='The three datastreams',
    )
    publication: Publication = Field(
        ...,
        description='The topic namespaces obs/ and ctl/ are conventions of the harness and are not configurable; what is configurable is the delivery guarantee.',
        title='How observations are published',
    )
    reconnect: Reconnect = Field(
        ...,
        description='What a sensor does when the broker is not there. It retries with bounded backoff driven by the simulation clock, publishes no heartbeat until it is connected, and is therefore correctly greyed out in the client rather than falsely lit.',
        title='Reconnection backoff',
    )


class DrognaSimulatedSensorsConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker
    logging: common.Logging
    sensors: Sensors = Field(..., title='The sampling platform and its instruments')
