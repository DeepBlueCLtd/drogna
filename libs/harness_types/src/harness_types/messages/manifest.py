# DO NOT EDIT.
# Generated from contracts/schemas/manifest.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import IntEnum, StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Generator(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    version: str = Field(
        ...,
        description='Generator version, in the sense of the code that wrote this document.',
        pattern='^[0-9]+\\.[0-9]+\\.[0-9]+$',
    )
    analytic_form_version: int = Field(
        ...,
        description='Version of the analytic form itself. A reader that understands this number can reconstruct the field; a reader that does not must refuse rather than guess.',
        ge=1,
    )


class Derivation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(..., min_length=1)
    version: int = Field(..., ge=1)


class DrawOrderItem(RootModel[str]):
    root: str = Field(..., min_length=1)


class Seed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    root: int = Field(..., ge=0)
    stream: str = Field(..., min_length=1)
    derived_entropy: str = Field(
        ...,
        description="The stream's derived entropy in hexadecimal, so a reader can rebuild the sequence without repeating the derivation by hand.",
        pattern='^[0-9a-f]+$',
    )
    derivation: Derivation
    draw_order: list[DrawOrderItem] = Field(
        ...,
        description='The names of the draws, in the exact order they were taken. Order is load-bearing: reordering it changes every world without changing any parameter.',
    )


