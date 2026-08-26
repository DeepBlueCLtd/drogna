# DO NOT EDIT.
# Generated from contracts/schemas/config.publisher.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Staging(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    forecast_file: str = Field(..., min_length=1)
    uncertainty_file: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class Catalogue(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    root_directory: str = Field(..., min_length=1)
    run_directory_prefix: str = Field(
        ...,
        description="Prefixed to the run identifier to name a run's directory, so a run directory is recognisable as one.",
        min_length=1,
    )
    current_pointer: str = Field(
        ...,
        description="Name of the entry in the root that resolves to the current run's directory.",
        min_length=1,
    )
    forecast_file: str = Field(..., min_length=1)
    uncertainty_file: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class Collections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    forecast_prefix: str = Field(..., min_length=1)
    uncertainty_prefix: str = Field(..., min_length=1)


class Publisher(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    staging: Staging = Field(
        ...,
        description='The same location the model runner writes into, on the same volume as the catalogue, because a move across volumes is a copy and a copy is not indivisible.',
        title='Where completed runs are collected from',
    )
    catalogue: Catalogue = Field(
        ...,
        description="A directory per run under a root, with the current run named by a pointer that is replaced in one operation. The layout is the query layer's to define; these are the names this component needs in order to write into it.",
        title="The coverage store's layout",
    )
    collections: Collections = Field(
        ...,
        description='Identifiers are derived from the run identifier by prefix, so that a new run is addressable the moment it is catalogued and no collection is ever enumerated in a configuration file.',
        title="How a run's collections are named",
    )


class DrognaPublisherConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    publisher: Publisher = Field(..., title='Publication')
