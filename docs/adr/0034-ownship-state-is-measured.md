# ADR-0034: ownship state is measured, not declared

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 113 (the Operator flow chart, and the platform beneath it)
**Requirements:** SRD-v2 FR-52 to FR-56, FR-60
**Engages:** ADR-0005, which closed the observed-property enumeration; Constitution V

## Context

Before this feature nothing in drogna held ownship state. The sensors computed their own
position from simulation time — `Sensors.positionAt(seconds)`, a closed form — which
made the platform's motion a private detail of the component that sampled the sea. There
was nothing to command, nothing to stop, and nothing to draw a track from.

FR-52 gives that motion its own component, and the question the component forces is how
its state reaches the rest of the harness. Two answers were live:

- **Declared:** the platform publishes a state message on a control topic and the map
  reads it. This is the smallest change, and it keeps the observed-property enumeration
  shut.
- **Measured:** the platform's navigation instruments publish course, speed and depth as
  SensorThings observations, exactly as the ocean instruments publish temperature.

The second requires amending a closed enumeration, and `observation.schema.json` names
ADR-0005 in the enumeration's own description as the reason it is closed. A closed list
reopened without a record is how the next reader learns the wrong lesson, which is why
this record is owed before the master is amended rather than after.

## Decision

**The platform's course, speed and depth are measured quantities. The enumeration grows
by three, and the amendment does not reopen ADR-0005's closure.**

- `observed_property` becomes `temperature | salinity | pressure | platform_course |
  platform_speed | platform_depth`. The ownship three are produced by declared
  instruments with declared noise models, on the platform's own Thing and Datastreams,
  through the same topic prefix and the same ingest path as the ocean three. They reach
  the world through the SensorThings subset already cleared under Constitution X; no new
  collection is released.
- **ADR-0005's closure stands, because its argument is about derived values.** Sound
  speed is a function of temperature, salinity and pressure, all of which the store
  already holds; storing it beside its inputs creates a second source of truth that can
  disagree with them after a change to the equation, with no way to tell which is right.
  Course, speed and depth over ground are the motion simulator's *primary* state.
  Nothing else in the harness holds them, so there is no second source for them to
  disagree with. The enumeration is closed against derivation, not against measurement,
  and it remains closed on those terms: no derived quantity joins it without amending
  ADR-0005 itself.
- **Position is not among them.** A latitude is not a measurement result, and every
  observation already carries `/location`. Position therefore arrives where position has
  always arrived, and the ownship track is those locations in phenomenon-time order — the
  ordinary Observations resource, read through the ordinary query path (FR-60).
- **`HistoricalLocations` stays outside the served subset.** SensorThings offers it and
  it would be the obvious home for a track. It is refused for the same reason sound speed
  is: a second representation of one fact is two answers that can disagree. The track has
  no representation of its own.
- **An ownship observation is not a sample of the ocean** (FR-56). Sharing a transport is
  not sharing a meaning, and the two consumers that reason about *where the sea has been
  measured* refuse it in the two shapes their existing designs already had. The planner's
  observation-age field is a denylist naming the platform's own datastreams, asserted
  against the platform's declared instruments so a fourth ownship datastream cannot
  arrive and be quietly counted as a sounding. The monitor needs nothing added: its
  `pairs` document is already an allowlist naming the Thing and the two datastreams it
  scores, which is the stronger of the two. A denylist was written for it as well,
  planted against, and found **unable to fail** — so it was removed, the master no longer
  admits the field, and a test asserts its absence.
- **Constitution V is engaged and satisfied.** One moving Thing whose series is a track
  is exactly the case Principle V's own text keeps "track" as ordinary navigational
  English for: the harness's own vehicle, whose position it knows because it computed it.
  What the principle forbids is the third party whose position the harness would infer.
  The ocean datastreams are unaffected — a series of sampling locations is a sampling
  path, and its FeatureOfInterest is still not a place anything went.

## Consequences

- **The sensors' output now depends on delivery order.** They sample at the last ownship
  position they heard rather than at a position they computed, so a closed form has
  become a subscription. AT-04's replay claim is unaffected in its stated form —
  components run in lockstep and delivery order is deterministic — but the dependency is
  new and is stated in the claim's boundary rather than left to be discovered. The
  platform is scheduled before the sensors in the composition root (ADR-0030) so that the
  cold start lasts one tick.
- **The cold start is a real behaviour, not an edge case.** Before the first ownship
  position arrives the sensors publish nothing and say so, counting what they skipped.
  Stopping the platform therefore stops the sea being sampled, which is the consequence
  chain SC-001 watches; a harness where stopping a component changed nothing visible
  would be a worse demonstration.
- **The store holds ownship history**, which it did not before. It is bounded by the same
  retention the ocean observations have and served by the same subset.
- **A consumer that iterates every datastream will now see ownship series.** That is the
  cost of one vocabulary for both, and FR-56's named exclusions are where it is paid.
  A consumer added later that forgets to refuse them is a defect no existing test catches
  for it. The mitigation is that the refusal is in configuration rather than in each
  consumer's code — best served, where the design allows it, by naming what *is* wanted
  rather than what is not.

## Alternatives rejected

- **A control-topic state message only** (the "declared" option). Smaller, and it keeps
  the enumeration shut — but the map's track would then be drawn from control traffic the
  query layer never served, which is exactly the thing this harness exists to avoid
  claiming. FR-60 wants the track to come back through a genuine query, and it does. The
  state message still exists (`platform-state.schema.json`) because the Operator tab
  needs demanded-versus-current and the binding limit, which are not measurements of
  anything; it is not what the map reads.
- **A fourth ocean-style datastream carrying position as a scalar.** There is no scalar:
  position is two numbers and a depth, and flattening it into three results would invent
  observed properties (`platform_latitude`) that mean nothing outside this harness while
  duplicating a field every observation already has.
- **`HistoricalLocations`, served.** Rejected above. It is also the more standards-shaped
  answer, which is why the refusal is recorded rather than assumed.
