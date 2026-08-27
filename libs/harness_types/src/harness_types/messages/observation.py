# DO NOT EDIT.
# Generated from contracts/schemas/observation.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ObservedProperty(StrEnum):
    temperature = 'temperature'
    salinity = 'salinity'
    pressure = 'pressure'


class Location(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: float = Field(
        ..., description='Degrees north, WGS 84.', ge=-90.0, le=90.0
    )
    longitude: float = Field(
        ..., description='Degrees east, WGS 84.', ge=-180.0, le=180.0
    )
    depth_m: float = Field(
        ...,
        description='Depth below the surface in metres, positive downwards.',
        ge=0.0,
    )


class Thing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(..., description='One line saying what the platform is.')


class Sensor(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(
        ..., description='One line saying what the instrument simulates.'
    )
    encoding_type: str = Field(
        ...,
        description='SensorThings encodingType of the metadata field. The instrument is synthetic, so the metadata is prose rather than a datasheet.',
    )
    metadata: str = Field(
        ...,
        description="The instrument's declared noise model: distribution and standard deviation, stated so a stored value can be scored against the generator's field.",
    )


class ObservedProperty1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='The CF-style name, for example sea_water_temperature.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    name: str = Field(..., description='The quantity in words.')
    definition: str = Field(
        ...,
        description='What the name means, as a definition a consumer can resolve to a vocabulary.',
    )
    description: str = Field(..., description='One line for a reader.')


class UnitOfMeasurement(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='The unit in words, for example degree Celsius.')
    symbol: str = Field(..., description="The unit's symbol, for example degC.")
    definition: str = Field(
        ...,
        description='The unit as the coverage store spells it, for example degree_C, so a reader can compare a stored observation with a forecast field without a conversion table.',
    )


class Datastream(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(..., description='One line saying what the series is.')
    observation_type: str = Field(
        ...,
        description='SensorThings observationType. Every series here is a measurement.',
    )
    unit_of_measurement: UnitOfMeasurement = Field(..., title='Unit of measurement')


class FeatureOfInterest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., description='Short name for a reader.')
    description: str = Field(
        ...,
        description='One line saying what the location is. It is where a sample was taken and not a place anything went.',
    )
    encoding_type: str = Field(
        ...,
        description='SensorThings encodingType of the geometry the ingest client derives, which is GeoJSON.',
    )


class Context(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    thing: Thing = Field(
        ...,
        description='The sampling platform: the simulated vessel or a fixed sampling point.',
        title='Thing',
    )
    sensor: Sensor = Field(
        ...,
        description='The simulated instrument, and where its noise characteristics are stated.',
        title='Sensor',
    )
    observed_property: ObservedProperty1 = Field(
        ...,
        description='The quantity, named as the query layer and the coverage store name it, so one vocabulary serves the read path and the write path.',
        title='ObservedProperty',
    )
    datastream: Datastream = Field(
        ...,
        description='The series this observation belongs to, and where the unit of measurement lives. SensorThings puts the unit on the Datastream and not on the Observation, and so does this.',
        title='Datastream',
    )
    feature_of_interest: FeatureOfInterest = Field(
        ...,
        description="What the observation is of, in SensorThings terms: the sampled location. The geometry is derived from the message's own position by the ingest client, so it cannot disagree with it.",
        title='FeatureOfInterest',
    )


class DrognaObservation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    observation_id: str = Field(
        ...,
        description="Deterministic identifier derived from the root seed and the observation's logical position — thing, datastream and sequence — never from entropy, arrival order or a database sequence. It is the store's primary key, which is what makes redelivery under at-least-once a no-op rather than a duplicate row.",
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this observation belongs to, as carried on every clock sample.',
    )
    sim_time: str = Field(
        ...,
        description='Phenomenon time: the simulation instant the value was measured at, ISO-8601 UTC with microsecond precision. This is the only time the store orders on. An observation that arrives late is stored on its own time, not on arrival order.',
    )
    tick: int = Field(
        ...,
        description='The tick index the sensor had observed when it sampled. Carried beside sim_time because a tick is the unit of causality and an instant is not.',
        ge=0,
    )
    thing_id: str = Field(
        ...,
        description='The sampling platform this observation came from, and the first segment of the topic. A platform is a coordinate and a sampler; it carries no history and is not an entity of any other kind.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    datastream_id: str = Field(
        ...,
        description='The Datastream — the pairing of a Thing, a Sensor and an ObservedProperty with a unit — and the second segment of the topic.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    sensor_id: str = Field(
        ...,
        description='The simulated instrument that produced the value, carrying its noise characteristics in its metadata.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    feature_of_interest_id: str = Field(
        ...,
        description='The location the observation pertains to, in SensorThings terms. Derived deterministically from the sampled position, so two observations of the same place share one FeatureOfInterest.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    observed_property: ObservedProperty
    result: float = Field(
        ...,
        description='The measured value, in the unit the Datastream declares: degrees Celsius, practical salinity units or decibars. Seeded sensor noise is already applied; the value is what the instrument reported, not what the world held.',
    )
    location: Location
    context: Context
