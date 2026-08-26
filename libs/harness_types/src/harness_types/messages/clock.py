# DO NOT EDIT.
# Generated from contracts/schemas/clock.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Mode(StrEnum):
    realtime = 'realtime'
    accelerated = 'accelerated'
    paused = 'paused'
    lockstep = 'lockstep'


class DrognaSimulationTimeSample(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    run_id: str = Field(
        ..., description='The run this sample belongs to, matching the run manifest.'
    )
    tick: int = Field(
        ...,
        description='Tick index. Strictly increasing within a run; gaps are possible for a slow subscriber and are never filled in by the consumer.',
        ge=0,
    )
    sim_time: str = Field(
        ...,
        description='Simulation time of this tick, ISO-8601 UTC with microsecond precision.',
    )
    mode: Mode = Field(
        ...,
        description='Byte-identical replay is claimed for lockstep only; the free-running modes reproduce drawn values but not interleaving.',
    )
    rate: float = Field(
        ...,
        description='Emission rate. Zero is a legitimate rate: it pins the clock for screenshot capture (FR-53) and stops simulated time without stopping anything else.',
        ge=0.0,
    )
