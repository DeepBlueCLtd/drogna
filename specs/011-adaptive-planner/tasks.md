---

description: "Task list for 011-adaptive-planner"
---

# Tasks: Adaptive Sampling Planner

**Input**: Design documents from `/specs/011-adaptive-planner/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 001 (clock, RNG, config loader),
feature 004 (ground-truth manifest, including the decorrelation timescale field tau
and its evaluation at an arbitrary location), feature 006 (type
generation chain), feature 007 (observation message shape) and feature 009's
uncertainty field and `ctl/run-published` announcement must be in place. The value
function, collapse model, selection and projection are all testable against
hand-built fields before any of feature 009 exists.

**Tests**: Requested. Test tasks are included and are written before the
implementation they cover.

**Organization**: Grouped by user story so each can be implemented, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: US1 collapse-aware value, US2 committed route under budget,
  US3 receding-horizon replanning, US4 forward projection

## Path Conventions

Service code under `services/planner/src/harness_planner/`, unit tests under
`services/planner/tests/`, shared schemas under `contracts/schemas/`, the algorithm
derivation in `docs/algorithms/`, cross-component tests under `tests/integration/`.

---

## Phase 1: Setup

- [X] T001 Create the `services/planner/` package skeleton — `pyproject.toml`,
  `src/harness_planner/__init__.py`, `tests/` — and register it in the `uv` workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the plan contract, the configuration contract, and the planning cell and
uncertainty state that every story computes over.

**CRITICAL**: no user story work begins until this phase is complete.

- [X] T002 Write `contracts/schemas/plan.schema.json` — committed route with
  per-vertex H3 index, depth band and arrival simulation time; collapse-aware value;
  budget and consumption; projection report; plan identifier, superseded plan
  identifier, horizon, uncertainty field identifier planned against; H3 resolution;
  empty-route reason. No addressee, no tasking, no directive field. `$id`
  `https://schemas.harness.invalid/plan.schema.json`.
- [X] T003 [P] Write `contracts/schemas/config.planner.schema.json`, `$ref`ing
  `config.common.schema.json` and adding H3 resolution, depth band definition, sensing
  decay lengths, budget and nominal speed, replan cadence, horizon, commitment window
  and improvement margin, usable-confidence threshold, projection step, heuristic
  restart count, and heartbeat interval.
- [X] T004 Regenerate Python and TypeScript types from `plan.schema.json` and confirm
  the drift check passes (`libs/harness_types/`, `client/src/generated/`).
- [X] T005 [P] Add `config/local/planner.json` and `config/droplet/planner.json` —
  same shape, destination-specific values.
- [X] T006 [P] Contract test asserting the plan schema accepts a canonical example,
  rejects payloads missing each required field, and rejects a route vertex lacking any
  of H3 index, depth band or arrival time, in
  `tests/integration/test_plan_schema.py`.
- [X] T007 [P] Implement the planning cell — H3 index at the configured resolution
  paired with a depth band, with neighbour and distance helpers — plus its unit test,
  in `services/planner/src/harness_planner/cells.py` and
  `services/planner/tests/test_cells.py`.
- [X] T008 Implement the uncertainty state — ensemble spread combined with an
  observation-age term, last-informed simulation time per cell, and regrowth at tau
  evaluated per planning cell from the generator's decorrelation timescale field
  (background water included, moving features advected) — plus its unit test covering
  cold arrival (spread alone), loiter (spread plus age), a background-water cell and a
  cell a moving feature has drifted across, in
  `services/planner/src/harness_planner/uncertainty_state.py` and
  `services/planner/tests/test_uncertainty_state.py`.

**Checkpoint**: the contract is fixed, and there is a field over planning cells to
plan against.

---

## Phase 3: User Story 1 — A route's value accounts for the sampling it does on the way (P1) 🎯 MVP

**Goal**: a value function that simulates the collapse of uncertainty along a
candidate route, so a distant objective's value decays as nearer sampling resolves it.

**Independent Test**: near and far objectives on one bearing; the far one's marginal
value is strictly less after the near one is visited, and the total is strictly less
than the naive sum.

### Tests for User Story 1

- [X] T009 [P] [US1] Unit test for the sensing footprint: which cells a visit informs
  and by how much, in the horizontal and in depth, against hand-computed values, in
  `services/planner/tests/test_sensing.py`.
- [X] T010 [P] [US1] Unit test for collapse and regrowth: a visit reduces the informed
  cells; a revisit after elapsed simulation time recovers only the regrown
  uncertainty; a cell already below the usable threshold contributes approximately
  nothing, in `services/planner/tests/test_collapse.py`.
- [X] T011 [P] [US1] Unit test for the collapse-aware value on the near/far geometry,
  asserting the far objective's marginal value is strictly smaller after the near
  visit, that the total is strictly less than the naive sum, and reporting the size of
  the difference, in `services/planner/tests/test_value.py`.

### Implementation for User Story 1

- [X] T012 [US1] Implement config loading and schema validation as the first
  operation, in `services/planner/src/harness_planner/config.py`.
