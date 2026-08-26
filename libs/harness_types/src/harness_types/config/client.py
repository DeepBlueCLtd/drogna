# DO NOT EDIT.
# Generated from contracts/schemas/config.client.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from pydantic import AnyUrl, BaseModel, ConfigDict, Field


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
        description="Base URL of the clock service's HTTP interface, where the deployment exposes it to the browser. Absent means the client waits for the first sample instead.",
    )
    routes: Routes | None = Field(
        None,
        description='Routes relative to the endpoint. Only the read route appears here: the client is not a controller.',
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
        description="Simulation time arrives by subscription to ctl/clock (ADR-0009). The HTTP interface is optional here and is used for one thing only: asking what the time is at startup, so the page is not blank until the next sample. The client offers no control over the clock; the rate is pinned for capture against the clock's own control surface, not from here.",
        title='Simulation clock',
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
