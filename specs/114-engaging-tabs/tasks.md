# Feature 114 — tasks

Grouped by subject and ordered by the build order the author ruled: **Messages first**,
because the traffic display is the yardstick made visible and the rest is built on the
same idea. Dependencies inside a group are ordered; between groups there are none except
where a task says so.

Only the specification tasks are done. Tick as you go, and write the reason at the moment
a task is declined — the reason is the part that cannot be reconstructed later
(CLAUDE.md, lesson 1).

Features 101 to 113 are hard prerequisites: the shell and its addressing, the seam, the
broker, the coverage store and its EDR service, telemetry, the walkthrough machinery and
the Operator flow chart all come from them.

## Specification

- [x] T001 Interview the author and write `spec.md`: scope (System, Holdings, Messages,
      map parity, the walkthrough), the three yardsticks, and the table-replacement
      licence.
- [x] T002 Establish that the shell may derive the comparison without an exemption.
      `map-data.ts` has transformed served coverages into cells, ranges and interpolated
      positions since feature 109; the boundary that holds is *transform what crossed the
      seam, invent nothing*. Recorded in the spec rather than left to be re-argued.
- [x] T003 Catch what the interview did not raise: Principle IX admits no forecast-skill
      claim without a persistence reference, so a picture of forecast error alone is such
      a claim. The comparison gained a third coverage before it was specified rather than
      after it was built.
- [x] T004 Settle whether this stays one feature or splits. **It stays whole**, on the
      tree rather than on taste: 36 tasks against 113's 34 and 111's 43, each of which
      landed as the single long-lived PR PR-05 asks for, and 113 bundled two subjects
      less related than these four. The cost accepted with the ruling: map parity and the
      button move sit unmerged behind the Holdings comparison for the life of the PR.
- [x] T005 Correct the first draft's claim that this reverses 113's table-beside rule. It
      does not. Messages keeps its list; System's table is deleted with its tab, not
      replaced. Holdings is the only place in the feature where a table goes — a licence
      exercised once, with a condition, not a policy change.

## Record — owed before the code

- [x] T006 ADR: *the shell may derive, and says so*. The fourth kind of figure beside
      113's three; why a derived difference is not a Constitution VII violation and what
      would make one; why the request URLs are constitutive of the display rather than a
      convenience; why telemetry keeps skill. Owed before the comparison is built, because
      a display that computes is exactly what ADR-0035's three kinds were drawn to prevent
      and the next reader must find the argument, not infer it.
- [x] T007 ADR: *the help control belongs to the panel*. Why the header button goes rather
      than staying as a fallback; what the absence of a button now means; how the
      completeness rule generalises from the declared component list to a per-surface list
      on disk. Amends the record of feature 110 rather than replacing it.
- [x] T008 Amend `srd.md`: new §5.14 with FR-63 to FR-70; FR-14, FR-16, FR-23, FR-24,
      FR-40, FR-46 and FR-61 amended in place. FR-16's obligation is named as discharged
      by the Operator flow chart — the amendment must say that, not merely delete System.
- [x] T009 Note feature 114 in `docs/v2/plan.md` §5, beside the notes 111, 112 and 113
      left, so the numbering stays reconciled openly.
- [x] T010 Design the three displays before any of them is built: the traffic display, the
      holdings timeline, the comparison. A committed mockup that leads implementation
      rather than records it, as 113's `mockup.html` did — at both densities, with the
      four kinds of figure annotated, the empty and refused states drawn, and the keyboard
      order shown. Landed as `mockup.html`: the four treatments, the traffic display with
      its still and first-seconds states, the tree and the schema-aware inspector, the
      timeline with its refused and empty states, the comparison with both differences on
      one shared scale and the three URLs, both densities, and the keyboard order drawn as
      tab stops.

## Messages — built first

- [x] T011 The traffic display: lanes from the topology artefact's top-level namespaces,
      marks as messages arrive, refusals visibly refused, an undeclared topic drawn as an
      undeclared lane. `traffic.ts` and `TrafficDisplay.tsx`. **One thing the
      specification assumed turned out not to be possible, and the display is better for
      it:** an *undeclared namespace* can never arrive, because the broker's role rules
      confine every publisher to declared prefixes and refuse a new first segment at the
      seam. The fault that can happen — and that the topic tree has drawn since 103 — is a
      topic nobody declared inside a namespace somebody did. So a mark's lane is its
      namespace when the artefact declares its topic, and an undeclared lane beside that
      namespace when it does not. One rule covers a rogue namespace too, if the broker
      ever admits one.
