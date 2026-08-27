# DO NOT EDIT.
# Generated from contracts/schemas/run-started.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DrognaModelRunStarted(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The model runner, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(..., description='The scenario run this belongs to.')
    sim_time: str = Field(
        ...,
        description='Simulation time at which work began, ISO-8601 UTC with microsecond precision.',
    )
    tick: int = Field(..., description='The tick index the runner had observed.', ge=0)
    run_id: str = Field(
        ...,
        description='The model run identifier from the request that caused this run.',
    )
    divergence_id: str = Field(
        ...,
        description='The divergence that justified the request, so the chain from observation to field is followable through the control namespace alone.',
    )
    member_count: int = Field(
        ...,
        description='Ensemble members this run will execute. A member that fails invalidates the run rather than shrinking it.',
        ge=2,
    )
    kernel: str = Field(
        ...,
        description='The model kernel implementation selected by configuration, behind the kernel port.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    initialisation_sim_time: str = Field(
        ...,
        description='The simulation instant the run initialises from, echoed from the request.',
    )
