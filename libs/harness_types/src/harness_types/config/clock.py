# DO NOT EDIT.
# Generated from contracts/schemas/config.clock.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Bind(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    host: str = Field(..., description='Interface to bind.')
    port: int = Field(..., description='Port to bind.', ge=1, le=65535)


class RateBounds(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum: float = Field(
        ...,
        description='Least permitted rate. Zero, so that a capture can pin the clock.',
        ge=0.0,
    )
    maximum: float = Field(..., description='Greatest permitted rate.', ge=0.0)


class Run(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='The run id, recorded in the manifest and carried on every tick. Deterministic: it comes from here, never from entropy or a host clock. A resumed run takes its id from the manifest instead.',
        pattern='^[a-z0-9][a-z0-9_-]*$',
    )
    code_revision: str = Field(
        ...,
        description='Commit identifier, or a build identifier where there is no commit. A replay claims byte-identical output only against the same revision.',
    )
    code_dirty: bool | None = Field(
        None,
        description='True when the code was run from a working tree, in which case the revision does not identify it and the replay claim does not hold.',
    )


class Manifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., description='Directory holding the manifest.')
    file: str = Field(..., description='File name of the manifest within it.')


class ClockService(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    bind: Bind = Field(
        ...,
        description="Where the HTTP interface listens. Distinct from the common clock section's endpoint, which is where clients reach it: inside a container network the two differ, and pretending otherwise would put a deployment topology in source.",
        title='Listening address',
    )
    epoch: str = Field(
        ...,
        description="The run's simulation epoch, ISO-8601 UTC with microsecond precision. Tick n is epoch + n * tick_interval_us, so this value and the next one fix every tick value in the run.",
    )
    tick_interval_us: int = Field(
        ...,
        description='Simulation microseconds between ticks, in exact integers. A rate change alters how quickly ticks are emitted and never what they say.',
        gt=0,
    )
    default_mode: common.ClockMode = Field(
        ...,
        description='The mode the run starts in. Byte-identical replay is claimed for lockstep only.',
    )
    default_rate: float = Field(
        ...,
        description='The rate the run starts at. Zero starts the clock pinned, which is legitimate: it stops simulated time and stops nothing else (ADR-0006, FR-53).',
        ge=0.0,
    )
    rate_bounds: RateBounds = Field(
        ...,
        description='What a rate request from the browser is checked against. A request outside these is refused with a readable error and the current state is unchanged.',
        title='Permitted rates',
    )
    lockstep_deadline_seconds: float | None = Field(
        None,
        description='Host seconds the lockstep barrier waits for an outstanding acknowledgement before the stall is reported. It never skips the tick: a participant that dies stalls the clock rather than being outrun, which is the correct failure for a replay mode (ADR-0009).',
        gt=0.0,
    )
    idle_poll_seconds: float = Field(
        ...,
        description='How long the service waits between attempts when nothing is due — pinned, paused, or held at the lockstep barrier. Host seconds, because it is a poll interval and not a measurement of anything; the heartbeat still goes out on its own real-time cadence while the clock is held.',
        gt=0.0,
    )
    liveness_window_seconds: float = Field(
        ...,
        description="How long, in host seconds, one of this component's heartbeats should be taken as evidence that it is alive. Published in the heartbeat itself, because only the sender knows its own cadence and the receiver holds no table of expected intervals (ADR-0006).",
        gt=0.0,
    )
    run: Run = Field(
        ...,
        description="Who this run is and what code it is running. The clock holds the run's identity because it is the component that must exist before any other.",
        title='Run identity',
    )
    manifest: Manifest = Field(
        ...,
        description='Where the run manifest is written. If a manifest is already there when the service starts, the run is resumed from it rather than restarted: a clock that silently rewound time would be worse than one that refused to start.',
        title='Run manifest',
    )


class DrognaClockConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    clock_service: ClockService = Field(
        ...,
        description='Named clock_service rather than clock because the common clock section already holds that name and means the opposite thing: how a component reaches the clock, not how the clock runs.',
        title='The clock this service serves',
    )
