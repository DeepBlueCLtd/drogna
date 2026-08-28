# ADR-0026: The third wall-clock exemption is resource sampling, and the socket stops at the door

**Status:** Accepted
**Date:** 28 August 2026
**Requirements:** SRD FR-70, FR-72, FR-73; Constitution Principle I (amended to 1.6.0 by this record); C-21
**Raised by:** SRD §5.12, which owes this record before the operator plane is built. The decisions were taken by the owner on 28 August 2026, by structured interview; this record is the argument and the bound.

## Context

Two of the operator plane's requirements touch surfaces the constitution guards.

FR-70 asks the system controller to sample each container's processor and memory use
and publish it, so the display can show where the harness saturates as the rate
rises. Utilisation is inherently a per-host-second measure: there is no simulation-
time reading of a CPU. Principle I permits wall-clock time in exactly two bounded
places — heartbeat emission and liveness evaluation (ADR-0006), and display
interpolation between clock samples (ADR-0007) — and states that a third request "is
evidence the principle is being eroded and must be argued on its own merits, never by
analogy to these two". This is that argument.

FR-72 asks the controller to dispatch process-level lifecycle — stopping, starting
and restarting a component's container — which requires the container runtime socket.
Whoever holds that socket holds the deployment: it is the widest capability in the
harness, and the SRD names it a deliberate trust surface wanting its own bound.

## Decision

### The exemption, and its bound

**Principle I gains a third bounded exemption: container resource sampling, confined
to the system controller's sampler module.** The constitution moves to 1.6.0. The
bound has three parts, and each is what keeps this an exemption rather than an
erosion:

- **One module.** The sampling lives in a single module of C-21, carries the
  `harness:allow-wallclock` marker with this ADR as its reason, and appears in the
  exemption inventory like every other marker. No other component samples anything.
- **Its own kind.** Resource readings are published as their own telemetry kind whose
  schema declares host-time semantics — per-host-second, with the sampling instant as
  a host timestamp labelled as one. They never enter a simulation-time metric, never
  reach the run record, and nothing operational reads them: they exist for the
  display and for the saturation question, and FR-73 already keeps operator activity
  outside AT-04's replay claim.
- **The same shape as the first two.** Like the heartbeat and the render
  interpolation, this measures the boundary between the simulated world and the
  machine running it — the machinery, not the simulation. A reading of what the *host*
  is doing has no simulation-time answer even in principle, which is the test the
  first two exemptions passed and the test a fourth request must pass on its own.

### The socket, and its reach

**The runtime socket is mounted into C-21's container and no other.** No component
gains it incidentally; the compose configuration names it once, on the controller.

**Lifecycle commands may target any component except three: the proxy, the
controller itself, and the broker.** The exclusions are each an argument, not a
list:

- the **proxy** is the operator's own path — stopping it severs every command that
  could restart it, stranding the plane behind a door it closed;
- the **controller** orphans every in-flight command and the plane with it;
- the **broker** carries the heartbeats by which the display shows the effect of any
  command — stopping it does not demonstrate a component failing, it blinds the
  instrument.

Everything else — the loop services, the sensors, the stores, the clock — is fair
game, which is the teaching value FR-72 exists for. A command naming an excluded
component is refused with the exclusion named, in the house style. The exclusion
list is configuration validated against schema, so a destination can narrow it
further but the three names above are the floor.

Reachability of the commands is ADR-0025's subject: the plane, socket commands
included, sits behind the boundary's clearance.

## Alternatives rejected

- **Marker only, no constitution amendment.** The gate's inventory would carry an
  exemption the constitution never granted — precisely the erosion Principle I warns
  about. The first two exemptions were each granted by amendment with an ADR, and
  informality here would make the third the precedent for a casual fourth.
- **Rejecting the exemption** and dropping resource sampling from FR-70, or sourcing
  it host-side outside the harness. Keeps Principle I at two, but loses the
  saturation display inside the client where FR-76 wants it, and a host-side tool
  beside the harness is the "tool beside it" §5.12 rejects in its first sentence.
- **Lifecycle over everything.** Maximum honesty about the socket's power, but a
  plane that can strand itself converts a demonstration into a host-side recovery,
  and what it teaches is recoverable-by-ssh rather than anything about the
  architecture.
- **Lifecycle over the loop services only.** The narrowest surface, but it forecloses
  the instructive cases for free — a stopped sensor thinning the observation stream,
  a stopped store failing its dependents loudly — which cost nothing once the three
  structural exclusions hold.

## Consequences

- The constitution's "third request" sentence is rewritten by the 1.6.0 amendment to
  count four: the first three are granted and bounded, and a fourth request is the
  evidence-of-erosion case.
- The wall-clock gate needs no change: the marker-and-inventory mechanism already
  covers the new module, and the gate's fixture tree should gain the planted
  violation (a sample taken outside the sampler module) and be watched catching it
  when C-21 is built.
- The socket's exclusion list is asserted by test when C-21 is built: a lifecycle
  command against each excluded name is refused with the exclusion named, and the
  compose configuration is linted for exactly one mount of the socket.
- FR-73 already states that a lifecycle-commanded run sits outside the replay claim;
  nothing here widens or narrows that.
