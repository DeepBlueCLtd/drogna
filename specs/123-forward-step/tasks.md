# Feature 123 — tasks

Two pull requests, on the author's decision recorded in `spec.md`: **the record first, the
implementation second.** The first carried the requirements and the decision records and
changed no code; the second is the implementation, and it ticks the rest with the reasons
written at the moment they were taken (CLAUDE.md, lesson 1).

**Where to start.** The plan's own tasks run to T048; T049 onwards are what four rounds of
adversarial review found, and those are the ones worth reading first. In rough order of what
they cost to be wrong: **T049** (stopping the runner mid-cost becalmed the loop for ever),
**T056** (every forecast step served one step off the label on it), **T068** (a mask claimed
in three documents and applied in one place of two), **T051** and **T053** (magnitudes
published at sixteen times their own uncertainty; a feature located 213 km from where it was
authored, at one seed in five), and **T065**, **T071** and **T073** (three checks this
feature added that could not fail — in the branch that quotes the lesson about exactly that).
Of the plan's own, **T024**, **T042**, **T043** and **T045** found things it did not have.

## The record — done on this branch

- [x] T001 Resolve the `121` collision: `specs/121-operator-actions` → `122`. The Data tab
      holds 121 in the SRD (§5.19, FR-93 to FR-103) and operator actions amended no
      requirement, so it is the one that moves. Its blog entry's `feature:` path moves with
      it.
- [x] T002 `specs/121-data-navigator/spec.md` said "Feature number. 118" after two
      renumbers. Corrected, with both renumbers recorded in the line rather than erased —
      the tree said 121 in three places and only the prose disagreed.
- [x] T003 `srd.md` defined **FR-91 and FR-92 twice each** — §5.16 (feature 118, consumer
      views) and §5.18 (feature 120, start conditions). §5.16 keeps them, its citations
      being the older; §5.18's move to FR-104 and FR-105, appended rather than inserted.
      Checked against the tree rather than asserted: four definitions before, two after.
- [x] T004 Citations chased individually, not by `sed` — the two meanings are
      indistinguishable by pattern. ADR-0041, the constitution's Data constraint,
      `specs/120-start-conditions/{spec,tasks}.md`, `Welcome.tsx`'s head comment. The
      `config.shell` master's three FR-91/92 references are §5.16's and were left alone.
- [x] T005 Constitution to **2.1.1**, editorial: one citation follows the renumbering, no
      principle, constraint or gate touched, and the version log says so in those words.
- [x] T006 FR-76 and FR-77, vacated by the *first* renumber of these two requirements, stay
      vacant. Recorded in §5.18 — a number is never reused, which is what makes a citation
      mean one thing.
- [x] T007 `srd.md` §5.20: FI-01 to FI-35 as FR-106 to FR-140, each citing its origin as
      *(FI-nn)*, in the companion document's own order. Checked mechanically: 35 FI cited,
      no FR defined twice.
- [x] T008 §9 gains AT-06 to AT-11 from FA-01 to FA-06; §10 strikes Q1 and Q2 with their
      answers and carries Q3 as Q-01; §4 restates V2-C11 and V2-C13; §2.2 upgrades the
      kernel port from a claim to a fact.
- [x] T009 The companion document archived at `docs/v2/forecast-illustration-srd.md`,
      unchanged below a banner naming §5.20 as where it now lives — the pattern
      `harness-srd.md` set.
- [x] T010 ADR-0042 (the forward step is a second kernel) and ADR-0043 (a run costs
      simulation time). Written on this branch rather than with the code because both were
      contested at the interview and both are hard to reverse: 0043 declines a
      constitutional request, and 0042 changes what every published run is made of.
- [x] T011 `pnpm gates`: 21 clean, on a branch that changes no code — which is the point of
      running them on a documentation change, since `check-site-links`, `check-blog-length`
      and `check-snapshot-drift` all read the tree this branch edits.

## The forward step

- [x] T012 `config.model-runner.schema.json`: a `two_layer` block — interface depth, the two
      layers' velocities, horizontal diffusivity, interfacial exchange — and a `cost` block
      declaring the rate. Amended surgically; the master is never round-tripped through a
      formatter.
- [x] T013 `pnpm generate`, and commit the output. The topology artefact moves too when
      `run.json` grows.
- [x] T014 `kernel.ts`: `shallowTwoLayerKernel` (`shallow-two-layer-v1`) behind the unchanged
      `ModelKernel` interface, registered in `KERNELS` beside `shiftAdvectKernel`. Upwind
      advection and explicit diffusion per layer, interfacial exchange, integrated forward
      from the analysis.
- [x] T015 Internal sub-stepping from the kernel's own stability condition, with the
      sub-step count derived from the grid and the parameters rather than configured.
