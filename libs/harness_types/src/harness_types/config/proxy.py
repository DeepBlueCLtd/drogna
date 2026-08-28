# DO NOT EDIT.
# Generated from contracts/schemas/config.proxy.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import AnyUrl, BaseModel, ConfigDict, Field, RootModel

from . import common


class Listen(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    host: str = Field(
        ..., description='Address to bind, container-internal.', min_length=1
    )
    port: int = Field(..., ge=1, le=65535)
    server_name: str = Field(
        ...,
        description="The name this deployment answers to. An underscore is nginx's catch-all and is what a destination with no hostname uses.",
        min_length=1,
    )


class Protocol(RootModel[str]):
    root: str = Field(..., min_length=1)


class Tls(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    enabled: bool = Field(
        ...,
        description='Whether this destination terminates TLS. The locations below are declared whatever the answer, because a destination differs from another in its values and never in its keys.',
    )
    certificate: str = Field(..., min_length=1)
    key: str = Field(..., min_length=1)
    protocols: list[Protocol] = Field(
        ...,
        description='Protocol versions offered. A list rather than a constant because deprecating one is a configuration change.',
    )


class Credentials(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    realm: str = Field(
        ...,
        description='The challenge realm. It is shown to a human and must name nothing about what is behind it.',
        min_length=1,
    )
    file: str = Field(
        ...,
        description='Location of the credential file the proxy reads. Untracked, produced at deploy time.',
        min_length=1,
    )
    user: str = Field(
        ...,
        description='The identity a reader authenticates as. Tracked, because a name is not a secret; the secret is generated at deploy time and reaches the credential file alone.',
        min_length=1,
    )


class Page(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(
        ..., description="Base URL of the client's server on the internal network."
    )


class Query(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(..., description='Base URL of the query layer.')
    collection_path: str = Field(
        ...,
        description="The query layer's own path under which one collection lives, with no trailing slash. A released collection identifier is appended to it. This is the native path FR-002 refuses to expose, named here so that the released prefix can be mapped onto it.",
        min_length=1,
    )


class ControlWebsocket(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(..., description="Base URL of the broker's WebSocket listener.")
    path: str = Field(
        ...,
        description='The path on that listener the upgrade is proxied to.',
        min_length=1,
    )


class Upstream(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    page: Page | None = Field(
        None,
        description='Where the page is proxied from, where the destination serves one through the boundary (see proxy.page). Declared beside the other upstreams so that everything the rendered configuration can reach is declared in one section.',
        title="The client's server (C-18)",
    )
    query: Query = Field(..., title='The query layer (C-09)')
    control_websocket: ControlWebsocket = Field(
        ...,
        description='The far end of ADR-0008. The listener is deliberately unpublished, so this upgrade location is the only way a browser reaches the control namespace.',
        title="The broker's WebSocket listener (C-03)",
    )


class Collection(RootModel[str]):
    root: str = Field(
        ...,
        description='One collection identifier, matched whole. A released identifier that is a string prefix of an unreleased one does not admit it.',
        pattern='^[a-z0-9][a-z0-9_-]*$',
    )


class Variable(RootModel[str]):
    root: str = Field(..., min_length=1)


class Released(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    prefix: str = Field(
        ...,
        description='The one path prefix beneath which released collections are reachable. A single leading-slash segment.',
        pattern='^/[a-z0-9][a-z0-9-]*$',
    )
    collections: list[Collection] = Field(
        ...,
        description='Released collection identifiers. The key is required, so an absent list is a startup failure rather than a silent empty release; the list being non-empty is refused by the renderer instead of here, because the destination validator that runs on a machine with nothing but a container runtime implements no array-length keyword and refuses a schema that uses one rather than ignoring it.',
    )
    variables: list[Variable] = Field(
        ...,
        description='The variables a released artefact may carry (FR-014). A variable driven by observation age is absent from this list by design: an age field is a map of measurement locations, and tests/leakage/test_updated_region.py is what holds that in place.',
    )


class Path(RootModel[str]):
    root: str = Field(..., pattern='^/[A-Za-z0-9._-]*$')


class Prefix(RootModel[str]):
    root: str = Field(..., pattern='^/[a-z0-9][a-z0-9_-]*$')


class Page1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    paths: list[Path] = Field(
        ...,
        description='The exactly-matched document paths the page needs: the root, the entry document, the served configuration. Each is one absolute path admitted whole and alone.',
    )
    prefixes: list[Prefix] = Field(
        ...,
        description='The asset directories the build writes into, admitted as inspected subtrees the way a released collection is. A single leading-slash segment each; the bare prefix itself names a directory, not a document, and stays refused.',
    )


class Control(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    upgrade_prefix: str = Field(
        ...,
        description='The dedicated path prefix carrying the upgrade. Distinct from the released prefix so that neither can widen the other.',
        pattern='^/[a-z0-9][a-z0-9-]*$',
    )
    read_timeout_seconds: int = Field(
        ...,
        description='How long an idle upgraded connection is held open. A socket parameter: the control namespace is quiet between heartbeats and a short timeout would close a healthy subscription.',
        gt=0,
    )
    subprotocol: str | None = Field(
        None,
        description='The WebSocket subprotocol offered upstream, where the deployment pins one.',
        min_length=1,
    )


class Health(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    port: int = Field(..., ge=1, le=65535)
    path: str = Field(..., pattern='^/[a-z0-9][a-z0-9/-]*$')


class Rendered(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    output: str = Field(..., min_length=1)


class ErrorLevel(StrEnum):
    debug = 'debug'
    info = 'info'
    notice = 'notice'
    warn = 'warn'
    error = 'error'
    crit = 'crit'
    alert = 'alert'
    emerg = 'emerg'


class Logs(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    access: str = Field(..., min_length=1)
    error: str = Field(..., min_length=1)
    error_level: ErrorLevel


class Proxy(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    listen: Listen = Field(
        ...,
        description='The one socket a caller can reach. Everything answered on it is either a released location or the refusal.',
        title='The published listener',
    )
    tls: Tls = Field(
        ...,
        description='Certificate and key locations, provisioned by the deployment (NFR-06) and only consumed here. Termination is off at a destination that has no certificate, which is the local one; a destination that terminates and has no material is a render failure rather than a listener that quietly serves plaintext.',
        title='TLS termination',
    )
    credentials: Credentials = Field(
        ...,
        description='Binary access, per ADR-0001: a caller holds this credential set or holds nothing. The file is produced at deploy time and is never tracked. There is no user model here because there is nothing for one to express.',
        title='The single clearance',
    )
    upstream: Upstream = Field(
        ...,
        description='The upstreams this proxy is willing to reach, each by service name on the internal network. None is published to a host: reaching them is what the proxy is for. An upstream declared here and routed to nowhere is inert; every host named here must resolve where the proxy starts, because nginx resolves proxy_pass hosts at startup and refuses to start otherwise.',
        title='What sits behind the boundary',
    )
    released: Released = Field(
        ...,
        description='The single place exposure is opted into. A collection absent from the list has no location in the rendered configuration at all, so adding one to the query layer cannot expose it (FR-003).',
        title='The release policy',
    )
    page: Page1 | None = Field(
        None,
        description="The client's own build, served through this boundary so that the page and the data it reads share one origin and one credential (decided 28 August 2026, issue #34 link 6). Optional: a destination that serves no page omits the section and the rendered configuration carries no page location at all. Declaring it requires proxy.upstream.page, which says where the page comes from. The surface is declared path by path, exactly as the released collections are — the build emitting a new file does not expose it, which is FR-003's property applied to the page. The renderer refuses a declared page with no paths, and refuses any entry that falls under the released prefix or collides with the upgrade location.",
        title='The page, behind the same clearance',
    )
    control: Control = Field(
        ...,
        description="One protocol-upgrade location at a dedicated prefix, proxying MQTT-over-WebSockets to the broker. It is subject to the same default deny as every other path, but it is a different exposure surface: policy is evaluated once, at the upgrade, and the connection then persists carrying traffic the proxy does not inspect per message. What a subscriber may receive is therefore settled by the broker's access control lists, not here, and is tested there.",
        title='The control-namespace upgrade location (ADR-0008)',
    )
    health: Health = Field(
        ...,
        description='A second listener, container-internal and never published, carrying one location that answers a container health probe. It is separate because the published listener cannot have one: a location that answers 200 to an uncleared caller is exactly what FR-006 forbids, and a probe that has to hold the clearance is a credential in a Compose file.',
        title='The health listener',
    )
    rendered: Rendered = Field(
        ...,
        description='The rendered file is a build artefact. It is written here, validated with nginx -t, and never edited.',
        title='Where the rendered configuration is written',
    )
    logs: Logs = Field(
        ...,
        description='Every refusal is recorded with the normalised path and the rule that refused it (FR-020), so an unexpected refusal is diagnosable without loosening policy to find out what happened. These files carry the host clock, which Constitution I permits as log line decoration; no decision in this feature reads one.',
        title='Access and refusal logs',
    )
    identification_radius_m: float = Field(
        ...,
        description='Metres. Two uses, both about withholding measurement geometry: the provenance scanner flags a coordinate pair falling within this distance of a measurement location (FR-012), and the updated-region test buffers the measurement geometry by it before scoring a change mask against it (FR-015).',
        gt=0.0,
    )
    quantisation_step: float = Field(
        ...,
        description='The step a released value is quantised to. A difference at or below it between two successive released products is not a change, which is what makes the change mask of FR-015 well defined rather than a map of floating-point noise.',
        gt=0.0,
    )


class DrognaReverseProxyConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    component: common.Component
    clock: common.Clock | None = None
    seed: common.Seed | None = None
    broker: common.Broker | None = None
    logging: common.Logging
    proxy: Proxy = Field(
        ...,
        description='Where the proxy listens, what it is willing to pass through, and where each released thing lives upstream. Read once at render time; nothing here is consulted per request.',
        title='The exposure boundary',
    )
