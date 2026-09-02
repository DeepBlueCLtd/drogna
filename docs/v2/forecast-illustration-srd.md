> **Folded in — the live requirements are `srd.md` §5.20.** This companion document was
> written on 1 September 2026 and adopted at feature 123. Its FI-01 to FI-35 are now FR-106
> to FR-140 and its FA-01 to FA-06 are AT-06 to AT-11, each citing its origin here as
> *(FI-nn)*. Of the three questions §9 raised open, Q1 is answered at FR-125 (the shore
> broadcast is background) and Q2 at FR-114 (no wall-clock exemption; cost is simulation
> time); Q3 remains open as the SRD's Q-01. This file is kept unchanged below as the record
> of how the requirements were written, on the pattern `harness-srd.md` set — nothing is
> dropped silently, and where the two disagree `srd.md` is the authority.

# Software Requirements Document
## Forecast illustration tool

**Status:** Draft, 1 September 2026. Written against `srd.md` (SRD-v2) and the
constitution at 2.1.0. This is a companion document, not an amendment: it specifies one
new backend capability and one new surface, both of which land inside drogna and answer
to every constraint drogna already carries.
**Author:** Doc
**Date:** 1 September 2026

Requirements carry their own numbers in an **FI-** space, because `srd.md`'s FR- space is
cited across `specs/` and the ADRs and a second document writing into it would collide on
the next feature. Where a requirement descends from drogna's own, the provenance is cited
as *(FR-nn)*.

---

## 1. Purpose

drogna assimilates but does not forecast. Its analyst corrects a standing field by
optimal interpolation and publishes the analysis, its error and its per-cell provenance
(FR-30); its model runner then advects that analytically with noise. Advection is not
a forecast — it slides a field sideways rather than propagating a state — and the
distinction matters because the thing an operator most needs explained is the one thing
the harness currently cannot show.

This tool exists to close that gap in **two** places at once, and the pairing is the
point:

1. A **forward step** thin enough to run in a browser tab and honest enough to be called
   a forecast rather than a translation.
2. An **illustration surface** that makes the mechanics of assimilation visible —
   specifically, what a given cell's value was made from and in what proportion.

The second is the deliverable. The first exists because a surface explaining a forecast
needs a forecast to explain.

### 1.1 What this is not

- **FI-01** The numerics remain deliberately fake and the data synthetic (FR-01). This
  tool models no third-party entity, holds no track, and does not become a candidate
  system by acquiring a forward step. The surface shall state, where a reader meets it,
  that the physics is a teaching approximation and name the real schemes it stands in for.
- **FI-02** This is **not** an implementation of, port of, or wrapper around an
  operational assimilation system. NEMO, ROMS, MITgcm, PDAF, DART, OceanVar and OpenDA
  are named in the explainer as what the real thing is, and nothing here claims kinship
  with them beyond structure. Neither Pyodide nor any transpiled Fortran enters the
  application: NFR-01's one-codebase-one-browser constraint is not spent on this.
- **FI-03** The tool does not decide. It shows what a re-forecast would cost and what
  the standing one is worth; the operator chooses (Constitution VIII, FR-34). Where a
  requirement here sounds like an alarm, §4 draws the line.

---

## 2. Relationship to drogna

- **FI-04** The forward step lands **behind the existing model kernel port** (§2.2 of
  `srd.md`) as a second implementation. No component outside the port learns that it
  changed. This is the port doing the work it was declared for, and the ADR shall say so
  plainly rather than treating it as a new abstraction.
- **FI-05** The illustration surface is a **panel of the shell** reached through the seam
  and nowhere else (FR-02, FR-92): relative-path GETs against configured prefixes,
  validated against the master the response declares before anything is drawn (FR-96).
  It imports no backend module.
- **FI-06** Every figure the surface shows shall already be published by an existing
  component or be **derived by the shell and labelled as derived**, the fourth kind of
  figure beside declared, reported and observed (ADR-0036, FR-70). The per-cell
  provenance the analyst already publishes is the substrate for the whole of §5; if a
  contribution cannot be read from what was published, it is not drawn.

