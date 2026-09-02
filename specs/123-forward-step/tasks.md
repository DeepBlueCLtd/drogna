# Feature 123 — tasks

Two pull requests, on the author's decision recorded in `spec.md`: **the record first, the
implementation second.** This branch carries the requirements and the decision records and
changes no code. Everything under *The forward step* onwards is therefore unticked, and the
implementation PR ticks them as it goes, with the reasons written at the moment they are
taken (CLAUDE.md, lesson 1).

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

- [ ] T012 `config.model-runner.schema.json`: a `two_layer` block — interface depth, the two
      layers' velocities, horizontal diffusivity, interfacial exchange — and a `cost` block
      declaring the rate. Amended surgically; the master is never round-tripped through a
      formatter.
- [ ] T013 `pnpm generate`, and commit the output. The topology artefact moves too when
      `run.json` grows.
- [ ] T014 `kernel.ts`: `shallowTwoLayerKernel` (`shallow-two-layer-v1`) behind the unchanged
      `ModelKernel` interface, registered in `KERNELS` beside `shiftAdvectKernel`. Upwind
      advection and explicit diffusion per layer, interfacial exchange, integrated forward
      from the analysis.
- [ ] T015 Internal sub-stepping from the kernel's own stability condition, with the
      sub-step count derived from the grid and the parameters rather than configured.
- [ ] T016 **Watched failing**: a configuration that violates the stability condition, seen
      refused with the numbers named, before the refusal is trusted. Reverted, and said so
      in the commit message.
- [ ] T017 `KernelParameters` gains the two-layer block as **optional**; the new kernel
      refuses by name when it is absent. `shiftAdvectKernel` is not touched — if it needs
      touching, the port's interface is being bent to fit the newcomer and that is the
      finding, not the workaround.
- [ ] T018 `run.json`: `model_runner.kernel` → `shallow-two-layer-v1`.
- [ ] T019 `kernel.test.ts`: determinism from a seed, the refusal, and `shift-advect-v1`'s
      existing tests still passing unchanged (SC-004).

## The four features

- [ ] T020 `forecast-features.schema.json`: the four kinds, their parameters per step, and
      the uncertainty each carries. One master, four `$defs`, mirroring the manifest's own
      `eddy_parameters` / `front_parameters` / `thermocline_parameters` shapes so a scoring
      test compares like with like.
- [ ] T021 `features.ts`: estimators over **the analysis field the run initialises from** —
      eddy centre at the depth-averaged anomaly's extremum with the radius where it falls to
      1/e; front from the maximum horizontal gradient; thermocline from the maximum vertical
      gradient; the drifting feature tracked across steps.
- [ ] T022 Carried forward by the kernel's own two-layer velocity, with uncertainty growing
      as the analysis error times the root of the lead. Published per step and announced on
      a declared topic.
- [ ] T023 `features.test.ts`: **scored**, against the manifest's ground truth, with the
      bound read from the authoring jitter on disk. Never a number typed into the test.
- [ ] T024 Any estimator that will not score honestly is reported here as not done, with
      what it did instead. The front and the thermocline are the two expected to be
      difficult at this grid, and widening a bound until one passes is the failure mode this
      task exists to name in advance.

## Cost

- [ ] T025 `run-cost.schema.json`, and the runner as its **sole** publisher: work implied by
      the configuration over the declared rate, in ticks, published at start-up and whenever
      a tuning changes it.
- [ ] T026 `run-started.schema.json` gains `cost_ticks`.
- [ ] T027 `runner.ts`: `run()` splits into compute-on-announcement and publish-when-spent,
      released on the clock subscription it already holds. The staged publication waits;
      nothing is amortised across ticks.
- [ ] T028 `config.scheduler.schema.json` gains the release margin **and nothing else**. A
      cost figure here is the duplication T031's gate exists to prevent.
- [ ] T029 `scheduler.ts`: subscribe to the cost statement; hold a warranted scheduled or
      prompted run while `validityEnd − now > cost + margin`; release as headroom decays.
      `considerDivergence()` is untouched, and says why in a comment rather than leaving the
      omission to be read as an oversight.
- [ ] T030 `held-for-cost` as a fourth `scheduler-decision`, with the shortfall in ticks
      named, in the telemetry message and the heartbeat both. FR-32's three facts become
      four in the place that already draws them.
- [ ] T031 `gates/check-declared-cost.ts`, appended as one line to `scripts/gates.registry`.
      Fails if any component but the model runner declares a run's cost. The bound is read
      from the master on disk.
- [ ] T032 **Watched failing**: a planted `run_cost_ticks` in the scheduler's configuration
      master, seen caught. Reverted, and said so in the commit message.
- [ ] T033 `scheduler.test.ts`: the four decisions; **the becalm test** (SC-006) — a held run
      released when validity lapses; and a divergence accepted at a tick where a scheduled
      run would be held (SC-007).

## The socket, and the view

- [ ] T034 `forecast-indicator.schema.json`, and the monitor publishing it beside its
      divergence events: the figure, the threshold in force, and what the figure is. Read
      from the same `threshold()` the divergence rule reads, so the mark and the rule cannot
      disagree.
- [ ] T035 `run.json` `shell.views` gains `forecast`; `registry.tsx` maps it.
      `check-view-ids` reads the configuration, so the three sides stay cross-checked with
      no literal typed into a gate.
- [ ] T036 `ForecastPanel.tsx`: the gauge with its threshold and the cost beneath it in the
      same frame; the absence stated where the gauge would be when the topic is silent.
- [ ] T037 The timeline: runs in simulation time, labelled by cause, the fourth cause
      included.
- [ ] T038 The centre and right regions state that they are not built and name feature 124.
      Not an empty canvas, which is a claim the shell is not entitled to make.
- [ ] T039 Reads through `read.ts`'s `Read<T>` union — a value or a refusal, never
      `undefined` standing in for both. Refresh on announcement; no timer.
- [ ] T040 The help tour, held to a list on disk so a region gaining a feature and not a
      step is reported by name.
- [ ] T041 Greyscale, keyboard traversal and `prefers-reduced-motion`, captured.

## The ripple

- [ ] T042 `pnpm snapshots`, and **read the diff before committing it**. The kernel change
      moves every field a snapshot carries; if the grid, a seed or a leg moved too, that is
      a fault and not churn.
- [ ] T043 Start-condition legs: a run now occupies ticks, so a condition whose card claims
      a published run may need more of them. The 120 test that holds each card's prose to
      what its legs leave behind is the one that will say so.
- [ ] T044 `pnpm replay-proof` — byte-identical replay surviving the second kernel and the
      held publication (SC-002).
- [ ] T045 The existing suites that build a backend and turn the loop: re-derive their tick
      counts from the declared cost rather than adjusting numbers until they pass.

## The record, second half

- [ ] T046 The blog entry, with the capture. `pnpm capture:motion` — the run occupying its
      ticks is the thing that moves, and a paragraph describing it is the weakest of the
      three ways to show it.
- [ ] T047 The pull request links its own instance opened at `#/view/forecast`, and the
      entry by its full URL on the branch.
- [ ] T048 Tick the tasks above as they are done, and write the reason at the moment a task
      is declined. The reason is the part that cannot be reconstructed later.
