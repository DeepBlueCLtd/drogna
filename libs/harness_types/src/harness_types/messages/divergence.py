# DO NOT EDIT.
# Generated from contracts/schemas/divergence.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Region(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_latitude: float = Field(..., ge=-90.0, le=90.0)
    centre_longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_m: float = Field(
        ..., description='Radius enclosing the contributing samples, in metres.', gt=0.0
    )
    minimum_depth_m: float = Field(..., ge=0.0)
    maximum_depth_m: float = Field(..., ge=0.0)


class Residual(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    mean_m_per_s: float = Field(
        ...,
        description='Signed mean of measured minus forecast sound speed over the contributing samples.',
    )
    peak_m_per_s: float = Field(
        ...,
        description='Largest absolute residual among the contributing samples.',
        ge=0.0,
    )
    threshold_m_per_s: float = Field(
        ...,
        description='The threshold in force when the event was raised, of the order of 1.5 to 2 m/s, which is roughly half a degree Celsius. Carried so a reader need not guess what the scenario was tuned to.',
        gt=0.0,
    )
    sample_count: int = Field(
        ...,
        description='How many residual samples justified the event. Never one: a single sample is a spike, and a spike is not a divergence.',
        ge=2,
    )


class Rule(StrEnum):
    spatial = 'spatial'
    temporal = 'temporal'


class Persistence(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: Rule = Field(
        ...,
        description='spatial: distinct samples above threshold inside one neighbourhood. temporal: consecutive samples above threshold spanning at least the configured simulation-time span.',
    )
    sample_count: int = Field(..., ge=2)
    span_seconds: float = Field(
        ...,
        description='Simulation-time span from the first contributing sample to the last, in seconds.',
        ge=0.0,
    )
    first_sim_time: str = Field(
        ..., description='Simulation time of the earliest contributing sample.'
    )
    last_sim_time: str = Field(
        ..., description='Simulation time of the latest contributing sample.'
    )


class DrognaDivergenceEvent(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The component id of the monitor that raised it, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this event belongs to, as carried on every clock sample.',
    )
    sim_time: str = Field(
        ...,
        description='Simulation time at which the event was raised, ISO-8601 UTC with microsecond precision.',
    )
    tick: int = Field(
        ...,
        description='The tick index the monitor had observed when it raised the event.',
        ge=0,
    )
    divergence_id: str = Field(
        ...,
        description="Deterministic identifier derived from the root seed and the monitor's divergence ordinal, never from entropy or a host clock.",
    )
    forecast_run_id: str = Field(
        ...,
        description='The model run whose forecast field the residuals were scored against. Evidence gathered against a superseded field is discarded rather than carried, so every sample counted here scored this run.',
    )
    region: Region
    residual: Residual
    persistence: Persistence
    sound_speed_equation: str = Field(
        ...,
        description='The named equation the derivation used, so a residual can say which model of sound speed produced it.',
    )
