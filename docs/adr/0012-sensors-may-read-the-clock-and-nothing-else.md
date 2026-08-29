> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0012: Sensors and the ingest client may read the clock, and nothing else on the control branch

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-14, FR-09; ADR-0006, ADR-0009; Constitution I
**Raised by:** feature 007, which could not satisfy both requirements as written

## Context

FR-14 confines sensors to the observation branch: observation traffic and internal
control events use separate topic namespaces, "with access control lists confining
sensors to the observation branch". Read literally, a sensor gets no subscription to
`ctl/` at all.

ADR-0009 then decided that simulation time reaches every component by subscription to
`ctl/clock`, the browser included, and that the clock's small HTTP interface exists for
setting the rate and for startup catch-up only — a component polling it for time is doing
the wrong thing.

The two cannot both hold literally. A component that cannot receive a clock sample has no
simulation time, and a component with no simulation time can only pace itself on the host
clock, which Constitution I forbids outright. The conflict is not between a requirement
and a convenience; it is between two requirements, and one of them has to give.

## Decision

The sensor and ingest roles may subscribe to **`ctl/clock` and to nothing else** on the
control branch, and may publish nothing on it. Every other control topic is refused in
both directions.

## Consequences

- **What FR-14 defends still holds exactly.** Its purpose is that a sensor cannot read
  the control loop and cannot forge a control event. A sensor that receives the time can
  do neither. What is given up is the literal wording, not the property.
- **The test changes shape, and this is the part worth keeping.** The property to assert
  is no longer that a sensor's subscription to `ctl/#` is refused. Mosquitto grants every
  SUBACK and enforces read rules at delivery, so a refused subscription looks like a
  successful one. The assertion is therefore that subscribing to `ctl/#` delivers the
  clock **and nothing else** — which is a stronger statement than the original, because it
  fails if any other control topic ever reaches a sensor, including one added later by
  someone who never read this record.
- The ingest client additionally publishes `ctl/heartbeat` and `ctl/telemetry`, which it
  must, and reads `obs/#`, which it must. The browser role publishes nowhere at all and
  cannot read `obs/#` (ADR-0008).
- **The two-broker fallback of FR-15 becomes slightly more than a configuration change.**
  Two components now need both namespaces, so with one broker they hold one connection and
  with two they hold two, while a component's configuration carries a single broker
  endpoint. The fallback needs an optional second endpoint in the common configuration
  schema. That is still configuration rather than redesign, which is what FR-15 promises,
  but it is not free and the promise should not be repeated as though it were.
- **If this is judged wrong, the alternative is a clock transport that is not the control
  namespace** — and that is ADR-0009's decision to revisit, not a rule to be quietly
  loosened in an access control list. Recording it here rather than only in the broker's
  own documentation is what makes revisiting it possible.
