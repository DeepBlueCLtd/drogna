# DO NOT EDIT.
# Generated from contracts/schemas/config.offload.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import AnyUrl, BaseModel, ConfigDict, Field, RootModel

from . import common


class Source(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    observations_file: str = Field(..., min_length=1)
    run_manifest_file: str = Field(..., min_length=1)


class Staging(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    bundle_suffix: str = Field(
        ...,
        description='Appended to the bundle identifier to name the NetCDF file.',
        min_length=1,
    )
    manifest_suffix: str = Field(
        ...,
        description='Appended to the bundle identifier to name the sidecar manifest.',
        min_length=1,
    )
    run_manifest_suffix: str = Field(
        ...,
        description="Appended to the bundle identifier to name the run-manifest sibling: the copy of the run manifest, carrying the window's measurement geometry, that travels beside a bundle and is never a member of it. The sidecar names the sibling without membership; the leakage gate's updated-region half is the consumer (FR-015, FR-42).",
        min_length=1,
    )
    partial_suffix: str = Field(
        ...,
        description='Appended while a file is being written, so a half-written bundle can never be mistaken for a staged one.',
        min_length=1,
    )


class Release(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    path_prefix: str = Field(..., min_length=1)
    directory: str = Field(..., min_length=1)


class Ledger(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    directory: str = Field(..., min_length=1)
    file: str = Field(..., min_length=1)


class Routes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    upload: str = Field(..., min_length=1)
    commit: str = Field(..., min_length=1)
    receipt: str = Field(..., min_length=1)


class Destination(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str = Field(
        ...,
        description="The destination's identifier, as it appears in every receipt.",
        pattern='^[a-z][a-z0-9_-]*$',
    )
    endpoint: AnyUrl
    routes: Routes = Field(
        ...,
        description='Routes relative to the endpoint. Upload writes under a temporary name, commit makes the object visible atomically, and receipt asks the destination what it holds.',
    )
    timeout_seconds: float = Field(
        ...,
        description='Socket timeout for a transfer. A transport parameter, not simulation time.',
        gt=0.0,
    )


class Retention(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_staging_bytes: int = Field(
        ...,
        description='Bytes the staging area may hold before eviction is asked for.',
        ge=1,
    )
    maximum_age_simulation_seconds: float = Field(
        ...,
        description='Age, in seconds of simulation time, past which a verified bundle may be evicted. Simulation time, because every interval in this component except heartbeat cadence is measured on the clock port.',
        gt=0.0,
    )


class AllowlistItem(RootModel[str]):
    root: str = Field(..., pattern='^[A-Za-z][A-Za-z0-9_]*$')


class Attributes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    allowlist: list[AllowlistItem] = Field(
        ...,
        description='Every attribute name the export may carry, global or per variable. Read as a set, so a repeated entry is the same permission twice and an empty list permits nothing — which is a coherent configuration and not a special case: the writer refuses the first attribute it is asked to write and the component produces no bundle. Neither minItems nor uniqueItems is declared here, deliberately: the destination configuration check runs under the system Python with no jsonschema available and its fallback validator refuses a keyword it cannot implement rather than skipping it, so a constraint that would not be checked at the destination is stated in the description and tested in the component instead of being declared where nothing enforces it.',
    )


class ConventionVersion(StrEnum):
    CF_1_10 = 'CF-1.10'


class Compliance(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    convention_version: ConventionVersion = Field(
        ...,
        description='Pinned deliberately: a claim of conformance without a version is a claim about nothing.',
    )


class Window(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    length_simulation_seconds: float = Field(
        ...,
        description="The simulation-time span one bundle covers. Window boundaries are counted from the run's simulation epoch, so a bundle's logical position is a function of the manifest and not of when the packager happened to run.",
        gt=0.0,
    )


class Export(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    window: Window
    identification_radius_m: float = Field(
        ...,
        description="The identification radius the run is released under, written into the measurement geometry of the run-manifest sibling. The run-manifest master requires the radius to travel with the geometry rather than be read from a deployment's policy later, so the packager declares its own value — and a parity test holds it equal to the proxy's declared identification_radius_m at the same destination, because a run scored on a radius it was not released under is scored on nothing.",
        gt=0.0,
    )


class Offload(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    source: Source = Field(
        ...,
        description="A run's observations as recorded, one JSON document per line in the observation vocabulary, beside the run manifest that names the run's identity and its simulation epoch. The packager reads these and writes nothing here.",
        title='The recorded run a bundle is packaged from',
    )
    staging: Staging = Field(
        ...,
        description='Where bundles are written, transferred from and eventually evicted. A bundle exists here and nowhere else until a receipt justifies its removal, so this is the only area the eviction path may delete from.',
        title='The offload staging area',
    )
    release: Release = Field(
        ...,
        description='The one path prefix the reverse proxy releases, and the area it serves. The packager does not serve anything; it is declared here so the component can refuse to start when its staging area sits inside the released area, rather than discovering it when a bundle appears on the public side (FR-41, FR-42).',
        title='The released surface this component stays out of',
    )
    ledger: Ledger = Field(
        ...,
        description='Append-only, one record per line, flushed and synced before the side effect it describes happens. The filesystem is not the source of truth; this is.',
        title="The durable record of every bundle's state",
    )
    destination: Destination = Field(
        ...,
        description='One destination, identified so that a receipt carrying a different identifier is refused. The transport is not dressed as a port: there is one implementation, and a second would need an ADR under Constitution VI.',
        title='Where a bundle is sent',
    )
    retention: Retention = Field(
        ...,
        description='A receipt makes a bundle eligible for eviction. This asks for the space. Both bounds are examined every cycle and the oldest eligible bundle goes first.',
        title='The only thing that causes an eviction',
    )
    attributes: Attributes = Field(
        ...,
        description='The allow-list applied at write time. An attribute not named here cannot be written, which is what makes the omissions decisions rather than oversights (FR-42).',
        title='What an exported file is allowed to say',
    )
    compliance: Compliance = Field(
        ..., title='The convention version the export is checked against'
    )
    export: Export = Field(..., title='How a run is divided into bundles')


class DrognaOffloadPackagerConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock
    seed: common.Seed
    broker: common.Broker | None = None
    logging: common.Logging
    offload: Offload = Field(
        ...,
        description='The whole of what this component does, in the order it does it.',
        title='Packaging, transfer, verification and eviction',
    )
