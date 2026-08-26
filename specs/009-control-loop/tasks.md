---

description: "Task list for 009-control-loop"
---

# Tasks: Control Loop — Sense, Decide, Act, Publish

**Input**: Design documents from `/specs/009-control-loop/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 001 (clock, RNG, config loader,
manifest), feature 004 (ground-truth manifest), feature 006 (type generation chain)
and feature 007 (observation message shape and store) must be in place.

**Tests**: Requested. Test tasks are included and are written before the
implementation they cover.

**Organization**: Grouped by user story so each can be implemented, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: US1 monitor, US2 scheduler, US3 model runner, US4 publisher,
  US5 closed loop

## Path Conventions

Paths are as fixed in `plan.md`: services under `services/<name>/src/harness_<name>/`,
unit tests under `services/<name>/tests/`, shared schemas under `contracts/schemas/`,
cross-component tests under `tests/integration/`, acceptance under `tests/acceptance/`.
Every service's `service.py` task includes loading `HARNESS_CONFIG` and validating it
against the component schema before any other I/O.

---

## Phase 1: Setup

- [x] T001 Create the four service package skeletons — `services/monitor/`,
  `services/scheduler/`, `services/model_runner/`, `services/publisher/`, each with
  `pyproject.toml`, `src/harness_<name>/__init__.py` and `tests/` — and register all
  four in the `uv` workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the message contracts and configuration contracts every story depends on.

**CRITICAL**: no user story work begins until this phase is complete.

- [x] T002 Write `contracts/schemas/divergence.schema.json` (region, mean and peak
  residual in m/s, sample count, simulation-time span, forecast run identifier scored
  against, persistence rule satisfied) and `contracts/schemas/run-request.schema.json`
  (run identifier, initialisation simulation time, region, ensemble size, the
  divergence that justified it). `$id`s of the form
  `https://schemas.harness.invalid/<name>.schema.json`.
- [x] T003 [P] Write `contracts/schemas/run-started.schema.json` (run identifier,
  request reference, member count, start simulation time) and
  `contracts/schemas/run-published.schema.json` (run identifier, valid time range,
  grid bounds, forecast and uncertainty collection identifiers, current flag).
- [x] T004 [P] Write the four component config schemas —
  `contracts/schemas/config.{monitor,scheduler,model_runner,publisher}.schema.json` —
  each `$ref`ing `config.common.schema.json` and adding: window bounds, threshold in
  m/s, persistence counts, spans and neighbourhood radius, warm-up mode (monitor);
  minimum interval and outstanding timeout (scheduler); ensemble size, perturbation
  and noise parameters, staging location, kernel selector (model runner); staging and
  catalogued locations and catalogue naming parameters (publisher). All four carry a
  heartbeat interval.
- [x] T005 Regenerate Python and TypeScript types from the four message schemas and
  confirm the drift check passes (`libs/harness_types/`, `client/src/generated/`).
- [x] T006 [P] Add the four component config files to `config/local/` and the four
  matching files to `config/droplet/` — same shape, destination-specific values.
- [x] T007 [P] Contract tests asserting each of the four message schemas accepts a
  canonical example and rejects a payload missing each required field, in
  `tests/integration/test_control_schemas.py`.

**Checkpoint**: contracts fixed and types generated. Stories may proceed in parallel.

---

## Phase 3: User Story 1 — Divergence is detected without crying wolf (P1) 🎯 MVP

**Goal**: a monitor that scores observation traffic against the current forecast on
sound speed and raises a justified divergence, never a spurious one.

**Independent Test**: replay a recorded observation stream against a fixed published
field; a single spike raises nothing, a sustained neighbourhood bias raises exactly
one `ctl/divergence` carrying its evidence.

### Tests for User Story 1

- [x] T008 [P] [US1] Unit tests for the residual being defined on sound speed — a
  case where temperature diverges but salinity compensates raises nothing — and for
  the monitor calling `harness_core`'s shared sound-speed derivation rather than any
  local copy of the equation (ADR-0005), in `services/monitor/tests/test_residual.py`.
  Scoring the derivation itself against published reference values belongs beside the
  shared implementation, not here, because there is only one of it.
- [x] T009 [P] [US1] Unit test for the rolling window: eviction by simulation-time
  span, eviction by sample count, and shed counting under overload, in
  `services/monitor/tests/test_window.py`.
