# DO NOT EDIT.
# Generated from contracts/schemas/config.client.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import AnyUrl, BaseModel, ConfigDict, Field, RootModel


class Broker(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(
        ...,
        description="WebSocket URL of the proxy's upgrade location. Not the broker's own port: everything stays behind one reverse proxy under one policy.",
    )
    client_id: str = Field(
        ...,
        description='The MQTT client identifier. Deterministic, never derived from entropy or a host clock (Constitution II). Two viewers served the same identifier will disconnect one another, so a deployment that expects several viewers issues a distinct identifier per served document.',
        pattern='^[a-z][a-z0-9_-]*$',
    )
    keepalive_seconds: int | None = Field(
        None,
        description='Transport keepalive. A socket parameter, not simulation time.',
        gt=0,
    )
    reconnect_period_seconds: float | None = Field(
        None,
        description='How long the transport waits before retrying a dropped connection. Zero disables retrying.',
        ge=0.0,
    )


class Routes(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    snapshot: str = Field(
        ..., description='What the time is now, for a page that has just loaded.'
    )
    control: str | None = Field(
        None,
        description='Where a rate change is asked for, by POST. The clock decides; a request may be clamped or refused, and the display shows the rate the clock reports in force rather than the rate that was asked for (SRD FR-10, FR-49, FR-53).',
    )


class Clock(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    stale_after_seconds: float = Field(
        ...,
        description='How long, in host seconds, the client waits for a time sample before reporting the clock stale. Staleness is the absence of samples and is not the same as a rate of zero, which is a state the clock reports and which stops emission legitimately (FR-53).',
        gt=0.0,
    )
    endpoint: AnyUrl | None = Field(
        None,
        description="Base URL of the clock service's HTTP interface, where the deployment exposes it to the browser. Absent means the client waits for the first sample instead. Null says the same thing as a value: this destination exposes no clock to a browser (the droplet publishes its clock to loopback only, and the 28 August decision on issue #34 keeps it unproxied), and the speed control renders unavailable and says why. Stated as null rather than by omitting the key because destinations may differ in values only, never in the set of keys — the parity check up.sh runs is what holds that.",
    )
    routes: Routes | None = Field(
        None,
        description='Routes relative to the endpoint. The read route is required; the control route is optional, because a destination may serve a page that can watch the clock without being able to set it.',
    )


class RouteParameter(RootModel[str]):
    root: str = Field(..., min_length=1)


class Query(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    endpoint: AnyUrl = Field(
        ...,
        description="Base URL of the query layer as the browser reaches it: the proxy's released prefix, never the query layer's own port.",
    )
    collections_path: str = Field(
        ...,
        description='Path under the endpoint at which collections are addressed. A collection identifier from a run announcement is appended to it.',
    )
    trajectory_path: str | None = Field(
        None,
        description='Path under a collection at which an OGC API-EDR trajectory query is served. Per-vertex arrival times travel as the M ordinate of a WKT LINESTRING ZM in the coords parameter (SRD FR-20). Absent where the destination does not serve trajectory queries, in which case the route renders without conditions along it rather than with conditions for the wrong moment.',
    )
    route_parameters: list[RouteParameter] | None = Field(
        None,
        description='Which forecast parameters to ask for along a route. Named here rather than in source because what a destination serves is a property of the destination.',
    )
    cube_path: str | None = Field(
        None,
        description='Path under a collection at which an OGC API-EDR cube query is served. The map asks for one cube per announcement, at the extent the announcement stated, and draws that. Absent where the destination does not serve cube queries, in which case the map renders the extent and states that no field can be read rather than drawing a field it did not fetch.',
    )
    field_parameter: str | None = Field(
        None,
        description='Which parameter the map draws as the uncertainty field. Named here for the same reason route_parameters is: which parameter carries the ensemble spread is a property of what the destination serves, not of the client. Absent means the map has not been told what to draw and says so.',
        min_length=1,
    )


class Liveness(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    default_window_seconds: float = Field(
        ...,
        description='The window applied to a heartbeat that declares neither a window nor an interval. One scalar tolerance, deliberately not a table of components: a table would be a list of what ought to exist, which is what Constitution VII forbids.',
        gt=0.0,
    )
    window_multiplier: float | None = Field(
        None,
        description='Applied to a declared interval when the sender declares an interval but no window: a sender that says it speaks every n seconds is believed for a small multiple of n, so one dropped message is not read as death.',
        gt=1.0,
    )
    disconnected_is_indeterminate: bool | None = Field(
        None,
        description='Whether evidence that expires while the transport is down renders as indeterminate rather than dark. Default true: a client that has gone deaf cannot honestly say a component died. It can never light anything — indeterminate is not lit.',
    )


class Display(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    frame_interval_ms: float = Field(
        ...,
        description='Minimum host milliseconds between re-renders. The frame budget, not a sampling interval for liveness.',
        gt=0.0,
    )
    buffer_depth: int | None = Field(
        None,
        description='How many messages each control topic keeps, oldest evicted first, so an hour of demonstration has a stable memory footprint. It bounds how far back a viewer can read and can neither light a component nor draw a transit.',
        gt=0,
    )
    coalescing_threshold: int | None = Field(
        None,
        description='How many arrivals in one frame before transits on the same boundary are drawn as one mark carrying the count. A display bound: it changes how many marks are drawn and never how many messages are counted.',
        gt=0,
    )
    maximum_drawn_cells: int | None = Field(
        None,
        description='The largest number of uncertainty cells drawn before the field is downsampled. The resolution actually shown is stated on the display, never reduced silently.',
        gt=0,
    )
    interpolate_between_samples: bool | None = Field(
        None,
        description="Whether the render path may smooth the display between two received clock samples using the browser's animation frame timestamp, under the three rules of ADR-0007. False renders on clock samples alone, which costs smoothness and nothing else.",
    )


class Extent(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_longitude: float = Field(..., ge=-180.0, le=180.0)
    minimum_latitude: float = Field(..., ge=-90.0, le=90.0)
    maximum_longitude: float = Field(..., ge=-180.0, le=180.0)
    maximum_latitude: float = Field(..., ge=-90.0, le=90.0)


class Vertical(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    minimum_depth_m: float = Field(..., ge=0.0)
    maximum_depth_m: float = Field(..., ge=0.0)


class Map(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    extent: Extent = Field(
        ...,
        description="The destination's declaration of the scenario's horizontal extent, in CRS84 degrees. The same numbers the destination declares as its domain elsewhere; declared again here because the client cannot read that document and cannot enumerate collections through the boundary.",
        title='Declared scenario extent',
    )
    vertical: Vertical | None = Field(
        None,
        description="The depth range the scenario covers, in metres, positive downwards, as the coverage's own vertical convention has it. Used to label the volume mode's depth axis before a run has been announced.",
        title='Declared vertical range',
    )
    graticule_spacing_degrees: float | None = Field(
        None,
        description="Spacing of the graticule the map draws, in degrees. Absent means the map chooses a spacing from the extent's own span, which is what keeps a wide extent from being drawn as a black rectangle of meridians.",
        gt=0.0,
    )


class DrognaBrowserClientRuntimeConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    broker: Broker = Field(
        ...,
        description="How the browser reaches the control namespace: an MQTT-over-WebSockets connection through the reverse proxy's upgrade location (ADR-0008). The identity is subscribe-only; the client publishes on no topic.",
        title='Broker connection',
    )
    clock: Clock = Field(
        ...,
        description="Simulation time arrives by subscription to ctl/clock (ADR-0009). The HTTP interface is used for two things: asking what the time is at startup, so the page is not blank until the next sample, and asking the clock for a rate. The rate control is the browser's by SRD FR-10 and FR-49, and a rate of zero pins the clock for a capture (FR-53). It is a request and never an assertion: the rate the page displays is the one the clock reports in force on ctl/clock, never the one that was asked for. Where the control route is absent the page still renders the control and says why it cannot act, rather than appearing to act and doing nothing.",
        title='Simulation clock',
    )
    query: Query = Field(
        ...,
        description='Where the client reads the forecast, the uncertainty field and the conditions along a recommended route, through the reverse proxy under one path policy (ADR-0008, Constitution X). Freshness is never discovered here: a new run is announced on ctl/run-published and the client reads only when it has been told there is something new (SRD FR-31). The collection identifiers are not configured — they arrive in the announcement, so publishing a run adds collections without any document being edited.',
        title='Query layer',
    )
    liveness: Liveness = Field(
        ...,
        description='How long a received heartbeat is taken as evidence, when its sender did not declare that itself. Real time by ADR-0006: a rate of zero stops simulated time and stops nothing else, so a pinned clock keeps its lit components lit for the duration of a capture.',
        title='Liveness tolerances',
    )
    display: Display = Field(
        ...,
        description='Rendering settings, and nothing that changes what is believed. A high clock rate degrades the frame rate and never the truth: every received heartbeat is folded into liveness state whether or not a frame is drawn for it.',
        title='Display',
    )
    map: Map | None = Field(
        None,
        description="Where the scenario is, for a surface that must not invent geography. The extent a run's field is drawn in comes from the announcement's own grid bounds and never from here; this is what the map has to draw before any run has been announced, which is the state a harness whose loop has not yet turned is honestly in. Optional: a document that omits it renders the statement that no extent has been served rather than failing to start, and a client that has neither an announcement nor a declaration draws no frame at all.",
        title='Map surface',
    )