class GeneratedAt(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    sim_time: str = Field(..., min_length=1)
    tick: int = Field(..., ge=0)


class Time(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    origin_sim_time: str = Field(..., min_length=1)
    start_offset_seconds: float
    step_seconds: float = Field(..., gt=0.0)
    count: int = Field(..., ge=2)
    units: str = Field(..., min_length=1)


class Dtype(StrEnum):
    float32 = 'float32'
    float64 = 'float64'


class Variable(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    standard_name: str | None = Field(
        ...,
        description='The CF standard name, or null where CF has none. Null is stated rather than invented: a standard name that is not in the table is a claim the vocabulary does not support.',
    )
    long_name: str = Field(..., min_length=1)
    units: str = Field(..., min_length=1)
    dtype: Dtype
    tolerance_absolute: float = Field(
        ...,
        description="Derived from the stored width at this variable's largest magnitude, not chosen. It is the threshold a comparison against the stored field is entitled to use.",
        ge=0.0,
    )


class Parameters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    surface_temperature_c: float
    deep_temperature_c: float
    temperature_scale_depth_m: float
    surface_salinity_psu: float
    deep_salinity_psu: float
    salinity_scale_depth_m: float


class Background(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    parameters: Parameters


class PressureRelation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    expression: str = Field(..., min_length=1)
    dbar_per_metre: float
    surface_dbar: float


class Validity(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    min_temperature_c: float
    max_temperature_c: float
    min_salinity_psu: float
    max_salinity_psu: float
    min_depth_m: float
    max_depth_m: float


class FirstPoint(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: float
    longitude: float
    depth_m: float
    time_seconds: float


class OutsideValidity(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    count: int = Field(..., ge=0)
    first_point: FirstPoint | None


class SoundSpeed(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    method: str = Field(..., min_length=1)
    implementation: str = Field(
        ...,
        description='The single implementation in drogna, by module name. A second implementation would make a recovery error partly an artefact of the disagreement between copies.',
        min_length=1,
    )
    validity: Validity
    outside_validity: OutsideValidity = Field(
        ...,
        description='Where the equation was used outside its stated range, and how often. The numerics are deliberately fake, but the fact of being used outside range must not be invisible.',
    )


class Composition(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class BlendingRule(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    version: int = Field(..., ge=1)
    description: str = Field(..., min_length=1)
    parameters: dict[str, Any]


class Membership(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    rule: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)


class Timescale(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    background_seconds: float = Field(..., gt=0.0)
    background_to_time_step_ratio: float = Field(..., gt=0.0)
    floor_ratio: float = Field(
        ...,
        description='The configured floor every ratio in this document was checked against.',
        gt=0.0,
    )
    blending_rule: BlendingRule = Field(
        ...,
        description='ADR-0002 leaves the blending rule open and requires it to be named here, because two features may overlap and the answer where they do is a modelling choice rather than a fact.',
    )
    membership: Membership = Field(
        ...,
        description="How a feature's weight at a location is obtained. It shares the anomaly's geometry so that a timescale and the anomaly it belongs to cannot drift apart.",
    )


class FieldModel(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    format: str = Field(..., min_length=1)
    sha256: str = Field(..., pattern='^sha256:[0-9a-f]{64}$')


class Manifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    format: str = Field(..., min_length=1)


class Outputs(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    field: FieldModel
    manifest: Manifest = Field(
        ...,
        description='This document. It carries no digest of itself, which it could not compute without changing.',
    )


class Treatment(StrEnum):
    omitted = 'omitted'
    fixed = 'fixed'


class NormalisedAttribute(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    treatment: Treatment
    reason: str = Field(..., min_length=1)


class StoredDtype(StrEnum):
    float32 = 'float32'
    float64 = 'float64'


class Tolerance(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    basis: str = Field(..., min_length=1)
    stored_dtype: StoredDtype
    description: str = Field(..., min_length=1)


class Direction(StrEnum):
    north = 'north'
    east = 'east'
    down = 'down'


class SpatialAxis(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum: float
    maximum: float
    count: int = Field(..., ge=2)
    spacing: float
    units: str = Field(..., min_length=1)
    direction: Direction = Field(
        ...,
        description='Which way the axis increases. The vertical says down, because a field that leaves it implicit will be read upside down by somebody.',
    )


class Resolution(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    scale: float = Field(..., gt=0.0)
    scale_units: str = Field(..., min_length=1)
    grid_spacing: float = Field(..., gt=0.0)
    ratio: float = Field(..., gt=0.0)


class Kind(StrEnum):
    eddy = 'eddy'
    front = 'front'
    thermocline = 'thermocline'
    moving = 'moving'


class Sign(IntEnum):
    integer__1 = -1
    integer_1 = 1


class Parameters1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_latitude: float
    centre_longitude: float
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign
    depth_centre_m: float
    depth_half_thickness_m: float = Field(..., gt=0.0)


class Feature1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')
    kind: Literal['eddy']
    timescale_seconds: float = Field(
        ...,
        description="This feature's authored decorrelation timescale. Ground truth, and scorable.",
        gt=0.0,
    )
    timescale_to_time_step_ratio: float = Field(
        ...,
        description='Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing.',
        gt=0.0,
    )
    resolution: Resolution
    parameters: Parameters1


class Parameters2(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    anchor_latitude: float
    anchor_longitude: float
    bearing_degrees: float
    sharpness_km: float = Field(..., gt=0.0)
    amplitude_c: float = Field(..., gt=0.0)
    salinity_amplitude_psu: float
    depth_scale_m: float = Field(..., gt=0.0)


class Feature2(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')
    kind: Literal['front']
    timescale_seconds: float = Field(
        ...,
        description="This feature's authored decorrelation timescale. Ground truth, and scorable.",
        gt=0.0,
    )
    timescale_to_time_step_ratio: float = Field(
        ...,
        description='Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing.',
        gt=0.0,
    )
    resolution: Resolution
    parameters: Parameters2


class Parameters3(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    depth_m: float
    thickness_m: float = Field(..., gt=0.0)
    temperature_drop_c: float = Field(..., gt=0.0)
    salinity_rise_psu: float


class Feature3(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')
    kind: Literal['thermocline']
    timescale_seconds: float = Field(
        ...,
        description="This feature's authored decorrelation timescale. Ground truth, and scorable.",
        gt=0.0,
    )
    timescale_to_time_step_ratio: float = Field(
        ...,
        description='Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing.',
        gt=0.0,
    )
    resolution: Resolution
    parameters: Parameters3


class Parameters4(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_latitude: float
    centre_longitude: float
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign
    depth_centre_m: float
    depth_half_thickness_m: float = Field(..., gt=0.0)
    drift_east_km_per_day: float
    drift_north_km_per_day: float
    reference_latitude: float = Field(
        ...,
        description='The latitude the local plane is built about, so the advection is an exact affine map rather than an approximation that depends on where it is evaluated.',
    )


class Feature4(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(..., pattern='^[a-z][a-z0-9_-]*$')
    kind: Literal['moving']
    timescale_seconds: float = Field(
        ...,
        description="This feature's authored decorrelation timescale. Ground truth, and scorable.",
        gt=0.0,
    )
    timescale_to_time_step_ratio: float = Field(
        ...,
        description='Recorded whether or not it passed the floor, because a ratio close to the floor is worth seeing.',
        gt=0.0,
    )
    resolution: Resolution
    parameters: Parameters4 = Field(
        ...,
        description='The initial centre is the position at the time origin. Its position at any other time is that centre plus the drift velocity times the elapsed simulation time, computed about reference_latitude, so no consumer needs to step through the field to find it.',
    )


class Feature(RootModel[Feature1 | Feature2 | Feature3 | Feature4]):
    root: Feature1 | Feature2 | Feature3 | Feature4


class EddyParameters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_latitude: float
    centre_longitude: float
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign
    depth_centre_m: float
    depth_half_thickness_m: float = Field(..., gt=0.0)


class FrontParameters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    anchor_latitude: float
    anchor_longitude: float
    bearing_degrees: float
    sharpness_km: float = Field(..., gt=0.0)
    amplitude_c: float = Field(..., gt=0.0)
    salinity_amplitude_psu: float
    depth_scale_m: float = Field(..., gt=0.0)


class ThermoclineParameters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    depth_m: float
    thickness_m: float = Field(..., gt=0.0)
    temperature_drop_c: float = Field(..., gt=0.0)
    salinity_rise_psu: float


class MovingParameters(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    centre_latitude: float
    centre_longitude: float
    radius_km: float = Field(..., gt=0.0)
    strength_c: float = Field(..., gt=0.0)
    salinity_strength_psu: float
    sign: Sign
    depth_centre_m: float
    depth_half_thickness_m: float = Field(..., gt=0.0)
    drift_east_km_per_day: float
    drift_north_km_per_day: float
    reference_latitude: float = Field(
        ...,
        description='The latitude the local plane is built about, so the advection is an exact affine map rather than an approximation that depends on where it is evaluated.',
    )


class Grid(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: SpatialAxis
    longitude: SpatialAxis
    depth: SpatialAxis = Field(
        ...,
        description='Depth increases downwards, as CF requires it to say explicitly.',
    )
    time: Time = Field(
        ...,
        description='The time axis is offsets in seconds from an origin in simulation time. The evaluator takes seconds from that origin, so a point between two steps is as evaluable as one on them.',
    )


class DrognaGroundTruthManifest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    schema_version: Literal[1] = Field(
        ..., description='Bumped when the shape changes in a way a reader must notice.'
    )
    generator: Generator = Field(
        ...,
        description='Which generator, and which analytic form. Any change to the analytic form is a version bump here, so a manifest never describes a field it could not have produced.',
    )
    run_id: str = Field(
        ...,
        description='The run this field belongs to, as recorded in the run manifest.',
        pattern='^[a-z0-9][a-z0-9_-]*$',
    )
    config_digest: str = Field(
        ...,
        description='Digest of the configuration that produced the field. A digest and never values, so publishing a manifest cannot leak what a config file happens to carry.',
        pattern='^sha256:[0-9a-f]{64}$',
    )
    seed: Seed = Field(
        ...,
        description='Where every stochastic value came from. Randomness enters only as authored jitter on feature parameters; the jittered values are what this document records, which is why it stays sufficient on its own.',
    )
    generated_at: GeneratedAt = Field(
        ...,
        description='Simulation time, taken from the clock port. There is no host time anywhere in this document.',
    )
    grid: Grid
    variables: list[Variable] = Field(
        ...,
        description='What the field carries, with the units and standard names a consumer reads it by, and the absolute tolerance within which the evaluator agrees with the stored value.',
        min_length=1,
    )
    background: Background = Field(
        ..., description='The base state on which every feature is composed.'
    )
    pressure_relation: PressureRelation = Field(
        ...,
        description='Pressure is derived from depth, never generated beside it. A pressure generated independently of depth would be unphysical and would make the sound speed derivation meaningless.',
    )
    sound_speed: SoundSpeed = Field(
        ...,
        description='ADR-0005: sound speed is derived at the point of use by one implementation, named here so a residual computed elsewhere can say which equation produced it.',
    )
    composition: Composition = Field(
        ...,
        description="How features reach the background. Stated as a rule so the field is reproducible from this document's parameters alone.",
    )
    features: list[Feature] = Field(
        ...,
        description='The four seeded features of SRD FR-03, with the parameters that produced them after jitter. These are the ground truth a recovery error is measured against.',
        max_length=4,
        min_length=4,
    )
    timescale: Timescale = Field(
        ...,
        description='ADR-0002. The timescale is a field: authored per feature over this background, evaluated per location, and advected with the feature that moves. Both the background and the per-feature values are ground truth.',
    )
    outputs: Outputs = Field(
        ...,
        description='What was written, by the names configuration gave them, so a cataloguing convention can be applied without the generator knowing it.',
    )
    normalised_attributes: list[NormalisedAttribute] = Field(
        ...,
        description='The file attributes fixed or omitted so that two runs with one seed are byte-identical. Declared, because a comparison that silently skipped them would be proving less than it claims.',
    )
    tolerance: Tolerance = Field(
        ...,
        description='Why the per-variable tolerances above are what they are. Derived from the stored width, so a comparison has a stated threshold rather than a chosen one.',
    )
