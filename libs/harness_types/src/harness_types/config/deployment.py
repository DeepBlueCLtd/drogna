# DO NOT EDIT.
# Generated from contracts/schemas/config.deployment.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, RootModel

from . import common


class ActiveItem(RootModel[str]):
    root: str = Field(..., min_length=1)


class Profiles(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    active: list[ActiveItem] = Field(
        ...,
        description='Compose profiles started at this destination. A profile says what runs here today. It says nothing about which components the client shows as alive, which is decided by heartbeats alone.',
    )


class RestartPolicy(Enum):
    no = 'no'
    always = 'always'
    on_failure = 'on-failure'
    unless_stopped = 'unless-stopped'


class Healthcheck(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    interval: str = Field(..., min_length=1)
    timeout: str = Field(..., min_length=1)
    retries: int = Field(..., ge=1)
    start_period: str = Field(..., min_length=1)


class Runtime(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    restart_policy: RestartPolicy
    log_driver: str = Field(..., min_length=1)
    log_max_size: str = Field(..., min_length=1)
    log_max_files: str = Field(..., min_length=1)
    healthcheck: Healthcheck
    wait_timeout_seconds: int = Field(..., ge=1)


class ContainerPaths(RootModel[str]):
    root: str = Field(..., min_length=1)


class HostPaths(RootModel[str]):
    root: str = Field(..., min_length=1)


class Scheme(Enum):
    http = 'http'
    https = 'https'


class Tls(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    terminate: bool
    hostname: str


class Database(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: str = Field(..., min_length=1)
    user: str = Field(..., min_length=1)


class Seeding(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    record_filename: str = Field(..., min_length=1)
    artefact_dirname: str = Field(..., min_length=1)


class Port(RootModel[int]):
    root: int = Field(..., ge=1, le=65535)


class PublishedPort(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    bind: str = Field(..., min_length=1)
    host_port: Port
    container_port: Port


class ResourceLimit(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    memory: str = Field(..., min_length=1)
    cpus: str = Field(..., min_length=1)


class Network(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    publish: dict[str, PublishedPort] = Field(
        ...,
        description='One entry per service that publishes a port to the host. A service absent from this map publishes nothing and is reachable only on the internal network.',
        min_length=1,
    )


class PublicUrl(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    scheme: Scheme
    host: str = Field(..., min_length=1)
    port: Port
    base_path: str = Field(..., pattern='^/')


class DestinationDeploymentValues(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component = Field(
        ...,
        description='Component identity, taken from the shared definition so that the shape has one home. This file is read by the deployment scripts rather than by a running process, which is why it carries no clock, seed, broker or logging section.',
    )
    destination: str = Field(
        ...,
        description='Name of the destination, matching the directory this file sits in.',
        min_length=1,
    )
    project_name: str = Field(
        ...,
        description='Compose project name, and therefore the prefix of every container, network and volume the deployment creates.',
        min_length=1,
    )
    profiles: Profiles
    runtime: Runtime
    container_paths: dict[str, ContainerPaths] = Field(
        ...,
        description='Paths inside containers. Every one of these reaches an image as a build argument or an environment variable, never as a literal in a Dockerfile or in the Compose file.',
    )
    host_paths: dict[str, HostPaths] = Field(
        ...,
        description='Paths on the host, relative to the repository root. Absolute host paths are deliberately not accepted: they would tie a destination to one machine.',
    )
    network: Network
    public_url: PublicUrl = Field(
        ...,
        description='The address a person types to reach this destination. The run scripts print it; nothing in the stack resolves it.',
    )
    tls: Tls = Field(
        ...,
        description='Whether this destination terminates TLS, and at what name. The reverse proxy feature (C-10) consumes this; this feature only carries it.',
    )
    database: Database = Field(
        ...,
        description='Database name and role. The password is not here and never will be: it is generated into the untracked environment file at deploy time.',
    )
    resources: dict[str, ResourceLimit] = Field(
        ...,
        description="Memory and CPU ceilings. 'default' applies to every service; a key named for a service overrides it for that service.",
    )
    seeding: Seeding
