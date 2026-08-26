# ADR-0006: Heartbeat cadence and liveness windows are real time

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-09, FR-45, FR-52, FR-53
**Amends:** Constitution Principle I, which gains a narrow named exemption
**Raised by:** feature 016's specification

## Context

Constitution Principle I forbids reading the host clock for any operational purpose;
all time comes from the simulation clock (FR-09). FR-52 makes the clock's heartbeat the
first liveness signal, and FR-45 requires component illumination to be driven by
liveness alone. FR-53 requires screenshot capture to pin the clock rate to **zero** for
the duration of a capture, so that a before/after pair differs only where the change
under evidence differs.

Feature 016's specification found the collision. If heartbeat cadence and liveness
windows are measured in simulation time, then at rate zero simulation time does not
advance, no heartbeat is ever due, every liveness window expires, and every component
greys out — during exactly the capture that FR-53 exists to make meaningful. The
capture would show an all-grey shell and assert, falsely, that nothing is running.

The failure is not a bug in any component. It is what the two requirements mean when
composed.

## Decision

**Heartbeat cadence and liveness windows are measured in real time.** The simulation
time a heartbeat carries is *payload*, not schedule.

Every component emits its heartbeat on a real-time interval and includes the current
simulation time in the message. The client's liveness window is likewise real time. A
rate of zero stops simulated time and stops nothing else.

Constitution Principle I gains a correspondingly narrow exemption: heartbeat emission
and liveness evaluation may read the host clock, under the existing
`# harness:allow-wallclock` marker with this ADR as the reason.

## Consequences

- At rate zero the shell keeps its lit components lit, which is what FR-53 needs and
  what an observer would expect: pausing the simulated world does not kill the
  processes simulating it.
- The exemption is defensible rather than merely convenient. Liveness answers "is this
  process alive?", which is a fact about the host and not about the simulated world. A
  question about the host is properly answered by the host's clock. Deterministic replay
  (AT-04) is untouched, because no operational output depends on heartbeat timing —
  heartbeats drive illumination, and illumination is not replayed.
- The exemption is narrow and must stay narrow. It covers emitting a heartbeat and
  evaluating a liveness window. It does not cover timestamping an observation,
  scheduling a model run, ageing an uncertainty field, or anything else. The lint gate
  keeps flagging every other use.
- Feature 016 can drop the defensive assertion it specified — that lit components must
  stay lit through a capture, or the capture fails. It is worth keeping anyway as a
  cheap regression test on this decision, and it is written to fail loudly rather than
  produce a misleading pair.
- Feature 001 must implement the clock service's heartbeat on a real-time interval, and
  feature 003 must evaluate liveness in real time. Both were about to inherit the
  ambiguity.
