# Feature Specification: The analysis step, and where a value came from

**Feature Branch**: `115-analysis-step`

**Created**: 30 August 2026

**Status**: Draft — written from a structured interview with the author, 30 August 2026.
The maths is built and proven; everything downstream of it is specified and unbuilt.

**Input**: "It would be very informative to be able to view the contribution of platform
measurements to the nowcast and forecast data fields. This could be a valuable new
Background topic — showing how historic data, forecast data when the boat leaves the
quay, live measurements, and received vector forecast updates get combined. Think
through the maths behind this, and how to illustrate it. Then check that our
implementation matches that, and how measured or forecast data is shown in the map."

## Context

The interview opened on a question about a display and closed on a defect in the
system. The question was how to show the contribution of platform measurements to the
now-cast. Reading the loop to answer it established that there is no contribution to
show.

### What the tree said

The coverage store has exactly two writers.

| Writer | What it publishes | Where |
|---|---|---|
| Environment generator | The historic archive, and a rolling now-cast, both evaluated from the analytic true ocean | `app/src/backend/env-generator/generator.ts:339` |
| Model runner | The ensemble mean as the forecast, the ensemble spread as the uncertainty field | `app/src/backend/model-runner/runner.ts:280` |

The model runner initialises from `store.currentNowcast()`
(`app/src/backend/model-runner/runner.ts:93`), and that now-cast is re-evaluated from
truth every `nowcast.interval_ticks` (`app/src/backend/env-generator/generator.ts:159`).
Observations reach the observation store through the ingest seam and are served through
the query layer, and from there they feed exactly two things:

- `app/src/backend/monitor/monitor.ts:134` — `residual = observedC − forecastC`, a
  breach streak, a divergence, a run request. Measurements decide **when** a forecast
  is computed.
- `app/src/backend/planner/planner.ts:170` — the published spread and an
  observation-age field decide **where** the platform samples next.

No observation modifies a field value anywhere. There is no innovation applied to a
field, no gain, no increment, no analysis. **The loop still converges, because truth
leaks into it on a timer**, and the residuals the monitor reports fall for that reason
rather than because anything was learned. That is a demonstration harness asserting a
capability it does not have, which is the exact dishonesty the constitution's opening
sections exist to forbid — and it survived nine features because every part of it is
individually honest. Nothing lied. The arrow was simply missing.

This feature adds the arrow.

### What was decided in the interview, and what it rules out

| Decision | Consequence |
|---|---|
| Build a **real analysis step**, do not merely explain one | The Background explainer describes a live system. Rules out teaching the maths beside a system that does not do it. |
| A **new component**, the analyst, between the observation store and the model runner | The analysis is a published holding, so EDR serves it, the Map draws it and Holdings lists it. Rules out a private stage inside the runner, which would have made the step invisible at the seam. |
| The generator's now-cast becomes the **truth reference**; nothing initialises from it | `|analysis − truth|` becomes computable and watchable. Rules out deleting the truth now-cast, which would have left the monitor nothing to score against. |
| **Optimal interpolation**, with the run's own spread as the background error | Neither term of the gain is invented: B is a published field, R is each instrument's declared `noise_std`. Rules out nudging, whose weights would have made the provenance figure a cartoon. |
| Provenance carried as a **per-cell share field**, propagated every cycle | The contribution is queryable and mappable, not a number computed for one cell on demand. Rules out showing only the current cycle's split, which cannot tell the departure-to-now story. |
| **Three shares**: archive, departure forecast, measurement | Matches how an operator thinks about it. Costs an admission: see *the departure bar is a convention*, below. |
| The analysis **publishes its own error field**, and the planner reads it | FR-33's observation-age term is retired: doubt falls where sampling actually reduced it, not where a timer says it should have. Rules out two competing notions of doubt. |
| The analyst runs **on the run trigger**, before each forecast | Background and analysis pair one-to-one with forecasts, so lineage is exact. Costs responsiveness: between breaches nothing is assimilated. |
| Shore advisories are the **fourth arrow, and a different kind of arrow** | They are guidance with a region and a validity window, not a field that blends numerically. Rules out inventing a shore forecast field. |
| The explainer sits **fifth in the course**, after *What a holding is* | Holdings introduces the eras as different things; this shows a measurement moving between them. It is the only explainer depicting drogna's own maths rather than a standard, and must say so. |
| The Map shows a **provenance tint** | The stacked bar as geography. Depends on provenance being a field, which the decision above makes it. |

