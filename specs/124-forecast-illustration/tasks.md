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

- [x] T001 `kernel.ts` (analyst): `AnalysisField` gains the per-source contributions the gain
      already produces — K_aj kept per (source, cell) instead of collapsed into
      `observationWeight`. The row sum stays: it is what the measurement share is, and a
      consumer that recomputed it from the columns would be a second implementation.

      *Amended before it was built.* A **source** is an instrument at the cell its observations
      were attributed to, not an observation. H is nearest-neighbour, so every observation a
      datastream makes inside one cell shares that cell's covariance row exactly — the same
      separation to every other cell, the same declared error — and the sum of their K_aj is
      the source's contribution by linearity, with nothing approximated. What forced it is
      size: measured on the shipped configuration (root seed 4242, the loitering condition,
      lockstep — the analyst test's own drive), the first three cycles assimilate 1,080, 1,572
      and 1,596 observations (the kernel's own comment said ~180) and each reaches ~1,200 cells at a
      60 km support over a 5 km grid, so per-observation retention is ~800,000 entries and
      ~9 MB a cycle, kept for the life of the run, against a store holding ~9 MB in total.
      Per source it is tens of sources a cycle, and a column has tens of rays rather than
      hundreds — which is also the only count a reader could read.
      *Built, and measured again with the holding in the store:* 4–6 sources a cycle on the
      loitering condition (the platform's two temperature instruments in the two or three
      cells it loiters over), 1,144–1,203 cells reached, 3,174–4,761 entries, 75–103 KB a
      cycle against the provenance holding's 737 KB. The kernel already had every number —
      `row` in the error reduction is K_ak — so the change is an accumulate per reaching
      observation and no new arithmetic.
- [x] T002 The retention is bounded by the correlation's own support: Gaspari–Cohn reaches
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
      *Built.* A note for the profile and the rays (T018, T021): under root seed 4242 on
      the loitering condition the holdings' declared tolerances are 9.5e-7, 7.6e-6 and
      3.05e-5 over the first three cycles — float32's width at magnitudes of 1–2, 8–16 and
      32–64 — so a contribution or ω of that size exists where the ensemble spread at a cell
      dwarfs the spread at the observed cell and the gain extrapolates (kernel.test.ts, "lets
      the weight exceed one"), and it grows as the spread sharpens. (The first record here
      said 1.5e-5 for the second cycle, back-derived from a test tolerance with the wrong
      divisor; review caught it.) That is optimal interpolation behaving as documented since
      feature 116, not this feature's doing; a ray whose width is proportional to it will
      dominate the column, and the drawing task has to decide what proportional means at
      that magnitude rather than meet it as a surprise.
- [x] T003 `analysis-contributions.schema.json`: the column document the query layer serves —
      the sources reaching the column, each level's contributions by source with the
      separation and the two errors (spec FR-04), ω and the remainder per level — and, under
      `$defs`, the header the holding's own bytes open with. One master; amended, never
      round-tripped through a formatter.
      *Built.* The level's `background_error_std` is null where the level was not reached,
      because the holding carries a row for every reached cell and no other: null is that
      fact, not a nought pretending to be a measurement (FR-129's three facts).
- [x] T004 `pnpm generate`, and commit the output.
- [x] T005 `analyst.ts` publishes the contributions holding beside the analysis, its error and
      the four shares, and names it in `analysis-published.schema.json`'s `collections` and
      `digests` — which grows by one property each, appended. The bytes are
      `drogna-contributions-v1`, a second format `coverage-holding.schema.json` admits beside
      `drogna-f32-v1`: a header and typed arrays, because the same content as JSON measured
      several times the size and the cost this feature accepts is storage, not that much of it.
      EDR does not list it — a sparse holding is not a coverage — and says so in the code.
      *Built.* `contributions-format.ts` is the codec, one file both ways on the snapshot
      codec's argument; the header is padded to four bytes so every section is a typed array,
      and the decoder copies each section so an unaligned caller is never a fault. The
      manifest's one variable carries a tolerance derived as the generator and runner derive
      theirs, 4 ulp at the largest magnitude stored.
- [x] T005a The query component serves it at a configured prefix (`config.query.http`,
      `config.shell.endpoints`, the boundary's allow list — three documents, appended): the
      header, and a column by `coords=POINT(lon lat)` as EDR's position query spells a
      position, validated against the master. Not under the EDR prefix: the standard has no
      such query type, and the EDR component refuses unknown types by name, which is the
      honesty this must not spend.
      *Built.* `query/contributions.ts`; the snap to a cell is `field-sampler.ts`'s own
      `nearestIndex`, now exported, so the contributions query and EDR's position query agree
      on which column answered. `ConfigShell.endpoints.contributions` is declared and
      configured and has no reader yet: it is T013's. The document's `run_id` is the model
      run's, read from the holding's own header, because the descriptor's is the scenario's
      for every analysis holding (review). No decode cache: a holding is ~100 KB and there is
      no caller yet to measure against (review).

      *After review:* the holding's arrival in the store reached three faces that treat
      every holding as a coverage — the Data tab grouped it as a phantom cycle captioned
      "the corrected field", its volume asked EDR for a collection EDR had stopped listing,
      and the query component counted it as a served collection. One predicate,
      `lib/holding-format.ts`, now answers "is this a coverage" for EDR, the count and the
      contributions query; the Data tab reads `field.format` for itself across the seam, as
      it already does for the collection id. The SC-008 test that guards exactly this was
      waiting on the pre-rolled archive and had never seen an analysis holding; it drives
      to one now, and asserts the non-coverage is *not* served.
- [x] T006 **Watched failing**: a planted contribution beyond the correlation's support, seen
      refused. Reverted, and said so in the commit message (SC-002).
      *Watched, three times.* Kernel: with the `continue` on ρ = 0 removed so every
      observation counted as reaching, "an entry at 75.8 km, 0 m lies beyond the support:
      expected 2.526 to be less than 2", and the remainder test saw the far cast appear as a
      source. Served column: with ω scaled by 1.01 and the remainder shifted by 0.01, the
      identity test failed by 0.0094 against a tolerance of 6.1e-5 and the cold-start test by
      0.01 against 1.9e-6. And after review, the SC-008 Data test that had never seen an
      analysis holding (T005a): with `lib/holding-format.ts`'s predicate planted to call
      every holding a coverage, "EDR lists 'analysis.…-run-0-contributions', which is not a
      coverage". All three reverted; all three in the commit messages.
- [x] T007 `analyst.test.ts`: the contributions sum, per cell, with the remainder, to the cell's
      ω; and on the cold-start cycle — where the carried measurement share is nought, so the
      published share *is* ω — to the measurement share the same cycle published. The
      tolerance is the holding's own `tolerance_absolute`, never typed in.

      *Built.* The first draft of the kernel's remainder test placed two casts beyond each
      other's reach and watched the remainder be exactly nought — correct, and the reason
      the coupling needs a chain is now the test's comment. The cold-start equality is the
      one cycle on which the published measurement share is ω itself; on later cycles the
      carried share is not published alone, and the identity is the kernel test's.
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

*Built before the volume, and the reason is recorded rather than left as a reordering.* The
task file's order was "the substrate before the picture", and that dependency was real. Between
the substrate and the volume there is no such dependency: a ray is drawn on the **surface
plane** (FR-122 rules out one descending into the volume), its origin is a position on that
plane, and its width comes from the served contributions. What it needs is a column selection,
which the share map has had since feature 123. The volume is the setting the rays happen in and
not a thing they are read through — FR-128 says exactly that about the profile — so building it
first would have delayed the whole explanatory claim of §5.20 behind the most speculative
drawing in it.


- [x] T013 `rays.ts`: contributions for the selected column, by source, widths proportional to
      contribution. Pure; no DOM, so the arithmetic is testable alone. A source is what the
      holding says it is (T001): an instrument at a cell, so its ray has one origin.
      *Built.* `rays.ts`, pure and tested alone. Two decisions are in its docstring because
      they are judgements rather than readings: a ray's origin is where the **instrument** was
      while its stated separation is the **cell-to-cell** distance the taper was evaluated on —
      two distances, both stated, neither pretending to be the other — and widths are
      proportional *within the drawn set*, normalised by the widest, because a contribution is a
      gain coefficient rather than a share and T002's measured magnitudes would otherwise draw
      one ray as a slab and the rest as hairlines.
- [x] T014 Spatial sources placed where they are; non-spatial sources docked at the margin in
      positions stable across selections, from a declared order rather than from whatever the
      holding happened to list first. The remainder (T002) has no position and is not a ray:
      it is stated in the region, as coupling from beyond the column's reach.
      *Reconciled after the substrate:* every source in the contributions holding is spatial
      and measured by construction (spec FR-03 as amended). The non-spatial origins — the
      archive, the departure forecast, the model's own error — are the *provenance* holding's
      shares, not this holding's sources, and the docked nodes read them from there.
      *Built.* The remainder is returned beside the rays and drawn as a band in the profile,
      never as a line: it has no position, and drawing it from the margin would invent one. No
      docked nodes are drawn, because no non-spatial source exists to dock — the reconciliation
      above records why, and the profile's baseline is where those origins appear.
- [x] T015 Measured and modelled grouped and marked. The shore broadcast is modelled.
      *Reconciled after the substrate:* "modelled" is the provenance holding's three
      non-measurement shares, drawn as the baseline; the contributions holding's `kind` is
      carried so the master states the distinction, and today it is always `measured`.
      *Built as the reconciliation says:* the background's three shares are the profile's
      baseline bands, the contributions holding's `kind` is carried into the numbers table
      beside every source, and every source in this harness is `measured`.
- [x] T016 The standing forecast is not in the ray set (SC-005), and the omission is a named
      condition in the code rather than an absence to be read as an oversight.
      *Built.* `backgroundRaysIn` is the named condition, and it is tested against a source
      table that admits the archive — which no analyst here produces, so the test plants what
      the code is guarding against rather than asserting an absence that cannot fail.
- [x] T017 Rays never descend into the volume: drawn on the surface plane, held by a test over
      the drawn geometry rather than by a comment.

      *Built, and held over the drawn geometry.* The rays are children of the surface plane's
      own SVG and carry two endpoints in it; the test walks every ray's attributes and refuses
      any that reads as a depth, which is a check on the DOM rather than on a comment.
## The profile

- [x] T018 `Profile.tsx`: depth down the vertical axis, each level's composition as bands
      sized by contribution and coloured by source, background as the baseline band.
      *Reconciled:* `ColumnProvenance.tsx` already opens a picked column into a profile of the
      four shares; this profile replaces the measurement share's band with the sources' bands
      and the remainder, and keeps the other three as the baseline it sits on.
      *Built.* `Profile.tsx`, and the stack is an identity rather than an arrangement:
      archive + departure + model, then the measurement share **less ω** — what earlier cycles'
      observations left, which is not this cycle's and must not be drawn as though it were —
      then this cycle's per-source contributions and the remainder. It sums to one because the
      gain says so, and the sum is printed rather than normalised away.
- [x] T019 Selecting a level re-weights the rays and does not move them (SC-003).
      *Built* (SC-003), and held twice: over the arithmetic in `rays.test.ts` and over the
      drawn geometry in `forecast.test.tsx`, where the origins are asserted identical and the
      widths asserted different. Watched failing with the level ignored: "expected [ '0.0586',
      '1.0000', … ] to not deeply equal [ '0.0586', '1.0000', … ]".
- [x] T020 A level with no observational contribution states that, distinguishably from a
      level whose contributions summed to zero (SC-004). Absent, null and declined are three
      facts.
      *Built* (SC-004), and the first draft had it wrong in a way worth keeping: the absence
      note **replaced** the level's figures. What is absent at a level nothing reached is the
      observational part; the background's own composition is known, and hiding a fact in order
      to state one is not the trade FR-129 asks for. The note now sits beside the figures.
- [x] T021 The two numbers behind any contribution, stated in the region it is drawn in
      (FR-130): the separation, and the observation's declared error against the background's.
      *Built* (FR-130): a table under the profile carrying, per source, the contribution, the
      separation the taper was evaluated on, the instrument's declared error and the
      background's. Under the profile rather than in a tooltip, for the reason the map's readout
      is: it cannot be clipped at a phone's width and a screen reader meets it in document order.
- [x] T022 `contributions.test.ts`: the drawn contributions sum to the published value of the
      column, cell by cell, within the holding's own declared tolerance (SC-001, AT-07).

      *Built* (SC-001, AT-07), against the running loop rather than a constructed document:
      the served column's contributions and remainder are summed per level and checked against
      the ω the same holding published, at the tolerance that holding's own manifest declares.
      The test also asserts the drawn ray set is exactly the served source set, so the picture
      is checked against the provenance and not only the arithmetic against itself.
## A fault the rays uncovered, and what it cost

- [x] T022a **The departure share had never been read, on any surface, since feature 116.** The
      analyst names each provenance field from its *configured label* — `config.analyst.shares.departure`
      ships as "departure forecast" — so the served parameter is
      `temperature_share_departure_forecast`. `ColumnProvenance.tsx` matched a share by
      `endsWith('_departure')`, which that name does not, so the share came back `NaN` at every
      cell of every column: drawn as nothing on the map, printed as `NaN%` in the readout, and
      folded into a zero in the profile's stack.

      Nothing caught it because **both surfaces treated a non-number as a zero** — the reading
      FR-041 exists to forbid — and the only test over the profile asserted that *some* stack was
      drawn. It surfaced here because the new stack sums its bands and prints the sum, and a
      `NaN` band makes the sum `NaN` rather than quietly vanishing.

      Fixed by matching on the segment after `_share_`, by prefix, so a label may be extended and
      still be its share while a label that stops beginning with its key is missed loudly. The
      profile now states a share it was not served rather than drawing it as nought. Watched
      failing against the match as it shipped: "expected undefined to be 'departure'".

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
