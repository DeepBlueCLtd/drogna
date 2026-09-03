# Feature 124 — tasks

Feature 123 built the forward step, the cost, and the left region and timeline of
`#/view/forecast`; this feature builds the centre and right regions, which is the deliverable
§5.20 exists for. The tick goes in as the work is done with the reason written at the moment a
task is declined (CLAUDE.md, lesson 1).

## Reconciled against the tree before the first task was started

This file was written as "unstarted" and was true of the code; it was not true of the tasks.
Feature 123's last commit (`4d92726`, its seventh and eighth review rounds, T080–T086) built
more of the forecast view than this file credited, and three of the tasks below were partly
done or reshaped before anyone read them. Lesson 1 says check the tree first, so:

- **The centre region is not a stub.** `ColumnProvenance.tsx` draws the four-share provenance
  field as a map at a chosen depth, with a source selector, a depth control, keyboard traversal
  of the grid, and a picked column opened into a profile of the four shares. T012 and T018 are
  amended below to build on it rather than beside it.
- **The plan view of the forecast's features landed in the right region** (`FeatureTracks.tsx`),
  and the spec's FR-05 was amended to say so. T010 read as if the tracks were unbuilt; it is
  amended to what remains, which is depth.
- **The ensemble spread ahead is still a stated absence**, and T023 stands as written.
- **The help tour already holds a step per region**, naming this feature; T031 is a rewrite
  and was already written as one.

And the substrate was re-planned on a measurement taken before it was built, recorded at
`spec.md` §"The finding" and in T001–T002 below: a cycle assimilates 1,080–1,572 observations
on the shipped configuration, each reaching ~1,200 cells, so per-observation retention is
~9 MB a cycle against a store of ~9 MB in total. The retention is per **source** — an
instrument at the cell its observations were attributed to — which is exact by linearity and
loses nothing the picture reads.

The order below is the order the dependencies run in: the substrate before the picture,
because the finding recorded in `spec.md` is that the picture cannot be drawn from what is
published today.

## The substrate — the analyst publishes what it already computes

