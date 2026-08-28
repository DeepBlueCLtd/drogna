# DO NOT EDIT.
# Generated from contracts/schemas/coverage-run-manifest.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ValidTime(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    begin: str = Field(
        ..., description='Start of the valid extent, in simulation time.', min_length=1
    )
    end: str = Field(
        ...,
        description='End of the valid extent, in simulation time. Not before begin — an ordering this document cannot express and the catalogue checks besides.',
        min_length=1,
    )


class Ensemble(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    members: int | None = Field(
        ...,
        description='Members the run was computed over. At least two, or there is no spread and the uncertainty field beside this manifest would be a fiction.',
        ge=2,
    )
    method: str = Field(
        ...,
        description='How the members were combined into the published fields.',
        min_length=1,
    )


class DrognaCoverageRunManifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schema_version: int = Field(
        ...,
        description='Bumped when the shape changes in a way a reader must notice.',
        ge=1,
    )
    run_id: str = Field(
        ...,
        description="This run's identifier. It must equal the name of the directory holding this file: a run whose manifest disagrees with its directory is refused rather than catalogued, because nothing in a response would then say which of the two names it was answering under.",
        min_length=1,
    )
    root_seed: int = Field(
        ...,
        description='The seed the run derives from. With run_sequence it determines run_id, by the rule stores/coverage/layout.md states.',
    )
    run_sequence: int | None = Field(
        ...,
        description="Which run of this scenario this is. Null where nothing carried it — a run named by a rule other than the store's cannot have its sequence read back out of its name, and a guess here would look like a fact that reproduced the run.",
        ge=0,
    )
    generator_version: str = Field(
        ...,
        description='What produced the initial state this run was advected from.',
        min_length=1,
    )
    model_version: str = Field(
        ...,
        description='The model kernel that produced the forecast, and the version of the analytic form it used.',
        min_length=1,
    )
    sim_time: str = Field(
        ...,
        description='The simulation time the run was made at. Simulation time, never host time (Constitution I).',
        min_length=1,
    )
    valid_time: ValidTime = Field(
        ...,
        description='Load-bearing beyond documentation: an EDR query that names no time is answered over this extent, taken from this document rather than from a host clock — there is no now here, and reading one to decide what a forecast says would be Constitution I broken at the one place the answer would still look right.',
        title='The extent the forecast is valid over',
    )
    ensemble: Ensemble = Field(
        ..., title='How many members, and how they were combined'
    )