- [X] T013 [P] [US1] Implement the sensing footprint model with configured decay
  lengths in `services/planner/src/harness_planner/sensing.py`.
- [X] T014 [US1] Implement simulated collapse along a traversal and regrowth at the
  cell's tau in `services/planner/src/harness_planner/collapse.py`.
- [X] T015 [US1] Implement the collapse-aware route value as the sum of marginal
  reductions in traversal order, in `services/planner/src/harness_planner/value.py`.

**Checkpoint**: given a field and a candidate route, the planner can say what the
route is worth, honestly.

---

## Phase 4: User Story 2 — One committed route, chosen under a budget, recommended not ordered (P2)

**Goal**: prize-collecting selection under a budget over H3 and depth cells, emitted
as a four-dimensional committed route on `ctl/plan`, carrying no instruction.

**Independent Test**: a budget too small to visit everything yields a within-budget
route that leaves cells unvisited, ordered with arrival times and depths, and a
payload that passes the forbidden-vocabulary test.

### Tests for User Story 2

- [X] T016 [P] [US2] Unit test for selection under budget: route cost within budget,
  candidate cells left unvisited, no requirement that all be visited, in
  `services/planner/tests/test_select.py`.
- [X] T017 [P] [US2] Determinism test: the same field, budget and seed produce the
  same route, including tie-breaks, across repeated runs and across process restarts,
  in `services/planner/tests/test_selection_determinism.py`.
- [X] T018 [P] [US2] Test for the empty-route cases: budget too small for any
  candidate, and every cell already below the usable threshold, each yielding an empty
  route with its stated reason rather than a consolation recommendation, in
  `services/planner/tests/test_empty_route.py`.
- [X] T019 [P] [US2] Forbidden-vocabulary test over `contracts/schemas/plan.schema.json`
  and over emitted plan payloads, asserting no addressee, no imperative verb, no
  tasking or directive field and no operator-addressed text, in
  `tests/integration/test_plan_carries_no_instruction.py`.

### Implementation for User Story 2

- [X] T020 [US2] Implement prize-collecting selection under a budget — greedy
  insertion with seeded randomised restarts, seeded tie-breaks, explicitly not a tour
  construction — in `services/planner/src/harness_planner/select.py`.
- [X] T021 [US2] Assemble the committed route: ordering, per-vertex H3 index, depth
  band and arrival simulation time, collapse-aware value and budget consumption, in
  `services/planner/src/harness_planner/select.py` and
  `services/planner/src/harness_planner/value.py`.
- [X] T022 [US2] Implement plan publication on `ctl/plan` and the heartbeat carrying
  `planning` / `no-field` / `nothing-worth-sampling`, in
  `services/planner/src/harness_planner/publish.py`.
- [X] T023 [US2] Wire the service: subscribe to `ctl/run-published` and `obs/#`, read
  the announced uncertainty field through the coverage read port, plan, publish, in
  `services/planner/src/harness_planner/service.py`.

**Checkpoint**: the planner recommends a single route under a budget, and nothing it
emits could be mistaken for an order.

---

## Phase 5: User Story 3 — The route is reconsidered as measurements arrive (P3)

**Goal**: replanning on a receding horizon, with commitment that holds and departures
that are recorded.

**Independent Test**: a sequence of fields and observation arrivals produces a
sequence of superseding plans whose committed prefix is stable when nothing material
has changed.

### Tests for User Story 3

- [X] T024 [P] [US3] Unit test for the commitment rule: the committed prefix is
  retained when improvement is below the margin, changed when it exceeds it, and the
  departure and its margin are recorded, in
  `services/planner/tests/test_commitment.py`.
- [X] T025 [P] [US3] Integration test: a new uncertainty field triggers a replan
  carrying a new plan identifier and the superseded identifier; a plan is never
  emitted against a superseded field; measurement arrivals collapse the cells they
  informed before the next replan, in
  `tests/integration/test_planner_replans_on_new_field.py`.

### Implementation for User Story 3

- [X] T026 [US3] Implement the receding horizon: cadence trigger in simulation time,
  new-field trigger, measurement-arrival trigger, replanning from the current
  position, in `services/planner/src/harness_planner/commitment.py`.
- [X] T027 [US3] Implement the commitment window and improvement margin, with
  departure recording, in `services/planner/src/harness_planner/commitment.py`.
- [X] T028 [US3] Extend the service to maintain last-informed times from `obs/#`, to
  discard an in-flight search whose field has been superseded, and to carry plan
  lineage identifiers, in `services/planner/src/harness_planner/service.py` and
  `services/planner/src/harness_planner/uncertainty_state.py`.

**Checkpoint**: the plan tracks the world without chasing it.

---

## Phase 6: User Story 4 — When a region will go blind is stated in advance (P4)

**Goal**: forward projection of uncertainty growth, with a crossing time or an
explicit no-crossing state for every region.

**Independent Test**: known growth rates give crossing times matching the analytic
values, and every region in the domain appears in the report.

