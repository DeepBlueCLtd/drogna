# DO NOT EDIT.
# Generated from contracts/schemas/config.model_runner.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from . import common


class Name(StrEnum):
    analytic = 'analytic'
    persistence = 'persistence'


class Kernel(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: Name = Field(
        ...,
        description="analytic advects the manifest's features by their recorded drift and adds seeded noise. persistence holds the initialisation state still, which is the reference a forecast has to beat and a second implementation proving the port is real.",
    )
    noise_temperature_c: float = Field(
        ...,
        description='Standard deviation of the seeded noise added to temperature, in degrees Celsius. Fake numerics, stated as such.',
        ge=0.0,
    )
    noise_salinity_psu: float = Field(
        ...,
        description='Standard deviation of the seeded noise added to salinity, in practical salinity units.',
        ge=0.0,
    )


class Ensemble(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_size: int = Field(
        ...,
        description='Largest ensemble this runner will accept. A request for more is refused rather than quietly truncated, because a spread over fewer members than were asked for is a different quantity.',
        ge=2,
    )
    perturbation_temperature_c: float = Field(
        ...,
        description="Spread of the members' perturbed initial temperature, in degrees Celsius.",
        ge=0.0,
    )
    perturbation_salinity_psu: float = Field(
        ...,
        description="Spread of the members' perturbed initial salinity, in practical salinity units.",
        ge=0.0,
    )
    perturbation_drift_fraction: float = Field(
        ...,
        description="Fractional spread applied to each feature's recorded drift velocity, which is what makes the members disagree more where a feature is moving.",
        ge=0.0,
        le=1.0,
    )


class Forecast(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    step_seconds: float = Field(
        ...,
        description='Spacing of the forecast time axis, in seconds of simulation time.',
        gt=0.0,
    )
    step_count: int = Field(
        ...,
        description='Number of forecast steps, the first being the initialisation instant.',
        ge=2,
    )


class GroundTruth(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class Staging(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    forecast_file: str = Field(..., min_length=1)
    uncertainty_file: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class StoredDtype(StrEnum):
    float32 = 'float32'
    float64 = 'float64'


class ModelRunner(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    kernel: Kernel = Field(
        ...,
        description='Initialisation state in, gridded field out. The name selects a registered implementation; nothing outside the runner knows which one ran except through ctl/run-started, which carries it.',
        title='The model kernel behind the port',
    )
    ensemble: Ensemble = Field(
        ...,
        description="One derived random stream per member, so a member's realisation is a function of the root seed and its ordinal and of nothing else.",
        title='Members and their perturbations',
    )
    forecast: Forecast = Field(
        ...,
        description="The run's spatial grid is the ground-truth manifest's grid; only the time axis is the run's own, because a forecast is initialised now and is valid forward.",
        title="The forecast's time axis",
    )
    ground_truth: GroundTruth = Field(
        ...,
        description="The environment generator's ground-truth manifest. The runner reads the recorded drift velocities from it and does not define them.",
        title='The seeded features to advect',
    )
    staging: Staging = Field(
        ...,
        description="The runner writes here and nowhere else. Nothing a reader can reach is touched by this component; making a run visible is the publisher's single operation.",
        title='Where a run is written while it is being written',
    )
    stored_dtype: StoredDtype = Field(
        ...,
        description='Width of the stored data variables. Byte-identity does not survive a silent change of precision, so it is stated and recorded.',
    )


class DrognaModelRunnerConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    model_runner: ModelRunner = Field(..., title='The run')
