# DO NOT EDIT.
# Generated from contracts/schemas/offload-receipt.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DrognaOffloadReceipt(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    destination_id: str = Field(
        ...,
        description='Which destination is speaking. A receipt from a destination this component was not configured to send to is refused rather than believed.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    bundle_id: str = Field(
        ...,
        description='Which bundle the destination is acknowledging. A receipt naming a bundle that was never sent is refused: an acknowledgement is not permission.',
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    digest: str = Field(
        ...,
        description='The digest the destination computed over the bytes it received. Compared against a digest recomputed locally from the file on disk at verification time, never against the digest the transfer request declared.',
        pattern='^sha256:[0-9a-f]{64}$',
    )
    byte_count: int = Field(
        ...,
        description='How many bytes the destination received. Checked as well as the digest: a destination acknowledging a different length has not received what was sent, whatever it says it hashed.',
        ge=0,
    )
    sim_time: str = Field(
        ...,
        description='Simulation instant of receipt, ISO-8601 UTC with microsecond precision. It may be earlier than the instant of the transfer under accelerated replay, which is a property of the clock and not a fault.',
    )
    tick: int | None = Field(
        None,
        description='The tick index the destination had observed when it composed the receipt. Optional: the destination is a stub within the deployment and may hold no clock port of its own.',
        ge=0,
    )
    schema_version: int | None = Field(
        None,
        description='Bumped when the shape changes in a way a reader must notice.',
        ge=1,
    )