- [x] T010 [P] [US1] Unit test for the persistence rules: single spike rejected,
  spatial rule satisfied, temporal rule satisfied, evidence invalidated on a new
  publication and on broker reconnection, in
  `services/monitor/tests/test_persistence.py`.
- [x] T011 [P] [US1] Integration test for warm-up and restart catch-up: no divergence
  before warm-up completes, exactly one store query in catch-up mode, zero store
  queries thereafter, in `tests/integration/test_monitor_warmup.py`.

### Implementation for User Story 1

- [x] T012 [US1] Implement the residual against the current forecast, sampled through
  the coverage read port at the observation's four-dimensional position and derived by
  calling `harness_core`'s shared sound-speed implementation, in
  `services/monitor/src/harness_monitor/residual.py`. Where that shared implementation
  does not yet exist, contribute it to `libs/harness_core` additively, with its
  formulation and validity range written up in `docs/algorithms/`, so telemetry and the
  environment generator call the same function (ADR-0005). The monitor holds no copy of
  the equation, and there is no stored sound-speed datastream to read instead.
- [x] T013 [P] [US1] Implement the bounded rolling window with simulation-time
  eviction and shed counters in `services/monitor/src/harness_monitor/window.py`.
- [x] T014 [US1] Implement the spatial and temporal persistence rules and evidence
  invalidation in `services/monitor/src/harness_monitor/persistence.py`.
- [x] T015 [US1] Implement warm-up and the single restart catch-up query in
  `services/monitor/src/harness_monitor/catchup.py`.
- [x] T016 [US1] Implement divergence publication on `ctl/divergence`, residual
  summaries on `ctl/telemetry`, and the heartbeat carrying `warming` / `scoring` /
  `no-forecast`, in `services/monitor/src/harness_monitor/publish.py`. The heartbeat
  fires on a real-time interval and carries the current simulation time as payload,
  marked `# harness:allow-wallclock` with ADR-0006 as its reason; every other interval
  in the service stays on the simulation clock.
- [x] T017 [US1] Wire config loading and validation, the `obs/#` subscription loop and
  the `ctl/run-published` subscription that swaps the field being scored, in
  `services/monitor/src/harness_monitor/config.py` and
  `services/monitor/src/harness_monitor/service.py`.

**Checkpoint**: the monitor runs alone, scores a live observation stream, and raises
justified divergence and nothing else.

---

## Phase 4: User Story 2 — A run is scheduled at most once, and not too often (P2)

**Goal**: a scheduler that converts divergence into at most one outstanding run
request under a minimum interval, with a recorded decision for every divergence.

**Independent Test**: replay recorded divergence messages; assert request count,
decision count and decision reasons.

### Tests for User Story 2

- [x] T018 [P] [US2] Unit test for the minimum-interval rule, including a divergence
  arriving exactly at the interval boundary, in
  `services/scheduler/tests/test_policy.py`.
- [x] T019 [P] [US2] Unit test for duplicate rejection while a request is
  outstanding, clearing on `ctl/run-published`, and clearing on outstanding timeout,
  in `services/scheduler/tests/test_outstanding.py`.
- [x] T020 [P] [US2] Unit test asserting run identifiers derive from root seed and run
  ordinal and are stable across replays, in `services/scheduler/tests/test_run_id.py`.
- [x] T021 [P] [US2] Integration test: a burst of 50 divergences inside one minimum
  interval yields at most one `ctl/run-request` and 50 recorded decisions, in
  `tests/integration/test_monitor_scheduler_handoff.py`.

### Implementation for User Story 2

- [x] T022 [P] [US2] Implement deterministic run identifiers in
  `services/scheduler/src/harness_scheduler/run_id.py`.
- [x] T023 [US2] Implement the minimum-interval and duplicate-rejection policy, with
  a recorded decision for every divergence, in
  `services/scheduler/src/harness_scheduler/policy.py`.
- [x] T024 [US2] Implement the outstanding-request register with simulation-time
  timeout in `services/scheduler/src/harness_scheduler/outstanding.py`.
- [x] T025 [US2] Wire config loading, the `ctl/divergence` and `ctl/run-published`
  subscriptions, publication on `ctl/run-request`, decision records on
  `ctl/telemetry`, and the heartbeat, in
  `services/scheduler/src/harness_scheduler/config.py` and
  `services/scheduler/src/harness_scheduler/service.py`.

**Checkpoint**: monitor and scheduler together produce at most one run request per
minimum interval, with every divergence accounted for.

