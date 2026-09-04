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
- [ ] T014 **The docking half is declined; the placement half is built.** One box cannot carry
      two answers, and this one said `[x]` over a requirement `spec.md` cites as outstanding and
      then `[ ]` over a body beginning "*Built.*" — both spellings were wrong in one direction or
      the other. Left unticked because the task as written is not done: spatial sources placed
      where they are; non-spatial sources docked at the margin in
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
      *Built, and renamed at T022t:* `modelledRaysIn` is the named condition, and it is tested against a source
      table that admits the archive — which no analyst here produces, so the test plants what
      the code is guarding against rather than asserting an absence that cannot fail.
- [x] T017 Rays never descend into the volume: drawn on the surface plane, held by a test over
      the drawn geometry rather than by a comment.

      *Built, and held over the drawn geometry.* Every ray in the document is asserted to live
      inside the surface plane's own SVG, with both endpoints inside that plane's view box.

      *Amended at T022q, and the amendment is the point of the tick.* The view-box half is gone.
      `placeOn` clamps to `[0, kept.length]` and the view box is `0 0 cols rows`, so the clamp
      bound and the assertion bound were one expression and no input could fail it — the second
      time this assertion has been worthless, the first being the reason recorded below. The
      clamp is asserted in `rays.test.ts` against out-of-range inputs, where the clamp is. What
      remains here, and can fail, is that every ray lives inside the surface plane's SVG, carries
      four finite coordinates, and is not a point.

      *Corrected after review, and the first version is the reason T022f exists:* it walked each
      ray's attributes refusing anything that read as a depth — which an SVG line cannot carry,
      so it passed on any code that drew lines at all, including code drawing them through a
      volume in another element. A tick pointing at a check the same file elsewhere calls
      worthless is worse than no tick.
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
- [x] T022 `contributions.test.ts` (**landed as `rays.test.ts` and `forecast.test.tsx`**; no file of
      that name exists — the unit arithmetic wanted one file and the end-to-end sum wanted the
      running loop, and neither was worth a third): the drawn contributions sum to the published value of the
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

