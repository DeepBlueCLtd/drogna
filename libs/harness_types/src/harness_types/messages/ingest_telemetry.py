# DO NOT EDIT.
# Generated from contracts/schemas/ingest-telemetry.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Queue(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    depth: int = Field(..., description='Messages held now.', ge=0)
    bound: int = Field(..., description='The configured limit.', ge=1)
    at_bound: bool = Field(
        ...,
        description='The backpressure indicator. True when the queue is full now, and true when it filled at any point during the interval just ended — a loop that takes and writes within one turn is rarely caught full by an instantaneous sample, and an indicator that only reported the instant would say a system under sustained backpressure was comfortable. It clears when an interval passes with room to spare throughout.',
    )
    high_water: int = Field(
        ...,
        description='The deepest the queue has been this run. Never above the bound, and that is the claim SC-006 tests.',
        ge=0,
    )
    filled: int = Field(
        ...,
        description='How many times the queue has reached its bound this run. Not a count of losses: reaching the bound stops the client taking more, and what it has not taken it has not acknowledged, so the broker still holds it. This is the figure the indicator is derived from, and it is carried so a reader can tell one long stall from a hundred short ones.',
        ge=0,
    )


class Write(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    batches: int = Field(..., description='Transactions committed this run.', ge=0)
    stored: int = Field(..., description='Observations written this run.', ge=0)
    duplicates: int = Field(
        ...,
        description='Redeliveries that found their row already there and changed nothing. Counted rather than absorbed in silence: a rising number says the broker is redelivering.',
        ge=0,
    )
    rate_per_simulation_second: float = Field(
        ...,
        description='Observations stored per second of simulation time since the previous report. A rate in simulation time rather than host time, because that is the time the rest of this component runs on.',
        ge=0.0,
    )


class Rejections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    count: int = Field(..., description='Every rejection this run, kept or not.', ge=0)
    retained: int = Field(
        ..., description='How many are still held for inspection.', ge=0
    )
    discarded: int = Field(
        ...,
        description='Rejections that fell off the end of the retention. Reported rather than silently forgotten, which is what reaching the bound means.',
        ge=0,
    )


class Broker(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    received: int = Field(
        ..., description='Messages delivered to this client this run.', ge=0
    )
    lost: int = Field(
        ...,
        description="Messages the broker reported dropping. A burst larger than the broker's retention for the in-flight window loses messages before this component sees them; the loss is counted and reported rather than found later as a hole in the data.",
        ge=0,
    )


class DrognaIngestTelemetry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The component reporting, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this report belongs to, as carried on every clock sample.',
    )
    sim_time: str = Field(
        ...,
        description='Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. The telemetry interval is measured in simulation time like every interval in this component except the heartbeat, which is real time by ADR-0006.',
    )
    tick: int = Field(
        ...,
        description='The tick index the client had observed when it composed the report.',
        ge=0,
    )
    queue: Queue = Field(
        ...,
        description='Depth against bound. At the bound the client stops acknowledging rather than discarding, so a depth equal to the bound is backpressure and not loss.',
        title='The bounded queue',
    )
    write: Write = Field(..., title='What has reached the store')
    rejections: Rejections = Field(
        ...,
        description='Messages that failed validation. Never written, always counted, kept up to the configured bound so they can be inspected.',
        title='What did not reach the store',
    )
    broker: Broker = Field(..., title='What the broker did')
