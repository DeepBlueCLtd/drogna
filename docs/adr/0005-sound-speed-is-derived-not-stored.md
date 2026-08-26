# ADR-0005: Sound speed is derived at the point of use, not stored

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-02, FR-16, FR-24, FR-37; SRD §2.2
**Raised by:** feature 007's specification, where the SRD does not assign the derivation

## Context

FR-24 has the monitor compute the residual between **measured and forecast sound
speed**, and the SRD is emphatic that it is sound speed and not temperature. FR-02 has
the environment generator produce temperature, salinity and pressure, "from which sound
speed is derived". SRD §2.2 lists sound speed computation among the genuinely bespoke
logic inside the boundary.

What the SRD does not say is *where* the derivation happens. Feature 007's specification
surfaced the gap: if the simulated sensors publish sound speed as a fourth datastream
and the ingest client stores it, then the monitor reads it; if they publish only the
three measured quantities, the monitor derives it. Two specifications were about to make
opposite assumptions.

## Decision

Simulated sensors publish **temperature, salinity and pressure only**, as three
SensorThings Datastreams. Sound speed is never published, never stored, and is not a
datastream.

Sound speed is **derived at the point of use**, by a single shared implementation in
`libs/harness_core`, called by the monitor (FR-24) and by telemetry (FR-37).

## Consequences

- There is one implementation of the sound speed equation in drogna, and it is inside
  the boundary where SRD §2.2 puts it. Both consumers get the same numbers by
  construction rather than by agreement.
- The observation store holds only measured quantities. A derived value stored beside
  its inputs is a second source of truth that can disagree with them after a change to
  the equation, and there would be no way to tell which was right.
- The equation is versioned with the code, not with the data. Recomputing a residual
  after changing the equation gives a different answer for the same stored
  observations, which is correct: the residual is a statement about the current model
  of sound speed, not a historical fact.
- The environment generator derives sound speed too, for the field it writes, and must
  call the same implementation. A generator with its own copy of the equation would
  make the recovery error of AT-03 partly an artefact of the disagreement.
- Sensors carry no bespoke logic, which is what a simulated sensor ought to look like.
- The chosen equation and its validity range are a documented modelling decision, and
  the harness's numerics are deliberately fake (SRD §1.1) — the point is the seam, not
  the oceanography. Whichever formulation is used, it is stated in
  `docs/algorithms/`, not left implicit in a function body.