- [x] T012 Silence is still. **Plant it**: a run with publication stopped must show a
      still display, and the check must fail if anything animates — SC-02. An idling
      animation is the display asserting traffic that is not there. **Two checks, because
      one of the two faults is invisible to the other.** The panel's rendered tree must be
      byte-identical across thirty seconds of host time with the harness stopped; and the
      stylesheet that owns every traffic rule must declare no animation, transition or
      keyframes, because a CSS animation is motion the DOM cannot see. Both were planted
      and both were watched failing — a sweep interval in `TrafficDisplay`, and a
      `@keyframes traffic-throb` on `.traffic-mark` — then reverted, and said so in the
      commit message. The display holds no clock at all, which is what makes the first
      check pass by construction rather than by care: a mark is placed by receive order,
      so the display advances on arrival and at no other time.
- [x] T013 Watch SC-01 happen end to end and capture it: stop the sensors from Operator,
      see the observation lane still while the clock lane beats on. Generator to pixel,
      never inferred from green tests (Constitution IX, PR-06). This is the task that
      proves the yardstick before three more surfaces are built on it.
      `scripts/capture/messages.ts`, run in CI, and it is a **proof and not a picture**:
      it exits non-zero when the observation lane did not still, and also when the control
      lane stilled with it, which would mean the page had stopped rather than the traffic.
      Watched, at rate 60: **12 observation marks running, 0 with the sensors stopped, the
      control lane beating on at 179 then 191.** Two things were found by running it
      rather than by reasoning. The first draft ran at rate 1 and reported an empty
      observation lane before anything was stopped — heartbeat cadence is host time while
      sampling is simulation time, so twenty components' heartbeats crowd the observations
      out of a window measured in messages; the capture sets the rate through the shell's
      own control and says so in its provenance. The second was a layout fault the first
      screenshot showed at a glance: `.traffic-row` was itself a grid item, so two lanes
      landed on every line and `adv` and `cov` shared a row at half width.
- [x] T014 Promote the topic tree out of its disclosure to a primary region; selecting a
      node filters the traffic display and the list. A node is a `<button>` rather than a
      span with a click handler, so the tree is a keyboard surface because the platform
      made it one and not because this file remembered to. Narrow it still discloses —
      FR-50 changes where a region is, never whether it is.
- [x] T015 The schema-aware inspector: fields named and united from the master the topic
      declares, refusals marked on the offending field, the raw wire document always
      reachable, an undeclared topic named as such. `inspect.ts`. Two things the first
      draft got wrong and the masters on disk caught. Refusals were being re-parsed out of
      the refusal *sentence*, which made its punctuation load-bearing; `ValidationVerdict`
      now carries `faults` with the instance path kept apart from the message, and the
      sentence is derived from the pair rather than the other way round. And a `$ref` was
      not followed, so `observation.location` — the richest field in the document — would
      have been drawn as one line of JSON; references are now followed both inside a
      document and across masters, carrying the target's own `$defs` with them.
- [x] T016 Hold the counters: everything received is validated and counted, suppressed
      kinds included, and the "N refused by their schema" claim keeps its full coverage
      (FR-23). The list stays — Messages does not exercise the replacement licence. The
      traffic display draws the suppressed kinds either way: a lane that hid the clock
      would be the one lane whose stillness meant nothing.

## System folds away — the two facts first

- [x] T017 Add **declared beat** and **liveness window** to the Operator list view, as
      declared figures, typographically distinct from reported and observed per FR-58.
      Nothing else in this group may land before this does. The `.flow-figure-declared`
      treatment had been in `operator.css` since 113 and nothing had ever used it — the
      faces draw reported figures only — so this is its first instance. One thing needed
      deciding: a component may report its own liveness window in its heartbeat, and the
      System tab drew whichever it had. That would be a figure changing kind between
      states, which FR-57 forbids, so the cell carries the **configured** window as a
      declared figure always, and a component's own reported window is drawn beside it as
      a reported one when the two differ.
