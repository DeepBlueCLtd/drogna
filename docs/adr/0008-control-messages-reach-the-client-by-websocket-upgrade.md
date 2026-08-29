> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0008: Control messages reach the client by WebSocket upgrade at the proxy

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-31, FR-40, FR-41, FR-45, FR-46, FR-52; Constitution VII, X
**Raised by:** feature 013's specification

## Context

The client must show the control loop cycling in real time, messages crossing component
boundaries, and component illumination driven by heartbeats (FR-46, FR-52, FR-45). All
of that traffic lives on the control namespace of the broker. The SRD does not say how
it reaches a browser.

One option is ruled out before the argument starts. FR-31 is explicit that the publisher
announces new runs as events and that consumers subscribe, "because the query layer has
no notification mechanism" — nothing polls the query layer for freshness. So the client
subscribes to something; the question is only to what, and through what.

Feature 013's specification raised this rather than assuming it, because the answer
changes the reverse proxy's path policy materially, and path policy is the whole of
FR-40 and FR-41.

Three options were weighed.

**A read-only relay service** subscribing to the control namespace and pushing
server-sent events over plain HTTP GET. Attractive because the proxy stays purely
path-prefix based, which is the premise FR-40 rests on, and because a relay is
structurally incapable of letting a browser publish. Rejected on cost: it is a
nineteenth component in a system whose component list the client renders as a fixed
eighteen-box layout, and it would need its own liveness, its own failure mode and its
own box.

**A direct browser connection to the broker**, bypassing the proxy. Simplest, and the
most honest about what is actually happening. Rejected: it puts a listening port outside
the reverse proxy, contradicting FR-41's default-deny on everything else and
Constitution X, and it makes the leakage tests harder to reason about because there
would be two ways into the system with different policies.

## Decision

The reverse proxy carries a **WebSocket upgrade location at a dedicated path prefix**,
proxying MQTT-over-WebSockets to the broker. The client subscribes through it.

Everything stays behind one reverse proxy, under one access policy, and the component
count stays at eighteen.

## Consequences

- FR-40's path-prefix policy still governs the upgrade location; it is a path like any
  other, under the same default-deny (FR-41). Adding it does not weaken the rule that
  adding a collection never exposes it by accident.
- **An upgrade location is a genuinely different exposure surface from a static path
  prefix, and must be treated as one.** Path policy is evaluated once at upgrade, and
  the connection then persists carrying traffic the proxy does not inspect per-message.
  The proxy is therefore not the place that constrains what a subscriber may receive;
  the broker's ACLs are. This must be tested at the broker, not assumed at the proxy.
- The browser needs a broker identity. It is **subscribe-only on the control namespace**
  and must be incapable of publishing anywhere, and in particular must not be confusable
  with the sensor identities that FR-14 confines to the observation branch. Cross-
  contamination of flows is C-03's named failure mode, and this is the connection most
  able to cause it.
- The client subscribes to the control namespace only. Observation traffic is not
  proxied to the browser; the client reads observations through the query layer, as
  FR-19 intends.
- Constitution VII is unaffected and slightly strengthened: illumination is driven by
  heartbeats arriving over this connection, which is real traffic from real components.
  A failure of this connection greys out the display, which is correct — the client
  genuinely does not know whether anything is alive.
- Feature 013 owns the upgrade location and its policy tests. Feature 003 owns the
  client's subscription and the liveness evaluation. Feature 007 owns the broker ACLs
  that make the browser identity subscribe-only.
