---
title: C-01 Simulation clock
---

# C-01 Simulation clock

!!! success "Status: built"

    - **Code:** `services/clock/`, with the clock port every other component reads
      through in `libs/harness_core/clock.py`
    - **Delivered by:** `specs/001-deterministic-foundations`
    - **Covered by:** `services/clock/tests/`,
      `tests/integration/test_clock_liveness.py` and
      `tests/integration/test_heartbeat_under_rate_zero.py`; the wall-clock prohibition
      below is the gate `scripts/check_no_wallclock.py`
    - **Not present:** the lockstep barrier is implemented and unit-tested, but the
      replay acceptance test scores the environment generator reproducing its own values
      rather than two components advancing in lockstep, so the stronger claim rests on
      unit tests alone

**Responsibility:** single source of time, rate-controllable.
**Owns the failure mode of:** hidden wall-clock dependencies.

## What it does

Every other component asks the clock what time it is. The clock answers with
simulation time, which advances at a rate the browser client controls: real
time, faster than real time, or — during screenshot capture — not at all.

## Why it exists as a separate component

Because the alternative is that eighteen components each ask the operating
system, and the moment one of them does, replaying a scenario from its seed
stops producing the same answer. A run that cannot be replayed cannot be
scored, and scoring against recorded ground truth is the only thing separating
drogna from a demonstration that asserts its own success.

This is also the one property in the whole system that cannot be added later at
acceptable cost. Retrofitting a clock is not a refactor; it is an audit of every
line that ever asked what time it is, including the ones inside libraries and
the ones that got the time from a message broker's delivery timestamp rather
than from a function call.

## Constraints it lives under

- No component may call a wall-clock function for any operational purpose. This
  is checked by a lint gate that fails the build, with an inline marker as the
  only exemption and every marker reviewed.
- The clock publishes a heartbeat on the control namespace. That heartbeat is
  the first real liveness signal in the system: the client lights this
  component because a message from it arrived, not because a configuration file
  says it should exist.
- Capture pins the clock rate to zero, so that a before-and-after screenshot
  pair differs only where the change under evidence differs.

**Requirements:** FR-09, FR-10, FR-52, FR-53. **Feature:** 001.
