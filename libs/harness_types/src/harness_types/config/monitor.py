# DO NOT EDIT.
# Generated from contracts/schemas/config.monitor.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Window(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    span_seconds: float = Field(
        ...,
        description='How far back the window reaches, in seconds of simulation time.',
        gt=0.0,
    )
    maximum_samples: int = Field(
        ...,
        description='Hard bound on samples held. The oldest is evicted when it is reached.',
        ge=1,
    )
    maximum_pending: int = Field(
        ...,
        description='Bound on observations accepted but not yet paired into a scoreable sample. Beyond it the oldest are shed and counted, because falling behind unboundedly at a high clock rate is worse than a reported drop.',
        ge=1,
    )


class Residual(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    threshold_m_per_s: float = Field(
        ...,
        description="Residual magnitude above which a sample counts towards persistence, in metres per second. Of the order of 1.5 to 2 m/s, which is roughly half a degree Celsius at the scenario's nominal conditions.",
        gt=0.0,
    )


class Persistence(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    neighbourhood_radius_m: float = Field(
        ...,
        description='Radius within which samples count as neighbours, in metres. A radius and not a spatial index: indexing belongs to the planner, and coupling the monitor to it would buy nothing.',
        gt=0.0,
    )
    spatial_sample_count: int = Field(
        ...,
        description='Distinct samples above threshold inside one neighbourhood that satisfy the spatial rule.',
        ge=2,
    )
    temporal_sample_count: int = Field(
        ...,
        description='Consecutive samples above threshold that satisfy the temporal rule.',
        ge=2,
    )
    temporal_span_seconds: float = Field(
        ...,
        description='Simulation-time span those consecutive samples must cover, in seconds. Without it a burst arriving in one instant would satisfy a rule about persistence over time.',
        gt=0.0,
    )


class Mode(StrEnum):
    span = 'span'
    catchup = 'catchup'


class Warmup(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    mode: Mode = Field(
        ...,
        description='span: wait out the declared simulation-time span. catchup: one query to the observation store, and no further query for the life of the process.',
    )
    span_seconds: float = Field(
        ...,
        description='The warm-up span in seconds of simulation time, and in catchup mode the span the single query covers.',
        gt=0.0,
    )
    catchup_sample_limit: int | None = Field(
        None,
        description='Bound on the rows the single catch-up query returns, so a restart cannot pull the store into memory.',
        ge=1,
    )


class Coverage(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    root_directory: str = Field(
        ..., description='Root of the coverage store.', min_length=1
    )
    current_pointer: str = Field(
        ...,
        description='Name of the text file in the root holding one run identifier on one line (ADR-0011). Two identifiers means two runs claim to be current, and the reader reports no current forecast rather than choosing one.',
        min_length=1,
    )
    runs_dirname: str = Field(
        ...,
        description='Name of the directory under the root holding the run directories. The pointer names a run, not a path, so the reader needs this to find it.',
        min_length=1,
    )
    forecast_file: str = Field(
        ...,
        description="Name of the forecast field inside a run's directory.",
        min_length=1,
    )


class Monitor(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    window: Window = Field(
        ...,
        description='Bounded in both simulation-time span and sample count, so it cannot grow with the length of the scenario. Eviction is by simulation time; the count bound is what holds the memory footprint at a high clock rate.',
        title='The rolling window',
    )
    residual: Residual = Field(
        ...,
        description='The residual is defined on sound speed, derived from the observed temperature, salinity and pressure by the single implementation in harness_core (ADR-0005). There is no threshold on temperature here, and there is not meant to be.',
        title='The residual and its threshold',
    )
    persistence: Persistence = Field(
        ...,
        description='Either rule may be satisfied. Both counts are at least two, because a single sample above threshold is an outlier and raising a run for it is the failure this component owns.',
        title='What makes a divergence rather than a spike',
    )
    warmup: Warmup = Field(
        ...,
        description='On start or restart the monitor has no window. It either observes a span of simulation time or issues exactly one catch-up query against the observation store, and publishes no divergence until that completes.',
        title='Starting and restarting',
    )
    coverage: Coverage = Field(
        ...,
        description='The monitor samples the forecast through the coverage read port, not through the query layer: it sits inside the boundary, and routing an internal consumer out through the external read path and back would claim a seam that is not there.',
        title='Reading the current forecast',
    )


class DrognaMonitorConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    monitor: Monitor = Field(..., title='Divergence monitoring')
