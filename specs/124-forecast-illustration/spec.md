# Feature Specification: The illustration surface — what a cell's value was made from

**Feature Branch**: `claude/srd-model-forecast-specs-ws9x3d`

**Created**: 2 September 2026

**Status**: Specified

**Input**: SRD-v2 §5.20, FR-120 to FR-134 and FR-135 to FR-140, folded in from the
*Forecast illustration tool* companion document of 1 September 2026
(`docs/v2/forecast-illustration-srd.md`), with the instruction: "Consider how to
incorporate this into the overall SRD, and deliver it within the current app."

## Context

Feature 123 built the half of §5.20 that runs: a shallow two-layer forward step behind the
model kernel port, a run that occupies its declared cost in simulation time, a scheduler
that can hold a warranted run because the standing forecast still has life in it, and the
`forecast` view carrying the left region and the timeline. §5.20 says plainly which half
that was: **the surface is the deliverable, and the forward step exists because a surface
explaining a forecast needs a forecast to explain.** This feature is the deliverable.

The centre and right regions of `#/view/forecast` currently state that they are not built
and name this feature. That was a deliberate cost accepted at 123 — a view announcing its
own incompleteness for a whole feature, preferred to shipping a scheduler behaviour nothing
could see. This feature spends it.

**What the surface is for.** An operator asked to trust a forecast asks one question the
harness has never been able to answer: *what is this number made of?* Not "which model ran"
— the Operator tab has drawn that since feature 113 — but, for the water column I care
about, at the depth I care about: which observations moved it, by how much, and where the
rest came from when nothing sampled. Assimilation is arithmetic on published numbers and
every reader assumes it is magic. FR-130 is the requirement that says so.

### The finding this specification exists to record

**The per-cell provenance the analyst publishes today cannot draw a ray.** FR-111 makes the
published provenance the substrate for the whole of the centre region and the depth profile,
and FR-122 requires one ray per contributing *source* with its width proportional to *that
source's* contribution. Read against the tree, those two do not meet:

- `analyst.ts` publishes a provenance holding of **four aggregate shares** per cell —
  `archive`, `departure`, `measurement`, `model` (`config.analyst.schema.json`'s share
  vocabulary). The measurement share is Σⱼ K_aj: every observation's contribution to that
  cell, already summed.
- The analysis kernel *computes* the per-observation gain — `optimalInterpolationKernel`
  builds K row by row — and then reports `observationWeight`, the row sum, discarding the
  columns. `AnalysedObservation` carries the cell an observation was attributed to and its
  innovation, but not what it contributed to any other cell.

So a ray per source is not derivable from what is published, and FR-111's last sentence is
unambiguous about the consequence: *if a contribution cannot be read from what was published,
it is not drawn.* Three answers were available.

1. **Draw four rays** — one per share — and call the four "sources". Rejected. It reads as
   an answer to FR-122 and is not one: the archive share is not a source with a position,
   and the whole point of FR-123's spatial-versus-docked distinction dies. Worse, it would be
   a picture that *looks* like per-source attribution while being an aggregate, which is the
   exact class of dishonesty Constitution VII forbids.
