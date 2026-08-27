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


class Measurement(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    longitude: float = Field(
        ...,
        description='Degrees east. Bounded so that a pair written the other way round, or in radians, is refused here rather than scored as a geometry somewhere else entirely — which would put the buffered cells nowhere near the mask and read as a clean release.',
        ge=-180.0,
        le=180.0,
    )
    latitude: float = Field(
        ...,
        description='Degrees north. Bounded for the same reason as the longitude beside it, and separately because the metres-per-degree conversion the buffer uses is only meaningful inside this range.',
        ge=-90.0,
        le=90.0,
    )
    simulation_seconds: int = Field(
        ...,
        description="When in the interval the measurement was taken, counted in simulation seconds from the interval's start. Simulation time and not a host clock, so that a replay of the run produces the same geometry and the gate's verdict is reproducible (Constitution I, Constitution II).",
        ge=0,
    )


class MeasurementGeometry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    identification_radius_m: float = Field(
        ...,
        description="How close to a measurement a released value has to be before it identifies where that measurement was taken. It travels with the geometry rather than being read from a deployment's policy alone, so a run scored long after it finished is scored on the radius it was released under and not on whatever the boundary has been widened to since.",
        gt=0.0,
    )
    interval_seconds: int = Field(
        ...,
        description='How long the interval between two successive released products is, in simulation seconds. Stated rather than inferred from the measurements: a geometry covering a shorter span than the products it is scored against would leave the cells that moved unaccounted for, and a mask nobody can account for scores at chance for the wrong reason.',
        gt=0,
    )
    measurements: list[Measurement] = Field(
        ...,
        description='Every place a measurement was taken in the interval. At least one, because a geometry with none is not a geometry: it buffers to no cells, every comparison against it is inconclusive, and a document that could produce that silently is worse than one that is refused.',
        min_length=1,
    )


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
    measurement_geometry: MeasurementGeometry | None = Field(
        None,
        description="Where the run's measurements were taken, and the terms a release of that run is scored on. Optional, and the reason is the thing a reader will otherwise get wrong: C-01 writes the run's own manifest and holds no observations, so the manifest on the run-data volume does not carry this block and is complete without it; the offload packager writes the copy that travels beside a bundle and does know the geometry, so that copy carries it. A consumer that needs the geometry — the updated-region half of the leakage gate is the only one — must refuse a manifest without this block rather than read the absence as an empty geometry, because an empty geometry makes every comparison inconclusive and an inconclusive result nobody reads is indistinguishable from a pass (FR-015, FR-017).",
    )