## The maths

One variable, one instant, one grid. Cells are indexed `a`; observations `j`.

**The analysis.**

```
xᵃ = xᵇ + K(y − Hxᵇ)          K = BHᵀ(HBHᵀ + R)⁻¹
```

- `xᵇ` — the background: the current forecast valid at the initialisation instant.
- `y` — the observations taken since the last cycle, of this variable only. Ownship
  datastreams are excluded by name, as the monitor and planner already exclude them.
- `H` — nearest-neighbour selection: an observation is attributed wholly to one cell.
- `B` — `B_ab = σ_a σ_b ρ(a,b)`, where `σ` is the run's published ensemble spread at
  that cell and `ρ` is Gaussian in horizontal separation and in depth, with two
  correlation lengths from configuration.
- `R` — diagonal, from each instrument's declared `noise_std` in `config/run.json`.

**The error.** `Pᵃ = (I − KH)B`; the diagonal is published as the analysis error, and
is what the planner scores against.

**The provenance.** Because `H` selects, every row of `H` sums to one, so

```
xᵃ = (I − KH)xᵇ + Ky
```

is an exact linear combination whose weights sum to one. With `ω_a = Σⱼ K_aj`:

```
pᵃ_a[s]           = (1 − ω_a) · pᵇ_a[s]        for every prior share s
pᵃ_a[measurement] = (1 − ω_a) · pᵇ_a[measurement] + ω_a
```

The stacked bar is therefore not an illustration of the contribution. It is the
algebra, read off the gain. **This is the whole reason optimal interpolation was
chosen over a nudging scheme**, and it is the sentence the explainer is built around.

### Three things the maths does not let us say

**ω is not confined to [0, 1].** Where a cell's background error greatly exceeds the
observed cell's and the two are well correlated, the gain extrapolates, ω passes one,
and the prior shares go negative. This is optimal interpolation behaving correctly —
the estimate is not a weighted average in general — and it is a fact the figure must
survive. `app/src/backend/analyst/kernel.test.ts` holds it as a test so the display
cannot meet it as a surprise. The kernel reports ω unclamped: a share silently clamped
is a display telling a story the maths did not.

**The departure bar is a bookkeeping convention, not an information one.** Everything
the departure forecast contains, it got from the archive; the model propagates
information without creating any. Tagging the state at the moment the boat leaves as a
distinct source is a choice made for the operator's benefit, and the explainer must say
so on the step that introduces the third bar. Two bars — prior knowledge, and
measurement — would have been the information-theoretic answer.

**The recursion saturates, and this is unsolved.** Four analysis cycles over one short
track, with a 40 km correlation length in a 142 × 134 km domain, leave measurement
owning **at least 0.449 of every cell in the domain** and 1.077 of one cell beside the
track. Every value is correct — each cycle genuinely did move each cell — but the
shares are not, because `p ← (1−ω)p + ω` credits measurement again on every cycle
though re-observing the same water brings almost no new information. Left as it stands,
the provenance tint would show a corner of the domain the platform never approached as
half measurement-derived, which is worse than showing nothing. This is recorded as
Open Question 1 and pinned by a characterisation test; it is a fault in the recursion
across cycles rather than in the gain, so the kernel is not where it is fixed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A measurement changes the field (Priority: P1)

An evaluator watches the platform sample a region, and sees the field it sampled change
because of what it measured — the analysis published as its own holding, the value at
the sampled cells moved toward what the instruments reported, and the error there
reduced.

