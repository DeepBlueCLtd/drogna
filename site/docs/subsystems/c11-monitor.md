---
title: C-11 Monitor
---

# C-11 Monitor

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** detect forecast divergence from observations.
**Owns the failure mode of:** over-sensitivity.

## What it does

It compares what the sensors measured with what the current forecast said would
be measured, and raises a divergence event when the difference is large enough,
for long enough, over enough space to mean something.

The residual is computed on [sound speed](../glossary.md#sound-speed), not on
temperature. Sound speed is the derived quantity the system exists to get right,
and it responds to temperature, salinity and pressure together; a temperature
residual can be large while the quantity that matters is fine, and vice versa.

## Why over-sensitivity is the failure it owns

A monitor that fires on every spike turns the control loop into a thrash
generator. The rule is therefore explicit: a single spike shall never trigger a
run. A divergence event requires the residual to exceed threshold *with
sustained spatial or temporal persistence*.

There is also a declared warm-up period before any divergence event may be
raised, because a system that has just started has no forecast worth diverging
from, and the first minutes of a run would otherwise fire continuously.

The default threshold is around half a degree Celsius equivalent — order 1.5 to
2 m/s of sound speed — and is tunable per scenario.

## What it must not do

It raises requests. It does not invoke the model. The decision about whether a
run is warranted belongs to the [scheduler](c12-scheduler.md), and keeping those
two apart is what allows either to be reasoned about.

**Requirements:** FR-22 to FR-26. **Feature:** 009.
