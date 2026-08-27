# DO NOT EDIT.
# Generated from contracts/schemas/config.features.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, RootModel

from . import common


class RuntimeRole(RootModel[str]):
    root: str = Field(..., pattern='^[a-z][a-z0-9_]*$')


class Tables(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    bathymetry: str = Field(..., pattern='^[a-z][a-z0-9_]*$')
    coastline: str = Field(..., pattern='^[a-z][a-z0-9_]*$')


class Store(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dsn: str = Field(
        ...,
        description='Connection string for the provisioning role, which is the only role that may write here and only while the scenario is not running.',
    )
    schema_: str = Field(
        ...,
        alias='schema',
        description='The schema provisioned. features, beside observations in the same instance.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    provisioning_role: str = Field(
        ...,
        description='The role the script connects as. It holds write permission; nothing running during a scenario does.',
        pattern='^[a-z][a-z0-9_]*$',
    )
    runtime_roles: list[RuntimeRole] = Field(
        ...,
        description='Every role a running scenario connects with. Each is granted select and nothing else, and the script asserts that after applying the grants, so a drifted grant fails the run rather than being found later.',
    )
    tables: Tables = Field(..., title='Table names')


class Bathymetry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude_count: int = Field(..., description='Rows in the depth grid.', ge=2)
    longitude_count: int = Field(..., description='Columns in the depth grid.', ge=2)
    shallow_depth_m: float = Field(
        ..., description='Depth at the shallow edge of the shelf, in metres.', ge=0.0
    )
    deep_depth_m: float = Field(
        ...,
        description='Depth at the deep edge, in metres. The slope between the two is smooth and the seeded roughness is added to it.',
        gt=0.0,
    )
    roughness_m: float = Field(
        ...,
        description='One standard deviation of the seeded variation added to the smooth slope, in metres.',
        ge=0.0,
    )


class Coastline(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    vertex_count: int = Field(..., description='Vertices in the line.', ge=2)
    variation_degrees: float = Field(
        ...,
        description='One standard deviation of the seeded wander of the line, in degrees.',
        ge=0.0,
    )


class Extent(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum: float
    maximum: float


class Domain(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    latitude: Extent
    longitude: Extent


class Features(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    store: Store = Field(
        ...,
        description="The second schema in the observation store's Postgres instance. Two schemas in one instance, mirroring the conceptual split without doubling the operational surface (SRD FR-12).",
        title='The feature store',
    )
    domain: Domain = Field(
        ...,
        description='The same extent the generated environment occupies, so the client and the planner have reference data everywhere they have a field.',
        title='The domain the reference covers',
    )
    bathymetry: Bathymetry = Field(
        ...,
        description='A grid of depths produced from the root seed. It is not a survey of anywhere: the numerics are deliberately fake and the shape is whatever the seeded parameters make it.',
        title='Synthetic bathymetry',
    )
    coastline: Coastline = Field(
        ...,
        description='One line along the shallow edge of the domain, with seeded variation. A boundary to draw against, not a chart of anywhere.',
        title='Synthetic coastline',
    )


class DrognaFeatureStoreProvisioningConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    features: Features = Field(..., title='Static spatial reference')