- [x] T016 **Watched failing**, and twice over. The refusal itself is driven by a
      configuration that genuinely violates the condition — a diffusivity four orders of
      magnitude past anything oceanographic — and the test requires the message to name the
      Courant number, the diffusion number and the ceiling, so "unstable" without the numbers
      does not pass. Then the guard was disabled and the test seen to fail with "expected
      [Function] to throw an error", which is what says the refusal is doing the work rather
      than the configuration being unreachable. Reverted.
- [x] T017 `KernelParameters` gains the two-layer block as **optional**; the new kernel
      refuses by name when it is absent. `shiftAdvectKernel` is not edited, and its tests are
      written against the interface as it was.
      **Two things about the port did move, and neither is the interface being bent — but
      they are recorded rather than left to be found in the diff.** `KernelGrid` gained
      `depthsM`: a fact about the grid that was always true, that `shift-advect-v1` has no
      use for because it displaces every level identically, and that a kernel splitting the
      water column cannot do without. Reading it off the manifest inside the kernel would
      have put the manifest behind the port, which is the worse of the two. And `ModelKernel`
      gained `subStepsPerStep`, **optional**, which is how a kernel reports the work a run
      covers (FR-114) without every implementation having to answer: one that declares none
      costs nothing, and the runner says so in its cost statement. A required member there
      would have forced `shift-advect-v1` to answer a question it has no answer to, and that
      would have been the finding.
- [x] T018 `run.json`: `model_runner.kernel` → `shallow-two-layer-v1`.
- [x] T019 `kernel.test.ts`: determinism from one seed and divergence from another (a
      byte-identity claim against a seed that changes nothing is vacuous), both refusals, and
      the sub-step count derived from the grid rather than constant.
      **`shift-advect-v1` had no direct tests to keep passing** — it was covered only through
      `loop.test.ts`, which is not a test of the port — so SC-004 is met by writing them now,
      against the interface as it was: it runs unedited with the two-layer block present and
      ignored, and declares no work. One of them states the property that makes it a
      translation, so ADR-0042's central claim is checked rather than asserted: with the
      noise off, both layers see the same displacement of the same structure.

## The four features

- [x] T020 `forecast-features.schema.json`: the four kinds, their parameters per step, and
      the uncertainty each carries. One master, four `$defs`, mirroring the manifest's own
      `eddy_parameters` / `front_parameters` / `thermocline_parameters` shapes so a scoring
      test compares like with like.
- [x] T021 `features.ts`: estimators over **the analysis field the run initialises from** —
      eddy centre at the depth-averaged anomaly's extremum with the radius where it falls to
      1/e; front from the maximum horizontal gradient; thermocline from the maximum vertical
      gradient; the drifting feature tracked across steps.
- [x] T022 Carried forward by the kernel's own two-layer velocity, with uncertainty growing
      as the analysis error times the root of the lead. Published per step and announced on
      a declared topic.
- [x] T023 `features.test.ts`: **scored**, against the manifest's ground truth, with the
      bound read from the authoring jitter on disk. Never a number typed into the test.
