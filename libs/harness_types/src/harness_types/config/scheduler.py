# DO NOT EDIT.
# Generated from contracts/schemas/config.scheduler.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common


class RunId(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(
        ...,
        description='The named rule the digest is taken over. Matches query.coverage_store.run_id.rule.',
        min_length=1,
    )
    version: int = Field(
        ...,
        description="The rule's version. Bumping it changes every identifier the rule produces.",
        ge=1,
    )
    prefix: str = Field(
        ...,
        description='What a run identifier begins with, so a run directory is recognisable as one.',
        min_length=1,
    )


class Scheduler(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_interval_seconds: float = Field(
        ...,
        description='Least simulation time between successive run requests. A divergence arriving inside it is declined with a recorded reason, not dropped.',
        ge=0.0,
    )
    outstanding_timeout_seconds: float = Field(
        ...,
        description='Simulation time after which a request that has produced no publication is abandoned, so that a run which never completes cannot block the loop for ever.',
        gt=0.0,
    )
    ensemble_size: int = Field(
        ...,
        description='Members to ask each run for. The scheduler owns this number rather than the runner, so that one request carries one answer and two components cannot disagree about how large a run was.',
        ge=2,
    )
    initialisation_offset_seconds: float = Field(
        ...,
        description="Offset from the divergence's simulation time to the instant the run initialises from. Zero initialises at the divergence.",
    )
    run_id: RunId = Field(
        ...,
        description="How a run is named. The rule is the coverage store's, stated in stores/coverage/layout.md, and it is carried here rather than imported so that this component computes the same string from the same five values as the query layer does — root seed, run sequence, rule, version and prefix. Naming the rule and its version in configuration is what makes a change to either change every identifier visibly.",
        title="The coverage store's run identifier rule",
    )


class DrognaSchedulerConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    scheduler: Scheduler = Field(..., title='Run policy')
