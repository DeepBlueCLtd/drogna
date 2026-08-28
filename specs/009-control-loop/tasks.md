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

- [x] T042 [US5] Add the four services to the Compose configuration with their config
  **Done**, reconciled 2026-08-28 (long-run-01). All four are in `deploy/compose.yaml` — `monitor`, `scheduler`, `model-runner`, `publisher` — each with a `HARNESS_CONFIG_PATH_*` environment entry and the shared read-only config mount. The note this replaces claimed they were absent.
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
- [x] T045 [P] Add the four components to the component reference in
  **Done**, reconciled 2026-08-28 (long-run-01). `site/docs/subsystems/` carries `c11-divergence-monitor`, `c12-scheduler`, `c13-model-runner` and `c14-publisher`. `site/gates/check_subsystem_coverage.py` reports 0 findings, which is the check that every C-number is accounted for.
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
- [x] T051 [US1] Change the monitor's coverage reader to resolve the pointer as the layout
  defines it — read one identifier as text, then open the run under `runs/` — in
  `services/monitor/src/harness_monitor/coverage.py`, with the runs directory named in
  `contracts/schemas/config.monitor.schema.json` and both `monitor.json` files.
  Done in `009b20d`; the note below it was left standing and was stale by the time the
  delivery plan quoted it. Re-reconciled 28 August 2026 against the tree: `StoredForecasts._resolve`
  reads the pointer with `read_text`, refuses anything but one line, and joins
  `root / runs_dirname / identifier`; `runs_dirname` is required in the monitor's config
  master and carried by both `monitor.json` files; and all seven AT-02 assertions pass.
  The paragraph that followed — "until this lands the monitor reads no published field, and
  the acceptance test fails at its first assertion" — described the state before that commit
  and is kept here only as the record of what was fixed.
- [x] T052 [US2] Adopt the coverage store's run identifier rule in
  `services/scheduler/src/harness_scheduler/run_id.py`. The store derives a name from the
  root seed and the run sequence and puts the sequence in the name; the scheduler hashed an
  ordinal, so a published run's name could not be read back as the sequence it was.
  Done. `run_identifier` now computes `<prefix>-<sequence:06d>-<sha256("rule|version|seed|
  sequence")[:12]>`, with the rule, its version and the prefix in a new required
  `scheduler.run_id` section of the config master and both `scheduler.json` files.
  `services/scheduler/tests/test_run_id.py` asserts the four worked examples
  `stores/coverage/layout.md` publishes, so the scheduler and the query layer are held to
  the same stated values rather than to a shared module. `handle_run_published` also
  advances the sequence past whatever has been published, which is what stops a restarted
  scheduler computing a name the store already holds.
- [x] T053 [US2] Carry the run ordinal on `ctl/run-request` and through the staged
  descriptor, so the publisher records which run of the scenario a manifest describes
  rather than the absence of one.
  Done. `run_sequence` is a required field of `run-request.schema.json`, carried by
  `publish.run_request_message`, read by the runner and written into the staged descriptor,
  and `manifest.sequence_of` now prefers it to parsing the name. The parse is kept as the
  fallback for a run named some other way, and where neither answers the manifest still
  records a null. `services/publisher/tests/test_manifest.py` covers all three.
- [x] T054 [US4] Give the publisher's configuration master its own keys for the runs
  subdirectory and the partial suffix, in
  `contracts/schemas/config.publisher.schema.json`. The subdirectory was carried in
  `run_directory_prefix` — the layout gives a run directory no prefix of its own and the
  key cannot be empty — and the partial suffix was a constant in three components.
  Done. `catalogue.runs_dirname` replaces `run_directory_prefix` and
  `catalogue.partial_suffix` is new; the model runner's `staging.partial_suffix` is the
  second of the three statements and the query layer's `coverage_store.partial_suffix` the
  third. No component reads another's configuration, so the three are compared instead:
  `tests/integration/test_coverage_store_seam.py` now checks the suffix at all three ends
  and the runs directory at both, per destination.
- [x] T055 [US4] Write the run manifest's master as
  `contracts/schemas/coverage-run-manifest.schema.json`, which Constitution III requires and
  `stores/coverage/layout.md` records as an outstanding gap. Its absence is why the shape is
  stated twice, in the publisher that writes it and the catalogue that reads it.
  Done. The master is registered in `contracts/openapi/generators.toml` (both the generated
  models and a package copy for the publisher) and in `tests/unit/test_generated_models.py`,
  and `write_run_manifest` validates against it *before* writing rather than after — a
  manifest the query layer would refuse is a run that reaches the store, is announced, and
  is never catalogued, which is the least legible failure this component has.
  Watched failing: with only the required keys declared, the "a manifest the query layer
  would refuse is refused here instead" test did not raise for an empty valid-time extent;
  the master gained `minLength` on the strings the catalogue treats as substantive, and the
  test then failed the unfixed code and passes the fixed. The ordering constraint the
  catalogue also checks — begin not after end — is not expressible in JSON Schema and is
  recorded in the master's description as still living in the reader.
