# ADR-0009: The clock publishes on the control namespace, and gains a lockstep mode

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-09, FR-10, FR-52, AT-04
**Related:** ADR-0008, which decides how control traffic reaches the browser
**Raised by:** feature 001's specification

## Context

Feature 001's specification proposed carrying simulation time to consumers over HTTP
with server-sent events, on the reasoning that the control-topic list was closed and
that a browser consumes SSE without an MQTT client.

Both halves of that reasoning have since been overtaken. FR-52 requires the clock to
publish its heartbeat **on the control namespace**, which is the broker. ADR-0008
decides that the client reaches the control namespace through a WebSocket upgrade at
the reverse proxy, so the browser does not need an SSE fallback — it already has a
subscription to everything else on `ctl/`. Carrying time over a second transport would
mean two mechanisms delivering control traffic to the same consumer, with two failure
modes, two liveness stories and two things to keep alive.

Separately, feature 001 proposed a **lockstep** mode beyond the real-time and
accelerated modes FR-10 names. The argument is that AT-04 requires the whole scenario to
replay deterministically from its seed, and that free-running modes can reproduce values
but not interleaving: two components consuming the same tick may process it in either
order, and anything order-dependent then differs between runs. Lockstep is what makes
AT-04 achievable rather than aspirational.

## Decision

**Transport.** The clock publishes on the broker's control namespace, not over SSE:

- `ctl/clock` — simulation time samples, at the clock's declared cadence.
- `ctl/heartbeat` — the clock's own liveness heartbeat, on a real-time cadence per
  ADR-0006, like every other component's.

The clock also exposes a small HTTP interface for two things a subscription cannot do:
setting the rate, which is a command from the browser (FR-10), and answering "what is
the time now" for a component starting up or catching up after a restart.

Consumers, the browser included, receive time by subscribing. There is one transport for
control traffic.

**Quantisation.** Simulation time is quantised: tick *n* is always
`epoch + n × interval`. A rate change alters the pace at which ticks are emitted and
never the value of any tick. This is feature 001's design and it is adopted as-is; it is
what makes a rate change safe at any moment, and a rate of zero simply stops emission.

**No local interpolation in the port.** The clock port is a client of the service and
must not interpolate between samples. Interpolating locally would smuggle host time back
into every component. The single exception is the client's render path, bounded by
ADR-0007, which is a display concern and never reaches an operational value.

**Lockstep mode.** A third mode is added alongside real-time and accelerated, in which
the clock does not advance until every registered participant has acknowledged the
current tick. Real-time and accelerated modes claim reproducibility of values only;
lockstep claims reproducibility of interleaving as well, and AT-04 runs in it.

## Consequences

- One transport for control traffic, one subscription in the browser, one liveness
  story. `ctl/clock` is added to the control-topic list in the repository layout, which
  is extended rather than treated as closed.
- The HTTP interface is small and is not a way to read time in a loop. A component that
  polls it for time is doing the wrong thing and should be subscribing; the endpoint
  exists for startup and for rate control.
- Lockstep is an addition beyond the SRD's stated modes and is recorded here as such,
  not smuggled in as an implementation detail. It has a cost: every participant must
  register and acknowledge, and a participant that dies stalls the clock rather than
  being outrun. That is the correct failure for a replay mode — a stalled run is
  visible, a silently divergent one is not — but it means lockstep is for replay and
  test, not for demonstration.
- Real-time and accelerated modes remain the demonstration modes, and their weaker
  claim must be stated wherever reproducibility is asserted. "Deterministic replay"
  without qualification means lockstep.
- AT-04 is written against lockstep and says so.
