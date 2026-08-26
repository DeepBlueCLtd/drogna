# ADR-0002: Decorrelation timescale is a field, authored per feature

**Status:** Accepted
**Date:** 26 August 2026
**Requirement:** SRD FR-05 (v0.3); consumed by FR-08, FR-32, FR-34
**Supersedes:** the provisional per-feature position taken in SRD v0.2

## Context

Something must govern how fast a location loses memory of a measurement. That quantity
— the decorrelation timescale, tau — drives the revisit cadence during loiter (FR-08)
and is an input to every cell the planner scores (FR-32, FR-34).

SRD v0.2 left the question open and started with tau as a property of each seeded
feature. That was recorded as an open question rather than a decision, and it did not
survive contact with the requirements that consume it.

Three formulations were available.

**Per-feature.** Each of the four seeded features of FR-03 carries its own timescale.
Simple to author, simple to record in the ground-truth manifest, and it matches the
intuition that an eddy decorrelates faster than open water. But it leaves the
background water with no timescale at all — and FR-08 explicitly requires that quiet
water be *left alone*, which is a statement about the background, not about the
features. The planner would have to invent a value for every cell outside a feature,
and an invented value is not ground truth and cannot be scored.

**Per-region.** A static map over the domain, giving every location a timescale
including the background. This fixes the gap, and it is defensible physically. But
FR-03 requires a feature of known drift velocity, and a static map cannot follow it:
the fast-decorrelating patch would stay put while the feature it describes moves away,
so the revisit pattern of FR-08 would track the wrong water.

**A field, authored per feature.** tau(latitude, longitude, depth, time), evaluated at
every location, where the value is a domain-wide background blended with the
contribution of any feature overlapping that location, and a moving feature's
timescale advects with the feature.

## Decision

The decorrelation timescale is a **field**, tau(latitude, longitude, depth, time). It
is *authored* per feature over a domain-wide background value, and *evaluated* per
location. A moving feature's timescale advects with it. Both the background value and
the per-feature timescales are ground truth and are recorded in the FR-04 manifest.

Authoring stays per feature, so a scenario is still written the way a person thinks
about it: a background, and four features that disturb it. Evaluation is per location,
so every consumer gets a defined answer everywhere.

## Consequences

- The environment generator (C-02) gains a fourth derived field alongside temperature,
  salinity and pressure. It must be advected in step with the feature that authored it.
- The manifest gains a background timescale and per-feature timescales, both scorable.
  Recovery of tau becomes a measurable claim rather than an assumption, consistent with
  Constitution IX.
- The planner may assume a defined tau at every H3 cell and depth layer it evaluates,
  including open background water. No special case for cells outside a feature.
- The blending rule between background and overlapping features is a modelling choice
  that this record does not fix. It must be stated explicitly in the generator's
  documentation and recorded in the manifest, since two features may overlap.
- Authoring and evaluation are now different shapes. The generator must not leak the
  authored per-feature representation to consumers, who see only the evaluated field.
