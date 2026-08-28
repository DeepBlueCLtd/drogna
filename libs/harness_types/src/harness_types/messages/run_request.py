# DO NOT EDIT.
# Generated from contracts/schemas/run-request.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import divergence as divergence_1


class DrognaModelRunRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The scheduler that published the request, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this request belongs to, as carried on every clock sample.',
    )
    sim_time: str = Field(
        ...,
        description='Simulation time at which the request was published, ISO-8601 UTC with microsecond precision.',
    )
    tick: int = Field(
        ..., description='The tick index the scheduler had observed.', ge=0
    )
    run_id: str = Field(
        ...,
        description='Deterministic model run identifier, derived from the root seed and the logical run ordinal. It names the run in every later message and in the coverage store.',
    )
    run_sequence: int = Field(
        ...,
        description='Which run of this scenario this is, counting from zero. It is the other half of the identifier rule — run_id is a function of the root seed and this number — and it is carried rather than left to be read back out of the name, so that a manifest can record it as a fact rather than as a parse. Before it was carried the run manifest recorded a null here for want of anything to record.',
        ge=0,
    )
    initialisation_sim_time: str = Field(
        ...,
        description='The simulation instant the run initialises from. The forecast is valid forward of it.',
    )
    ensemble_size: int = Field(
        ...,
        description='How many perturbed members the run is asked for. At least two, or there is no spread to publish and the uncertainty field would be a fiction.',
        ge=2,
    )
    region: divergence_1.Region = Field(
        ...,
        description="The region that diverged. It does not bound the run's domain, which is the whole grid; it records where the disagreement was.",
    )
    divergence: divergence_1.DrognaDivergenceEvent = Field(
        ...,
        description='The divergence event that justified this request, carried whole.',
    )