### Tests for User Story 4

- [X] T029 [P] [US4] Unit test asserting projected crossing times match analytically
  derived times to within one projection step, that a just-sampled region's crossing
  time moves later consistently with collapse and regrowth, and that the tau values
  used match the generator's ground-truth field at sampled cells, in
  `services/planner/tests/test_projection.py`.
- [X] T030 [P] [US4] Test asserting 100% region coverage in every projection report,
  with an explicit no-crossing-within-horizon state rather than omission, in
  `services/planner/tests/test_projection_coverage.py`.

### Implementation for User Story 4

- [X] T031 [US4] Implement forward projection of uncertainty growth and per-region
  crossing times against the usable-confidence threshold, in
  `services/planner/src/harness_planner/projection.py`.
- [X] T032 [US4] Attach the projection report to every published plan so the output is
  schedulable, in `services/planner/src/harness_planner/publish.py`.

**Checkpoint**: the planner says when confidence will lapse, and says it about every
region.

---

## Phase 7: Polish & Cross-Cutting

- [X] T033 Write `docs/algorithms/informative-path-planning.md` — the value function
  derivation, the collapse and regrowth model, the sensing footprint, the orienteering
  formulation and why it is not travelling-salesman, and the heuristic.
- [X] T034 Measure the selection heuristic's optimality gap against exhaustive search
  on small hand-built instances and record the figures in
  `docs/algorithms/informative-path-planning.md` and as a test in
  `services/planner/tests/test_optimality_gap.py`.
- [X] T035 [P] Add the planner service to the Compose configuration with its config
  file mount, following the shape feature 005 fixed, and add C-15 to the component
  reference in `docs/architecture/`, naming crossing into tactical advice as the
  failure mode it owns.
- [X] T036 [P] Run the wall-clock, seeded-RNG, literal-path and forbidden-vocabulary
  lint gates over the package, the schema and the algorithm document, and add a replay
  test asserting an identical ordered plan sequence across two runs from the same
  manifest, in `services/planner/tests/test_replay.py`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story: all four compute
  over planning cells and the uncertainty state.
- **US1 (Phase 3)**: depends on Phase 2 only.
- **US2 (Phase 4)**: depends on US1, because the selection maximises the value US1
  defines. Selecting against a naive value would produce a route that is wrong in a
  way the tests would not catch.
- **US3 (Phase 5)**: depends on US2, since there must be a plan before there can be a
  replan.
- **US4 (Phase 6)**: depends on Phase 2's uncertainty state and regrowth model; it can
  be built in parallel with US2 and US3 by a second person, and only its attachment to
  the published plan (T032) depends on US2.
- **Polish (Phase 7)**: depends on the stories it documents. T034 depends on US2.

### Story Dependencies

- **US1** depends on nothing outside this feature except the manifest's decorrelation
  timescale field; it is testable on hand-built fields.
- **US2** depends on US1 and on the plan contract.
- **US3** depends on US2 and on feature 009's `ctl/run-published`.
- **US4** depends on Phase 2, and on US2 only for publication.

### Within Each Story

- Unit tests are written first and must fail before implementation.
- Config loading precedes anything that reads config.
- The sensing model precedes collapse; collapse precedes value; value precedes
  selection; selection precedes publication and commitment.
- Publication precedes the integration tests that observe it on the broker.

### Parallel Opportunities

- T003, T005, T006 and T007 in parallel; T002 is written first because the config
  schema and the contract test both reference the plan shape.
- All test tasks marked `[P]` within a story are separate files and run in parallel.
- T013 runs in parallel with T012.
- Phase 6 (US4) runs in parallel with Phases 4 and 5, apart from T032.
- T035 and T036 in parallel.

---

## Parallel Example: Phase 3 tests

```bash
Task: "Unit test for the sensing footprint in services/planner/tests/test_sensing.py"
Task: "Unit test for collapse and regrowth in services/planner/tests/test_collapse.py"
Task: "Unit test for collapse-aware value in services/planner/tests/test_value.py"
```

---

## Implementation Strategy

### MVP first

Phase 1, Phase 2, then US1. The collapse-aware value function is the hard part and the
part that can be wrong invisibly. It needs no broker, no solver and no published field
to be proved correct, so it is built and tested first, in isolation, on geometries
whose right answer is known by construction.

### Incremental delivery

1. Setup and Foundational — the plan contract, planning cells, uncertainty state.
2. US1 — a candidate route can be valued honestly.
3. US2 — a single committed route under a budget, published as a recommendation.
4. US3 — the route is reconsidered on a receding horizon without thrashing.
5. US4 — the output becomes schedulable rather than merely reactive.

### Notes

- `[P]` means different files with no dependency.
- Commit after each task or coherent group.
- The forbidden-vocabulary test (T019) is not a polish item. Once the schema exists,
  it applies to every subsequent task in this feature.
- Any randomisation added anywhere in the search must come through the RNG port. A
  bare `random` call in this package is a constitution violation, not a shortcut.
