# DO NOT EDIT.
# Generated from contracts/schemas/config.telemetry.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Regions(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    origin_latitude: float = Field(
        ...,
        description="Latitude of the grid's south-west corner, where row zero begins.",
        ge=-90.0,
        le=90.0,
    )
    origin_longitude: float = Field(
        ...,
        description="Longitude of the grid's south-west corner, where column zero begins.",
        ge=-180.0,
        le=180.0,
    )
    cell_latitude_degrees: float = Field(
        ..., description='Cell height in degrees of latitude.', gt=0.0
    )
    cell_longitude_degrees: float = Field(
        ..., description='Cell width in degrees of longitude.', gt=0.0
    )
    rows: int = Field(
        ...,
        description='Number of cells northwards from the origin. Rows times columns is the hard bound on region-level scopes.',
        ge=1,
    )
    columns: int = Field(
        ..., description='Number of cells eastwards from the origin.', ge=1
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
        description='Name of the directory under the root holding the run directories. The pointer names a run, not a path.',
        min_length=1,
    )
    forecast_file: str = Field(
        ...,
        description="Name of the forecast field inside a run's directory.",
        min_length=1,
    )


class Telemetry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    publication_interval_seconds: float = Field(
        ...,
        description='How often statistics and skill are published, in seconds of simulation time. In simulation time deliberately: under clock acceleration the residual arrival rate rises but the interval does not shorten, so what grows is the number of samples per message rather than the number of messages per second.',
        gt=0.0,
    )
    minimum_sample_count: int = Field(
        ...,
        description='The count below which a scope reports insufficient-samples and publishes no skill score at all. No default score, no zero, no carried-forward previous value (Constitution IX).',
        ge=1,
    )
    staleness_window_seconds: float = Field(
        ...,
        description='How long a statistic may go without a real update before it is published as stale, in seconds of simulation time. Simulation time so that a paused clock does not age a statistic that nothing has stopped feeding.',
        gt=0.0,
    )
    regions: Regions = Field(
        ...,
        description='A fixed grid of cells, so that the number of region-level scopes a run can hold is decided before it starts. A grid that grew a cell whenever a sample arrived somewhere new would make memory a function of where the platform went, which is the unbounded growth FR-003 forbids. A residual outside the grid is counted at scenario level and nowhere else.',
        title='The region grid',
    )
    coverage: Coverage = Field(
        ...,
        description='Telemetry reads published forecast fields through the coverage read port, not through the query layer: it sits inside the boundary SRD 2.2 draws, and routing an internal consumer out through the external read path and back would claim a seam that is not there. The names below are the same ones the monitor is given, because both are reading one store.',
        title='Reading the persistence reference',
    )


class DrognaTelemetryConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    telemetry: Telemetry = Field(..., title='Reporting')
