# Feature 115 — tasks

Ordered by build order: the record first, then the shared frame, then the three tabs in
the source's own sequence — each is expected to reuse what its predecessor established, so
building them out of order costs the family resemblance §2 of the source asks for.

Tick as you go, and write the reason at the moment a task is declined — the reason is the
part that cannot be reconstructed later (CLAUDE.md, lesson 1).

Features 101 to 109 are hard prerequisites: the shell and its addressing, the seam, the
broker, the coverage store and its EDR service, the planner and the map surface.

## Specification and record

- [x] T001 Write `spec.md` from the author's SRD: scope, the five open questions settled,
      the tree-versus-record corrections, and FR-71 to FR-80.
- [x] T002 Carry the author's SRD into the feature directory unmodified as
      `source-srd.md`, so what was asked for sits beside what was decided.
- [x] T003 SRD-v2 §5.15: FR-71 to FR-80, and the note on why the numbering starts at 71.
- [x] T004 ADR-0036: *a consumer may synthesise its inputs; it may never synthesise
      drogna's*. Owed before any synthesised lane is built, because Constitution VII
      forbids fixture data and the next reader must find the argument rather than infer
      it.
- [x] T005 Establish that Tab 2 stands on the right side of Constitution V, in the spec
      rather than in a commit message: a Monte Carlo over the whole domain infers no
      position, and the words `contact` and `detection` stay out of the code so the
      vocabulary gate holds the claim.

## Contracts and configuration

- [x] T006 `contracts/schemas/config.shell.schema.json`: `views[].kind`
      (`harness` | `consumer`, default `harness`), amended in place.
- [x] T007 Same master: a `consumers` block — hex resolution bounds and cell ceiling,
      depth-zone count, time budgets, expendable rates, the roster with its motion
      parameters, the objectives, the candidate count, the weighting bounds, the lanes,
      the tasks, the confidence weights, and every sample count the tabs are bounded by.
      Appended, never rewritten (CLAUDE.md).
- [x] T008 `app/config/run.json`: the three views and the `consumers` document.
- [x] T009 `pnpm generate`, commit `app/src/generated/`. The drift gate fails the build
      if this is skipped.

## The shared frame

- [x] T010 `panels/consumers/frame.tsx`: the provenance strip and the yellow chrome,
      rendered by the frame so a fourth consumer cannot be built without them.
- [x] T011 Yellow tabs in **both** presentations, driven by `views[].kind`: a custom
      dockview tab component and the stack's tab strip. The shell holds no list.
- [x] T012 `panels/consumers/freshness.ts`: the stale latch — `run/published` with
      `current: true` marks stale; recompute only on the reader's click; the superseded
      answer retained as a ghost naming its run; dismissible; replaced by the next
      accepted update, never by a local control change.
- [x] T013 `panels/consumers/rng.ts`: a seeded stream per tab, derived from the run
      manifest's root seed and a stream name. No `Math.random` anywhere (Constitution II,
      and the gate).
- [x] T014 `panels/consumers/domain.ts`: the domain read from the seam — horizontal and
      vertical extent from the EDR collection, the vessel's reach from the planner's
      published depth bands. No grid size, zone count or depth constant in any panel.
- [x] T015 `panels/consumers/hexes.ts`: the H3 grid over the domain at a chosen
      resolution, the aggregation of underlying cells, and the refusal when a resolution
      would exceed the configured cell ceiling.
- [x] T016 `consumers.css`: one stylesheet for the family — yellow chrome, ghosting,
      lanes, hexes. One breakpoint only (the gate reads `NARROW_WIDTH`).

## Tab 1 — Sampling

- [x] T017 `sampling/uncertainty.ts`: observations binned by hex and zone; recency,
      density and monotonic age decay toward saturation; unheard cells at saturation.
      Simulation time only (Constitution I, and the gate).
- [x] T018 `sampling/plan.ts`: value-per-transit insertion under a time budget, ending
      where the budget expires, seeded tie-breaks.
- [x] T019 `sampling/plan.ts`: expendable drops for the unreachable zones, constrained to
      lie on the route, each carrying the zone and the uncertainty it addresses.
- [x] T020 `SamplingPanel.tsx`: the hex map, the zone selector with its per-hex stack, the
      budget and rate controls with the coupled drop count, the plan action, the ghost.
