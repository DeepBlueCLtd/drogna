---
title: C-02 Environment generator
---

# C-02 Environment generator

!!! success "Status: built"

    - **Code:** `services/env_generator/` — the four features, the background, the
      composition, the manifest writer and the timescale field each in their own module
    - **Delivered by:** `specs/004-environment-generator`
    - **Covered by:** `services/env_generator/tests/` and
      `tests/acceptance/test_at03_eddy_recovery.py`, which scores a recovered eddy
      against the seeded parameters in the manifest
    - **Not present:** no check reconstructs a fully composed value — background plus
      four anomalies, plus pressure, plus [sound speed](../../glossary.md#sound-speed) —
      from the manifest's documented
      forms alone; the pieces are each reconstructed separately

**Responsibility:** synthetic four-dimensional fields plus a ground-truth manifest.
**Owns the failure mode of:** unverifiable truth.

## What it does

It invents an ocean. The output is a field over latitude, longitude, depth and
time carrying temperature, [salinity](../../glossary.md#salinity) and pressure,
from which [sound speed](../../glossary.md#sound-speed) is derived. Four features
are seeded into it with recorded parameters: a
[mesoscale eddy](../../glossary.md#mesoscale-eddy) of known centre, radius and
strength; a [front](../../glossary.md#front) of known position and sharpness; a
[thermocline](../../glossary.md#thermocline) at known depth; and a moving feature
of known drift velocity.

Alongside each generated field it writes a manifest recording those parameters,
the seed the generator was given, and the generator's own version.

## Why the manifest is the point

Without it, every later claim is unfalsifiable. "The eddy is recoverable from
the observations" means nothing on its own; it means something when the recovery
error is computed against the centre and radius that were seeded, and reported
as a number. Two of the four acceptance tests score against this manifest.

The generator therefore owns the failure mode of unverifiable truth: if the
manifest is incomplete, or drifts out of step with what was actually generated,
every downstream measurement of skill is decoration.

## The decorrelation timescale

The manifest also records the
[decorrelation timescale](../../glossary.md#decorrelation-timescale), which is not
a constant. It is a field: authored per feature over a domain-wide background
value, evaluated per location, and advecting with a feature that moves. Quiet
water gets the background value; a fast-turning eddy gets its own; the planner
needs an answer at every cell it scores, not only inside features.

**Requirements:** FR-02 to FR-05. **Feature:** 004.