---

## Phase 5: User Story 3 — A run produces a forecast and an honest uncertainty field (P3)

**Goal**: an analytic model runner behind the model kernel port, producing an
ensemble mean and a per-cell spread on one grid, into staging only.

**Independent Test**: call the kernel directly with a fixed initialisation state and
seed; swap in the test-double kernel with no edits outside `services/model_runner/`.

### Tests for User Story 3

- [x] T026 [P] [US3] Unit test for the kernel port contract, exercised against both
  the analytic kernel and a test double, in
  `services/model_runner/tests/test_kernel_port.py`.
- [x] T027 [P] [US3] Unit test for analytic advection: a seeded feature with known
  drift velocity is displaced by velocity times elapsed simulation time, within grid
  resolution, in `services/model_runner/tests/test_advection.py`.
- [x] T028 [P] [US3] Unit test asserting the uncertainty field equals the per-cell
  spread across members and the forecast field their mean, on identical grids, in
  `services/model_runner/tests/test_ensemble.py`.
- [x] T029 [P] [US3] Tests asserting two runs from the same manifest produce
  byte-identical fields, and that a failed member invalidates the run so no
  partial-ensemble spread is offered for publication, in
  `services/model_runner/tests/test_determinism.py` and
  `services/model_runner/tests/test_member_failure.py`.

### Implementation for User Story 3

- [x] T030 [US3] Define the model kernel port — initialisation state in, gridded field
  out — in `services/model_runner/src/harness_model_runner/kernel.py`.
- [x] T031 [US3] Implement the analytic kernel: advection of the manifest-recorded
  features plus seeded noise, no real numerics, in
  `services/model_runner/src/harness_model_runner/analytic_kernel.py`.
- [x] T032 [US3] Implement ensemble execution with one derived RNG stream per member,
  and the mean and spread reduction, in
  `services/model_runner/src/harness_model_runner/ensemble.py`.
- [x] T033 [US3] Implement staging writes through the coverage output port, holding
  the invariant that nothing is written where a reader can reach it, and wire config
  loading, the `ctl/run-request` subscription, the `ctl/run-started` publication
  before any computation, failure reporting and the heartbeat, in
  `services/model_runner/src/harness_model_runner/staging.py`,
  `config.py` and `service.py`.

**Checkpoint**: a run request produces a staged forecast and uncertainty field pair
that nothing can yet see.

---

## Phase 6: User Story 4 — A run becomes visible all at once, and announces itself (P4)

**Goal**: atomic publication, marking current under the catalogue convention, and
announcement on `ctl/run-published`.

**Independent Test**: a reader looping over the current field observes only complete
fields across a publication; the announcement is emitted; nothing polls.

### Tests for User Story 4

- [x] T034 [P] [US4] Unit tests for staged-run validation — incomplete or
  failed-member runs refused — and for a failed publication leaving the previous
  current run intact and discarding staging, in
  `services/publisher/tests/test_validate.py` and
  `services/publisher/tests/test_failure.py`.
- [x] T035 [P] [US4] Unit test for the catalogue naming convention and the
  mark-current operation, in `services/publisher/tests/test_catalogue.py`.
- [x] T036 [P] [US4] Concurrency test: ten thousand reads issued across a publication
  all return a complete field whose checksum matches one of two known runs, in
  `tests/integration/test_publication_atomicity.py`.
- [x] T037 [P] [US4] Integration test asserting the published run is servable through
  the query layer with no collection configuration edited, and that no consumer
  issued a polling request, in `tests/integration/test_runner_publisher_handoff.py`.

### Implementation for User Story 4

- [x] T038 [US4] Implement staged-run completeness validation in
  `services/publisher/src/harness_publisher/validate.py`.
- [x] T039 [US4] Implement the single indivisible visibility step behind the coverage
  output port, and the catalogue naming and mark-current operation, in
  `services/publisher/src/harness_publisher/atomic.py` and
  `services/publisher/src/harness_publisher/catalogue.py`.
- [x] T040 [US4] Wire config loading, staged-run intake, the `ctl/run-published`
  announcement, failure recording and the heartbeat, in
  `services/publisher/src/harness_publisher/config.py` and
  `services/publisher/src/harness_publisher/service.py`.

**Checkpoint**: a completed run appears whole, is current, and says so once.

---

## Phase 7: User Story 5 — The loop closes, visibly (P5)