- [x] T021 The no-drops comparison line, so that *depth changes route shape* is visible
      rather than asserted.
- [x] T022 Tests: the budget changes the route's shape, not only its length; a drop always
      lies on the route; uncertainty grows monotonically with time since observation; the
      resolution ceiling refuses rather than freezes.

## Tab 2 — Courses

- [x] T023 `courses/participants.ts`: three motion models — corridor on a schedule, seeded
      loiter over the shallows, seeded descent toward low detectability read from the
      fetched field. Behaviour drives motion, not a multiplier (source §4.3).
- [x] T024 `courses/candidates.ts`: three or four candidates drawn to span the trade,
      scored as exposure risk and objective achievement separately, combined under the
      reader's weighting.
- [x] T025 `CoursesPanel.tsx`: the roster with likelihoods, the objective, the cloud, the
      candidate table with its component scores, the weighting sliders, the ghost.
- [x] T026 Tests: the three clouds differ in character; likelihoods change the ranking;
      **the weighting flips the ranking** within the slider's range.

## Tab 3 — Feasibility

- [x] T027 `feasibility/lanes.ts`: the ten lanes, boolean and continuous, each carrying
      its provenance — from the seam, or synthesised by this tab and labelled so.
- [x] T028 `feasibility/sets.ts`: per-task thresholds, confidence weighting from
      configuration with `Off` excluding a source, and the top two or three **maximal**
      feasible sets with what each gives up.
- [x] T029 `FeasibilityPanel.tsx`: the Gantt, the draggable thresholds, the confidence
      controls, the task list with locking, the excluded tasks and what excluded them.
- [x] T030 Tests: a low-confidence source cannot veto a task alone; `Off` changes the
      sets; locking a task excludes the tasks that cannot coexist with it; the sets
      returned are maximal.

## What watching it run corrected

Written at the moment each was decided, because the reason is the part that cannot be
reconstructed later (CLAUDE.md, lesson 1). Each was found by looking at the running page,
not by a failing test.

- [x] T036 The tabs drew nothing until the first published forecast — several minutes of
      three blank yellow tabs, raised by the author watching the instance. A consumer now
      starts from the **now-cast** the store already holds (`basis.ts`), which also makes
      the freshness ceremony available from the first minute rather than after the first
      model run: with a now-cast answer on screen, the first forecast is already a change
      of basis.
- [x] T037 The uncertainty field was a flat dark rectangle: a consumer that counts only
      what arrived after it opened has an empty ocean, and a zero-to-saturation ramp draws
      it as one uniform shade. Two fixes, both honest: the view reads the **served
      observation history** on opening through an ordinary paged SensorThings GET, and the
      shading runs **between the values present** with the range printed beneath the map.
- [x] T038 The candidate ranking did not always flip on the default objective, and the
      test that claimed it did was passing on a lucky seed. Under *evasion* the two
      components genuinely move together, so no weighting reorders them. The view now
      **says when there is no trade at this objective**, opens on one where the trade is
      real, and the test names its objective rather than relying on the default.

## Proof, and showing the work

- [x] T031 Panel tests against a genuine backend, in the shape `panels.test.tsx` already
      uses: nothing mocked below the seam.
- [x] T032 `pnpm check` green, gates included.
- [ ] T033 Watch AC-01 to AC-10 in the published instance and link each from the pull
      request at the view it is in (CLAUDE.md, *showing the work*). The instance is built
      by CI once the pull request opens; the links go into the pull request body.
- [x] T034 Blog entry: three new faces in the shell is the case D17 names. Background,
      requirement, options considered, demo.
- [ ] T035 **Declined for this pull request, with the reason recorded now.**
      `scripts/capture/background.ts` is built around Background's slides — its keyboard
      proof drives a rail that only that panel has, and its greyscale pass measures that
      panel's own marks. Extending it to a consumer tab is a rewrite of the capture rather
      than an addition to it, and doing it here would put a capture refactor inside the
      feature that needed it. The palette was chosen against the same bar in the meantime
      (about 13:1 on the yellow, separating in greyscale as well as in colour, recorded in
      `consumers.css`), and the extension is owed as its own piece of work.
