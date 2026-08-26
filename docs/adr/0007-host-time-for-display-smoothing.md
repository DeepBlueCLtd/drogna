# ADR-0007: Host time may smooth the display between clock samples

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-09, FR-46, FR-47, FR-48
**Amends:** Constitution Principle I, which gains a second narrow exemption
**Raised by:** feature 012's specification, which recorded it as a Complexity Tracking entry

## Context

The client animates: the control loop cycles, messages cross boundaries, the
uncertainty field decays and refreshes, and a route is traversed against a time
control (FR-46 to FR-48). Simulation time arrives from the clock service as discrete
samples at whatever rate the transport delivers them.

Rendering only on arrival of a sample makes the display step at the sample rate, which
at a low sample rate looks broken rather than paused. The conventional fix is to
interpolate between the two most recent samples using the browser's animation frame
timestamp, which is host time and therefore forbidden by Constitution Principle I.

Feature 012 recorded this as the only host-time use across its four features and put it
in Complexity Tracking rather than committing it silently. That was the right handling,
and it is now decided rather than left as a standing violation.

## Decision

The client **may** read the browser's animation frame timestamp for the sole purpose of
interpolating between two received simulation clock samples for display.

Constitution Principle I gains a second narrow exemption, alongside ADR-0006's, under
the existing `# harness:allow-wallclock` marker with this ADR as the reason.

Three rules bound it:

1. **It may only interpolate between two samples actually received.** It may never
   extrapolate beyond the most recent sample, so the display cannot invent a simulation
   time that the clock has not reached.
2. **Every received sample is authoritative and snaps the display to it.** Interpolation
   is discarded on arrival, not blended, so error cannot accumulate.
3. **No value derived from it ever leaves the render path.** It does not reach a query,
   a message, a recorded observation, a screenshot's recorded time, or any assertion in
   a test.

If sample arrival stops, the display holds at the last sample rather than drifting
forward. A rate of zero is therefore indistinguishable from a paused display, which is
correct.

## Consequences

- Smooth animation at a low sample rate, without the display ever claiming a simulation
  time the clock has not reached.
- The exemption is confined to the client's render path and is invisible outside it. The
  lint gate keeps flagging every other use, in the client as much as in the services.
- Deterministic replay (AT-04) is untouched. Nothing rendered is replayed; what is
  replayed is what the services computed, and none of it passes through this path.
- Feature 012 keeps the render-on-clock-samples fallback it specified. If the three
  rules ever become hard to hold, dropping interpolation costs smoothness and nothing
  else.
- Two exemptions now exist to Principle I beyond the originals, both about the boundary
  between the simulated world and the machine displaying it: ADR-0006 for liveness,
  this one for smoothing. That is the shape of the boundary, not a slide. A third
  request should be treated as evidence the principle is being eroded and argued on
  its own merits, not by analogy to these two.