- [x] T056 [US4] Put staging on the volume the coverage store is on. Both destinations name
  a staging directory that no Compose volume mounts, so the model runner writes into its own
  container and the publisher sees nothing; and a move between volumes is a copy, which the
  publisher refuses rather than performing non-atomically. This belongs with T042.
  Done: staging is `staging/` inside the coverage store, named by
  `query.coverage_store.staging_dirname`, recorded in `stores/coverage/layout.md` and
  admitted at the store root by `stores/coverage/validate_layout.py`. The model runner and
  the publisher mount `coverage-data` writable; every other reader mounts it read-only.

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

### Wiring the receiving half (added 28 August 2026, long-run-01)

Found by starting these components rather than by reading them. Every entry point here takes
`messages: Iterable[tuple[str, bytes]] = ()`, which is how the tests drive them; in a
container nobody supplies a source, so the default stood and each ran its loop over nothing
and exited 0. `resolve_publisher` had already solved the same problem for the publishing
half. Nothing had solved it for this one, so the loop could not turn and no run was ever
published — which is also why the EDR cube answers "no run is current".

- [x] T056 Add the receiving half to `harness_core`: `PahoSubscription` and
      `resolve_subscriber`, mirroring `resolve_publisher`'s three states, with a sentinel
      that distinguishes "nobody supplied a source" from "somebody supplied nothing"

      Takes several topic filters, because the monitor watches two branches and one filter
      wide enough for both would ask for control topics its role is refused. Deliberately
      not built on `PahoTickSource`, which yields `Tick` objects because it subscribes to the
      clock.

- [x] T057 [US1] Wire the monitor to it, as the worked example

      `monitor running` where it read `exited 0`, and the shell reports 3 of 18 components
      heard from where it read 1.

- [x] T058 [US2..US4] Wire `scheduler`, `model_runner` and `publisher` the same way, and
      `telemetry` with them

      Done, and extended to `planner`, which carried the same default and the same two
      topics as the monitor. `offload` is deliberately not included: it takes no message
      source at all — its loop is over staged bundles and its cycle is a batch — and
      `specs/014-offload-export/tasks.md` asks for a Compose entry and a one-command local
      run rather than a subscription. Lane D owns `services/offload/` in the wave 6 table,
      so it is left there rather than half-touched from here.

      Each service now resolves its source through `harness_core.broker.resolve_subscriber`
      exactly as the monitor does: `scheduler` on `ctl/divergence` and `ctl/run-published`,
      `model_runner` on `ctl/run-request`, `telemetry` on `ctl/telemetry/#` and
      `ctl/run-published`, `planner` on `obs/#` and `ctl/run-published`.

      **Two things this needed that the task did not say.**

      The publisher's input is a directory rather than a message, and it had no loop at all:
      it took whatever staging held at start-up — nothing, on a stack that has just come up —
      and exited 0. It subscribes to `ctl/run-started`, which says a run is *coming*, and
      takes whatever staging holds on every turn, because a run is announced started before
      its ensemble is computed and the directory appearing is the only thing that says it is
      finished.

      And a loop written over arriving messages alone is silent on a quiet branch, which
      `ctl/` is between runs: each component published one heartbeat at start-up and then
      went dark — running perfectly, and greyed out in the client, which is the one untruth
      the liveness display exists to prevent. So a subscription now yields
      `harness_core.broker.IDLE` when its interval elapses with nothing received, and each
      loop does its own work on that turn: a heartbeat, an expired outstanding request, a
      staged run. The interval is half the component's declared heartbeat cadence, so a beat
      is never missed by a whole cadence.

      Watched failing: `tests/integration/test_idle_turns_keep_the_loop_alive.py` reports
      "scheduler beat once at start-up and then went silent" against a loop that beats only
      when a message arrives, and "monitor counted the idle turn as a message it could not
      read" against a routing predicate written the wrong way round; and
      `libs/harness_core/tests/test_broker_subscription.py` hangs to its timeout against a
      subscription that ignores its idle interval, which is the defect in its purest form.


- [x] T059 Decide the restart policy for components that depend on a seeded store

      **Decided, 28 August 2026** (`docs/architecture/delivery-plan.md`, "Decisions taken").
      The credential half is dissolved rather than solved: the observation store binds to
      127.0.0.1 at every destination and the harness models no database threat, so Postgres
      moves to trust authentication, DSNs name a role and carry no password, and there is no
      longer any value that seeding has to assign before a component can connect. That
      change lands in lane D and is not this lane's to make.

      What remained for the loop's services is the *unseeded store*, which is not an ordering
      constraint at all but the state every bring-up genuinely starts in: seeding runs after
      `up.sh`, so the coverage store is empty when the monitor, telemetry, the planner and
      the publisher start, every time. The resolution is that this is a normal start — no
      exit, no invented field, no degraded mode, and a heartbeat that says what is true.
      `tests/integration/test_empty_store_is_a_normal_start.py` asserts it against the real
      readers and a real empty directory rather than an injected stub, including that no
      component names a run in its heartbeat when the store holds none.

      The two components that depend on the *environment* store rather than the coverage
      store — the model runner's ground truth, the planner's decorrelation timescale — keep
      their startup failure and their distinct exit codes, deliberately. That store is
      written by a one-shot component and Compose orders it with
      `service_completed_successfully`, so there is no window in which a container can start
      before it; a retry there would duplicate an ordering the platform already guarantees
      and would hide a genuinely broken generator behind a spinner.