**Why this priority**: It is the missing arrow. Every other story in this feature
displays something that does not exist until this one lands, and until it lands the
harness demonstrates a forecast loop that does not learn.

**Independent Test**: Run a scenario in lockstep to the first breach-triggered run.
Assert the analysis holding exists, that at cells the platform sampled the analysis
differs from the background in the direction of the observation, and that the analysis
error there is below the background spread. Assert the model runner initialised from
the analysis and not from the generator's now-cast.

**Acceptance Scenarios**:

1. **Given** a run request and observations taken since the last cycle, **When** the
   analyst runs, **Then** an `analysis` era holding is published through the coverage
   store's digest-checked seam and announced on the control namespace.
2. **Given** a published analysis, **When** the model runner initialises, **Then** it
   initialises from that analysis, and a run requested when no analysis exists is
   refused with the reason named rather than falling back to truth.
3. **Given** a scenario in which the platform never samples, **When** runs are
   requested, **Then** the analysis equals the background everywhere and every share
   is unmoved — the absence of measurement is visible, not silent.

---

### User Story 2 - Where this number came from (Priority: P2)

A domain expert picks a cell in the Background explainer and watches, as the boat
sails, how much of that cell's current value it owes to the archive, to the forecast
that was valid when the boat left the quay, and to what the platform has measured
since.

**Why this priority**: This is the question that was asked. It is second only because
it has nothing to draw until Story 1 lands.

**Independent Test**: With the whole backend stopped, open the explainer, advance its
steps, and reach the closing state having seen a cell on the track and a cell off it
diverge in provenance. Every step addressable by anchor URL.

**Acceptance Scenarios**:

1. **Given** the explainer's opening step, **When** the viewer is at the quay,
   **Then** every cell's bar is wholly prior knowledge, and the step states that the
   departure bar's content is archive.
2. **Given** a cell the track passes through, **When** the boat has passed it, **Then**
   its measurement share is visibly larger than that of a cell the track avoided.
3. **Given** a cell where ω exceeded one, **When** its bar is drawn, **Then** the
   figure states what happened rather than drawing a negative share as zero.

---

### User Story 3 - The contribution, as geography (Priority: P3)

An evaluator opens the Map, selects the provenance tint, and sees a
measurement-coloured corridor along the track against an archive-coloured domain.

**Why this priority**: The Map is the arc's closing scene and this is where the value
of sampling becomes an area rather than a number. It depends on Open Question 1 being
settled, because a saturated provenance field tints the whole domain.

**Independent Test**: Drive a scenario past several analysis cycles, open the Map,
select the tint, and confirm the corridor follows the committed route and that cells
distant from it remain archive-dominated.

**Acceptance Scenarios**:

1. **Given** an analysis holding with a provenance field, **When** the tint is
   selected, **Then** each cell is coloured by its dominant share and the legend names
   the three sources.
2. **Given** the tint is selected, **When** the viewer picks a cell, **Then** the
   status line names the holding, the instant and the three shares as served.

---

### User Story 4 - Doubt falls where it was actually reduced (Priority: P4)

The planner stops scoring how long ago a region was measured and starts scoring what is
still unknown about it.

**Why this priority**: It removes a proxy, and it is the one change here that alters
existing behaviour rather than adding to it, so it carries the most risk to what
already works.

**Independent Test**: Assert the planner's scored field is the published analysis error,
that the observation-age field is gone from the planner and its configuration, and that
a route over recently analysed water scores lower gain than one over unanalysed water.

**Acceptance Scenarios**:

1. **Given** a published analysis error field, **When** the planner scores candidate
   routes, **Then** it scores against that field.
2. **Given** the analysis reduced error along the track, **When** the planner replans,
   **Then** it recommends away from the track rather than because a timer elapsed.

### Edge Cases

- **No analysis yet.** The first run of a scenario has no analysis to initialise from.
  Either the generator's first now-cast seeds the first analysis explicitly and the
  manifest's composition rule says so, or the first run is refused. Decided in
  Open Question 3.
