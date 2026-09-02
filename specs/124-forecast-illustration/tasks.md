# Feature 124 — tasks

Unstarted. Feature 123 built the forward step, the cost, and the left region and timeline of
`#/view/forecast`; this feature builds the centre and right regions, which is the deliverable
§5.20 exists for. Nothing here is ticked, and the tick goes in as the work is done with the
reason written at the moment a task is declined (CLAUDE.md, lesson 1).

The order below is the order the dependencies run in: the substrate before the picture,
because the finding recorded in `spec.md` is that the picture cannot be drawn from what is
published today.

## The substrate — the analyst publishes what it already computes

- [ ] T001 `kernel.ts` (analyst): `AnalysisField` gains the per-observation contributions the
      gain already produces — K_aj kept per (observation, cell) instead of collapsed into
      `observationWeight`. The row sum stays: it is what the measurement share is, and a
      consumer that recomputed it from the columns would be a second implementation.
- [ ] T002 The retention is bounded by the correlation's own support: Gaspari–Cohn reaches
      exactly zero at twice the declared half-width, so a contribution outside it is not
      stored. The bound is read from `AnalysisParameters`, never a constant.
- [ ] T003 `analysis-contributions.schema.json`: a sparse holding keyed by observation and
      cell, each entry carrying the contribution, the source, whether the source is measured
      or modelled, the separation, and the two errors (spec FR-04). One master; amended, never
      round-tripped through a formatter.
- [ ] T004 `pnpm generate`, and commit the output.
- [ ] T005 `analyst.ts` publishes the contributions holding beside the analysis, its error and
      the four shares, and names it in `analysis-published.schema.json`'s `collections` and
      `digests` — which grows by one property each, appended.
- [ ] T006 **Watched failing**: a planted contribution beyond the correlation's support, seen
      refused. Reverted, and said so in the commit message (SC-002).
- [ ] T007 `analyst.test.ts`: the contributions sum, per cell, to the measurement share the
      same cycle published — the two are the same arithmetic and a test that lets them drift
      is the one this feature needs most.

## The centre region — the volume and its grid

- [ ] T008 `panels/forecast/Volume.tsx`, code-split as the map is (`registry.tsx`'s
      `DEFERRED_VIEWS` gains nothing; the split is inside the panel, on the Data tab's
      precedent).
- [ ] T009 The semi-transparent field with the thermocline as a surface through it, its
      strength carried by the surface's appearance. Not a depth slice: the reason is at
      FR-120 and is that the thermocline domes, tilts and breaks.
- [ ] T010 The eddy, front and drifting feature drawn as tracked features with their
      uncertainty, read from the forecast-features holding feature 123 publishes.
- [ ] T011 The clickable grid on the surface plane; selection by grid square, yielding a
      water column. Keyboard traversal reaches every square.
- [ ] T012 The parameter control, defaulting to sound speed, and the depth control.

## The rays

- [ ] T013 `rays.ts`: contributions for the selected column, grouped by source, widths
      proportional to contribution. Pure; no DOM, so the arithmetic is testable alone.
- [ ] T014 Spatial sources placed where they are; non-spatial sources docked at the margin in
      positions stable across selections, from a declared order rather than from whatever the
      holding happened to list first.
- [ ] T015 Measured and modelled grouped and marked. The shore broadcast is modelled.
- [ ] T016 The standing forecast is not in the ray set (SC-005), and the omission is a named
      condition in the code rather than an absence to be read as an oversight.
- [ ] T017 Rays never descend into the volume: drawn on the surface plane, held by a test over
      the drawn geometry rather than by a comment.

## The profile

- [ ] T018 `Profile.tsx`: depth down the vertical axis, each level's composition as bands
      sized by contribution and coloured by source, background as the baseline band.
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
      the forecast extends there.
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
- [ ] T031 The help tour gains its steps for the two new regions, from the same list on disk.

## The record

- [ ] T032 The blog entry, with the capture. The rays re-weighting as a level is selected is
      the thing that moves; `pnpm capture:motion`.
- [ ] T033 The pull request links its own instance opened at `#/view/forecast`, and the entry
      by its full URL on the branch.
- [ ] T034 `pnpm snapshots` if the analyst's new output moves a committed artefact, and read
      the diff before committing it.
- [ ] T035 Tick the tasks above as they are done, and write the reason at the moment a task is
      declined.