- [x] T018 Move the System footnote's claim — that grey cannot distinguish *never ran*
      from *stopped* — onto the Operator legend, where the six node states are named.
      **The legend did not exist**: the specification said "the Operator flow chart's
      legend, which already distinguishes the six states", and the tree said otherwise —
      113 shipped the six states as colours and words on the nodes and no legend beside
      them. So the legend is built here, and it says one thing the footnote could not:
      where the operator plane has *reported* a component stopped, the word is `stopped`
      rather than `silent`, because that is a fact the surface was given rather than one
      it inferred from silence.
- [x] T019 A gate: no view id may be named in `app/src` that `config.run`'s shell document
      does not declare. Append one line to `scripts/gates.registry`; never edit the runner.
      **Plant a link to `#/view/system`, watch it fail, revert, and say so in the commit
      message** (CLAUDE.md, lesson 2) — SC-06. `scripts/gates/check-view-ids.ts`, one line
      appended to the registry, the runner untouched. It checks three shapes because a
      view is named in three ways — a literal `#/view/<id>`, a `hashForView('<id>')` call,
      and a key of the panel registry, which is the same fault seen from the other end: a
      panel that exists and nothing can reach. It scans `site/docs` as well as `app/src`,
      because a dangling link is the same fault wherever it is written and the published
      site is where a reader meets one. Planted and watched failing on
      `IntroPanel.tsx:34`, then reverted.
- [x] T020 Rewrite every reference to the System view: `IntroPanel.tsx` (two links, in the
      101 and 105 sections), the arc's prose in 104, the walkthrough's component steps
      that name `system` as a panel, and any spec or blog text that links it. The gate
      from T019 is what proves this complete, not a search by hand. **It was four links in
      `IntroPanel.tsx`, not two** — 101, 105, 107 and the walkthrough paragraph — and the
      gate found three more the specification did not list: Background's control-loop
      explainer names `system` as its live view, `site/docs/demo/index.md` tabulates the
      address, and two shell tests used `system` as their example view id. The
      walkthrough's component steps turned out not to name it at all. That is the
      difference between a gate and a search by hand, in one task.
- [x] T021 Remove `SystemPanel.tsx`, its registry entry and its view in `config/run.json`.
      Last in this group: the panel is the thing every earlier task is making removable.
      Its two tests retired with it and nothing was lost: `operator-panel.test.tsx`
      already asserted both claims — every declared component drawn, and a component that
      stops going dark because its heartbeats cease — against the surface that discharges
      FR-16's obligation now. The glance capture moved off `system` in the same change, as
      did the topology artefact's line references (`pnpm generate`).

## Holdings — the timeline

- [x] T022 **The parity check, written before the display.** Enumerate what
      `coverage-holding.schema.json` declares — era, `holding_id`,
      `published_at.sim_time`, `field.sha256`, the manifest's grid shape — and assert the
      timeline announces each, with every holding reachable by keyboard in publication
      order (SC-03). The bound is the master, not the table's five columns: the master is
      the authority, it is amended rather than rewritten, and a bound read from disk
      survives a holding gaining a field (CLAUDE.md, lesson 2). The digest is announced as
      the twelve-character fingerprint the table already shows, not sixty-four characters
      read aloud. **Plant a new field in the master, watch the check name the timeline,
      revert, and say so in the commit message.** Landed as `announce.ts` and
      `parity.test.ts`, written and passing before `HoldingsTimeline.tsx` existed. Every
      property of the master is either announced or exempted with a reason, and the
      exemptions are a list the check reads — so an exemption cannot be added silently and
      a new property cannot pass by being forgotten. There is one exemption,
      `schema_version`, because a reader hearing "schema version 1" learns nothing about
      what the store holds. Planted: `retention_ticks` added to
      `coverage-holding.schema.json`, `pnpm generate` run, and the check failed naming the
      property and the display. Reverted. The rendered half — every holding a keyboard stop
      in publication order, each carrying the announcement (SC-03) — is in
      `holdings.test.tsx`, against holdings the store genuinely published.
- [x] T023 Read a holding's coverage interval from its own manifest: `grid.time` gives
      origin, start offset, step and count. A pure function with tests, no panel.
      `interval.ts`, a pure function with tests and no panel. It reads an era nowhere: an
      archive holding and a forecast instance are read by the same three lines, which is
      what makes the timeline's lanes a presentation choice rather than a parsing one. It
      refuses an axis it cannot read rather than guessing — the archive's `start_offset`
      is *negative*, reaching twenty years back before its origin, which a reader assuming
      forwards-only offsets would have drawn in the wrong place.