- **No observations in the cycle.** Not an error: the gain is empty, the analysis is
  the background, every share is unmoved. Covered by test.
- **Two observations at one cell, both declaring no error.** The system is singular;
  the solve refuses and names the pivot. Covered by test.
- **An observation outside the domain.** Attributed to the nearest cell by clamping,
  which silently moves it. Open Question 4.
- **Grid mismatch between background and analysis.** The analyst refuses rather than
  interpolating, naming the two shapes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An analysis kernel MUST exist behind a port taking a background state,
  the cycle's observations, the grid and the correlation parameters, and returning the
  analysed values, the analysis error and the updated provenance shares. *(Built:
  `app/src/backend/analyst/kernel.ts`.)*
- **FR-002**: The kernel's gain MUST derive B from the published ensemble spread and R
  from each instrument's declared `noise_std`. No error term may be a literal in the
  analysis code. *(Built.)*
- **FR-003**: The kernel MUST report the observation weight ω per cell without
  clamping, and MUST NOT clamp a resulting negative share. *(Built.)*
- **FR-004**: The kernel MUST publish the diagonal of `Pᵃ = (I − KH)B` as the analysis
  error. *(Built.)*
- **FR-005**: An analyst component MUST subscribe to the run request topic, read the
  observations taken since its last cycle and the current forecast as background,
  call the kernel, and publish an `analysis` era holding through the coverage store's
  one write seam before the model runner initialises.
- **FR-006**: The model runner MUST initialise from the current analysis. A run
  requested when no analysis exists MUST be refused with the reason named; it MUST NOT
  fall back to a truth-derived field.
- **FR-007**: The environment generator MUST continue to publish its truth-derived
  now-cast, and no component other than the monitor's scoring and the display MUST read
  it. The gate registry gains a check that the model runner does not.
- **FR-008**: The analysis manifest's `composition` MUST state the rule, the
  correlation lengths used, the count of observations assimilated and the identity of
  the background holding — the lineage readable from the holding alone.
- **FR-009**: A provenance field with one share per source MUST be published alongside
  each analysis, every cell's shares summing to one within float32 tolerance.
- **FR-010**: The planner MUST score against the published analysis error, and the
  observation-age field MUST be removed from the planner and from its configuration
  document. SRD-v2 FR-33 is amended by this feature.
- **FR-011**: `coverage-holding.schema.json` MUST admit an `analysis` era. The master is
  amended, never rewritten; SRD-v2 FR-21's three eras become four.
- **FR-012**: A Background explainer MUST be added fifth in the course, after *What a
  holding is*, taking the course to twelve. It MUST state that it depicts drogna's own
  arrangement rather than a standard, and MUST link the live view.
- **FR-013**: The explainer's central figure MUST be one cell's provenance over time,
  as a stacked bar, and MUST state on the step that introduces it that the departure
  bar's content is archive and the distinction a convention.
- **FR-014**: The explainer MUST NOT read run state, in common with every other
  explainer (feature 111 FR-004).
- **FR-015**: The Map MUST offer a provenance tint colouring each cell by its dominant
  share, with a legend naming the three sources, and the status line naming the
  holding, instant and shares for a picked cell.

### Key Entities

- **Analysis holding** — a coverage holding of era `analysis`: the analysed field, its
  manifest stating its lineage and composition rule.
- **Analysis error field** — the diagonal of `Pᵃ`, published as its own holding, read
  by the planner and drawable by the Map.