- [x] T024 **The numbers below were the first draft's, measured at one seed, and T052 and
      T053 replace them.** They are left standing because striking them would erase what the
      estimator looked like when it was believed to be finished, which is the part that
      cannot be reconstructed later — but nothing in this paragraph is the current claim.
      Read T052 and T053 for what the tree does now: four seeds recover the drifting feature
      and the fifth declines it, the bearing is 0.2° to 0.6° rather than the 9.3° recorded
      here, and "all four score" was true of one seed and not of five.
      *(First draft, superseded:)* errors at the shipped grid, each against a bound read from
      disk: eddy centre 7.0 km (bound 69.5 km, its own authored radius); drifting feature
      7.2 km (bound 40 km, its own radius); front 3.3 km across the authored line (bound
      30 km, its own sharpness) with the bearing recovered to 9.3°; thermocline 9 m (bound
      200 m, the grid's own depth spacing).
      **Two things had to be got right and both were found by measuring, not by reasoning.**
      The first estimator took the extremum of the depth-averaged anomaly and recovered the
      eddy 164 km out — twice its radius. The cause was the *front*: it saturates, so its
      warm side is a broad plateau of the same order as the eddy's own amplitude, and a
      centroid over everything above half the peak is dragged across the domain by it. A
      finer grid measures that pull more precisely rather than removing it, which is the
      same lesson the AT-03 bound recorded. High-passing against a box mean a quarter of the
      shorter axis wide, and taking the centroid of the region *connected to* the peak,
      moved both blobs to 7 km.
      The second: the two blobs are separated by the **sign** of their anomaly — the eddy is
      authored warm, the drifting feature cold — which is a property of the field and not a
      hint from the manifest.
      Two claims are deliberately weaker than they look and are recorded rather than
      glossed. The front's *anchor* is scored as perpendicular distance to the authored
      line, never as distance between two anchors: a line has no distinguished point, so the
      second figure would score nothing. And the blob *radius* is under-estimated (42 km
      against an authored 69.5) because high-passing shrinks it; it is published because the
      surface needs a scale to draw, and it is not scored as if it were the authored radius.

## Cost

- [x] T025 `run-cost.schema.json`, and the runner as its **sole** publisher: work implied by
      the configuration over the declared rate, in ticks.
      **Not "published at start-up and whenever a tuning changes it", which is what this task
      said and is wrong twice.** No operator tunable targets the model runner, so the cost is
      a pure function of a document that is never mutated and there is no tuning to change
      it. And a figure published once, at start-up, is a figure the shell can never learn:
      the console mounts after the backend is built and pre-rolled, so the first statement
      goes out before anything is listening. It is restated on a declared cadence in ticks
      instead — a publication on the component's own clock, not a poll, and deterministic
      because it is driven by the clock subscription the runner already holds.
- [x] T026 `run-started.schema.json` gains `cost_ticks`.
- [x] T027 `runner.ts`: `run()` splits into compute-on-announcement and publish-when-spent,
      released on the clock subscription it already holds. The staged publication waits;
      nothing is amortised across ticks. The staged work is a closure over what was already
      computed rather than a recomputation later, which is what makes the wait a wait.
      **One consequence is widened rather than introduced, and is recorded rather than
      fixed.** Stopping the model runner from the operator plane between a run being
      announced and its publication strands the scheduler, whose `inFlight` clears only on a
      publication. That was already true — stopping the runner before a request stranded it
      identically — and what this feature changes is the size of the window, from zero ticks
      to the run's cost. Fixing it means giving the scheduler a way to give up on an
      outstanding run, which is a policy decision about the loop and not part of what §5.20
      asked for.
- [x] T028 `config.scheduler.schema.json` gains the release margin **and nothing else**. A
      cost figure here is the duplication T031's gate exists to prevent.
- [x] T029 `scheduler.ts`: subscribe to the cost statement; hold a warranted scheduled or
      prompted run while `validityEnd − now > cost + margin`; release as headroom decays.
      `considerDivergence()` is untouched, and says why in a comment rather than leaving the
      omission to be read as an oversight.
- [x] T030 `held-for-cost` as a fourth `scheduler-decision`, with the shortfall in ticks
      named, in the telemetry message and the heartbeat both. FR-32's three facts become
      four in the place that already draws them.
- [x] T031 `gates/check-declared-cost.ts`, appended as one line to `scripts/gates.registry`.
      Fails if any component but the model runner declares a run's cost. The bound is read
      from the master on disk.
- [x] T032 **Watched failing**: a planted `run_cost_ticks` in the scheduler's configuration
      master, seen caught. Reverted, and said so in the commit message.
- [x] T033 `scheduler.test.ts`: the four decisions; **the becalm test** (SC-006) — a held run
      released when validity lapses; and a divergence accepted at a tick where a scheduled
      run would be held (SC-007).

## The socket, and the view

- [x] T034 `forecast-indicator.schema.json`, and the monitor publishing it beside its
      divergence events: the figure, the threshold in force, and what the figure is. Read
      from the same `threshold()` the divergence rule reads, so the mark and the rule cannot
      disagree.
- [x] T035 `run.json` `shell.views` gains `forecast`; `registry.tsx` maps it.
      `check-view-ids` reads the configuration, so the three sides stay cross-checked with
      no literal typed into a gate.
- [x] T036 `ForecastPanel.tsx`: the gauge with its threshold and the cost beneath it in the
      same frame; the absence stated where the gauge would be when the topic is silent.
- [x] T037 The timeline: runs in simulation time, labelled by cause, the fourth cause
      included. The cause is read from the **run request**, which is where the scheduler
      declares it, rather than inferred from a decision's prose — a display that parses a
      sentence is a display inventing figures, so `run_request` joins the shell's declared
      topics.
      **And one thing the plan did not have.** The first capture of the running tab showed
      "no run has been announced yet" on a situation whose store held four forecasts: a
      console opens *after* the pre-roll, so every run the situation began with is in the
      past and no announcement of it is coming. That is the display inventing a silence,
      which is the fault the Operator tab's own head comment records being found the same
      way — by looking at the page. The panel now seeds the timeline from the store's
      inventory once on mount, and claims nothing it cannot support: a holding says when it
      was published and nothing about what asked for it, so those entries say the cause is
      not recoverable rather than guessing one.
- [x] T038 The centre and right regions state that they are not built and name feature 124.
      Not an empty canvas, which is a claim the shell is not entitled to make.
- [x] T039 Refresh on announcement; no timer. **`read.ts`'s `Read<T>` union was not reused,
      and the reason is recorded rather than left as an unexplained departure.** That module
      is the Data tab's, and its shape exists for a surface built out of relative-path GETs:
      it answers a value or a refusal because FR-06 needs a branch to say *why* it is empty.
      This surface is built out of broker announcements instead, and every one of them is
      validated against the master its topic declares before anything is drawn, with what was
      refused counted and stated. Importing one panel's reader into another would have
      coupled two panels to buy a shape this one has one use for — the single fetch it makes,
      the store's inventory on mount, whose only two outcomes are "seed the history" and "say
      nothing about it".
- [x] T040 The help tour, held to a list on disk so a region gaining a feature and not a
      step is reported by name.
- [x] T041 Greyscale, keyboard traversal and `prefers-reduced-motion`. The gauge prints its
      value and its threshold beside the bar and hatches the fill past the threshold, so the
      state survives greyscale without inference; the timeline marks a hold with a different
      glyph as well as a different tone, and every entry is a `button`, so the whole surface
      is reachable from the keyboard. `forecast.css` carries no `animation` and no
      `transition` at all, which is the strongest form of honouring
      `prefers-reduced-motion`: there is nothing to suppress. Keyboard traversal is held by
      `forecast.test.tsx`.
      **The greyscale legibility is not held by an automated check, and saying it was would
      be the claim this repository exists to avoid.** What `contrast.test.ts` gained is an
      entry in its *exemption* list — the gauge's fill carries no text — so what it holds is
      that the exemption has a reason beside it. The legibility itself rests on the hatch and
      the printed figures, and on a reader looking. Feature 124's Q-01 is the same question
      asked of the depth profile, and it is answered there by a capture for the same reason.

## The ripple

- [x] T042 `pnpm snapshots`, and the diff read: **nothing moved.** Every field digest and
      every embedded manifest is byte-for-byte what was committed; the only difference in the
      rebuilt artefacts is the recorded `code_revision`, which is a fact about the build and
      not about the ocean. The reason is worth stating because the task expected the
      opposite: a snapshot carries the *archive* and *now-cast* eras, which the environment
      generator authors, and this feature changed the model runner. `check-snapshot-drift` is
      clean against the artefacts already on disk, so they are left alone rather than
      re-committed for a revision string.
- [x] T043 It said so, and about exactly one condition. `'leaving'` promises "a departure
      forecast, assimilated from the now-cast alone", and its legs ran to the tick the
      cadence floor fires on — which used to publish a run in the same tick and now begins
      one. Its second leg goes to 920 ticks so the run it warranted is published inside the
      pre-roll rather than left integrating, and the leg's note says that is what the extra
      ticks are for. The other three conditions were unaffected: each already holds an
      instance from a run earlier in its script.
- [x] T044 `pnpm replay-proof` — byte-identical replay surviving the second kernel and the
      held publication (SC-002).
- [x] T045 The existing suites that build a backend and turn the loop: **nine tests across
      six files**, each re-derived from the behaviour rather than adjusted until it passed.
      The shape of every one is the same — a drive that stopped when a run was *requested*
      now stops with that run still integrating — so each waits for the publication instead:
      `loop.test.ts` (the end-to-end turn, and the minimum-interval decline),
      `analyst.test.ts` (one analysis per run, both counted), `operator.test.ts` (the prompt
      and the prompted offload), `operator-panel.test.tsx` (the same prompt in the drawer),
      `preroll.test.ts` (which needed no test edit at all — the fix was the leg length in
      `run.json`, per T043) and `advisories.test.ts`, whose reason is below.
      Two changed for reasons that are not tick counts and are recorded rather than
      absorbed. A **prompted run is now held for cost** where it used to be accepted — which
      is FR-116 working, not a regression, so the operator test asserts the hold and names
      the shortfall, and its title says so.
      And `advisories.test.ts`'s leakage tripwire **fired twice in this one branch, in both
      directions**, which is the best evidence in the feature that it is a real check. Two
      noise-free releases used to be identical value for value, because `shift-advect-v1`
      translated a field; a kernel that propagates a state diverged everywhere instead, so
      the mask became the whole domain. Correcting that kernel's lead convention (T056) made
      them identical again — and the reason is measured, not assumed: the two runs are made
      from byte-identical analyses, digest for digest, so with the model noise off they
      cannot differ. Why the assimilation left the field unchanged across a cycle in that
      zero-noise configuration is **not settled**, and the test says so rather than
      explaining it away; it now asserts the digests as the evidence for its own paragraph,
      so a future change that makes the analyses differ fails there instead of leaving a
      stale explanation standing. The conclusion never moved: an empty mask and a mask
      covering everything both discriminate nothing, #57 stays open, and this stays not a
      gate.

## What the adversarial review found, and what it changed

Two independent passes read the diff without having seen it written
(`.claude/skills/adversarial-review`). Six of their findings were real, and three of the six
are the kind that only an outsider finds — the author had already decided each was fine.

- [x] T049 **Stopping the model runner mid-cost becalmed the loop for ever.** A run now
      occupies the ticks it costs between its announcement and its publication, and the scheduler
      clears its outstanding run on a publication and on nothing else — so a stop landing in
      that window meant no cadence floor and no divergence would ever be acted on again,
      reached through an ordinary operator verb. It had been recorded here as "widened, not
      introduced" and left; that was wrong, because the window was zero ticks before and is
      now on every run. A run that will not finish now says so on the telemetry branch as it
      is stopped, and the scheduler releases what it was holding. Watched failing with the
      release removed: "expected +0 to be 1".
- [x] T050 **With a zero-cost kernel the standing-forecast gate had disappeared.** Replacing
      the cadence floor's validity test with "is the hold shortfall positive", and then
      short-circuiting the shortfall to zero whenever the cost was, deleted the gate
      outright for `shift-advect-v1` — the kernel ADR-0042 keeps registered precisely so the
      port stays real. The short-circuit is gone: a zero cost is still weighed, because the
      release margin alone is a validity rule. The scheduler's own master had gone on
      describing the old behaviour and now describes this one.
- [x] T051 **Three magnitudes were published under the manifest's names and were wrong by up
      to sixteen times the uncertainty beside them.** A blob's strength, a front's amplitude
      and a thermocline's temperature drop are quantities a horizontal estimator over a
      200 m depth grid cannot see. What is measured is now published as `anomaly_peak_c`,
      `anomaly_step_c` and `layer_drop_c` — names that do not invite the comparison — and
      the authored quantity each resembles is named in `not_estimated` with its reason.
- [x] T052 **The front's bearing was printed and never asserted, and the 9.3° this record
      quoted was one kind seed.** At the seed the console opens on, the same estimator was
      39.6° out, which for a folded bearing is barely distinguishable from chance. It is now
      averaged in doubled angles over every cell within half the peak gradient, weighted by
      it, and **asserted** against the authoring jitter read from configuration: 0.2° to
      0.6° across every seed the start conditions use.
- [x] T053 **Scoring every seed rather than one found two more faults.** The drifting
      feature came back 213 km from where it was authored at one of five seeds, because
      high-passing a warm blob leaves a cold ring around it and at that seed the ring — and
      then the front's own cold side — was deeper than the drifter. The ring is now excluded
      out to the width of the filter that made it, from the region as well as from its peak;
      and a peak that does not stand two standard deviations above the field's own scatter
      is **declined with its reason** rather than published. Four seeds recover it to 5–23
      km; the fifth says it could not.
- [x] T054 The smaller ones, each confirmed against the code: the Forecast timeline
      separated a forecast from its uncertainty sibling by the string `-spread` that no
      master declares, and now reads `manifest.composition.rule`; the monitor computed the
      same streak expression twice twenty lines apart, in the very function whose comment
      argues the gauge and the rule must read one figure; the gate's fixture was a 204-line
      copy of the owner master that had already drifted within this branch, and is a stub
      that cannot; the gate's `run.json` arm had never been planted against, and is; four
      comments said things the code did not do — a threshold "always" at mid-bar, "four
      causes" over three, no-flux boundaries that advect outward, a depth uncertainty of a
      spacing that is half of one — and each now says what happens.

- [x] T055 And one the review did not find, because the suite did. Fixing T049 gave the
      scheduler a ninth heartbeat figure, and `heartbeat.schema.json` caps a component at
      eight — a face has room for eight and a ninth is a face inventing space. Four tests
      went red at once and named it: the scheduler simply stopped being heard from. The
      release margin is the figure that goes, because it is a configured constant this
      component owns, is named in every held-for-cost decision anyway, and drawing it would
      be drawing configuration back at the reader who set it. The array now sits exactly at
      the cap, so the next figure has to displace one of these and argue for it — which is
      what a cap is for. (Momentarily two were dropped rather than one, leaving a comment
      describing a run-cost figure that was no longer there; the second round of review
      caught the comment, and the figure is back.)

### The second round, against the fixed tree

The skill's guard is keyed to the commit, so the fixes were reviewed too — and the second
pass found more than the first, including the one fault in this feature that would have
mislabelled every forecast the harness ever served.

- [x] T056 **The new kernel's output was one forecast step ahead of the time axis the runner
      labels it with.** `shift-advect-v1` writes step 0 undisplaced; the two-layer kernel
      wrote each step *after* integrating it, while the manifest went on declaring
      `start_offset_seconds: 0`. So an EDR query at the initialisation instant was answered
      with the field 900 seconds later, the last step was served 900 seconds early, and the
      instant a collection claimed to start at was one its field never contained — and the
      run's own features, published on the same tick, used the other convention. Step 0 is
      now the state the run initialises from, and a test holds **both** kernels to it,
      because the convention belongs to the port rather than to either of them.
- [x] T057 **A held reader's prompt was reported and then dropped.** Nothing remembered it,
      and the only path that requests again is the cadence floor, which fires on its own
      schedule and labels its run `scheduled` — so a reader was told "released as that
      headroom decays" and got no run, while FR-115, FR-116, this feature's spec, ADR-0043
      and the scheduler's own published sentence all said prompts are released. The prompt
      is now held as a commitment and released when the headroom decays, or declined by the
      rule that declines it if the world moved while it waited. Nothing expires in silence.
- [x] T058 **Pressing the button a second time during a hold published nothing at all.** The
      once-per-episode guard is right for the cadence floor, which is considered every tick
      and would republish an unchanged fact; it is wrong for a discrete act by a reader, who
      got an unchanged screen and a button that looked broken. A prompt is answered every
      time it is asked.
- [x] T059 **The Operator's ensemble face drew five empty pips for the whole visible duration
      of a run.** `members_done` was set at publication, and a run waits out the ticks it costs
      after computing every member — so the one figure that exists to show an ensemble
      filling rather than spinning was reporting less work than had been done. It is set
      when the members exist, which is when it became true.
- [x] T060 **`sub_steps_per_step` reported one sub-step for a kernel that declares no work.**
      A zero clamped to one had the same component saying "declares no work, so a run costs
      nothing" on the cost topic and "took one integration sub-step" on the run-started
      message, about the same run. The master now admits null and the runner publishes it —
      absent is not zero and neither is one, which is the distinction the indicator socket
      already makes correctly two files away.
- [x] T061 **One uncertainty block, computed from the eddy, was attached to all four
      features.** The drifting feature is authored weaker and smaller, so the uncertainty
      published beside its position came from a different feature's magnitudes — on a message
      whose entire purpose is that a forecast makes a falsifiable claim, and in a module
      whose own comment names that failure. Each feature now carries an uncertainty derived
      from its own peak and its own scale, and a test asserts two of them cannot be equal.

- [x] T062 **The Forecast tab's own deep link did not survive a reload.** A run heard live
      was keyed `run:<id>` and the same run read back from the store was keyed
      `held-instance:<id>` — and a holding published by a run carries that run's id, so the
      two were the same run under two names. An address written while the run was live
      selected nothing the moment the panel remounted and the run had become history, which
      is every reload; and the tour promises the opposite in so many words. A hold was worse:
      its key embedded its position in the list at insertion, so it was never addressable at
      all. Both now key on what the entry is. A test writes an address, remounts, and
      requires the selection to come back.
- [x] T063 **The cost was declared against a cell more than twice the size of the one the
      run is handed.** The declaration exists so a cost can be stated before any analysis
      arrives; it is only the same work as the occupancy while the two agree on the sub-step
      count, and nothing related them. At 11 km against a real 4.9 by 5.6 km that agreement
      was luck — both round to one sub-step at this step length — and would end at the first
      refined grid. The nominal is now 5 km and a test compares the declared count against
      the one the run reports.
- [x] T064 The smaller ones from the second round: the scheduler's heartbeat carried a
      comment justifying a run-cost figure that had been dropped along with the margin (the
      figure is back and the array sits at the cap); `not_estimated` was repeated verbatim in
      every step of every message, though it is a property of the estimate and cannot differ
      by lead, and is now published once; the high-passed field was computed twice per
      estimate in a function whose own comment argues against doing it the expensive way; a
      dead `scheduler` parameter in the test bench was silenced with `void` rather than
      removed; and T024 stood beside T052 and T053 carrying the numbers they replace.

### The third round, and the one finding that indicts the other two

- [x] T065 **Two of the checks feature 123 added could not fail, and the record said they
      held the shape against rot.** The master-conformance assertions in `loop.test.ts` live
      inside broker subscription handlers, and the broker *catches* a handler fault: it
      counts it, logs it, and delivery continues. So a published message its master refused
      turned a green test greener. This is the repository's second lesson arriving in the
      work that quotes it — a check never seen to fail is worth nothing — and it is a
      widening of a hole the file already had rather than a new one. Every drive now asserts
      the broker's fault count is zero. Watched failing: renaming `anomaly_peak_c` to
      `peak_c` in the master, which `tsc` cannot see past the runner's casts, now fails with
      "a subscriber threw and the broker swallowed it" where it used to pass.
- [x] T066 **Two requirements still said the runner publishes quantities it declines.**
      T051 renamed the magnitudes and declared the authored ones not recovered — and stopped
      there, in the tasks file, which is the one place the SRD does not point at. A reader
      tracing FR-113 to the wire would have found a requirement that reads as met and is
      not. SRD §5.20 FR-113 and this feature's own FR-05 are amended in place, with what was
      measured and why, which is the half of lesson 1 that says fix the record.
- [x] T067 The smaller ones: a held entry's timeline key carried `divergence_id`, which is
      always null for a hold because a divergence is never held — so two holds at one tick
      could collide, and the key now carries what the scheduler actually said; `hold()`'s
      `divergenceId` parameter was passed null by both callers and could never gain a third,
      so it is gone; `release_margin_ticks` carried an unreachable `default` beside being
      required; the panel kept one count in a ref and a state; and the Forecast tab's tests
      were the slowest file in the repository — the pure tour check paid for a whole backend
      it never touched, and three drives ran a fixed 5,400 ticks where they wanted a
      condition. That last one is a flake risk this feature enlarged: the suite's total is
      close enough to vitest's worker-reply deadline that one run of `pnpm check` exited
      non-zero with every test passing.

### The fourth round, and a claim made in three documents and implemented in none

- [x] T068 **The front was masked against the eddy and not against the drifting feature,
      while this module, its master and its own function's docstring all said "outside both
      blobs".** The mask argument is that an unmasked gradient maximum finds whichever
      anomaly is steeper at this seed and would find the other at the next — and it was
      applied to one of the two, because the front was estimated before the cold blob
      existed to mask with. Measured across the shipped seeds, the anchor landed **inside the
      authored drifting feature at three of five**, and the step taken across "the front" was
      16% to 35% larger than the quantity its master describes. Neither of the two figures
      the tests score could see it: the anchor is scored as a perpendicular distance to the
      authored line and the drifting feature happens to sit near that line, and the step is
      not scored at all. The order is now eddy, then the cold blob, then the front against
      both — the ordering was never load-bearing, since the cold search needs only the warm
      blob.
- [x] T069 **The declared cost stated four integration steps where the kernel takes three.**
      T056 made step 0 the state a run initialises from, so a four-step run integrates three
      times; the cost arithmetic went on multiplying by the output count. Self-consistent —
      the declared cost was also the occupied one — and wrong by a third as a *statement*, in
      a `basis` string whose whole purpose is that a reader who disagrees with the cost can
      see which assumption to argue with. A run now costs 9 ticks and says why.
- [x] T070 **An abandoned run went on saying it was occupying its cost for ever.** T049 gave the runner a
      way to say it had given a run up and the scheduler a way to hear it; the Forecast tab
      receives the same message on the same topic and dropped it. So the surface built to
      make an occupancy visible went on asserting work in progress that the component owing
      it had already disowned — with the contradicting message delivered to the panel and
      discarded. It now says the run was never published.
- [x] T071 **A check in `features.test.ts` could not fail.** "Every kind is either estimated
      or named with a reason" tested `declined.some(e => e.kind === kind)`, and every kind is
      pushed to `declined` on both branches — absent with a whole-feature reason, present
      with a quantity reason — so the set always held all four. It now requires a
      **whole-feature** decline, and requires that a kind is never both estimated and
      disowned. In the same file that quotes lesson 2.
- [x] T072 The rest: the `cadence-floor` tunable in `run.json` still described the rule the
      scheduler's master had already been rewritten away from; the timeline's held key
      carried `divergence_id`, which is null for every hold by construction, so two holds at
      one tick collided (it now carries what the scheduler said); and the blog capture and
      its alt text stated a nominal cell of 11 km after T063 moved it to 5.

### The fifth round, and the third check that could not fail

- [x] T073 **"Reported once per episode" was true by construction of the test's own stopping
      condition.** The drive stopped on the tick that published the first hold, so the count
      was one whatever the scheduler did — and deleting the dedupe outright left all seven
      tests in the file green. It now drives past the hold and counts again: 201 against 1
      with the guard removed. That is the third check this feature added that could not fail,
      in a branch that quotes the lesson about exactly that, and the pattern is worth naming
      because all three took the same shape — an assertion placed where the thing it tests
      cannot yet have gone wrong.
- [x] T074 **And the check that could not fail was hiding a real fault.** The hold marker was
      one field, named for the cause being held and used as the marker for having reported
      it. A reader's prompt overwrote it, so the next clock sample found the cadence floor's
      cause missing and republished a fact that had not changed — a spurious row on the
      Forecast timeline and a wrong figure on the scheduler's face, once per press. It is a
      set now: two causes can be held at one instant, and each owes the reader exactly one
      sentence. Held by a bench test that plants the floor holding and then presses twice.
- [x] T075 The record: `restate_every_ticks` carried the same unreachable `default` beside
      `required` that T067 had just removed from its sibling; SC-010's second clause
      described a refetch this surface does not do and no test holds; four statements still
      said a run occupies twelve ticks after T069 made it nine; the SRD amendment to FR-113
      had split the requirement mid-paragraph, leaving its closing sentences and its citation
      inside the amendment note; and this file's own opening index still pointed at four
      tasks from the plan after four review rounds had found larger things.

Two of their observations were recorded rather than acted on. The sub-stepping machinery
never engages at the shipped grid (one sub-step at both the nominal and the real cell size,
because a 900-second step on 5 km cells is nowhere near the stability limit) — it is
headroom, reachable by configuration and tested there. And `ctl/forecast/features` has no
consumer: it is feature 124's to read, which is stated, and a loop test now validates the
message against its master so the shape cannot rot in the meantime.

## The record, second half

- [x] T046 The blog entry: `affordable-when-you-do-not-need-it-yet.md`, at 300 words. Its
      finding is the inverted affordability rule, because that is the part of this feature
      that cannot be reconstructed from the diff.
- [x] T047 The pull request links its own instance opened at `#/view/forecast`, and the
      entry by its full URL on the branch. The entry carries a **still** capture rather than
      a moving one, and the reason is a limitation of the tool rather than a judgement about
      the change: `capture:motion` pins the clock to zero and then clicks a selector, so it
      records movement a *reader* starts. The movement here — a run occupying its ticks — is
      started by the clock, and the Forecast tab carries no control that advances it. Named
      here rather than left as an unexplained still.
- [x] T048 Tick the tasks above as they are done, and write the reason at the moment a task
      is declined. The reason is the part that cannot be reconstructed later.

## The sixth round: what CI saw and the local check did not

The three below were all found after the branch was believed finished, and the first is the
one worth reading. `pnpm check` had reported green on every commit of this branch while
**every CI run on the pull request failed** — seven of them, from the first push onwards.
The check the repository runs locally and the check CI runs are not the same check, and
nothing said so.

- [x] T076 The Forecast tab did not fit a phone, and `pnpm check` cannot see that. The
      capture proofs (`capture:mobile`, feature 112's SC-001) run in CI and not in `check`,
      and they failed eleven times on this panel: `.forecast-run` was a grid of three
      `max-content` columns and a `minmax(0, 1fr)`, which cannot fold. At 360px the button
      laid out 351px wide inside 320px and pushed the `li`, the `ol`, the region and the
      whole panel past the viewport with it. Now a wrapping flex row — no breakpoint, so it
      folds wherever the content stops fitting — and `.forecast-run-detail` breaks inside a
      word, because a flex item's floor is its longest word and "published:" is 70px at this
      size, which is what the proof measured inside a 35px track. Reproduced locally at
      eleven failures, fixed, re-run at zero.
- [x] T077 **The refusal nobody heard.** T049 answered one entrance to the cost window —
      the runner stopped mid-occupancy — and asserted the other could not be reached: "the
      scheduler allows one request in flight at a time, so this cannot be reached from the
      shipped loop". Restarting the *scheduler* reaches it. A fresh scheduler has no run in
      flight and no standing validity to hold against, so its cadence floor fires at once,
      the analyst obliges, and a second analysis arrives at a still-occupied runner. The
      runner refused it by `throw`ing — inside a broker subscription handler, which catches
      handler faults and increments a counter. So the scheduler was never told, went on
      waiting for a publication that had been refused before any work was done, and no
      surface said anything. Measured at `loitering`, seed 4242, restart at tick 4420:
      twenty thousand ticks and eleven cadence floors with nothing requested, started or
      published. It now publishes `run-failed` for the run it refuses, on the branch the
      stopped-runner case already uses.

      Two drafts of the test were too weak to keep, and both are worth recording because
      they are the same mistake in different clothes. The first restarted the scheduler
      during the *first* run — and a restarted scheduler counts run ids from zero again, so
      it asked for the same `…-run-0` that was already occupying, and the occupying run's
      publication cleared the new scheduler's outstanding run by an id collision rather than
      by anything being right. The second asserted "a request followed the restart", which
      the becalmed loop also does: it makes exactly one. What separates the two cases is a
      *second* request, and the test now waits four cadence intervals for it. Watched
      failing against the restored `throw`: "expected 3 to be greater than 3".
- [x] T078 A feature was carried at a velocity the field is not. `carryVelocity` read
      `parameters.twoLayer !== undefined` as "the two-layer kernel is configured", and the
      runner populates that block whichever kernel is configured — deliberately, and it says
      so. So the branch was taken always: with `shift-advect-v1` selected the published
      features drifted at 7 and 3 km/day while the field was translated at the configured 4
      and 2, which on the shipped grid rounds to no displacement at all. Two forecasts in
      one message, which is what that function's own comment forbids. The unreachable branch
      was not a dead line — it was the correct behaviour, never run.

      The kernel is now asked rather than inferred: `ModelKernel.carryVelocity?`, optional
      like `subStepsPerStep` and for the same reason. No check could have caught this,
      because every carry test used the two-layer kernel, where the wrong branch and the
      right branch agree. The new one runs the same estimate under both kernels and reads
      the velocity off the resulting track. Its first draft asserted to a tolerance of
      0.0005 km/day and failed on the lat/lon round-trip (7.0028 for 7) while the planted
      fault went unremarked — a check failing for the wrong reason, which is no better than
      one that cannot fail. At a tolerance of 0.05, against kernels 3 km/day apart, it
      failed as it should: "expected 7.0028 to be close to 4".
- [x] T079 The analyst's hook budget, raised on a measurement rather than nudged. Feature
      123 made the drive dearer in simulation time — the hold moves the second cycle off the
      cadence floor, 3609 ticks to 4429, 28.0s to 38.7s standalone — and the budget is in
      host time. It walked into the ceiling one commit at a time: 52.8s, 57.5s, 59.96s, then
      a timeout. The third of those passed by 36 milliseconds, and a bound cleared by 0.06%
      is not a bound. 120s is the measurement doubled for a CI runner, which is the ratio
      `vite.config.ts` already records.
