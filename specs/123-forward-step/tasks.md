# Feature 123 — tasks

Two pull requests, on the author's decision recorded in `spec.md`: **the record first, the
implementation second.** The first carried the requirements and the decision records and
changed no code; the second is the implementation, and it ticks the rest with the reasons
written at the moment they were taken (CLAUDE.md, lesson 1).

Four of them found something the plan did not have, and those four are worth reading before
the rest: **T024** (what the estimators actually recover, and the two things that had to be
got right for them to), **T042** (the snapshots did not move, and why the task expected them
to), **T043** (one start condition's legs, and only one), and **T045** (what a run occupying
its cost did to five existing suites).

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
- [x] T024 **All four score, and none needed a widened bound.** Errors at the shipped grid,
      each against a bound read from disk: eddy centre 7.0 km (bound 69.5 km, its own
      authored radius); drifting feature 7.2 km (bound 40 km, its own radius); front 3.3 km
      across the authored line (bound 30 km, its own sharpness) with the bearing recovered
      to 9.3°; thermocline 9 m (bound 200 m, the grid's own depth spacing).
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
      the configuration over the declared rate, in ticks, published at start-up and whenever
      a tuning changes it.
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
      `prefers-reduced-motion`: there is nothing to suppress. Held by
      `forecast.test.tsx` and by `contrast.test.ts`, which named the gauge's fill the moment
      it was written.

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
      five files**, each re-derived from the behaviour rather than adjusted until it passed.
      The shape of every one is the same — a drive that stopped when a run was *requested*
      now stops with that run still integrating — so each waits for the publication instead:
      `loop.test.ts` (the end-to-end turn, and the minimum-interval decline),
      `analyst.test.ts` (one analysis per run, both counted), `operator.test.ts` (the prompt
      and the prompted offload), `operator-panel.test.tsx` (the same prompt in the drawer),
      `preroll.test.ts` (T043).
      Two changed for reasons that are not tick counts and are recorded rather than
      absorbed. A **prompted run is now held for cost** where it used to be accepted — which
      is FR-116 working, not a regression, so the operator test asserts the hold and names
      the shortfall, and its title says so. And `advisories.test.ts`'s second reason for an
      inconclusive leakage verdict **changed with the kernel**: two noise-free releases used
      to be identical value for value, because `shift-advect-v1` translated a field; a kernel
      that propagates a state diverges everywhere instead, so the mask is now the whole
      domain rather than empty. Different reason, same conclusion, and the test says which —
      which is precisely what that test was written to do.

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