**Goal**: AT-02 — a threshold breach triggers a model run end to end.

**Independent Test**: the ordered four-message sequence with matching identifiers,
within the configured simulation-time budget, reproducible from the manifest.

### Tests for User Story 5

- [x] T041 [US5] Acceptance test AT-02 asserting the ordered sequence
  `ctl/divergence` → `ctl/run-request` → `ctl/run-started` → `ctl/run-published`
  with matching identifiers within the configured budget, plus a replay assertion
  that the sequence and both field outputs are identical across two runs from the
  same manifest, in
  `tests/acceptance/test_at_02_threshold_breach_triggers_run.py`.

### Implementation for User Story 5

- [ ] T042 [US5] Add the four services to the Compose configuration with their config
  file mounts, following the shape feature 005 fixed.
- [x] T043 [US5] Add the divergence-guaranteed scenario configuration to
  `config/local/` — thresholds, intervals and budgets tuned so the loop is watchable
  at the demonstration clock rate.

**Checkpoint**: AT-02 passes and the loop is visible.

---

## Phase 8: Polish & Cross-Cutting

- [x] T044 [P] Run the wall-clock, seeded-RNG, literal-path and forbidden-vocabulary
  lint gates over all four packages and fix anything they surface, confirming that
  every surviving `# harness:allow-wallclock` marker is a heartbeat emission citing
  ADR-0006 and that nothing else in the four services reads host time (SC-014).
- [ ] T045 [P] Add the four components to the component reference in
  `docs/architecture/`, naming the failure mode each owns, and write the
  ensemble-spread and advection derivations in `docs/algorithms/`, which PR-09
  requires and this feature is where the mathematics lands. The sound-speed
  formulation is written up there too, beside the shared implementation it documents,
  per ADR-0005. Record an ADR if atomic visibility cannot be achieved by a single
  rename on the deployment's volume.
- [x] T046 [P] Integration test in `tests/integration/test_heartbeat_under_rate_zero.py`:
  with the clock rate pinned to zero for longer than every declared liveness window,
  all four services keep publishing heartbeats on their real-time cadence, each
  carrying the same unchanging simulation time, and no component falls out of its
  liveness window (SC-013, ADR-0006). This is the regression test on the decision that
  a rate of zero stops simulated time and stops nothing else, and it is what makes
  feature 016's rate-zero capture meaningful.

---

## Phase 9: The coverage store seam

Features 008 and 009 were built in parallel and met at the coverage store, which
`docs/architecture/delivery-plan.md` gives 008 to define and 009 to consume. They met
badly: the publisher wrote runs at the store root under a `run_` prefix, put a symlink
where the pointer belongs, and called the manifest `run.json`, while the query layer
looked under `runs/`, read the pointer as text and wanted `run-manifest.json`. Nothing
the control loop published was visible to the read path, and every test on both sides
passed, because no test crossed. These tasks are the repair and what it uncovered.

- [x] T047 [US4] Conform the publisher to `stores/coverage/layout.md`: the store root,
  the `runs/` subdirectory, run directories named by the run identifier alone, and the
  manifest name, in `config/local/publisher.json`, `config/droplet/publisher.json` and
  `services/publisher/src/harness_publisher/catalogue.py`.
- [x] T048 [US4] Rewrite `make_current` to write the pointer the layout defines — one run
  identifier, one line, flushed to a pending file and moved onto the pointer in a single
  `os.replace` — keeping the atomicity the existing tests prove, in
  `services/publisher/src/harness_publisher/atomic.py`.
- [x] T049 [US4] Translate the staged descriptor into the store's run manifest in
  `services/publisher/src/harness_publisher/manifest.py`, and write it into staging before
  the run moves, so a run arrives in the store complete in one rename. Renaming the file
  alone would not have joined the two ends: the descriptor's keys are not the manifest's.
- [x] T050 [US4] Cross-feature integration test in
  `tests/integration/test_coverage_store_seam.py`: publish through the publisher's own code
  path, resolve through feature 008's catalogue, and check both destinations' configuration
  files name one store. It fails on any of the pointer, the run directory, the manifest
  name, the manifest's contents or a configured root drifting apart.