- [x] T022b **Read off the warmed capture, not off the diff.** `capture:mobile` pins the clock
      before it measures, so it never sees a ray; the region was measured with the loop warmed
      to an analysis and a column opened on a source the served header names (CLAUDE.md's own
      correction, and feature 123's T083). Three findings, in the order a reader meets them:

      - **Two sources of one instrument printed the same name.** One instrument sampling either
        side of a cell boundary is two sources, and the profile read `temperature-200m 106.0%`
        and `temperature-200m 21.7%` on one level — two bands, one name. `sourceLabels` gives an
        ordinal only where a datastream carries more than one source, so a lone instrument keeps
        its plain name and the numbers table's separation says which is physically which.
      - **The bar holds at the magnitudes T002 warned about** — *and the figure first recorded
        here was an artefact, which T022l explains.* The reading was written as "at 667 m,
        `measurement, earlier cycles −122.3%` against `temperature-200m ·1 106.0%`". The
        extrapolation is real: at **400 m** the level's ω is 122.3%, drawn as +106.0% and +21.7%
        against an earlier-cycles band of −1.5% and a remainder of −5.4%, still summing to
        100.0%. The −122.3% was not the gain: it was one depth's measurement share minus another
        depth's ω, because the profile was pairing rows with the wrong levels. The claim survives
        at a different row and a different sign, and it is corrected here rather than left
        standing.
      - **The rays are short on this condition, and that is the scenario rather than the
        drawing.** The platform loiters, so every source sits within a cell or two of any column
        it reached and the fan collapses to almost a point. Nothing is wrong with the geometry —
        on a transiting condition the sources spread along the track — but a reader of the
        loitering start cannot count four rays by eye, which is why the count, the labels and
        the figures are printed beneath rather than left to the picture.

      Narrow widths hold with the loop warmed: at 390px and 360px nothing overflows and the page
      does not scroll sideways. The one box whose content exceeds it is the numbers table, which
      scrolls inside itself by design.

## What the adversarial review found in the rays, and what it cost

Two passes over the pushed head, neither of which had seen it written. Ten findings survived,
and four of them were faults in claims this feature had already made about itself — which is
the part worth recording, because each was a sentence asserting a property the code did not have.

- [x] T022c **Selecting a level deleted rays, while the region said it had not.** `raysFor`
      built its set from the chosen level's entries, so a source that reached the surface and
      not 667 m simply vanished — against FR-128 ("same origin, **same sources**, different
      widths") and SC-003 ("without changing their origins or their **count**"). Worse, the
      function's own docstring claimed the opposite behaviour, a test asserted the deletion *as
      correct*, and T019 ticked SC-003 as held. The panel meanwhile printed "the same sources at
      the same places" over a map with fewer lines on it. The set is now the column's at every
      level; a source that reached nothing there keeps its ray and its place at the thinnest
      stroke, marked, and the numbers table says so in words.

      The integration test passed throughout because it clicked the shallowest level, which
      every source in the loitering condition reaches: green by scenario, not by construction.
- [x] T022d **The ray width was affine, not proportional.** `1 + weight * 7` drew a 6.5:1
      contribution ratio as 3.85:1 — a 41% compression — three lines below a comment claiming
      "the ratios a reader compares are the arithmetic's own". The only proportionality test
      read `data-weight`, which is the arithmetic and not the drawing. Now `weight * 8`, with
      the drawn stroke widths asserted in the ratio of the contributions behind them and the
      bound derived from the attribute's own four-decimal rounding.
- [x] T022e **The instrument palette failed the repository's own greyscale bound.** Six hues
      chosen at similar lightness: worst pair `#b58ae0`/`#e87f9e` at contrast **1.037**, the same
      grey twice, for two colours that sit as adjacent bands of one bar. And the hatch angle the
      palette's docstring named as the carrier that survives greyscale was assigned to every band
      and **read by nothing** — `.is-source` had no rule at all. Both are Q-01's own subject, and
      the docstring was answering the question the capture is supposed to answer.

      The six are now an ordered luminance ramp, the hatch is drawn, and `greyscale.test.ts` holds it — modelled on
      `panels/consumers/greyscale.test.ts`, values read out of the palette rather than typed.
      Six ordered steps cannot each clear a contrast of 3 against a neighbour, so the ramp
      carries order and the hatch and dash carry identity; that disjunction is the honest claim
      and is what the test asserts. **Q-01 is still open**: whether it survives a real capture is
      T030's, and the palette comment no longer pretends otherwise.

      *The figures this task first recorded — "0.094 to 0.635, extremes at contrast 4.76, no pair
      below 1.32" — were the first ramp's and were left standing in the present tense after T022i
      replaced it. The shipped palette measures 0.147 to 0.751, extremes 4.07, worst pair 1.236,
      nothing below 3.44 against `--shell-bg`; T022i carries them and `shares.ts` states them.*
- [x] T022f **Three checks that could not fail, and three faults with no check at all.**
      - The FR-122 "never descends into the volume" test walked each ray for a `z` attribute an
        SVG line cannot carry; it passed on any code that drew lines, including code drawing
        them through a volume elsewhere. It now asserts every ray in the whole document lives
        inside the surface plane's SVG and every endpoint lies within its view box.
      - SC-005's "named condition" was a function nothing in the shell called. The region calls
        it now and prints what it returns, and the test asserts over the drawn set.
      - A refused contributions query was reported as one that never arrived — two of FR-129's
        three facts collapsed into one, and a `shares.test.ts` case encoded the conflation as
        expected. A refusal is now its own state and says so.
      - A single refused depth query shifted every level below it onto another depth's
        contributions: a bar summed across two depths, an absence sentence about the wrong one.
        Every depth gets a row, and a refused row says it is a place-holder.
      - `readColumn` reads seven documents and carried no cancellation token, where the slab
        effect twelve lines above carries one. Two picks in flight could pair one column's shares
        with another's contributions.
      - A picked column outlived the cycle it was read from, under a caption naming the new
        one — a surface stating a provenance it did not have. It is cleared when a cycle lands.
- [x] T022g **A fault in the region since it was written, which this feature's own attributes
      exposed.** The readout under the field indexed *drawn* cursor positions into the *served*
      axes: at the shipped grid, thinned by two, hovering a cell printed the position and the
      shares of a cell two rows and two columns away — 44.66°N where the cell said 45.32°N. The
      keyboard handler had always translated; the readout never did. The `data-lon`/`data-lat`
      attributes added for the rays are what made it visible, by carrying the right answer next
      to the wrong one.

- [x] T022h **A second review round, and three of its findings were faults the first round's
      fixes had introduced.** That is the part worth recording: a fix is a change like any
      other, and these were shipped inside a commit whose subject was "fix what the adversarial
      review found".

      - **One cancellation token served two independent streams.** Adding a token to
        `readColumn` — the right fix for two picks racing — took it from the ref the slab effect
        already used, so a cell click *cancelled an in-flight depth change*: the map stayed drawn
        from the old depth with the new depth's chip highlighted, `busy` stuck true because the
        `finally` was skipped with it, and nothing retried until the next depth change. A
        standing restatement, which arrives on a cadence and changes nothing, could equally
        cancel a reader's pick and leave the click doing nothing at all. One token per stream now.
      - **The guard ran after the write it guarded.** `setContributions` was called and *then*
        the token checked, so a stale answer wrote unconditionally.
      - **And the state it guarded was never cleared.** `column` is set a round trip before
        `contributions` arrives, so a second pick drew the new column's caption and coordinates
        over the old column's rays, bands and numbers for the width of that trip. Cleared at the
        start of the read now, and the cycle-change effect bumps the token as well as clearing
        the display — clearing alone left an in-flight read free to land afterwards and restore
        exactly what it had cleared.
- [x] T022i **The greyscale test held the palette against itself and not against the surface.**
      The ramp was ordered and its extremes cleared the bound, and `#7233b8` still measured
      **2.52** against the shell's own `--shell-bg` — under `AA_NON_TEXT`, on the hue every
      column draws first. The model this test names, `panels/consumers/greyscale.test.ts`, makes
      the against-the-ground assertion; leaving it out is how a palette can be internally
      beautiful and unreadable. The floor is the ground now: the ramp starts where a hue first
      clears 3:1 on the surface (0.147) and climbs to 0.751, nothing below 3.44 against the
      ground and no pair below 1.23, with the ground read out of `shell.css` rather than restated.
- [x] T022j **The named condition asked the wrong question, and its plant hid it.** SC-005's
      guard matched a source's *datastream id* against five words from `config.analyst`'s share
      vocabulary — a different vocabulary in a different document, munged differently. The
      harness's datastream ids are sensor streams, so a shore broadcast admitted as
      `shore-temperature-broadcast` would have walked past the guard written to catch it, and two
      of the shipped share labels are not in the list in their configured spelling anyway. The
      test's plant used the word `archive` as a datastream id — a value the id construction
      cannot produce — so it exercised the function and not the guard. `kind` is
      `'measured' | 'modelled'` in the master, the analyst fills it, the numbers table prints it,
      and it is the question being asked. The plant is now a document a future analyst could
      publish.
- [x] T022k **Three smaller things a reader would have met.** The ray encoding *inverted at the
      bottom*: an absent source was drawn at a constant 0.75 while a reached one under about 9%
      of the widest drew thinner than that, so contributing less than a ninth looked like
      contributing nothing — and contributing nothing looked like more. An absent source now has
      no width at all, which is the truthful end of the scale, and what keeps its place is a
      hollow origin marker, because a position is not a quantity. The remainder band's stripe
      never rendered: the inline `background` shorthand wrote `background-image: none` over the
      stylesheet's rule. And the band labelled "measurement, earlier cycles" carried that label
      even when this cycle's ω was unknown, where the honest label is the cumulative one.

- [x] T022l **The profile was reading the wrong depths, and its own self-check could not see
      it.** Both review passes found this independently, with measurements.

      The panel took the centre region's depth axis from `inventory.holdings[0]` — whichever
      holding the store listed first, which is the **archive**, filed at four levels — while an
      analysis is filed at six. Feature 123 could live with that: it queried each depth by value
      and EDR snapped it, so a reader saw the right numbers under a rounded label. This feature
      turned the row's *position* into an index into the contributions document, and the
      mislabelling became a data-mixing fault. Measured on the shipped configuration:

      | row shown | background shares from | ω and per-source bands from |
      |---|---|---|
      | 0 m | 0 m | 0 m |
      | 333 m | 400 m | **200 m** |
      | 667 m | 600 m | **400 m** |
      | 1000 m | 1000 m | **600 m** |

      The analysis's 800 m and 1000 m levels were never shown at all, and the absence sentence
      under the row labelled 1000 m was a true statement about 600 m.

      **Nothing caught it, and the reason is worth more than the fault.** The region prints
      "sums to 100.0%" and the docstring offers that as the reader's guard — but the stack is
      Σbackground + (measurement − ω) + Σcontributions + remainder, and Σcontributions +
      remainder = ω identically, so **ω cancels**. The printed sum is 100.0% whichever level's ω
      is subtracted from whichever level's measurement share. A surface's own advertised
      self-check was invariant under the fault it would have to catch: the repository's
      "a check that has never been seen to fail", in the picture rather than in a gate.

      Fixed at the root and again at the join: the axis is taken from the holding the analysis
      names, and every level lookup matches on `depth_m` rather than on position, so the pairing
      is checkable instead of assumed. `forecast.test.tsx` now asserts every profile row is a
      depth the analysis is filed at, and that every level it carries is offered. Watched failing
      against the axis as it shipped: "the profile offers 333 m, which the analysis is not filed
      at: expected [ 0, 200, 400, 600, 800, 1000 ] to include 333".
- [x] T022m **Three smaller readings that were wrong or unsupported.** The numbers table printed
      an unsigned separation as "200 m down" — the kernel stores `Math.abs(down)`, so the
      document carries no direction, and the 50 m instruments are *above* a 200 m level. Ray
      widths renormalise to the widest at the level shown, so clicking a level redrew a 0.42
      contribution at the width a 2.11 had occupied a frame earlier, under a sentence inviting
      exactly that comparison; the scale is stated now, with the figure it is relative to. And
      the two request streams, given separate cancellation tokens last round, still shared one
      refusal list — so a successful depth change deleted the refusal that the profile's rows
      were pointing at with "the refusal is named beneath".

## The right region, and the ghost

- [x] T022n **A fourth review round, and it found that the picture did not draw.** Two adversarial
      passes over the whole change, both measuring against a running loop rather than reading the
      diff. Between them they found ten things; four of them meant the delivered surface was not
      showing what every comment in it said it showed.

      **Four of six rays were points.** `placeOn` snapped a position to the nearest served axis
      entry and then to the nearest *drawn* column. Thinned by two, over a platform that loiters
      within a cell or two of the column it reaches, that put both endpoints of four rays on the
      same cell centre — including the one carrying the whole width encoding. Nothing saw it: the
      SC-003 check compared each ray's endpoint with itself between levels, and the viewBox
      containment loop could not fail while the placement returned cell centres by construction.
      The position is interpolated now.

      **Five of the remaining widths were below a device pixel.** 8, 0.47, 0.073, 0.0082, 0.0033,
      0.0012 px — a 6667:1 spread, drawn as one ray, under a sentence promising the same sources
      at that level's widths. Proportional and invisible is not more honest than proportional and
      marked: a reached ray under the floor is drawn at the floor, marked, and counted in a line
      beneath the map. The floor is for *reached* rays only, so it does not reintroduce the
      inversion T022k removed.

      **The mark that keeps an absent source's place was painted in the background colour.** The
      hue went on as an SVG presentation attribute, which sits at specificity 0, under
      `.forecast-ray-origin { stroke: var(--shell-bg) }`. A reached marker was saved by its fill;
      an absent one is `fill: none`, so it drew nothing at all — and at the three deepest levels
      of this column every source is absent, so the ray layer went blank while the caption said
      it had been re-weighted. This is T022c's fault back by another door, and the door was the
      cascade. Inline style now, which is also what makes it assertable in jsdom.

      **The blog capture was 41% flat background, and its warming loop had been refused.** The
      element is 1592 px tall and the viewport was 1000: the numbers table the entry's
      requirement paragraph promises was below the fold. The loop asked for 120 ticks a burst
      against a declared bound of 60 and read no response, so the simulation advanced by nothing
      — what made a picture at all was the pre-roll running on at the configured rate while
      Playwright worked, which the sidecar recorded as `rate 1` in a field nobody read. The
      second navigation dropped the query string, so `DROGNA_FORECAST_START` had no effect and
      the shell was answering 503 when the evaluate fired. And `image_size` came off the
      element's box rather than the file, which is why the two disagreed by two pixels. All
      fixed, the shot re-taken, and **added to CI** — it ran nowhere, which is why four faults
      survived in it. Two consecutive runs produced byte-identical PNGs with identical
      provenance, which is an observation and not a check: nothing on disk compares the committed
      artefact with a fresh one, here or for any of the estate's eight other blog assets. Said
      plainly because the alternative is a claim about a check that does not exist.

      Two more checks that could not fail: the SC-005 loop tested a source id against the
      *share* vocabulary when a source id is `<datastream>.cell-<n>`, and the proportionality
      bound was `1e-4 / the narrowest weight`, vacuous at one end and a division by zero at the
      other. And one that was vacuous by circumstance — the marker assertion was written into a
      test where no source is absent, passed with the fault planted, and had to be moved to the
      level where the fault actually lives. That one is worth naming on its own: a plant is the
      only thing that tells an empty loop from a passing one.

      The simplicity findings are in the same commit series: three paths and two refs answering
      "what is the depth axis" collapsed to one (watched failing in both mount orders), a prop
      passed beside the value it is derived from, a `depthIndex` prop typed as an index and
      carrying metres, a `BACKGROUND_KEYS` list kept in step with `SOURCES` by hand, an
      unreachable hue literal, and `contributionResidual` — exported from a production module
      with no production caller while the region's own caption printed `ω − remainder`, a
      rearrangement of the published weight that agreed with the drawn rays by construction. The
      caption sums the rays now — which fixed the caption's arithmetic and **left the dead
      export**, so this line read as resolved and was not. `contributionResidual` is still
      exported from `rays.ts` with no production caller; both consumers are tests. It stays,
      deliberately: it states the SC-001 identity once, beside the `RaySet` shape it reads, rather
      than having each test carry its own opinion of what "the drawn contributions and the
      remainder" means, and the test comment says so where a reader meets it. A decision, not a
      fix. `shares.test.ts` re-implements the analyst's munging and cannot
      do otherwise across the seam, so the end-to-end binding went into `forecast.test.tsx`,
      where the parameter names are read off an EDR area response; watched failing against the
      original `endsWith('_departure')`.

- [x] T022o **The narrow reading was a sentence in this file with nothing on disk behind it, and
      now it is a step in CI.** T022b asserted "at 390px and 360px nothing overflows and the page
      does not scroll sideways" on the strength of a throw-away script that was then deleted.
      `capture:mobile` is the repository's narrow proof and cannot stand in for it: it pins the
      clock to rate 0 before it measures and picks no column, so the rays, the profile, the
      under-scale note and the numbers table are absent from every frame it takes — the blindness
      `CLAUDE.md` records and the reason a gauge that had overflowed its box since the day it was
      written survived every run of that proof.

      `capture:forecast` now measures the region at both phone sizes *after* it has been warmed
      and with a column open, and fails on a page that scrolls sideways or a box whose content it
      cannot reach. Watched failing: a planted `min-width: 900px` was reported as "900px of
      content in a 352px box" at 390 and "in a 322px box" at 360.

      **And it nearly went in as a bug report, which is the part worth keeping.** Crossing the
      breakpoint changes presentation, which remounts the panel; the remounted panel subscribes
      to `analysis_standing` and reads "no analysis has been announced yet" until one arrives.
      With the clock pinned that is for ever, and the first version of this pass duly declared
      the region broken at a phone's width. It is not: the analyst restates the standing
      declaration every `restate_every_ticks`, which is what a standing topic is *for* — the
      measurement was of a stopped harness, again, one layer further in. The pass steps that many
      ticks before it measures, which is what a second of a running clock would have done.

- [x] T022p **A fifth round, against the tree being published, and four of its findings were
      faults the fourth round's fixes had introduced or left standing.**

      **The two hatch vocabularies collided, and the check written to stop them could not fail.**
      The share map hatched at `index * 45` — 0°, 45°, 90°, 135° — against an instrument palette
      at multiples of 30 from 0, so slots 0 and 3 were archive's and measurement's own directions,
      in one region, one surface above the other, and the two are drawn as adjacent bands of one
      bar. The assertion was `SOURCES.every((source) => !('angle' in source))`: the angles were
      computed inside the JSX and were never on `SOURCES`, so it tested a key's absence and
      passed whatever the map drew. This is V1's recorded trap — a gate reporting a file of
      deliberate violations as clean — reproduced exactly. Declared angles now, odd multiples of
      15 against multiples of 30, and the check reads the two lists.

      **And the claim the palettes separate without colour was false.** Measured with the shell's
      own `contrast`: archive `#3987e5` against instrument slot 1 `#e0584a` is **1.019**, and
      three more cross-vocabulary pairs are worse than the worst pair *inside* the instrument
      ramp, which the test bounds. Six ordered hues cannot also clear a bound against four more;
      the hatch is what carries it, and `shares.ts` says so now instead of claiming the hues do.

      **The region re-queried the whole field every 60 ticks**, under its own header saying "not
      on a tick, not on an announcement, not on a timer" (FR-136). The slab effect depended on
      the `analysis` object, and a standing restatement is a new object. `SC-010: nothing polls`
      measures a window in which no analysis exists at all, so it has never been in a state where
      it could fail; the new test warms a field first and was watched catching the query by name.

      **A refused area query took the numbers with the map.** The FR-130 table, the SC-001 caption
      and FR-125's notice were gated on the ray *geometry*, which is undefined whenever the slab
      is — and none of the three reads the slab. The set is split from the geometry.

      **FR-125 was enforced in the caption and not in the picture**: `backgroundRaysIn` named a
      modelled origin and the map drew it anyway, so the guard the SRD's FR-123 amendment leans
      on guarded a sentence. `drawableRays` keeps it out of the drawing and in the table, where
      removing it would break SC-001 silently rather than loudly.

      **`placeOn` had no unit test** — the fix at the centre of T022n, a `useCallback` no test
      could reach, in a file whose opening paragraph argues that the arithmetic must be testable
      on its own. Moved, with five cases, watched failing against the snapping it replaced.
      **`levelAtDepth`'s tolerance came from the first two levels**, which is far too tight below
      the first coarsening of a non-uniform axis; it reads the matched level's own neighbours now.
      The first version of *that* test asked for the level's own depth, where no tolerance is
      visible at all, and passed with the fault planted — the third time this round that a test
      had to be re-aimed before it could see anything.

      Smaller: the FR-17 assertion's `/rays/` began matching a sentence saying the rays *work*;
      the alt text was wrong about the 1000 m row; a CSS comment claimed a stipple the rule does
      not draw; an unreachable `?? SOURCES[0]` shipped in the same change that removed one;
      `drawn.width` was read nowhere; the all-NaN share record had three copies; and this file
      claimed byte-identity as though something on disk checked it — nothing does, here or for
      any of the estate's other blog assets, and it now says so.

      The narrow pass runs the clock at its configured ceiling rather than stepping it. Crossing
      the breakpoint remounts the panel, which draws nothing until a restatement, so a remount
      landing after the last step waits for one a stopped clock never delivers — half of runs
      failed on it, and no amount of polling wall time fixes a frozen simulation. Eight
      consecutive runs clean. The shot is still taken at rate 0 and is still byte-identical
      between runs.

- [x] T022q **A sixth round. Two of its findings were checks this feature had already been told
      about once, in a different disguise.**

      **The viewBox containment loop still could not fail.** T017's tick records the first
      version being worthless because the placement returned cell centres by construction; the
      replacement was worthless because `placeOn` *clamps to the viewBox*, so the clamp bound and
      the assertion bound are the same expression. No source position, no axis direction, no
      thinning step could fail it. It is gone, and the clamp is asserted where the clamp is.

      **The depth join's second line of defence did not hold against the fault it names.** The
      tolerance was half the axis's own spacing: asked for the archive era's 333 m against an
      analysis at 200 m steps, the nearest level is 400 and |400 − 333| = 67 passes. T022l says
      the pairing is "checkable instead of assumed"; it was assumed, and only the missing 800 m
      row would have shown. Both axes are built by the same arithmetic from the same manifest, so
      a real match is equal to within representation — the bound is relative and small now, and
      the test asks the archive-axis question directly.

      **`residual.published` was compared with `set.observationWeight`**, which the function
      returns verbatim. True for every input and every implementation. Deleted.

      **The profile's background bands carried no texture at all.** Only `kind: 'source'` bands
      were given an angle, while `shares.ts` claimed "a profile band carries its hatch angle" and
      `greyscale.test.ts` rested its cross-vocabulary check on it. Measured: archive/departure
      **1.067**, archive/model 1.185, departure/model 1.265 — one grey, three times, in adjacent
      segments of one bar, which is the defect that cost the first instrument palette a rewrite.
      The greyscale test measured `INSTRUMENTS` against itself and against the ground and never
      looked at `SOURCES`, so the palette that failed was the one nothing measured. Both fixed,
      both watched failing.

      **FR-125's notice said a ray was drawn that the map does not draw** — `drawableRays`
      removed it and the sentence beneath still announced it — and `underScaleCount` counted the
      set rather than the drawing, so the note would have counted a ray that is not there. The
      guard was applied to the picture and not to the sentences about the picture.

      **A 200 that is not the master's shape killed the panel.** The contributions body was cast
      and iterated inside a render-time `useMemo`; a body without `levels` throws
      `TypeError: levels is not iterable` and React unwinds the region rather than stating a
      refusal. The panel above validates its inventory and every broker payload goes through
      `drawable`; this crossing did neither, against a committed master that nothing used.
      Principle XI is that no code path may know whether the seam is answered locally, so "our
      backend cannot send that" was not available. Watched failing: with the check removed, the
      planted body throws in render.

      Smaller: `toLocaleString(undefined, …)` asked the *host* for its locale in the render path,
      so a deterministic run printed "9.4%" on one machine and "9,4 %" on another; the width floor
      was 0.75 px, itself sub-pixel and then dimmed to 0.6 opacity, against its own docstring's
      argument; the caption's printed total was read by no test, so restoring `ω − remainder`
      would have stayed green; `.forecast-share-map` was in the narrow pass's overflow list where
      an SVG reports its layout width as *both* `scrollWidth` and `clientWidth` (measured: 900 and
      900 for a map overflowing a 200 px parent), so that selector could not report and is now a
      comparison against the column that contains it; a dead `config.endpoints.holdings`
      dependency on the subscription effect; three spellings of the ray set in eighteen lines; and
      the "metres and never an index" docstring had been detached onto the `mapped` boolean added
      above it, leaving the field it argues about undocumented.

      And **`CLAUDE.md` said CI runs six capture proofs while this branch made it seven** — the
      same paragraph that exists because a branch shipped seven red CI runs against a green
      `pnpm check`, wrong again one entry later. Amended, with the rule that a pull request adding
      a capture step amends that line in the same change.

- [x] T022r **A seventh round, and its two largest findings were about the picture rather than the
      checks — the first time that has been true since T022c.**

      **The instrument palette was keyed on the served document's encounter order.**
      `contributions.ts` builds `sources` by first encounter while walking *this column's* levels,
      so the order is a fact about which column was asked for: the same physical instrument came
      out `#8b4bc8`, no dash, hatch 0° in one column and `#e0584a`, dash `6 3`, hatch 30° in the
      next, with nothing on the surface saying the palette had been reassigned — in a region whose
      whole premise is that a reader picks one square and then another. `rays.ts` opens by arguing
      that order must be declared rather than encountered; the ray *list* honoured it and the
      swatch beside each row did not.

      Sorting would not have fixed it (two columns with different source sets give the same source
      different ranks). The hue is keyed on the **instrument** — `datastream_id`, which is what
      `INSTRUMENTS` is a palette *of* — so it means the same thing in any two columns whose
      instrument sets agree, which is all the shell can promise without a list of every instrument
      in the run. *And the first version of that fix traded one fault for another*: a loitering
      platform puts three sources of one instrument in one column, and they drew as three adjacent
      bands of one bar identical in colour **and** texture, which is the defect the greyscale work
      exists against. Hue is the instrument's; dash and hatch step once per further source of it,
      inside `INSTRUMENTS`, so they stay multiples of 30 and cannot land on a share's direction.

      **`sourceOf` resolves any variable's share.** It reads the segment after the last `_share_`,
      which discards the variable, so `salinity_share_measurement` and
      `temperature_share_measurement` both answer `measurement` and the slab loop's last writer
      won. The master frames temperature-only provenance as a size decision rather than a
      permanent one. The new end-to-end test could not see it — eight names from two variables
      collapse to the same four keys and satisfy both its assertions exactly — so it counts names
      now, and a collision is a stated refusal rather than a field drawn under the wrong legend.

      **The caption printed ω = 0.0000 as a fact about a level the document has not got.** With no
      level matched every figure sums to nought, so "0 of this column's N sources reached that
      level … ω = 0.0000, the weight this cycle's observations added" printed directly under the
      row's own sentence saying the analysis carries no such level. `absenceOf` told those two
      facts apart over the document; the ray set did not, so nothing reading the set could.

      **The capture pinned the clock after the shell rendered**, and the pre-roll restores the
      configured rate before that — so the simulation free-ran for the width of a render and a
      round trip. The committed sidecar showed no drift, which is evidence the window was under a
      second on one machine, not that it is bounded. The instant is now checked against the sum of
      the condition's own legs on disk; watched failing with a planted 2.5-second delay, which it
      reports as two ticks of host time in the artefact.

      **A rule with nothing counting it.** T022q answered the CLAUDE.md capture-list drift with a
      sentence asking the next author to keep it in step — and a sentence asking for something is
      weaker than a check that has never been seen to fail, because it has never been in a
      position to fail. `check-capture-inventory` reads the capture steps out of the workflow and
      the backticked names out of the paragraph and fails on a difference in either direction, and
      on the count stated in prose beside them. Watched failing three ways: a proof CI runs that
      the record does not name, a name the record carries that CI does not run, and a count that
      drifts from its own list.

      Smaller: T017's tick still described the view-box loop deleted in T022q, which is what its
      own second paragraph calls worse than no tick; the `ground` read in `forecast.test.tsx`
      defaulted to `''`, which would have turned the "not painted in the ground colour" assertion
      into a duplicate of the one above it with nothing going red; the remainder band's stripe is a
      **third** hatch vocabulary at 135° — an odd multiple of 15, the shares' own series — living
      only in CSS and outside the check written to prevent exactly that collision; the inventory
      retry was unbounded, one fetch per restatement for the life of the tab with the endpoint
      down; `rays.set` was returned and read nowhere; the palette had two spellings of "which
      share is measurement" held in agreement by a test; two more unreachable `?? SOURCES[0]`
      fallbacks; a docstring stranded above the wrong declaration and another duplicated; the
      narrow pass skipped absent selectors silently, so a list of three boxes could be coverage of
      one; `capture:forecast`'s own docstring sent the reader to `capture:mobile` for the question
      its narrow pass was added to answer; the greyscale figures describe undimmed hues rather
      than the composited pixel, which is Q-01 and now says so; and three different start
      conditions were each called "the shipped" one.

- [x] T022s **An eighth round. Its two largest findings are the previous round's own fixes, and the
      gate the previous round added could not see the fault it was built for.**

      **The texture fix collided.** T022r keyed the hue on the instrument so a colour means the
      same thing in two columns, then stepped the *texture* from the instrument's slot once per
      further source of it — which walks onto other instruments' slots. Measured against a driven
      backend on the loitering column of three `temperature-050m` and three `temperature-200m`
      sources: bands two and three came out at the same angle and the same dash, and so did four
      and five, as **directly adjacent segments of one bar**, leaving a hue pair at 1.438:1 as the
      only thing between them. That is the defect the field's own docstring says it exists to
      prevent, and the third time in this feature that a fix for a colour collision has produced
      one. The texture is the source's own rank among the column's sorted ids now — unique by
      construction, which is the property that was wanted. *And the test could not see it*: it
      asserted the texture slots of a column with one repeated instrument, which is exactly the
      case where the stepping cannot collide. The check that was missing — no two sources of one
      column share a texture — is the one that now fails against the arithmetic it replaced.

      **`check-capture-inventory` reported clean on two neighbouring spellings of its own
      violation.** `run: pnpm capture:widgets` without the `run` verb — the form `CLAUDE.md`'s own
      commands table uses, and therefore the one a contributor copies — added a proof the record
      did not name and the gate passed. `capture:consumers2` matched as `capture:consumers`,
      because the token class stopped at a digit, so a step running a script that does not exist
      passed the name check *and* the count. I declared that gate working after planting three
      variants of **one** spelling. It now reads both forms, allows digits, checks the name
      against `package.json`, and has the fixture test 21 of the other 24 gates have — four
      fixtures, including a record that has lost the sentence entirely, which must throw rather
      than pass.

      **The retry allowance was spent on two paths that should not spend it.** A cycle whose axis
      the inventory does not carry *yet* is an honest answer, and it cost one — the comment
      claimed it was given back and nothing gave it back. Worse: the attempt was counted *before*
      the request, so a restatement arriving mid-fetch cancelled that fetch and spent an attempt
      on the retry. A restatement is 60 ticks, about 60 ms of real time at the configured
      `max_rate`, and `capture:forecast` drives at exactly that immediately after a breakpoint
      crossing has remounted the panel; three of those and the region was dead for the session.
      The policy is `spendAttempt` now, out of the effect and unit-tested, **because neither wrong
      version could be reached through the panel**: the axis is asked for only when a new analysis
      cycle lands, and that is rarer than a test can afford to drive — the panel test sees one such
      ask across eight scheduler intervals.

      **The drift check was a hard CI failure on an unbounded window.** Requiring the pin to catch
      the pre-roll's exact instant is right — a tolerance would put host time in the artefact — but
      throwing on the first slow frame turns a mount, a render and a round trip against one real
      second into a red build for a capture that is otherwise correct, which is the shape
      `CLAUDE.md` records seven consecutive red runs of. It reloads and tries again, three times,
      and says which it is doing; watched both retrying and giving up against a planted delay.

      Smaller: the "re-weighted to N m: the same sources at the same places" sentence rendered
      *beside* the "the analysis carries no level at N m" caption — the guard went on one of the
      two; the position path that builds the profile's background bands had no check for the
      share-name ambiguity the area path was given one for, so one region had two behaviours on
      one input; `Ray.sourceIndex`'s docstring said it was the palette slot, which is the field
      below it and the whole point of the previous round; the header docstring said every figure
      is read through EDR, which stopped being true when the contributions prefix arrived;
      `Profile` named `tableRays` as the mechanism carrying a distinction, and no such identifier
      exists; and `shares.test.ts`'s comment still argued for the `SOURCES[2]` spelling deleted a
      commit earlier, over an assertion that cannot catch what the comment says it catches.

- [x] T022t **A ninth round, and its first finding is that three of the eighth round's six claimed
      corrections were never made.** T022s and the commit message both list them; the tree had
      none of them. They were string replacements written without an assertion, so each matched
      nothing and did nothing, and I read the script's own "ok" as evidence. That is CLAUDE.md's
      opening lesson — the record is a claim about the tree — committed inside the commit written
      to close instances of it. Made now, each one verified in the file afterwards, and every
      edit in this round carries an assertion that fails loudly when its target is not there.

      **And a misreading of the master, held for four rounds and built on twice.**
      `analysis-contributions.schema.json` says of `kind`: *"Modelled: another party's model output
      **admitted as an observation** … the shore broadcast enters as background, **never as an
      observation**."* So a modelled source contributes, has a position, and SRD FR-124 says it is
      drawn as such; what FR-125 keeps out of the rays is the *standing forecast*, which is not in
      the source table at all and needs no filter. `drawableRays` was removing a contributing
      source's ray while its band was drawn in the stack, its figure printed in the table, and a
      paragraph beneath called it "the baseline these bands sit on" — three surfaces of one region
      disagreeing about one source. `backgroundRaysIn` is `modelledRaysIn`, the filter is gone, the
      notice says what FR-124 asks for, and the test that asserted the removal now asserts the
      drawing.

      That misreading also went into `srd.md` and `spec.md`. Both said `backgroundRaysIn` "guards
      the transition" to needing docked marginal nodes — conflating *modelled* with *non-spatial*,
      which are orthogonal, and missing that the master requires `cell` and `observed` with
      coordinates on **every** source, so a non-spatial source is unrepresentable rather than
      merely absent. Both amended: what would announce the transition is an amendment to the
      master, and no runtime guard can stand in for one.

      **The give-up flag was set on the next entry to the effect, so with the clock pinned it was
      never set at all** — and a pinned clock is every capture proof and any harness an operator
      has stopped. The region went on saying "the store had none when this console asked",
      describing a wait it had abandoned, which is the exact state the flag was added to
      distinguish. Set where the allowance is spent now.

      **The picked column's ring had no `non-scaling-stroke`** while the markers three lines above
      it did, with the CSS beside them explaining why. Under `preserveAspectRatio="none"` at the
      shipped field's proportions its left and right edges came out about 2 px and its top and
      bottom about 0.57 — so the mark the blog's alt text calls "a pale ring" was drawing as two
      arcs.

      **"Nothing here polls … not on an announcement" was false**, and had been since the region
      was written: a new analysis cycle fires an EDR area query and an inventory fetch. FR-136 is
      about cadence, not about announcements, and the sentence a reader would audit the region
      against said otherwise. Corrected to what the effects do, including the restatement keying
      that `FR-136` holds.

      **`check-capture-inventory` held one of the two numbers in the paragraph it guards.** Four
      words from "seven capture proofs" sits "CI runs seven more things than it does", which
      counts the captures *and* `replay-proof` — and it was wrong the day the gate was written to
      hold the other one. The gate holds both now, with a fixture; watched failing against the
      real tree before the fix.

      Smaller: the share-collision rule was written out twice, eleven lines identical down to the
      message string, so the fix for "the position path has no check" added a second copy of a
      refusal rule rather than generalising the first; two assertions restated the line above
      them and a unit test's title claimed behaviour in an effect it cannot reach; the FR-140
      check read an absent region as one that draws; the narrow pass measured a column a running
      clock can clear between the pick and the measurement, and now stops the clock once it has
      what it needs; and the pin's give-up message counted three attempts after four.

- [x] T022u **A tenth round, and it found the ninth round's record claiming a fix that was not
      made — the same fault, one round on.** T022t's own headline is that three of the eighth
      round's six claimed corrections were never made, and its list closes with "the pin's give-up
      message counted three attempts after four". It still did. The edit batch that carried it
      aborted on a later item's assertion and wrote nothing, and I checked the batch's exit rather
      than the file.

      So the process changed rather than only the line: edits are applied all-or-nothing, every
      target is asserted **before** anything is written, and every batch is followed by a
      verification pass that re-reads the file for what should be there and what should not. That
      pass caught two leftover imports in this round that the previous method would have shipped.

      **`drawableRays` was an identity function with three justifications describing a filter.**
      Once the modelled misreading was corrected the function returned its argument, and it was
      kept "because the name is where a reader looks for this rule" — which is the
      interface-for-its-own-sake Principle VI names. Two of its assertions were true for every
      input and every implementation, which is the shape T022q deleted three of one round earlier.
      Gone; the reasoning is at the call site where the decision is.

      **The master said the ray is drawn from the cell centre.** `analysis-contributions.schema.json`
      described `cell` as "its centre: where the ray is drawn from", while `rays.ts` argues at
      length for drawing from `observed` and does. The master is what a V3 backend and any
      external consumer generate from, so this is the one place the two accounts must agree.
      Amended, and `pnpm generate` re-run.

      **The blog entry explained the short rays by the wrong scenario.** The alt text said "on this
      scenario the platform loiters"; the capture's own sidecar records `arriving`, which is a
      transit. The explanation was causal and false of the run in the picture — and the alt text is
      the only description a reader has once the instance is gone.

      Smaller: `T014` was ticked while `spec.md` cites the same task as not built, so it is
      unticked with its reason, matching this file's own convention for a declined item; `T016`'s
      tick still named `backgroundRaysIn` and a plant that was replaced two rounds ago;
      `spendAttempt`'s docstring says a cancelled attempt is not an outcome and two of the three
      spend sites did not honour it, so two overlapping requests against a refusing endpoint burned
      two of three allowances in one restatement interval; an honest "the inventory does not carry
      it yet" was asked again on every restatement rather than once per cycle, unbounded, two files
      from a header saying "not on a timer"; a refusal from the previous column stood under the new
      column's heading for a round trip; and the depth chip read pressed over the previous depth's
      field with the one line that would have said so suppressed in exactly that case.

      `check-capture-inventory` also counted CI *steps* where the record names *commands*, so a
      second view of one proof — `capture:glance` already takes one — would have made an honest
      record red. Counted distinct now, with a fixture.

- [x] T022v **An eleventh round, and the last: the findings are now mostly about the round before
      them, and one of them was a line added an hour earlier.**

      **The busy line added in T022u threw out of render.** It read
      `grid.depthsM[depthIndex].toFixed(0)` with no guard, in the same round that added the effect
      resetting that index — effects run *after* the render that already read it, so a grid with
      fewer levels unwinds the panel. Every other consumer goes through `depthM` and checks it;
      this one line did not.

      **Every new cycle read the whole field twice**, measured: the analysis lands first and the
      depth axis a round trip later, and the axis was a fresh object literal, so the slab effect
      fired on the analysis and again on the object's new identity — two byte-identical full-grid
      area queries a cycle, one discarded, under a header saying "never twice for one cycle". The
      restatement test could not see it because it stops short of a boundary by design. The grid is
      handed back unchanged where the axis has not moved, and a second test crosses a boundary.

      **"Reopening the view asks again" was a remedy the shell does not offer.** Every view is
      mounted and switching only changes which is shown, so the sentence sent a reader to do
      something that changes nothing.

      **`check-capture-inventory` was narrow twice more.** Anchored on `run:` it could not see a
      multi-line `run: |` block or `pnpm -C app run capture:x` — both ordinary YAML, both adding a
      proof the record does not name while the gate reported clean. Anchored on `pnpm` and reading
      to the end of the line now, with a fixture for the block form.

      **`reachedCount` counted served indices**, so a document naming source 9 in a six-source
      table — which the master permits, bounding the index only below — printed "7 of this column's
      6 sources reached it". Counted over the rays now.

      **A field in which no share name resolved was drawn as a field of zeros**, and in the default
      mode as the archive at −∞: the shell asserting a provenance for a cell nothing was served
      for. `shares.ts` already states that rule for the profile; the map above it did not follow it.

      **And the blog body still explained the picture by the wrong scenario.** T022u corrected the
      alt text and left the identical claim one paragraph down — the verification checked that a
      string had been replaced rather than that the *claim* was gone from the file. It is checked
      the second way now.

      **One thing is recorded as unheld rather than covered.** The axis retry has two halves; the
      allowance half is tested and the once-per-cycle half is not. Three spellings of a bound were
      tried and all three passed with the mechanism removed — the panel is announced too few
      analyses over a window a test can afford to drive. A fourth spelling would be an assertion
      that looks like coverage and is not, which is what this feature has spent ten rounds
      removing. It is said in the test and in the pull request instead.

- [x] T022w **A twelfth round, and the last of them: the `·1`/`·2` ordinal was still assigned by
      encounter order.**

      T022r moved the hue off the served array's encounter order and T022s moved the texture; the
      *ordinal* is what both of those fixes handed the job of telling two sources of one instrument
      apart, and it was left on encounter order. `contributions.ts` builds `sources` by first
      encounter while walking this column's levels, so `temperature-050m ·2` named one cell in one
      column and a different cell in the next, at the same hue and the same dash, with nothing
      saying the labels had been reassigned — which is the sentence `rays.ts` uses about the fault
      it was written to close. Numbered by sorted `source_id` now, watched failing across two
      columns carrying the same two sources.

      **And the bar and the table beneath it listed the same six sources in opposite orders**, which
      the committed capture shows: the figures ran `·1, ·1, ·2, ·2, ·3, ·3` and the FR-130 table
      five elements below, sorted by id, ran `·3, ·2, ·1`. `rays.ts` opens by arguing that a set
      ordered by what the holding listed first is stable only by luck, and the bar a reader looks
      at first was ordered exactly that way. Both are the declared order now, and the alt text was
      re-read against the re-captured picture rather than assumed to still hold.

      **A cell with no readable share drew as the archive, negative.** The strongest-share search
      seeded at `-Infinity` and returned that when nothing was finite, so such a cell drew hatched
      as the first share at 0.15 opacity with the negative class, while the readout beneath printed
      `archive NaN%`. The whole-slab guard added last round catches a field in which no *name*
      resolved; this is the per-cell case, which a CoverageJSON producer using `null` for unsampled
      cells reaches with every name resolving.

      **`spendAttempt`'s reset arm had no production caller.** The reset was written inline beside
      it, so the test asserting `'answered'` held a path the panel never took — in a function
      extracted *because* the policy could not be reached through the panel.

      And T014 said both things at once: `[x]` over a requirement `spec.md` calls outstanding, then
      `[ ]` over a body beginning "*Built.*". It is two tasks in one box — placement, which is
      built and captured, and the docking, which is declined — and the line says so now.

- [x] T022x **A thirteenth round, and it found the map drawn upside down.**

      The served latitude axis ascends — measured off a running loop, row 0 is 44°N and the last
      row 48°N — and the drawing put served row `r` at `y = r`, so the top edge of the field was
      the *southernmost* row. It has been that way since the field was first drawn and twelve
      review rounds did not see it, because until this feature the region was coloured squares
      with no geometry on them. This feature is what makes it matter: it draws lines between two
      places on that plane, marks where instruments were, and publishes a capture whose whole
      claim is that a reader can see where a number came from. A ray to an instrument north-east of
      the column was drawn to the south-east, and `ArrowUp` moved the cursor north on screen while
      the readout beneath it counted *down* in latitude.

      **A renamed share label still printed `NaN%`.** The guard added last round asks whether *any*
      of the four names resolved, which leaves the case that actually happened: one label changed —
      `analyst.shares.archive` set to "historical archive", which its own master permits — resolves
      three of four, so no refusal is stated, the readout reads "archive NaN%" and that share's
      field draws as a uniformly empty rectangle. `shares.ts` records that exact fault costing the
      departure share four features of silence, and the profile prints "not served" for it two
      files away. Refused now when *any* share is missing, and the missing ones are named.

      **The gate reddened CI for a YAML comment.** Widened twice to catch every form of the
      command, it then matched prose — and this workflow carries a fifteen-line comment above the
      forecast step. Three findings on a correct tree, greenable only by writing a lie into the
      record. Comment lines are skipped, with a fixture.

      **A stray `source` index inflated the normaliser.** The master bounds it only below, so an
      entry naming source 9 in a six-source table contributed to `widest` — the number every drawn
      width is divided by — while producing no ray, so every ray drew narrower than its share.

      And the assertion added last round for "two byte-identical queries per cycle" compared
      `new Set(urls).size` — which is 1 for exactly that duplicate. It counted the entries in the
      end, but the line as written passed on the case its own comment named.

## What this branch leaves undone, and why

      Written here rather than only in the pull request, because the reason is the part that cannot
      be reconstructed later.

      - **The axis retry's once-per-cycle half is unheld.** Three spellings of a bound were tried
        and all three passed with the mechanism removed: the panel is announced too few analyses
        over a window a test can afford to drive. A fourth would be an assertion that looks like
        coverage and is not.
      - **`modelledRaysIn`, `noSuchLevel`, `gridGaveUp` and the share-collision refusals are
        unreachable against today's analyst**, which serves one variable and marks every source
        `measured`. They are Principle XI machinery — the seam may be remote — and each is tested
        against a planted document rather than a run.
      - **Q-01 is open** (T030): whether the palette survives greyscale *as composited* rather than
        as declared is a question a capture answers and a comment cannot.

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
- [x] T031 The help tour's steps for the two regions this feature fills are **rewritten**,
      not gained: feature 123 wrote a step for each saying the region is not built and naming
      this feature, and `forecast.test.tsx` already holds every region to having one. What
      changes is what they say.

      *Done, and it was overdue by the whole of this feature.* Until this task the `volume` step
      read "This region is feature 124 and is not built" to a reader standing in front of the
      share map, the rays, the profile and the numbers table; the `ahead` step said the same over
      the feature tracks. Both are rewritten to what the regions draw and what each is still
      missing — the volume in the first case, the ensemble spread along a route in the second.

      **Nothing could have caught it**, which is the part worth recording: `uncoveredSubjects`
      asks whether every region has *a* step and never what the step says, and the panel's own
      prose — careful to name the *part* that is missing rather than the region — was rewritten
      without the tour beside it. `forecast.test.tsx` now binds the two: a step may call a region
      unbuilt only where the rendered region has nothing in it to read. **Half of that is taken
      from the DOM and half is a phrase match, and the difference matters**: `drawsSomething`
      asks the rendered region, so a region that grows a surface moves the check with it; the
      claim is detected by `/this region\b[^.]*\bnot built/i`, so a step reworded to "the volume
      is not built" escapes it. Watched failing by restoring the old sentence, which is why the
      check reads more general than it is. Widening it means deciding what a whole-region claim
      *is*, which is a judgement a regex cannot hold; what it buys today is that the sentence
      this feature shipped for a year cannot come back.

## The record

- [x] T032 The blog entry, with the capture. The rays re-weighting as a level is selected is
      the thing that moves; `pnpm capture:motion`.
      *Built:* `site/docs/blog/posts/the-weights-were-there-and-thrown-away.md`, with the
      capture and its provenance beside it.

      **Captured still rather than moving — and the reason first written here was wrong about a
      file in this repository.** It said `capture:motion` "drives the clock and films what the
      system does on its own". It does not: it pins the clock exactly as `capture:glance` does,
      requires `DROGNA_MOTION_ACT` — a selector to click — and records frames across that click.
      It is an interaction recorder, and two entries on the estate were made with it.

      The real reason is narrower. Motion clicks **one** selector and this surface needs two: a
      cell picked to open a column, then a level chosen to re-weight it. Teaching a shared script
      a second act for one caller is a change to make when a second caller wants it, not now. So
      the capture is a still, from `scripts/capture/forecast.ts` — a committed script, because
      `site/authoring/README.md` requires it and the first version of this asset was taken by a
      throw-away in `.capture/` whose sidecar then described a viewport the image was not shot
      at. The alt text carries the reading.

      The asset carries a `.provenance.json` on the estate's convention, and its values are read
      off the running page rather than written from memory: the run, the simulated instant, the
      holding, how the loop was warmed, and that the column was picked from the served header so
      it is one a source actually reached.
- [ ] T033 The pull request links its own instance opened at `#/view/forecast`, and the entry
      by its full URL on the branch.
- [x] T034 `pnpm snapshots` if the analyst's new output moves a committed artefact, and read
      the diff before committing it. *Reconciled:* the shipped snapshots carry the archive and
      the now-cast alone (read off the artefacts, not assumed), so a new analysis holding
      moves nothing; `check-snapshot-drift` is what says so.
- [ ] T035 Tick the tasks above as they are done, and write the reason at the moment a task is
      declined.
