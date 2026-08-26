# DO NOT EDIT.
# Generated from contracts/schemas/run-published.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ValidTime(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    start_sim_time: str = Field(
        ..., description='Simulation time of the first forecast step.'
    )
    end_sim_time: str = Field(
        ..., description='Simulation time of the last forecast step.'
    )


class GridBounds(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_latitude: float = Field(..., ge=-90.0, le=90.0)
    maximum_latitude: float = Field(..., ge=-90.0, le=90.0)
    minimum_longitude: float = Field(..., ge=-180.0, le=180.0)
    maximum_longitude: float = Field(..., ge=-180.0, le=180.0)
    minimum_depth_m: float = Field(..., ge=0.0)
    maximum_depth_m: float = Field(..., ge=0.0)


class Collections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    forecast: str = Field(
        ..., description='Collection identifier of the ensemble mean.', min_length=1
    )
    uncertainty: str = Field(
        ...,
        description='Collection identifier of the per-cell ensemble spread.',
        min_length=1,
    )


class Digests(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    forecast: str = Field(..., pattern='^sha256:[0-9a-f]{64}$')
    uncertainty: str = Field(..., pattern='^sha256:[0-9a-f]{64}$')


class DrognaModelRunPublished(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The publisher, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(..., description='The scenario run this belongs to.')
    sim_time: str = Field(
        ...,
        description='Simulation time at which the run became visible, ISO-8601 UTC with microsecond precision.',
    )
    tick: int = Field(
        ..., description='The tick index the publisher had observed.', ge=0
    )
    run_id: str = Field(..., description='The model run that has been published.')
    current: bool = Field(
        ...,
        description='Whether this run is now the current one. Announced rather than assumed, because a run can be published for inspection without being made current.',
    )
    valid_time: ValidTime
    grid_bounds: GridBounds
    collections: Collections
    digests: Digests