---

## 3. The forward step

- **FI-07** The kernel shall integrate a **shallow two-layer advection–diffusion step**
  over the coarse grid: real physics, deliberately impoverished physics, propagating
  state forward rather than translating a field. It shall be a pure function of its
  initialisation state, the clock and its own seed stream (Constitution I, II), and shall
  replay byte-identically (AT-04).
- **FI-08** The seeded features shall be **forecast as features**, not merely carried in
  the field: the eddy's centre, radius and strength; the front's position and orientation;
  the thermocline's depth and gradient; the drifting feature's track. Each shall be
  published with a growing uncertainty, so that a forecast makes a falsifiable claim
  about next week rather than a picture of it. The manifest's ground truth is what scores
  it (FR-06, AT-03).
- **FI-09** The step's **cost shall be declared and real**. The kernel reports the
  simulation time a run covers and the wall-clock duration it took, and the duration is
  not smoothed, hidden behind a spinner, or amortised across ticks. A forecast that is
  expensive in the real system and free in the harness would teach the wrong lesson. This
  is the one place a wall-clock figure is read for a *reported* purpose, and it shall be
  declared as a bounded exemption in the constitution or the requirement shall be met
  another way — the exemption is not assumed by this document.

---

## 4. Cost as a domain fact

The insight this section exists for: a forecast that takes minutes is not an engineering
embarrassment to be optimised away, it is a **planning problem the operator owns**. The
vessel chooses when to spend the compute — on passage, in quiet water, before a decision
point — and the system's job is to make need and cost legible together.

- **FI-10** The scheduler shall carry a second dimension beside *is a run warranted*
  (FR-31): **can a run be afforded now**. A run has a declared duration and a window; the
  scheduler may hold a warranted run pending an affordable window, and a run held for
  cost is labelled distinctly from a run declined by the minimum interval and from a run
  nothing has requested. Three facts, never one appearance (FR-32).
- **FI-11** The operator may **commit a run against the stated cost** (FR-65). A run
  accepted from that prompt is labelled as reader-requested in its request, is weighed
  under exactly the policy a divergence is weighed under, and may be declined — the
  control plane dispatches, the scheduler decides (FR-63).
- **FI-12** **Boundary.** The indicator that re-forecasting is becoming valuable is
  *environmental science* and belongs to the environmental-indicators workstream, not to
  this tool. What this tool provides is the **socket**: a declared topic on which such an
  indicator publishes, a gauge that renders whatever is published there, and a refusal
  that names the absence when nothing is. The tool ships with drogna's own residual
  statistic wired into that socket as the reference implementation, and the surface says
  which it is showing. System health — ingest stopped, a component gone quiet, a store
  growing without bound — is a separate concern already drawn by the Operator tab (FR-57)
  and is not duplicated here.

---

## 5. The illustration surface

One view, three regions and a timeline. Left to right is time: why now, what changed,
what next.

### 5.1 The left region — why now

- **FI-13** A **vertical gauge** shall show the accumulating disagreement between what
  has been measured and what the standing forecast said, with the threshold at which a
  run becomes warranted marked on it, and the **cost of a run stated beneath it** in the
  same frame. Need and cost are read together or the panel has not done its job.
- **FI-14** The gauge shall be **reported, not derived** where the figure is published,
  and derived-and-labelled where it is not; it shall never be drawn from a configured
  expectation. An empty gauge and an unheard indicator are different facts and are drawn
  differently (Constitution VII, FI-12).

### 5.2 The centre region — the field, and what made it

- **FI-15** The field shall be presented as a **semi-transparent volume** with the
  **thermocline drawn as a surface through it**, its strength carried by the surface's own
  appearance. A surface is required rather than a depth slice because the thermocline
  domes, tilts and breaks, and shape is the answer a sonar user is asking for. The eddy,
  front and drifting feature (FI-08) are drawn as tracked features with their
  uncertainty, not merely as texture in the field.
