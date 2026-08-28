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
    runs_dirname: str = Field(
        ...,
        description='The subdirectory of the store root that holds the runs. The layout gives a run directory no prefix of its own — the directory is the run identifier, and the identifier already begins with the prefix its own rule states — so this names the directory they sit in. It replaces run_directory_prefix, which carried this value for want of a key of its own and which could not be empty.',
        min_length=1,
    )
    current_pointer: str = Field(
        ...,
        description="Name of the entry in the root that resolves to the current run's directory.",
        min_length=1,
    )
    partial_suffix: str = Field(
        ...,
        description="What an in-flight name ends in. Anything under it is invisible to the catalogue, which is what lets a run be assembled and a pointer be replaced without a reader ever seeing either half-made. It states the same value as query.coverage_store.partial_suffix and the model runner's staging.partial_suffix; three statements rather than one because no component reads another's configuration.",
        min_length=1,
    )
    forecast_file: str = Field(..., min_length=1)
    uncertainty_file: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class Collections(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    forecast: str = Field(
        ...,
        description="The collection identifier exactly as the query layer serves it. It states the same value the query configuration declares; two statements rather than one because no component reads another's configuration.",
        min_length=1,
    )


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
        description='The fixed identifier the query layer serves runs under, stated here so the announcement can carry it (decided 28 August 2026, issue #34). One collection carries the forecast parameters and the uncertainty parameter together; the current run answers at the collection itself, and a specific run is an EDR instance of it named by the run identifier. Until that decision the identifiers were derived per run by prefix, which produced names nothing served.',
        title='The served collection',
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