- [x] T024 The timeline: three era lanes, holdings drawn at their intervals, an axis that
      carries twenty years and six hours without either vanishing, and a stated scale.
      Grows on the store's publication topic; never polls. Built to pass T022.
      `HoldingsTimeline.tsx` and `scale.ts`. The axis is logarithmic in elapsed simulation
      time back from the newest step, and the panel states that beneath itself rather than
      letting a reader infer it from tick spacing. Three faults were found by looking at
      the running page rather than by reasoning, and each is recorded where it was fixed:
      `.timeline-row` was itself a grid item so two lanes landed on every line; four ISO
      instants printed over each other on one axis, so the labels are date-and-minute; and
      a run's forecast and its uncertainty field cover exactly the same interval, so the
      second bar hid the first entirely and four holdings drew as three — overlapping bars
      are now stacked into tracks within their lane. A bar under six per cent of the width
      draws no text, because a truncated identifier reading "loite" is worse than none;
      its accessible name is unaffected.
- [x] T025 Retire the inventory table once T022 passes against the timeline. **If it does
      not pass, the table stays and the reason is recorded here** — the licence was
      conditional on exactly this, and the check decides it rather than a judgment made
      at the end of the work.
      T022 passes, so the table is retired. The condition was met rather than waived: the
      check was written first, planted against a new field in the master, watched naming
      the timeline, and reverted.
- [x] T026 Keep the manifest view whole (FR-46) and the refusal path intact: a refused or
      unparseable inventory states its refusal; an empty timeline is never drawn as an
      empty store.
      The manifest is opened whole and the facts the timeline announces are written out
      above it, because an accessible name is not a thing a sighted reader can see and both
      are owed the same facts. A refused inventory states the refusal and draws **no**
      timeline; an empty store says the store has announced nothing yet, which is a
      different sentence from an empty picture.

## Holdings — truth against forecast

- [x] T027 Choose the counterpart: given an instance, find the nowcast holding whose time
      axis covers the instance's valid instant. Pure, tested, and refusing by name when
      there is none — including the in-validity case, which is the common one (SC-05).
      `counterpartFor`, pure and tested, refusing by name in every case — including the
      common one, an instance still inside its validity (SC-05).
      **The specification's rule, applied literally, refuses everything, and the reason is
      worth recording.** It asks for "never against a now-cast published before the instant
      it forecasts". The environment generator authors a now-cast covering three hours from
      the instant it publishes; a forecast instance reaches forty-five minutes past its
      own. So the now-cast covering an instance's last step was, in every case, published
      before that step, and the panel would always refuse. The requirement's *intent* is
      right and its test was wrong: what makes a document truth here is not when it was
      written but **who wrote it**. The environment generator is the world and evaluates
      the true field at any instant; the model runner predicts. The manifest names its
      generator, so the rule is read off the document — the truth's manifest must name a
      different generator from the instance's. A second rule fell out of the same reading:
      a run's *uncertainty* instance declares `temperature_spread`, which no now-cast
      carries, so it is refused for sharing no variable rather than by a guess about its
      identifier.
- [x] T028 Three area queries — instance, truth, persistence — at the chosen instant and
      depth, through the seam and the release gate, with the three URLs shown and copyable
      (SC-04).
      Three area queries at the chosen instant and depth, through the seam and the release
      gate, with the three URLs on screen and copyable. SC-04 is checked by fetching what
      the panel put on screen and validating each answer against the `coveragejson` master,
      against the real backend — not by eye.
- [x] T029 The difference display: both differences on one shared scale, which is closer
      stated plainly, and *the model is not earning its compute* said in those terms when
      it is not (Principle IX).
      Both differences on one shared scale — the larger magnitude of the two, so neither
      flatters itself — with which is closer stated plainly and *the model is not earning
      its compute* said in those terms when it is not, in the colour a refusal is said in.
- [x] T030 Label every derived figure as derived, distinctly from declared, reported and
      observed. Show telemetry's reported skill beside the picture, unrecomputed, with the
      sentence that says which question each answers.
      A fourth treatment joins 113's three: dashed, in its own hue, declared in
      `holdings.css` where the feature that introduced it lives. Telemetry's own skill
      figure sits beside the picture as a *reported* figure, carrying the component's own
      sentence unparaphrased, with the paragraph that says which question each answers.
      Where telemetry has published none, that is said and nothing is drawn in its place —
      a zero would be a claim about a model nobody has scored.