- **Provenance field** — one array per source, same grid, shares summing to one.
- **Analyst configuration** — correlation lengths, the observation window, the share
  vocabulary, the topics. A new master under `contracts/schemas/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a lockstep scenario, the analysis differs from its background at every
  cell the platform sampled, and the difference has the sign of the innovation.
- **SC-002**: The analysis error at sampled cells is strictly below the background
  spread there, and equals the closed form `σ²ᵦσ²ₒ/(σ²ᵦ+σ²ₒ)` for a single observation.
  *(Proven at the kernel: `kernel.test.ts`.)*
- **SC-003**: Every cell's shares sum to one within float32 tolerance, over repeated
  cycles. *(Proven at the kernel.)*
- **SC-004**: Root-mean-square error against truth falls after an analysis, and falls
  further at sampled cells than across the domain. *(Proven at the kernel, with a
  bound derived from the declared instrument error rather than typed in.)*
- **SC-005**: The same bound rejects an analysis computed with the gain's sign
  reversed. *(Proven at the kernel: the negative control.)*
- **SC-006**: No component other than the monitor and the display reads the
  truth-derived now-cast, enforced by a gate.
- **SC-007**: With the platform stopped for a whole scenario, no cell's measurement
  share exceeds zero.
- **SC-008**: The Background course has twelve explainers, all traversable with the
  backend stopped, all addressable, all closing on the same value panel.

## Out of Scope

- **A shore forecast field.** Advisories remain guidance documents, and the fourth
  arrow is drawn as a different kind of arrow. Revisit if a second producer of gridded
  state is ever wanted.
- **Assimilating ownship datastreams.** Course, speed and depth measure the platform,
  not the sea. Excluded by name, as elsewhere.
- **A variational or ensemble scheme.** The port admits one; this feature implements
  optimal interpolation and no other.
- **Cross-variable covariance.** Temperature and salinity are analysed independently,
  though they are physically correlated. Stated as an assumption below rather than
  left to be discovered.
- **Bias correction.** The analysis assumes unbiased background and observations.

## Assumptions

- Observation counts stay in the tens per cycle — four instruments on a thirty-tick
  cadence — so a direct Cholesky factorisation is right and no iterative solver or
  sparsity scheme is warranted. **If a fleet is ever put in the water this argument is
  re-made, not inherited.**
- The ensemble spread is a usable stand-in for background error. It is the spread of a
  five-member ensemble whose only source of divergence is per-cell noise growing with
  lead time, so it is smooth and nearly uniform — which is exactly why ω can exceed one
  only where the spread is made non-uniform. A real system's B would be structured.
- Nearest-neighbour `H` is adequate at this grid spacing. It is also what makes the
  provenance exact, so replacing it with interpolation is not a free change.
- Temperature and salinity are analysed independently.

## Open Questions

1. **How is the provenance recursion kept from saturating?** Measured: four cycles over
   one short track leave every cell at least 0.449 measurement. The candidate answer is
   principled rather than cosmetic — the forecast step adds model error, that added
   variance belongs to no observation, so every share should be diluted by `σ²ₐ/σ²_f`
   at the propagation step, with the remainder credited to a fourth *model* share. This
   would also make measurement share decay as a forecast ages, which is the honest
   behaviour the figure wants: the boat's measurement mattered a lot yesterday and less
   today. **Unresolved, and blocking User Story 3.** A localisation radius bounding a
   measurement's reach is the alternative or the complement; it must be argued
   physically, not as a compute optimisation, because at this observation count it buys
   no speed.
2. **What does the figure draw when a share is negative?** Stating it is required
   (FR-003, FR-013); how, is not settled.
3. **What seeds the first analysis?** Either the generator's first now-cast, once, with
   the manifest saying so, or refuse the first run. The first is a one-off truth leak
   at t=0 that must be visible in the lineage; the second delays the loop's start.
4. **An observation outside the domain** is currently attributed by clamping, which
   moves it. Refusing it, flagging it at ingest, or clamping and recording the fact are
   the three options; none is chosen.
5. **Does the departure bar earn its place?** It is a convention, and the explainer has
   to admit as much. Two bars would need no admission. Kept because the operator's
   question is genuinely "how much of this is what we knew before we sailed".

## What is built

`app/src/backend/analyst/` — the kernel port, `optimal-interpolation-v1`, the dense
solve it needs, and fifteen tests. The tests were shown to have teeth before this was
written: four faults were planted in the kernel, each was caught by three or four
tests, and each was reverted. The commit message records them.

Everything else in this specification is unbuilt.
