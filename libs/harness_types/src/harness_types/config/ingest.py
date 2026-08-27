# DO NOT EDIT.
# Generated from contracts/schemas/config.ingest.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import IntEnum

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Qos(IntEnum):
    integer_0 = 0
    integer_1 = 1
    integer_2 = 2


class Subscription(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    qos: Qos = Field(
        ...,
        description='MQTT quality of service of the subscription. At level 1 a message is acknowledged only once its batch is written, so the broker holds what the store has not taken.',
    )


class Tables(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    things: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    sensors: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    observed_properties: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    datastreams: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    observations: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    features_of_interest: str = Field(..., pattern='^[a-z][a-z0-9_]*$')


class Store(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dsn: str = Field(
        ...,
        description='Connection string for the ingest role. A password, where the destination needs one, arrives in the rendered configuration and appears in no tracked file.',
    )
    schema_: str = Field(
        ...,
        alias='schema',
        description='The schema written to. observations, beside features in the same instance.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    role: str = Field(
        ...,
        description='The database role connected as. Named here so the client can assert at startup that it is the role the grants were written for.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    tables: Tables = Field(
        ...,
        description="Named here rather than in code so the query layer and the ingest client can be pointed at the same tables from configuration, which is where the observation store's shape is described.",
        title='Table names',
    )


class Batch(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_messages: int = Field(..., description='Messages per batch, at most.', ge=1)
    maximum_interval_seconds: float = Field(
        ...,
        description='The time bound, in simulation seconds. Simulation time deliberately: a host-time flush interval would be a wall-clock read in the operational path, and under an accelerated clock a simulation-time bound flushes more often in real terms, which is correct for a harness whose point is to compress time.',
        gt=0.0,
    )


class Queue(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_depth: int = Field(
        ...,
        description='Messages held in memory, at most. At the bound the client stops taking messages from the broker rather than discarding them or growing without limit; the broker holds the excess.',
        ge=1,
    )


class Rejections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_retained: int = Field(
        ...,
        description='How many rejections are kept. Reaching the bound is itself reported rather than discarding in silence.',
        ge=1,
    )


class Telemetry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    interval_seconds: float = Field(
        ...,
        description='Simulation seconds between telemetry messages. On the simulation clock like every interval in this component except the heartbeat, which is real time by ADR-0006.',
        gt=0.0,
    )


class Ingest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    subscription: Subscription = Field(
        ...,
        description='The observation branch, at a delivery guarantee that matches what the sensors publish at. The topic namespace is a convention of the harness and is not configurable.',
        title='What is subscribed to, and how it is acknowledged',
    )
    store: Store = Field(
        ...,
        description='One Postgres instance with PostGIS carrying two schemas. The ingest role is the only role with insert permission on this one, which the database enforces rather than the code (FR-018).',
        title='The observation store',
    )
    batch: Batch = Field(
        ...,
        description='A batch is written when either bound is reached, and each batch is one transaction: a failure leaves the store with the whole batch or with none of it.',
        title='Batch bounds',
    )
    queue: Queue = Field(
        ...,
        description='Backpressure is the failure mode the SRD assigns to this component, so the queue has a limit and reaching it costs latency rather than data.',
        title='The bounded queue',
    )
    rejections: Rejections = Field(
        ...,
        description='A message that fails validation is never written, is counted, and is kept with the reason it was refused so it can be inspected. The retention is bounded because a long run would otherwise fill memory with refusals.',
        title='Retained rejections',
    )
    telemetry: Telemetry = Field(
        ...,
        description='Queue depth, write rate, rejection count and any broker-side loss go on ctl/telemetry, so degradation is visible without anyone reading a log file.',
        title='What is reported, and how often',
    )


class DrognaIngestClientConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker
    logging: common.Logging
    ingest: Ingest = Field(..., title='The write path')