- **FI-16** A **clickable grid shall be carried on the surface plane** above the volume,
  and selection is by grid square — a **water column**, not a point. Picking inside
  translucent geometry is unreliable, and the observations that matter most (XBT, CTD)
  are columns rather than points, so the column is both the tractable selection and the
  honest one.
- **FI-17** Selecting a column shall draw **rays on the surface plane** from the selected
  square to each contributing source, **width proportional to that source's contribution**
  to the column. Rays are drawn on the surface plane only and **never descend into the
  volume**: depth is answered by §5.3, and a ray sorted against translucent geometry is a
  rendering problem bought for no explanatory gain.
- **FI-18** Sources shall be positioned by kind. **Spatial sources** — the vessel's own
  casts and drops — are drawn where they physically are. **Non-spatial sources** — the
  legacy archive, the recent archive, climatology, the shore broadcast — are **docked as
  fixed nodes at the margin of the surface plane**, labelled, in stable positions across
  selections, so a reader learns where to look. The margin position is an admission that
  those sources have no geometry, not a substitute for one.
- **FI-19** Sources shall be grouped and marked as **measured** (own sensing) or
  **modelled** (climatology, archives, the shore broadcast). The shore broadcast is
  modelled: it is another party's forecast and is drawn as such.
- **FI-20** The **standing forecast is not a contributing source and shall not be drawn
  as a ray.** It is the background — the baseline the corrections sit on — and is drawn
  as the baseline of the stack in §5.3. This distinction is the grammar of assimilation
  and the surface shall not blur it for visual convenience.
- **FI-21** A **parameter control and a depth control** shall sit beside the volume. The
  parameter shall default to **sound speed**, being both the quantity the reader cares
  about and a derived one — which states, without a caption, that the system computes
  rather than stores (FR-05, ADR-0005).

### 5.3 The depth profile — where each source mattered

- **FI-22** Beside the volume, a **profile with depth running down the vertical axis**
  shall show, for the selected column, the **composition of each depth level** as bands
  sized by contribution and coloured by source, with the background as the baseline
  band (FI-20). The expected reading — an XBT dominating the upper water column, an
  archive taking over below where nothing sampled — is the thing this panel exists to
  make obvious.
- **FI-23** Selecting a level in the profile shall **re-weight the rays** to that level's
  contributions. It shall not move them, redraw their origins, or introduce a second
  geometry: same origin, same sources, different widths. The volume carries *which
  sources*; the profile carries *where they mattered*; neither is read through the other.
- **FI-24** A level with **no contribution from any observation** shall say so and shall
  not be drawn as a background-only band indistinguishable from a level nobody sampled by
  coincidence. Absent, null and declined are three different facts (FR-41).
- **FI-25** Weights shall be **explicable, not merely shown**. For any contribution the
  surface shall be able to state the two numbers that produced it — the separation, and
  the declared error of that source against the background's — because the weighting is
  the part every reader assumes is magic, and it is arithmetic already in the published
  provenance.

### 5.4 The right region — what next

- **FI-26** The right region shall draw the **ensemble spread ahead**, along the planned
  route where one exists, widening where confidence decays against tau (FR-33). Where the
  displayed instant lies outside the holding's time axis the region says so rather than
  implying the forecast extends there (FR-40).

### 5.5 The timeline

- **FI-27** Along the foot of the view, a **timeline of runs in simulation time**, each
  **labelled by cause** — scheduled, divergence-triggered, reader-requested, held for cost
  (FR-31, FI-10, FI-11). Selecting a run sets what the other three regions show.

### 5.6 Comparison with the previous forecast