### What starting it actually needed (added 28 August 2026, wave 6 lane A)

Three things the loop needed that no task here had asked for, each found by starting the
composed stack rather than by reading it. They are recorded as tasks because each is a
decision with a consequence, and because "T058 was mechanical" was true of the wiring and
false of the loop.

- [x] T060 Seed the coverage store's first run

      **Nothing can diverge from nothing.** The monitor scores observations against the
      *published* field; with no field it reports `warming` and raises nothing, which
      `spec.md` states as its cold-start edge case and which every test of this loop works
      around by publishing a first run before it starts. In the composed stack nothing did,
      so the loop was wired end to end and still could not turn. The delivery plan's
      expectation that "008 T062 then flips on its own" missed this.

      The first field is content, and every piece of content in a running drogna comes from
      `deploy/seed.d/` (NFR-07). `030-coverage.sh` produces it through the ordinary image and
      the ordinary entry point — `python -m harness_model_runner --initialise-store` — and
      leaves it in staging for the running publisher to make visible by the ordinary rename.
      Nothing new can produce a field. The run takes no broker connection, because MQTT
      identifies a client per role and a second connection under the model runner's name
      would have the broker close the incumbent without telling either party.

      It is named rather than derived by the store's identifier rule (`model_runner.
      initial_run.run_id`, `run-initial` at both destinations): it is not the nth run of the
      scenario in the loop's sense, and a name from that rule would claim the sequence the
      scheduler is about to use. Its manifest records `run_sequence: null`, which is what
      the layout says an absence looks like. It initialises at the ground truth's own time
      origin rather than at whatever the clock says now, so the store a replay produces is
      the store this one produced (Constitution II).

      Idempotent, as the seeding contract requires: the step does nothing at all if the store
      already names a current run. Watched converging — a second `run_local.sh` reported
      "the coverage store already names run-000000-7f80b47c7b91 as current; nothing to seed",
      which is the run the *loop* published rather than the one seeding staged.

- [x] T061 Retain the announcement of a published run

      A run identifier is a pure function of the root seed and the run sequence (T052), which
      is what makes a replay diffable — and it is also what makes a restarted scheduler
      compute a name the store already holds. Watched happening: after a restart the
      scheduler asked for `run-000000-7f80b47c7b91` again, the publisher refused it with "a
      run identifier names one run", and the loop stalled with `scheduler ok awaiting
      run-000000-7f80b47c7b91` against `publisher ok current run-000000-7f80b47c7b91` until
      the outstanding timeout expired. One wasted run of the scenario per restart.

      Which run is current is *state* rather than an event, and every component connects after
      the last announcement at least once, because every component restarts. `ctl/run-published`
      is therefore published retained, and a starting scheduler reads the sequence back out of
      the name it is handed — which it can only do because the store's rule puts the sequence
      in the name, which is the other half of T052. The announcement stays a notification and
      not a source of truth: every consumer of it re-reads the coverage store, so a retained
      message left over from a store that has since been reset costs a read and nothing else.

      Watched failing in `tests/integration/test_a_restarted_scheduler_does_not_reuse_a_name.py`,
      both halves separately: the scheduler that does not advance, and the publisher that does
      not ask for retention.

- [x] T062 Report waiting on seeding rather than exiting, in the ingest client

      The other half of T059's original note, and the thing that had kept `observation` out of
      the local destination's active profiles altogether: seeding creates the ingest client's
      schema and its role, seeding runs *after* `scripts/up.sh`, and the client exited 72 at
      the first attempt with `password authentication failed for user "drogna_ingest"`. With
      the observation profile inactive there were no sensors, and with no sensors there is no
      observation traffic and nothing for the monitor to score — so the loop could not turn
      for this reason as well.

      `connect_when_seeded` repeats the attempt, spends the wait in *simulation* time out of
      the tick stream this component already holds — never on the host's clock, which
      Constitution I forbids — doubles it to a bound, reports what the database said on every
      attempt, and heartbeats `starting` with the reason so a component that is waiting is
      visibly waiting rather than absent. It invents nothing: there is no connection until
      there is a real one, and it ends only if the clock stops.

      This is `services/ingest/`, which is feature 007's and no lane's in the wave 6 table. It
      is recorded here because it is the remaining half of this task's own note, and because
      lane D's move to trust authentication removes the password without removing the case:
      with trust, the connection succeeds and the tables are still not there yet.

      Watched failing: `services/ingest/tests/test_waits_for_seeding.py` against a first
      refusal treated as fatal, which is what it was.

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