- [ ] T001 `kernel.ts` (analyst): `AnalysisField` gains the per-source contributions the gain
      already produces — K_aj kept per (source, cell) instead of collapsed into
      `observationWeight`. The row sum stays: it is what the measurement share is, and a
      consumer that recomputed it from the columns would be a second implementation.

      *Amended before it was built.* A **source** is an instrument at the cell its observations
      were attributed to, not an observation. H is nearest-neighbour, so every observation a
      datastream makes inside one cell shares that cell's covariance row exactly — the same
      separation to every other cell, the same declared error — and the sum of their K_aj is
      the source's contribution by linearity, with nothing approximated. What forced it is
      size: measured on the shipped configuration, a cycle assimilates 1,080–1,572
      observations (the kernel's own comment said ~180) and each reaches ~1,200 cells at a
      60 km support over a 5 km grid, so per-observation retention is ~800,000 entries and
      ~9 MB a cycle, kept for the life of the run, against a store holding ~9 MB in total.
      Per source it is tens of sources a cycle, and a column has tens of rays rather than
      hundreds — which is also the only count a reader could read.
- [ ] T002 The retention is bounded by the correlation's own support: Gaspari–Cohn reaches
      exactly zero at twice the declared half-width, so a source outside it holds no entry
      against the cell. The bound is read from `AnalysisParameters`, never a constant.

      *Amended before it was built.* The support bounds the **covariance**, not the gain. K =
      BHᵀ(HBHᵀ+R)⁻¹, and the inverse couples every observation in a connected cluster, so an
      observation beyond a cell's reach still moves it — through its correlation with one that
      is within reach. That coupling is real (it is how two nearby casts share one innovation
      rather than counting it twice) and it is not attributable to a position a ray could be
      drawn from. So the holding carries, per corrected cell, ω — this cycle's total
      observation weight — and a **remainder**, ω less the in-support sources' sum, which is
      the coupling from beyond the cell's reach. The identity the tests hold is Σ sources +
      remainder = ω, exactly; a dense out-of-support column set is what is not stored.
- [ ] T003 `analysis-contributions.schema.json`: the column document the query layer serves —
      the sources reaching the column, each level's contributions by source with the
      separation and the two errors (spec FR-04), ω and the remainder per level — and, under
      `$defs`, the header the holding's own bytes open with. One master; amended, never
      round-tripped through a formatter.
- [ ] T004 `pnpm generate`, and commit the output.
- [ ] T005 `analyst.ts` publishes the contributions holding beside the analysis, its error and
      the four shares, and names it in `analysis-published.schema.json`'s `collections` and
      `digests` — which grows by one property each, appended. The bytes are
      `drogna-contributions-v1`, a second format `coverage-holding.schema.json` admits beside
      `drogna-f32-v1`: a header and typed arrays, because the same content as JSON measured
      several times the size and the cost this feature accepts is storage, not that much of it.
      EDR does not list it — a sparse holding is not a coverage — and says so in the code.
- [ ] T005a The query component serves it at a configured prefix (`config.query.http`,
      `config.shell.endpoints`, the boundary's allow list — three documents, appended): the
      header, and a column by `coords=POINT(lon lat)` as EDR's position query spells a
      position, validated against the master. Not under the EDR prefix: the standard has no
      such query type, and the EDR component refuses unknown types by name, which is the
      honesty this must not spend.
- [ ] T006 **Watched failing**: a planted contribution beyond the correlation's support, seen
      refused. Reverted, and said so in the commit message (SC-002).
- [ ] T007 `analyst.test.ts`: the contributions sum, per cell, with the remainder, to the cell's
      ω; and on the cold-start cycle — where the carried measurement share is nought, so the
      published share *is* ω — to the measurement share the same cycle published. The
      tolerance is the holding's own `tolerance_absolute`, never typed in.

## The centre region — the volume and its grid

- [ ] T008 `panels/forecast/Volume.tsx`, code-split as the map is (`registry.tsx`'s
      `DEFERRED_VIEWS` gains nothing; the split is inside the panel, on the Data tab's
      precedent).
- [ ] T009 The semi-transparent field with the thermocline as a surface through it, its
      strength carried by the surface's appearance. Not a depth slice: the reason is at
      FR-120 and is that the thermocline domes, tilts and breaks.
- [ ] T010 The eddy, front and drifting feature carried **with depth** in the volume, against
      the field they are in, read from the forecast-features holding feature 123 publishes.
      *Reconciled:* the plan view of the same features is built (`FeatureTracks.tsx`, 123's
      T080) and stays in the right region; this task adds a dimension to a drawing that
      exists and does not introduce it.
- [ ] T011 The clickable grid on the surface plane; selection by grid square, yielding a
      water column. Keyboard traversal reaches every square. *Reconciled:* the share map in
      `ColumnProvenance.tsx` already selects a column by square with arrow keys and enter;
      the volume's grid is the same selection and must not be a second one.
- [ ] T012 The parameter control, defaulting to sound speed, and the depth control.
      *Reconciled:* a depth control exists on the share map (123's T084) and walks the same
      column; the volume shares it rather than gaining a second. The parameter control is new.

## The rays

- [ ] T013 `rays.ts`: contributions for the selected column, by source, widths proportional to
      contribution. Pure; no DOM, so the arithmetic is testable alone. A source is what the
      holding says it is (T001): an instrument at a cell, so its ray has one origin.
- [ ] T014 Spatial sources placed where they are; non-spatial sources docked at the margin in
      positions stable across selections, from a declared order rather than from whatever the
      holding happened to list first. The remainder (T002) has no position and is not a ray:
      it is stated in the region, as coupling from beyond the column's reach.
- [ ] T015 Measured and modelled grouped and marked. The shore broadcast is modelled.
- [ ] T016 The standing forecast is not in the ray set (SC-005), and the omission is a named
      condition in the code rather than an absence to be read as an oversight.
- [ ] T017 Rays never descend into the volume: drawn on the surface plane, held by a test over
      the drawn geometry rather than by a comment.

## The profile

- [ ] T018 `Profile.tsx`: depth down the vertical axis, each level's composition as bands
      sized by contribution and coloured by source, background as the baseline band.
      *Reconciled:* `ColumnProvenance.tsx` already opens a picked column into a profile of the
      four shares; this profile replaces the measurement share's band with the sources' bands
      and the remainder, and keeps the other three as the baseline it sits on.
- [ ] T019 Selecting a level re-weights the rays and does not move them (SC-003).
- [ ] T020 A level with no observational contribution states that, distinguishably from a
      level whose contributions summed to zero (SC-004). Absent, null and declined are three
      facts.
- [ ] T021 The two numbers behind any contribution, stated in the region it is drawn in
      (FR-130): the separation, and the observation's declared error against the background's.
- [ ] T022 `contributions.test.ts`: the drawn contributions sum to the published value of the
      column, cell by cell, within the holding's own declared tolerance (SC-001, AT-07).

## The right region, and the ghost

- [ ] T023 The ensemble spread ahead, along the planned route where one exists, widening
      against tau. Outside the holding's time axis the region says so rather than implying
      the forecast extends there. *Reconciled:* still a stated absence in the region, beneath
      the plan view 123 landed.
- [ ] T024 The ghost layer: the previous forecast drawn simultaneously, ghosted values and
      ghosted rays at their own widths. Toggleable, closed at rest.
- [ ] T025 A test that the ghost's rays are the previous run's and not the current run's
      re-weighted — the finding at FR-133 is that a source which dominated the last run and
      barely matters now is what this shows, so a ghost that redraws the current widths shows
      nothing.

## The constraints, held rather than asserted

- [ ] T026 Nothing drawn that was not fetched: moving the timeline to an unfetched run shows
      it arriving (SC-006).
- [ ] T027 No polling: advance the clock with no announcement, assert no fetch; publish one,
      assert a refetch (SC-007).
- [ ] T028 Motion is the system's or is declared as illustration, and reads no host clock —
      `check-wallclock` covers the second half; the first is a test that nothing animates while
      nothing is arriving.
- [ ] T029 Greyscale, keyboard traversal and `prefers-reduced-motion`, captured (SC-009).
- [ ] T030 **Q-01, answered by the capture** (SC-008). Draw the profile with the scenario's
      full source set, capture in greyscale, read it. Separable: record the count reached.
      Not separable: group sources — measured by platform, modelled by origin — and record the
      grouping here as the answer, with the capture that forced it. Then strike Q-01 from
      `srd.md` §10 with the answer in the requirement it lands in.
- [ ] T031 The help tour's steps for the two regions this feature fills are **rewritten**,
      not gained: feature 123 wrote a step for each saying the region is not built and naming
      this feature, and `forecast.test.tsx` already holds every region to having one. What
      changes is what they say.

## The record

- [ ] T032 The blog entry, with the capture. The rays re-weighting as a level is selected is
      the thing that moves; `pnpm capture:motion`.
- [ ] T033 The pull request links its own instance opened at `#/view/forecast`, and the entry
      by its full URL on the branch.
- [ ] T034 `pnpm snapshots` if the analyst's new output moves a committed artefact, and read
      the diff before committing it. *Reconciled:* the shipped snapshots carry the archive and
      the now-cast alone (read off the artefacts, not assumed), so a new analysis holding
      moves nothing; `check-snapshot-drift` is what says so.
- [ ] T035 Tick the tasks above as they are done, and write the reason at the moment a task is
      declined.