- [ ] T051 [US1] Change the monitor's coverage reader to resolve the pointer as the layout
  defines it — read one identifier as text, then open the run under `runs/` — in
  `services/monitor/src/harness_monitor/coverage.py`, with the runs directory named in
  `contracts/schemas/config.monitor.schema.json` and both `monitor.json` files. Until this
  lands the monitor reads no published field, and
  `tests/acceptance/test_at_02_threshold_breach_triggers_run.py` fails at its first
  assertion. That failure is true and should not be worked around in the test.
- [ ] T052 [US2] Adopt the coverage store's run identifier rule in
  `services/scheduler/src/harness_scheduler/run_id.py`. The store derives a name from the
  root seed and the run sequence and puts the sequence in the name; the scheduler hashes an
  ordinal, so a published run's name cannot be read back as the sequence it was, and the
  run manifest records a null `run_sequence` for want of one.
- [ ] T053 [US2] Carry the run ordinal on `ctl/run-request` and through the staged
  descriptor, so the publisher records which run of the scenario a manifest describes
  rather than the absence of one.
- [ ] T054 [US4] Give the publisher's configuration master its own keys for the runs
  subdirectory and the partial suffix, in
  `contracts/schemas/config.publisher.schema.json`. Today the subdirectory is carried in
  `run_directory_prefix` — the layout gives a run directory no prefix of its own and the
  key cannot be empty — and the partial suffix is a constant in three components.
- [ ] T055 [US4] Write the run manifest's master as
  `contracts/schemas/coverage-run-manifest.schema.json`, which Constitution III requires and
  `stores/coverage/layout.md` records as an outstanding gap. Its absence is why the shape is
  stated twice, in the publisher that writes it and the catalogue that reads it.
- [ ] T056 [US4] Put staging on the volume the coverage store is on. Both destinations name
  a staging directory that no Compose volume mounts, so the model runner writes into its own
  container and the publisher sees nothing; and a move between volumes is a copy, which the
  publisher refuses rather than performing non-atomically. This belongs with T042.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks every user story, because all
  four services exchange the messages defined there.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**, **US4 (Phase 6)**: each
  depends only on Phase 2 and can be built in parallel by different people. Their
  integration tests additionally need the neighbouring service present.
- **US5 (Phase 7)**: depends on US1 to US4 all being complete.
- **Polish (Phase 8)**: depends on the stories it documents.

### Story Dependencies

- **US1** depends on feature 007 for the observation shape and feature 004 for the
  ground-truth manifest; on no other story here.
- **US2** depends on the divergence schema only, and is testable against recorded
  divergence fixtures with no monitor running.
- **US3** depends on the run-request schema and feature 004's manifest.
- **US4** depends on US3's staged output shape; until US3 exists it is testable
  against a hand-built staged run.
- **US5** depends on all four.

### Within Each Story

- Contract and unit tests are written first and must fail before implementation.
- Config loading precedes anything that reads config.
- Pure computation — the shared sound-speed derivation, window, persistence,
  advection, spread — precedes the service wiring that uses it.
- Service wiring precedes integration tests involving the broker.

### Parallel Opportunities

- T003, T004, T006 and T007 in parallel: separate files with no dependency. T002 is
  written first because the run-request shape references the divergence shape.
- All test tasks within a story marked `[P]` are separate files and run in parallel.
- T013 runs in parallel with T012; T022 runs in parallel with T023.
- Phases 3 to 6 in parallel across four people once Phase 2 lands.

---

## Parallel Example: Phase 2

```bash
Task: "Write run-started and run-published schemas in contracts/schemas/"
Task: "Write the four config.<component> schemas in contracts/schemas/"
Task: "Add the four component config files to config/local/ and config/droplet/"
Task: "Contract tests in tests/integration/test_control_schemas.py"
```

---

## Implementation Strategy

### MVP first

Phase 1, Phase 2, then US1. A monitor that scores a live observation stream against a
fixed field and raises justified divergence is demonstrable on its own and exercises
the shared sound-speed derivation, the window and the persistence rules — the three
pieces most likely to be wrong.

### Incremental delivery

1. Setup and Foundational — contracts fixed, types generated.
2. US1 — divergence raised and visible on the control namespace.
3. US2 — divergence converted into requests under policy.
4. US3 — requests converted into staged ensembles.
5. US4 — staged ensembles published atomically and announced.
6. US5 — AT-02 passes, and the client can show the loop turning.

### Notes

- `[P]` means different files with no dependency.
- Commit after each task or coherent group.
- Every task's output is subject to the seven CI gates; none of them is optional.
- Stop at any checkpoint and validate the story on its own before continuing.
