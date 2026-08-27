# DO NOT EDIT.
# Generated from contracts/schemas/offload-telemetry.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Bundles(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    staged: int = Field(
        ..., description='Written to the staging area and not yet transferred.', ge=0
    )
    transferred: int = Field(
        ...,
        description='Sent and revealed at the destination, awaiting a receipt that verifies.',
        ge=0,
    )
    verified: int = Field(
        ...,
        description='A receipt has matched a digest recomputed from the file on disk. Eligible for eviction, which is not the same as due for it.',
        ge=0,
    )
    evictable: int = Field(
        ...,
        description="The retention policy has asked for this bundle's space and the delete has not been confirmed. A bundle sitting here across a restart is re-verified, never deleted on the strength of the record.",
        ge=0,
    )
    evicted: int = Field(
        ...,
        description='Deleted locally, after a digest recomputed immediately before the delete matched the verified one.',
        ge=0,
    )
    failed: int = Field(
        ...,
        description='A step did not complete. The local bytes are present in every case: no failure path deletes anything.',
        ge=0,
    )


class Verification(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    refused: int = Field(
        ..., description='Receipts refused this run, across every reason.', ge=0
    )
    verified: int = Field(..., description='Receipts accepted this run.', ge=0)
    last_refusal: str | None = Field(
        None,
        description='Why the most recent refusal was refused, in the words the verifier used. Absent when nothing has been refused.',
    )


class Staging(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    bytes: int = Field(
        ...,
        description='What the staging area holds now, partial files included.',
        ge=0,
    )
    bound_bytes: int = Field(
        ..., description='The configured bound the retention policy holds it to.', ge=1
    )
    at_bound: bool = Field(
        ..., description='True when the staging area is at or over its bound.'
    )
    producing: bool = Field(
        ...,
        description='Whether the packager is still writing new bundles. False when the staging area is at its bound and nothing is eligible for eviction: eviction stays gated on a receipt, so the correct behaviour is to stop producing and report.',
    )


class DrognaOffloadTelemetry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: str = Field(
        ...,
        description='The component reporting, matching config /component/id.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    scenario_run_id: str = Field(
        ...,
        description='The scenario run this report belongs to, as carried on every clock sample.',
    )
    sim_time: str = Field(
        ...,
        description='Simulation time at which the report was composed, ISO-8601 UTC with microsecond precision. Every interval in this component except the heartbeat is measured in simulation time; the heartbeat is real time by ADR-0006.',
    )
    tick: int = Field(
        ...,
        description='The tick index the packager had observed when it composed the report.',
        ge=0,
    )
    bundles: Bundles = Field(
        ...,
        description="One count per state the ledger admits. The states move forward only, so a run's bundles migrate rightwards through these counts and a bundle that stops moving is a bundle whose side effect did not complete.",
        title='Bundles by ledger state',
    )
    verification: Verification = Field(
        ...,
        description='Refusals are reported rather than swallowed (FR-016). A refusal never changes a local file, so this count rising is a statement about the destination and not about the staging area.',
        title='What has been refused',
    )
    staging: Staging = Field(
        ...,
        description='Bytes held against the bytes the retention policy permits. At or over the bound with nothing eligible for eviction, the packager stops producing bundles and says so here rather than making room.',
        title='The staging area against its bound',
    )
