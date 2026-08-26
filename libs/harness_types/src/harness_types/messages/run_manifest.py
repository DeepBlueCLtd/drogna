# DO NOT EDIT.
# Generated from contracts/schemas/run-manifest.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class SeedDerivation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(..., description='Rule name, for example harness-rng.')
    version: int = Field(
        ...,
        description='Rule version. A change here changes every sequence in every replay.',
        ge=1,
    )


class Mode(StrEnum):
    realtime = 'realtime'
    accelerated = 'accelerated'
    paused = 'paused'
    lockstep = 'lockstep'


class Clock(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    epoch: str = Field(
        ..., description='Simulation epoch, ISO-8601 UTC with microsecond precision.'
    )
    tick_interval_us: int = Field(
        ..., description='Simulation microseconds between ticks.', gt=0
    )
    mode: Mode = Field(
        ...,
        description='Byte-identical replay is claimed for lockstep only. The free-running modes reproduce drawn values, not interleaving.',
    )
    rate: float = Field(..., description='Emission rate. Zero means pinned.', ge=0.0)
    min_rate: float | None = Field(None, ge=0.0)
    max_rate: float | None = Field(None, ge=0.0)
    lockstep_deadline_seconds: float | None = Field(
        None,
        description='How long the clock waits for an outstanding acknowledgement before reporting a stall. It never skips the tick.',
        gt=0.0,
    )


class CodeVersion(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    revision: str = Field(
        ...,
        description='Commit identifier, or a build identifier where there is no commit.',
    )
    dirty: bool | None = Field(
        None,
        description='True when the working tree carried uncommitted changes, in which case the revision does not identify the code and the replay claim does not hold.',
    )


class Role(StrEnum):
    observer = 'observer'
    lockstep = 'lockstep'


class Participant(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')
    role: Role
    config_digest: str = Field(
        ...,
        description='SHA-256 of the configuration file as read.',
        pattern='^sha256:[0-9a-f]{64}$',
    )
    registered_tick: int | None = Field(
        None, description='The tick at which the registration was observed.', ge=0
    )


class State(StrEnum):
    running = 'running'
    completed = 'completed'
    failed = 'failed'
    stalled = 'stalled'


class ExitState(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    state: State
    final_tick: int | None = Field(None, description='The last tick emitted.', ge=0)
    detail: str | None = Field(
        None,
        description='Free-text diagnostic. Declared non-reproducible: it may name a host, a duration or an exception message, none of which a replay is expected to match.',
    )


class NonReproducibleItem(RootModel[str]):
    root: str = Field(..., pattern='^/')


class DrognaRunManifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schema_version: Literal[1] = Field(
        ..., description='Bumped when the shape changes in a way a reader must notice.'
    )
    run_id: str = Field(
        ...,
        description='Identity of the run. Deterministic: derived from seed and scenario, never from entropy or a host clock.',
        pattern='^[a-z0-9][a-z0-9_-]*$',
    )
    root_seed: int = Field(
        ..., description='The seed every generator in the run derives from.', ge=0
    )
    seed_derivation: SeedDerivation = Field(
        ...,
        description='How per-stream seeds come from the root seed. Recorded as a rule rather than a table of seeds, because the rule is a pure function of root seed and stream name and so recomputes exactly.',
    )
    clock: Clock = Field(
        ...,
        description='The clock configuration the run started with. Tick values follow from epoch and interval alone.',
    )
    code_version: CodeVersion = Field(
        ...,
        description='The code the run executed. A replay claims byte-identical output only against the same revision.',
    )
    participants: list[Participant] = Field(
        ...,
        description='Components that registered with the clock, with the digest of the configuration each was started from. Digests only: never values.',
    )
    streams: list[str] | None = Field(
        None,
        description='Named RNG streams the run is expected to use. Listed so that two call sites accidentally sharing one stream shows up in the document rather than as a puzzle in the output.',
    )
    exit_state: ExitState = Field(
        ...,
        description='How the run ended. Written atomically, so no reader sees a partial document.',
    )
    non_reproducible: list[NonReproducibleItem] = Field(
        ...,
        description='JSON pointers a replay comparison excludes. Declared in the document as well as annotated in the schema, so a comparison needs the manifest alone.',
    )