- **FI-28** The previous forecast shall be shown as a **ghost layer drawn simultaneously**
  with the current one — ghosted values **and ghosted rays at their own widths** — rather
  than reached by a scrubber between two states. Both present at once is what makes the
  change readable; a slider asks the reader to hold one state in memory while looking at
  the other. *This reverses the design as first sketched, which had a scrubber in the
  centre panel, and the reason is kept: the ghosted **rays** are the finding. A source
  that dominated the last run and barely matters now is an insight no comparison of
  output fields can carry.*
- **FI-29** The ghost layer shall be **toggleable and closed at rest**, so a reader meets
  the current forecast first and asks for the comparison rather than having to unpick it
  from a crowded canvas.

---

## 6. Inherited constraints

Nothing in this document weakens any of the following, and each is called out because
this surface is the kind that tempts an exception.

- **FI-30** **Nothing shall be drawn that was not fetched** (FR-101). Scrubbing the
  timeline to a run whose fields have not been fetched shows that run arriving, never a
  neighbouring run's field.
- **FI-31** **No polling** (FR-97). The surface refreshes on the store's announcement of
  a publication and at no other time; observation arrivals are counted and applied by an
  explicit control.
- **FI-32** **Motion comes from the system or is declared as illustration** (FR-71,
  FR-90). No animation runs while nothing is arriving. Where this surface animates to
  explain rather than to report — the growth of an uncertainty ellipse, say — it is
  expressed without reading the host clock and is stated as illustration where the reader
  meets it.
- **FI-33** **Legible in greyscale, keyboard-traversable, and honouring
  `prefers-reduced-motion`** (FR-45, FR-59). Colour carries source identity in §5.3, which
  makes greyscale legibility a real constraint rather than a courtesy: a redundant
  encoding is required.
- **FI-34** **Code-split** from the shell, as the map and the Data tab's WebGL surfaces
  are, and for the same measured reason (FR-103).
- **FI-35** A **help tour** carried by the panel itself (FR-75), held to a list on disk so
  a region gaining a feature and not a step is reported by name.

---

## 7. Acceptance criteria

| ID | Test |
|---|---|
| FA-01 | A forecast run initialised from a published analysis propagates the seeded eddy, and the forecast position is scored against the manifest's ground truth with the error reported, not asserted |
| FA-02 | The contributions drawn for a selected column sum to the published value of that column, cell by cell, within a stated tolerance — the picture is checked against the provenance rather than trusted |
| FA-03 | A run held for cost, a run declined by minimum interval, and no run requested are distinguishable on the surface without reading a log |
| FA-04 | The whole scenario including a forecast run replays byte-identically from its manifest (AT-04) |
| FA-05 | With the indicator topic silent, the left region states the absence and draws no gauge; with drogna's own residual wired to it, the gauge names what it is showing (FI-12) |
| FA-06 | Every acceptance above is **watched happening in the shell** across the full path through the seam and captured, never inferred from green tests (PR-06) |

---

## 8. Deliberate exclusions

- **Cost realism.** The harness cannot demonstrate the real system's compute profile and
  shall not pretend to. It demonstrates that cost is *in the domain model*; the magnitude
  is a matter for the afloat appliance.
- **A real assimilation scheme.** 3D-Var, EnKF and their relatives are named in the
  explainer and implemented nowhere here (FI-02).
- **The indicator itself.** FI-12: socket, not science.
- **Clicking into the volume.** Ruled out in §5.2 with the reason recorded, so it is not
  rediscovered as an idea later.

## 9. Open questions

- **Q1.** Does the shore broadcast enter as **background** or as an **observation**? The
  working position is background — it is a model output that has already assimilated far
  more than the vessel will ever see, and admitting it as an observation would
  double-count what is already inside it, making the vessel's job local correction rather
  than forecasting from scratch. This is a question for the scientific lead and the answer
  changes FI-19 and FI-20.
- **Q2.** Whether FI-09's reported run duration needs a constitutional wall-clock
  exemption, or whether the figure can be carried as simulation-time cost alone.
- **Q3.** Whether the depth profile's source colouring can survive greyscale (FI-33) with
  more than about five distinct sources, or whether sources must be grouped at that point.