2. **Derive the split in the shell** from observation positions and the declared correlation,
   labelled as derived (FR-111's fourth kind of figure). Rejected as the primary path,
   allowed as nothing. The shell would be re-implementing the gain — a second implementation
   of the analyst's arithmetic, free to disagree with it — and AT-07 asks the drawn
   contributions to sum to the *published* value of the column. A derived split that sums
   correctly by construction proves nothing about the analysis.
3. **The analyst publishes the columns it already computes.** Adopted. The kernel keeps K's
   rows for the cells it corrected and the analyst publishes a per-observation contribution
   holding beside the analysis, its error and the four shares. This is the only one of the
   three under which AT-07 is a real test, and it is a small change to a component that
   already holds the numbers.

That is recorded here rather than discovered during implementation, because it moves work
into a backend component the companion document did not mention at all.

### The two costs this feature accepts

**The analyst grows an output, and the cost is storage.** A contribution holding is
observations × corrected cells, not cells. It is bounded — the correlation reaches exactly
zero at twice the declared half-width (`AnalysisParameters.horizontalKm`), so an observation
contributes to a fixed neighbourhood and not to the domain — and the bound is read from the
configured correlation rather than assumed. A sparse holding keyed by (observation, cell) is
what is published; a dense field per observation is what is not.

*Amended before the substrate was built, on a measurement.* The paragraph above was true in
shape and wrong by an order of magnitude. On the shipped configuration (root seed 4242, the
loitering condition, in lockstep) the first three cycles assimilate 1,080, 1,572 and 1,596
observations — the kernel's own comment said "~180", written when the cadence was longer and
the platform slower — and a 60 km support over a ~5 km grid with one level of
vertical reach is ~1,200 cells per observation. Per-observation retention is therefore
~800,000 entries and ~9 MB a cycle, kept for the life of the run, against a store holding
~9 MB in total; the analyst already declines to publish salinity's four shares at three
quarters of a megabyte a cycle on the same ground. Two things follow, both recorded at the
requirements they change:

- **A source is an instrument at the cell its observations were attributed to** (FR-01, FR-03),
  not an observation. H is nearest-neighbour, so every observation a datastream makes inside
  one cell shares that cell's covariance row exactly — the same separation to every other cell,
  the same declared error — and the sum of their gains is the source's contribution by
  linearity, with nothing approximated. Tens of sources a cycle; a column has tens of rays,
  which is also the only count a reader could read.
- **The support bounds the covariance, not the gain** (FR-02). The inverse in K couples every
  observation in a connected cluster, so an observation beyond a cell's reach still moves it,
  through its correlation with one within reach. That coupling has no position a ray could be
  drawn from, so it is published per cell as one figure — the remainder — and never as a dense
  column set.

*Measured after the substrate was built:* on the loitering condition a cycle's holding is 4–6
sources, 1,144–1,203 cells reached, 3,174–4,761 entries and 75–103 KB — a tenth of the
provenance holding it sits beside — so the cost accepted above was accepted for a tenth of what
the first paragraph feared and a hundredth of what per-observation retention would have been.

**Q-01 stays open until the profile is drawn.** §10 carries the companion document's Q3 as
Q-01 — whether the depth profile's source colouring survives greyscale beyond about five
distinct sources — and says this feature answers it. It is answered by the capture and not
by this document; the task that answers it says what to do in each direction, so the answer
is not an invitation to improvise.

## Requirements

Numbered locally; the mapping onto the SRD's global numbers is in *Traceability* below.

### The substrate

- **FR-01** The analysis kernel retains, for each **source** — an instrument at the cell its
  observations were attributed to — its contribution to each cell it reached, and the analyst
  publishes them as a holding announced beside the analysis. The contribution is Σⱼ K_aj over
  the source's observations — what the published analysis actually used, summed where the
  sum is exact — and never a recomputation. *Amended before it was built; the measurement is
  under §"The two costs".*
- **FR-02** The holding is sparse and its bound is read from the configured correlation: a
  source is stored against the cells inside its support and no others. Absent means outside
  the support. *Amended before it was built:* the support bounds the covariance and not the
  gain, so the holding also carries, per corrected cell, ω — the cycle's total observation
  weight, which is exactly zero where no source reaches — and the **remainder**, ω less the
  in-support sources' sum: what observations beyond the cell's reach contributed through
  their coupling with those within it. Σ sources + remainder = ω is the identity the tests
  hold, and a level's profile draws the remainder as a band that is not a ray.
- **FR-03** Each contribution names its **source** — the datastream that produced the
  observations and the cell they were attributed to — and whether that source is **measured**
  or **modelled**. In this harness every observation the analyst assimilates is a vessel
  instrument's, so every source in the holding is measured; the flag is carried so the master
  states the distinction rather than the shell assuming it. The modelled origins — the archive
  eras, the departure forecast, the model's own error, the shore broadcast — never enter the
  gain: they are the background's shares (FR-10, FR-125) and are the baseline the profile
  stacks the sources on. The shore broadcast is modelled (FR-125's answer to the companion
  document's Q1).
- **FR-04** For any contribution the holding carries the two numbers that produced it: the
  separation between the observation and the cell, and the observation's declared error
  against the background's at that cell. FR-130 is a requirement about arithmetic being
  available, so the arithmetic is published rather than reconstructed.

### The volume

- **FR-05** The centre region draws the field as a semi-transparent volume with the
  thermocline as a surface through it, the surface's own appearance carrying its strength.
  The eddy, front and drifting feature — forecast as features by feature 123 — are drawn as
  tracked features with their uncertainty, not as texture.

  *Amended before this feature started:* **the plan view of those tracks landed in feature
  123**, in the right region, because the tab otherwise had no graphic of a forecast at all
  and `ctl/forecast/features` had no consumer while this feature waited on the analyst change
  §"The finding" records. What remains here is the part that genuinely needs the volume: the
  same features carried **with depth**, against the field they are in. This feature adds a
  dimension to a drawing that exists; it does not introduce it.
- **FR-06** A clickable grid is carried on the surface plane above the volume. Selection is
  by grid square and yields a water column. Nothing inside the volume is clickable.
- **FR-07** A parameter control and a depth control sit beside the volume. The parameter
  defaults to sound speed, derived by the one implementation (ADR-0005).

### The rays

- **FR-08** Selecting a column draws rays on the surface plane from the selected square to
  each contributing source, each ray's width proportional to that source's contribution to
  the column. Rays are drawn on the surface plane only and never descend into the volume.
- **FR-09** Spatial sources are drawn where they physically are. Non-spatial sources are
  docked as fixed, labelled nodes at the margin of the surface plane, in positions stable
  across selections.
- **FR-10** Sources are grouped and marked measured or modelled, and the standing forecast is
  **not** among them: it is the background, drawn as the baseline of the depth profile's
  stack and never as a ray.

### The profile

- **FR-11** Beside the volume, a profile with depth running down the vertical axis shows, for
  the selected column, the composition of each depth level as bands sized by contribution and
  coloured by source, the background as the baseline band.
- **FR-12** Selecting a level re-weights the rays to that level's contributions: same origins,
  same sources, different widths. No second geometry.
- **FR-13** A level with no contribution from any observation says so, and is drawn
  distinguishably from a level that was sampled and whose contributions summed to nothing.
- **FR-14** For any contribution the surface states the separation and the two errors from
  FR-04, on demand, in the region the contribution is drawn in.

### Ahead, and before

- **FR-15** The right region draws the ensemble spread ahead, along the planned route where
  one exists, widening where confidence decays against tau. Where the displayed instant lies
  outside the holding's time axis the region says so.
- **FR-16** The previous forecast is drawn as a ghost layer simultaneously with the current
  one — ghosted values and ghosted rays at their own widths — and never as a scrubber between
  two states.
- **FR-17** The ghost layer is toggleable and closed at rest.

### Inherited

- **FR-18** Nothing is drawn that was not fetched. Selecting a timeline run whose fields have
  not arrived shows that run arriving, never a neighbouring run's field.
- **FR-19** No polling: the surface refreshes on the store's announcement and at no other
  time.
- **FR-20** Motion comes from the system or is declared as illustration, and reads no host
  clock.
- **FR-21** Legible in greyscale, keyboard-traversable, honouring `prefers-reduced-motion`.
  Colour carries source identity in the profile, so a redundant encoding is required and not
  a courtesy.
- **FR-22** Code-split from the shell, as the map and the Data tab's WebGL surfaces are.
- **FR-23** The panel's help tour gains steps for the regions this feature builds, held to the
  same list on disk, so a region gaining a feature and not a step is reported by name.

## Traceability

| Local | SRD-v2 | Acceptance |
|---|---|---|
| FR-01 to FR-04 | FR-111, FR-130 | AT-07 |
| FR-05 to FR-07 | FR-120, FR-121, FR-126 | — |
| FR-08 to FR-10 | FR-122, FR-123, FR-124, FR-125 | AT-07 |
| FR-11 to FR-14 | FR-127, FR-128, FR-129, FR-130 | AT-07, Q-01 |
| FR-15 to FR-17 | FR-131, FR-133, FR-134 | — |
| FR-18 to FR-23 | FR-135 to FR-140 | AT-11 |

FR-118, FR-119 and FR-132 — the gauge, its two silences and the timeline — landed with
feature 123 and are not restated here.

## What is deliberately not done, and why

- **A real assimilation scheme.** 3D-Var, EnKF and their relatives are named in the explainer
  and implemented nowhere (FR-107). Drawing optimal interpolation's own arithmetic honestly
  is the whole of this feature's claim.
- **Clicking into the volume.** Ruled out at FR-121, with the reason recorded there: picking
  inside translucent geometry is unreliable, and the column is both the tractable selection
  and the honest one.
- **Rays that descend into the volume.** Ruled out at FR-122. Depth is answered by the
  profile.
- **A scrubber between forecasts.** Ruled out at FR-133, and the reason is the finding: the
  ghosted *rays* are what a comparison of output fields cannot carry.
- **Dense per-observation fields.** FR-02 publishes a sparse holding. A dense field per
  observation is the obvious implementation and is rejected on size, with the support bound
  read from the configured correlation rather than assumed.
- **A second indicator.** FR-117 is a socket and stays one.

## Acceptance

- **SC-001** The contributions drawn for a selected column sum to the published value of that
  column, cell by cell, within a stated tolerance — the picture checked against the
  provenance rather than trusted (AT-07). The tolerance is derived from the holding's own
  declared `tolerance_absolute` and never typed into the test.
- **SC-002** An observation outside its correlation's support contributes to no cell, and the
  support distance is read from `config.analyst`'s correlation rather than from a number in
  the test. Watched failing against a planted contribution beyond the support.
- **SC-003** Selecting a depth level re-weights the rays without changing their origins or
  their count. Held by a test that asserts the origin set is identical across two levels and
  the width vector is not.
- **SC-004** A level with no observational contribution renders its own statement, and is
  distinguishable in the DOM from a level whose contributions summed to zero.
- **SC-005** The standing forecast never appears as a ray. Held by a test over the drawn ray
  set, and by the profile's baseline band being the background.
- **SC-006** With the timeline moved to a run whose fields have not been fetched, the centre
  region shows that run arriving and no field values are drawn from any other run (FR-18).
- **SC-007** Nothing in the view polls: advancing the clock with no announcement published
  makes no fetch; publishing one refetches.
- **SC-008** **Q-01 is answered by capture, not by assertion.** The profile is drawn with the
  full source set the scenario produces, captured in greyscale, and the capture is read. If
  distinct sources are not separable, sources are grouped — measured by platform, modelled by
  origin — and the grouping is recorded here as the answer with the capture that forced it.
  If they are separable beyond five, that is recorded too, with the count reached.
- **SC-009** Keyboard traversal reaches every column, every level and the ghost toggle, and
  `prefers-reduced-motion` suppresses the declared illustration motion.
- **SC-010** Every acceptance above is watched happening in the shell across the full path
  through the seam and captured, never inferred from green tests (AT-11, PR-06).
