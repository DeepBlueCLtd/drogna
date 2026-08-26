# DO NOT EDIT.
# Generated from contracts/schemas/config.env_generator.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import IntEnum, StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel

from . import common


class Time(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    start_offset_seconds: float = Field(
        ...,
        description='Offset of the first time step from the simulation instant of generation, in seconds.',
    )
    step_seconds: float = Field(
        ...,
        description='Spacing of the time axis, in seconds of simulation time.',
        gt=0.0,
    )
    count: int = Field(
        ...,
        description='Number of time steps. At least two, or a drifting feature has nowhere to drift to.',
        ge=2,
    )


class StoredDtype(StrEnum):
    float32 = 'float32'
    float64 = 'float64'


class Background(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    surface_temperature_c: float
    deep_temperature_c: float
    temperature_scale_depth_m: float = Field(..., gt=0.0)
    surface_salinity_psu: float = Field(..., ge=0.0)
    deep_salinity_psu: float = Field(..., ge=0.0)
    salinity_scale_depth_m: float = Field(..., gt=0.0)


class Pressure(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    relation: Literal['linear-hydrostatic'] = Field(
        ...,
        description='The named relation. A second relation is a new name and a generator version bump, never a changed coefficient under the same name.',
    )
    dbar_per_metre: float = Field(..., gt=0.0)
    surface_dbar: float = Field(..., ge=0.0)


class Sign(IntEnum):
    integer__1 = -1
    integer_1 = 1


class Jitter(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_km: float = Field(..., ge=0.0)
    radius_fraction: float = Field(..., ge=0.0, le=1.0)
    strength_fraction: float = Field(..., ge=0.0, le=1.0)
    timescale_fraction: float = Field(..., ge=0.0, le=1.0)


class Jitter1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    anchor_km: float = Field(..., ge=0.0)
    bearing_degrees: float = Field(..., ge=0.0)
    sharpness_fraction: float = Field(..., ge=0.0, le=1.0)
    amplitude_fraction: float = Field(..., ge=0.0, le=1.0)
    timescale_fraction: float = Field(..., ge=0.0, le=1.0)


class Jitter2(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    depth_m: float = Field(..., ge=0.0)
    thickness_fraction: float = Field(..., ge=0.0, le=1.0)
    drop_fraction: float = Field(..., ge=0.0, le=1.0)
    timescale_fraction: float = Field(..., ge=0.0, le=1.0)


class Jitter3(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_km: float = Field(..., ge=0.0)
    radius_fraction: float = Field(..., ge=0.0, le=1.0)
    strength_fraction: float = Field(..., ge=0.0, le=1.0)
    drift_fraction: float = Field(..., ge=0.0, le=1.0)
    timescale_fraction: float = Field(..., ge=0.0, le=1.0)


class Output(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    field_file: str = Field(..., min_length=1)
    manifest_file: str = Field(..., min_length=1)


class Rng(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    stream: str = Field(
        ...,
        description='The named stream every draw in this component comes from, through harness_core.rng.rng_for.',
        pattern='^[a-z][a-z0-9_.-]*$',
    )


class SpatialAxis(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum: float
    maximum: float
    count: int = Field(..., ge=2)


class Bound(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum: float
    maximum: float


class FeatureId(RootModel[str]):
    root: str = Field(
        ...,
        description='Stable identifier for this feature, quoted by a recovery error so a figure can be attributed.',
        pattern='^[a-z][a-z0-9_-]*$',
    )


class TimescaleSeconds(RootModel[float]):
    root: float = Field(
        ...,
        description='A decorrelation timescale in seconds of simulation time.',
        gt=0.0,
    )


class Grid(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: SpatialAxis
    longitude: SpatialAxis
    depth: SpatialAxis
    time: Time


class Eddy(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: FeatureId
    centre_latitude: float = Field(..., ge=-90.0, le=90.0)
    centre_longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign = Field(
        ..., description='Minus one for a cold core, plus one for a warm core.'
    )
    depth_centre_m: float = Field(..., ge=0.0)
    depth_half_thickness_m: float = Field(..., gt=0.0)
    timescale_seconds: TimescaleSeconds
    jitter: Jitter = Field(
        ...,
        description='Amplitudes of the authored jitter drawn through the RNG port, in the order the keys are listed here. The jittered values are what the manifest records, so the manifest stays sufficient on its own.',
    )


class Front(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: FeatureId
    anchor_latitude: float = Field(..., ge=-90.0, le=90.0)
    anchor_longitude: float = Field(..., ge=-180.0, le=180.0)
    bearing_degrees: float = Field(..., ge=0.0, le=360.0)
    sharpness_km: float = Field(
        ...,
        description="Half-width of the transition. The manifest records its ratio to the horizontal grid spacing, so an under-resolved front's recovery error can be interpreted rather than merely reported.",
        gt=0.0,
    )
    amplitude_c: float = Field(..., gt=0.0)
    salinity_amplitude_psu: float
    depth_scale_m: float = Field(..., gt=0.0)
    timescale_seconds: TimescaleSeconds
    jitter: Jitter1


class Thermocline(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: FeatureId
    depth_m: float = Field(..., ge=0.0)
    thickness_m: float = Field(..., gt=0.0)
    temperature_drop_c: float = Field(..., gt=0.0)
    salinity_rise_psu: float
    timescale_seconds: TimescaleSeconds
    jitter: Jitter2


class Moving(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: FeatureId
    centre_latitude: float = Field(..., ge=-90.0, le=90.0)
    centre_longitude: float = Field(..., ge=-180.0, le=180.0)
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign
    depth_centre_m: float = Field(..., ge=0.0)
    depth_half_thickness_m: float = Field(..., gt=0.0)
    drift_east_km_per_day: float = Field(
        ...,
        description='Eastward component of the drift velocity. Its position at any time is analytic, so it need not be stepped through the field.',
    )
    drift_north_km_per_day: float
    timescale_seconds: TimescaleSeconds
    jitter: Jitter3


class Features(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    eddy: Eddy
    front: Front
    thermocline: Thermocline
    moving: Moving


class Timescale(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    background_seconds: TimescaleSeconds = Field(
        ...,
        description='The timescale of water no feature overlaps. Ground truth, and recorded in the manifest.',
    )
    blending_rule: Literal['additive-rate-blend-normalised'] = Field(
        ...,
        description="How a feature's timescale combines with the background. Named rather than assumed, because ADR-0002 leaves the choice open and two features may overlap.",
    )
    floor_ratio: float = Field(
        ...,
        description='Smallest permitted ratio of any authored timescale to the time step. A timescale the time axis cannot express would silently mislead the revisit cadence of FR-08, so the generator refuses rather than writing it.',
        gt=0.0,
    )


class Bounds(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    temperature_c: Bound
    salinity_psu: Bound
    pressure_dbar: Bound


class EnvGenerator(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    grid: Grid = Field(
        ...,
        description="Latitude, longitude and depth are given as extent and count so that spacing is exact rather than accumulated. Time is given as an offset from the simulation instant of generation, a step and a count, because the generator has no origin of its own: its time origin is the clock's.",
        title='The four axes',
    )
    stored_dtype: StoredDtype = Field(
        ...,
        description="Width of the stored data variables. Recorded in the manifest and used to derive the evaluator's agreement tolerance, because byte-identity does not survive a silent change of precision.",
    )
    background: Background = Field(
        ...,
        description='The base state on which every feature is composed: exponential relaxation from a surface value to a deep value with depth, for temperature and for salinity independently.',
        title='Background stratification',
    )
    pressure: Pressure = Field(
        ...,
        description='Pressure is derived from depth rather than generated independently. An independent pressure would be unphysical and would make the sound speed derivation meaningless.',
        title='Pressure from depth',
    )
    features: Features = Field(
        ...,
        description='Exactly four kinds, because SRD FR-03 names exactly four. Each carries its own decorrelation timescale, which is authored here and evaluated as a field.',
        title='The four seeded features',
    )
    timescale: Timescale = Field(
        ...,
        description='ADR-0002: the timescale is a field, authored per feature over a domain-wide background and evaluated per location. Quiet water has a timescale because FR-08 requires quiet water to be left alone, and the planner scores every cell.',
        title='The decorrelation timescale field',
    )
    bounds: Bounds = Field(
        ...,
        description='The composed field is checked against these before anything is written. An unphysical world written quietly is worse than a refusal.',
        title='Physical bounds',
    )
    output: Output = Field(
        ...,
        description="Names come from configuration and are echoed into the manifest, so the coverage store's cataloguing convention can be applied without the generator knowing it.",
        title='Where the field and its manifest go',
    )
    rng: Rng = Field(..., title='Randomness')


class DrognaEnvironmentGeneratorConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    env_generator: EnvGenerator = Field(..., title='The generated world')
