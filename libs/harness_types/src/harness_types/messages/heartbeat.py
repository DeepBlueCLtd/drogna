# DO NOT EDIT.
# Generated from contracts/schemas/heartbeat.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Status(StrEnum):
    starting = 'starting'
    ok = 'ok'
    degraded = 'degraded'
    stalled = 'stalled'
    stopping = 'stopping'


class DrognaComponentHeartbeat(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The component id, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    sim_time: str = Field(
        ...,
        description='Simulation time of the heartbeat, ISO-8601 UTC with microsecond precision.',
    )
    tick: int | None = Field(
        None,
        description='The tick index the component had observed when it published. Present wherever the component holds a tick.',
        ge=0,
    )
    status: Status = Field(
        ...,
        description='degraded and stalled are how a component says it is alive but not working, rather than going quiet and being read as dead.',
    )
    run_id: str | None = Field(
        None,
        description='The run this component is part of, matching the run manifest.',
    )
    config_digest: str | None = Field(
        None,
        description="SHA-256 of the configuration the component was started from. This is how a participant's digest reaches the run manifest: never the configuration itself.",
        pattern='^sha256:[0-9a-f]{64}$',
    )
    heartbeat_interval_seconds: float | None = Field(
        None,
        description="The interval, in host seconds, at which this component says it heartbeats (ADR-0006). Optional: a component that does not declare one is judged against the receiver's default tolerance, which is a tolerance and not a list of components.",
        gt=0.0,
    )
    liveness_window_seconds: float | None = Field(
        None,
        description='How long, in host seconds, this heartbeat should be taken as evidence that its sender is alive. Declared by the sender because only the sender knows its own cadence; the receiver holds no table of expected intervals. Optional, as above.',
        gt=0.0,
    )
    detail: str | None = Field(
        None, description='One line for a human. Never a substitute for status.'
    )
