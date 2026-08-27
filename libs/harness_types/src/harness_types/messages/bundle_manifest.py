# DO NOT EDIT.
# Generated from contracts/schemas/bundle-manifest.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Window(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    index: int = Field(..., ge=0)
    start_sim_time: str = Field(
        ...,
        description='Simulation instant the window opens at, inclusive, ISO-8601 UTC with microsecond precision.',
    )
    end_sim_time: str = Field(
        ...,
        description='Simulation instant the window closes at, exclusive, ISO-8601 UTC with microsecond precision.',
    )


class Member(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(
        ...,
        description="The member's name within the bundle. A name, not a location: no directory reaches this document.",
        min_length=1,
    )
    digest: str = Field(..., pattern='^sha256:[0-9a-f]{64}$')
    byte_length: int = Field(..., ge=0)


class Variable(RootModel[str]):
    root: str = Field(..., min_length=1)


class DrognaBundleManifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schema_version: int = Field(
        ...,
        description='Bumped when the shape changes in a way a reader must notice.',
        ge=1,
    )
    bundle_id: str = Field(
        ...,
        description="Deterministic identifier derived from the run identity and the bundle's logical position — the window index — and from the format version, never from entropy or a host clock. Two packaging runs over one run manifest produce the same identifier for the same window.",
        pattern='^[a-z0-9][a-z0-9_.-]*$',
    )
    run_reference: str = Field(
        ...,
        description='An opaque derivation of the run manifest digest. Sufficient to tie a bundle to a run inside the boundary; useless to a reader who does not hold the manifest.',
        pattern='^[0-9a-f]{32}$',
    )
    run_manifest_digest: str = Field(
        ...,
        description='The digest of the run manifest the bundle was packaged from, so anything computed from the bundle can still be scored against the ground truth that produced it. Held here, in the sidecar, and not written into the exported file.',
        pattern='^sha256:[0-9a-f]{64}$',
    )
    format_version: str = Field(
        ...,
        description='The export format this bundle was written by. Byte-identity is claimed for a fixed code and format version, so the claim names the version it is about.',
        min_length=1,
    )
    window: Window = Field(
        ...,
        description="Which slice of the run this bundle covers. Boundaries are counted from the run's simulation epoch, so the index is a property of the manifest.",
        title='The simulation time window',
    )
    members: list[Member] = Field(
        ...,
        description='Every file in the bundle, with its digest and its byte length. A member list of one is the ordinary case; the shape admits more so that a bundle gaining a second file does not become a different kind of thing.',
        min_length=1,
    )
    variables: list[Variable] = Field(
        ...,
        description='The variables the export carries, so a reader can tell what is inside without opening it.',
        min_length=1,
    )
    profile_count: int = Field(
        ...,
        description='How many profiles the bundle holds. A window with none produces no bundle at all rather than an empty one.',
        ge=1,
    )
    level_count: int = Field(
        ...,
        description='Total depth levels across every profile: the length of the ragged sample dimension.',
        ge=1,
    )