## The map

- [x] T031 Draw the ownship track and demanded course in the cube, in the frame's own
      cartesian space, at the depths the platform reported — not at the surface (FR-69).
      `ownshipInCube` in `cube.ts`, pure, so the claim worth checking — the track is at
      the depths the platform *reported* — is one a test can assert without a WebGL
      context. The demanded ray sits at the depth the platform is at rather than at the
      surface: a demand carries a course and a speed and says nothing about descending,
      and a ray on the surface would say the platform had been told to come up.
- [x] T032 Extend the capture proof to all three projections — SC-07.
      `scripts/capture/map.ts`, run in CI. It selects each projection through the panel's
      own control and reads the layer ids the panel actually handed deck.gl off
      `data-map-layers`, exiting non-zero when a projection drew no track. Measured: 4
      layers in the plan view, 6 on the globe, 9 in the volume, with the ownship track in
      all three. **What it deliberately does not claim**: that the volume's track sits at
      reported depths. That cannot be read off a canvas, and is asserted over the frame's
      own cartesian coordinates in `cube.test.ts` — a capture claiming to have verified it
      by looking would be claiming more than it saw, and the provenance sidecar says so.

## The walkthrough

- [x] T033 Move the help control from the shell header into the panel, top right; a view
      without a tour shows nothing. Check both presentations (FR-50, ADR-0033): the
      control must reach the same place narrow as wide.
      `HelpButton` loses `onOpenView` and its two-phase start with the header placement:
      a tour started from inside its own panel has the elements its steps highlight in the
      document already. Checked at both widths in `narrow.test.tsx` — the control is in
      the panel's own header row at 390px and at 1440px, never inside a disclosure, and
      the header carries none. Intro and Background show none, and that absence is now the
      answer rather than an omission.
- [x] T034 Tours for Map, Holdings and Messages; the component tour moved into Operator.
      Four tours: the component tour moved into Operator, and new ones for Map, Holdings
      and Messages, each keyed to the subjects its surface declares.
- [x] T035 Generalise the completeness rule: each tour held to a list on disk — the map's
      layer registry, the panels' declared regions. **Plant an unstepped layer, watch the
      check name it, revert, say so** — SC-08.
      `uncoveredSubjects` is one check over a list on disk, and each surface names its own
      authority: the map's is `panels/map/layers.ts`, and Holdings' and Messages' are the
      `*_REGIONS` their panels export. The map needed **two** statements rather than one,
      and the reason is recorded in that file: a tour step per raw layer id would be
      twenty-three steps, most about the same thing seen twice, while holding only at the
      subject level would let a new layer be added under an existing subject and never be
      noticed. So layers are held to subjects and subjects are held to the tour, and a new
      layer passes through both. **Planted**: a `bathymetry` PathLayer added to
      `MapPanel`, and the check failed naming the layer and the projection that drew it.
      Reverted.
- [x] T036 Extend the teaches-and-does-not-report test to all four tours (FR-62, SC-09).
      Enumerated from `allTours` rather than listed, so a fifth tour cannot be a tour no
      rule covers. A second check rides along: every tour names a view the configuration
      declares, which is the same fault the T019 gate catches from the other side.

## Showing the work

- [ ] T037 Link the hosted instance from the pull request, opened at each changed view —
      `#/view/messages`, `#/view/holdings`, `#/view/map` — not at the shell's front door
      (CLAUDE.md; D16). Narrate progress in PR comments as PR-05 asks, each comment
      linking the instance at what it is about.
- [x] T038 Blog entries for the two new faces: the traffic display and the holdings
      timeline. One per new face in the shell, not one per feature (D17). The map parity
      and the button move are not new faces and get none — the reason recorded here.

      Two entries: `watching-a-lane-go-quiet.md` for the traffic display and
      `twenty-years-and-six-hours-on-one-axis.md` for the holdings timeline. The map
      parity and the button move get none, and the reason is that neither is a new face:
      the map already drew the track in two projections and now draws it in three, and the
      help control is the same control in a different place. Both would be entries about a
      change rather than about a thing to watch work.