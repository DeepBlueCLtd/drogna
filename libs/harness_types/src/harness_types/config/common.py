# DO NOT EDIT.
# Generated from contracts/schemas/config.common.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import AnyUrl, BaseModel, ConfigDict, Field


class Component(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='Stable component id, for example clock or env_generator.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    description: str | None = Field(
        None, description='One line for a human reading a heartbeat.'
    )
    heartbeat_interval_seconds: float | None = Field(
        None,
        description='Declared liveness interval, in host seconds. Real time by ADR-0006: measured in simulation time, a rate of zero would expire every liveness window and grey out a running system during exactly the capture FR-53 exists to make meaningful.',
        gt=0.0,
    )


class Routes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    snapshot: str = Field(
        ...,
        description='What the time is now, for startup and for catching up after a restart.',
    )
    control: str = Field(
        ...,
        description='Mode, rate, registration and acknowledgement: commands, not reads.',
    )


class Seed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    root: int = Field(
        ..., description="The run's root seed, recorded in the run manifest.", ge=0
    )
    stream: str = Field(
        ...,
        description="This component's stream prefix. Stream names are <component>.<purpose>.",
        pattern='^[a-z][a-z0-9_-]*$',
    )


class Broker(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(..., description='Broker URL.')
    client_id: str = Field(
        ...,
        description='Deterministic client id. Never derived from entropy or from a host clock.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    keepalive_seconds: int | None = Field(
        None,
        description='Transport keepalive. A socket parameter, not simulation time.',
        gt=0,
    )


class Level(StrEnum):
    DEBUG = 'DEBUG'
    INFO = 'INFO'
    WARNING = 'WARNING'
    ERROR = 'ERROR'
    CRITICAL = 'CRITICAL'


class Logging(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    level: Level = Field(
        ...,
        description='Log level. Log line decoration may carry host time; nothing else may.',
    )


class ClockMode(StrEnum):
    realtime = 'realtime'
    accelerated = 'accelerated'
    paused = 'paused'
    lockstep = 'lockstep'


class ParticipantRole(StrEnum):
    observer = 'observer'
    lockstep = 'lockstep'


class Participant(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description='Deterministic participant id, recorded in the run manifest.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    role: ParticipantRole


class Clock(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    endpoint: AnyUrl = Field(
        ...,
        description="Base URL of the clock service's HTTP interface (C-01). Not a way to read time in a loop.",
    )
    routes: Routes = Field(
        ...,
        description='Routes relative to the endpoint. Read and control routes sit under distinct prefixes so the reverse proxy can apply policy by prefix without enumerating routes.',
    )
    mode: ClockMode = Field(
        ...,
        description='The mode this component expects the run to be in. It does not set the mode; the clock does.',
    )
    stale_after_gap: int | None = Field(
        None,
        description='Tolerated gap in tick indices before the clock port reports itself stale. Gaps are normal in accelerated mode, so this is a per-component tolerance, not a constant.',
        ge=0,
    )
    timeout_seconds: float | None = Field(
        None,
        description='Socket timeout for clock requests. A transport parameter, not a source of time.',
        gt=0.0,
    )
    participant: Participant | None = Field(
        None,
        description='Present when this component registers with the clock. Absent means it only listens.',
    )


class DrognaCommonConfigurationSections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: Component
    clock: Clock
    seed: Seed
    broker: Broker | None = None
    logging: Logging
