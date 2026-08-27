---

description: "Task list for 010-telemetry-quality"
---

# Tasks: Telemetry and Forecast Quality

**Input**: Design documents from `/specs/010-telemetry-quality/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 001 (clock, config loader, event
publication) and feature 006 (type generation chain) must be in place. Feature 009's
monitor and scheduler are the producers of the inputs; the schema below is written
first so they have something to validate against.

**Tests**: Requested. Test tasks are included and are written before the
implementation they cover.

**Organization**: Grouped by user story so each can be implemented, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: US1 running residual statistics, US2 skill against persistence,
  US3 degradation is loud

## Path Conventions

Service code under `services/telemetry/src/harness_telemetry/`, unit tests under
`services/telemetry/tests/`, shared schemas under `contracts/schemas/`,
cross-component tests under `tests/integration/`.

---

## Phase 1: Setup

- [x] T001 Create the `services/telemetry/` package skeleton — `pyproject.toml`,
  `src/harness_telemetry/__init__.py`, `tests/` — and register it in the `uv`
  workspace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the single telemetry message contract and the configuration contract.

**CRITICAL**: feature 009's producers depend on T002 landing, so it is the first
substantive task in this feature.

- [x] T002 Write `contracts/schemas/telemetry.schema.json` — one document
  discriminated by `kind`, covering `residual-sample` (position, depth, simulation
  time, residual in m/s, forecast run identifier), `scheduler-decision` (divergence
  reference, outcome, reason), `residual-statistics` (scope, count, mean,
  root-mean-square, extremes, covered window, run identifier, last-update time,
  freshness) and `forecast-skill` (model MSE, persistence MSE, sample count, score,
  run and reference identifiers, state). `$id`
  `https://schemas.harness.invalid/telemetry.schema.json`.
- [x] T003 [P] Write `contracts/schemas/config.telemetry.schema.json`, `$ref`ing
  `config.common.schema.json` and adding the publication interval, minimum sample
  count, staleness window, region scoping definition and heartbeat interval.
- [x] T004 Regenerate Python and TypeScript types from `telemetry.schema.json` and
  confirm the drift check passes (`libs/harness_types/`, `client/src/generated/`).
- [x] T005 [P] Add `config/local/telemetry.json` and `config/droplet/telemetry.json` —
  same shape, destination-specific values.
- [x] T006 [P] Contract test asserting each `kind` accepts a canonical example,
  rejects a payload missing each required field, and rejects a `forecast-skill`
  payload that carries a score without both mean-square errors and a sample count, in
  `tests/integration/test_telemetry_schema.py`.

**Checkpoint**: the contract is fixed and generated. Feature 009's producers are
unblocked, and the stories below may proceed.

---

## Phase 3: User Story 1 — The residuals already computed are also reported (P1) 🎯 MVP

**Goal**: running statistics of the monitor's residuals, in bounded memory, attributed
to the forecast run they were scored against, published at a declared interval.

**Independent Test**: replay a recorded residual stream and compare the published
statistics against the same statistics computed offline.

### Tests for User Story 1

- [x] T007 [P] [US1] Unit test for the incremental accumulator: count, mean,
  root-mean-square and extremes match an offline computation over the same sequence,
  including the single-sample and all-identical-values cases, in
  `services/telemetry/tests/test_accumulator.py`.
- [x] T008 [P] [US1] Unit test for scoping and run attribution: region-level and
  scenario-level scopes accumulate independently, residuals for a superseded run are
  attributed to that run, and a new publication closes the old record rather than
  merging it, in `services/telemetry/tests/test_scopes.py`.
- [x] T009 [P] [US1] Bounded-memory test asserting the footprint over a stream ten
  times the reference length is within 10% of the reference, in
  `services/telemetry/tests/test_bounded_memory.py`.
- [x] T010 [P] [US1] Integration test asserting telemetry consumes the monitor's
  residual reports over the broker and issues zero queries to the observation store
  or query layer, in `tests/integration/test_telemetry_from_monitor.py`.

### Implementation for User Story 1

- [x] T011 [US1] Implement config loading and schema validation as the first
  operation, in `services/telemetry/src/harness_telemetry/config.py`.
- [x] T012 [P] [US1] Implement the incremental accumulator — constant time per
  sample, constant memory per scope — in
  `services/telemetry/src/harness_telemetry/accumulator.py`.
- [x] T013 [US1] Implement scenario and region scoping, run attribution and
  close-on-supersede in `services/telemetry/src/harness_telemetry/scopes.py`.
- [x] T014 [US1] Implement statistics publication on `ctl/telemetry/<component-id>` at
  the declared simulation-time interval, and the heartbeat carrying `warming` /
  `reporting` / `no-forecast`, in
  `services/telemetry/src/harness_telemetry/publish.py`.
- [x] T015 [US1] Wire the subscription loop over the residual and decision streams and
  over `ctl/run-published`, in `services/telemetry/src/harness_telemetry/service.py`.

**Checkpoint**: telemetry runs alone against a residual stream and reports honest,
attributed, bounded statistics.

---

## Phase 4: User Story 2 — Skill is reported against persistence, and says when it loses (P2)

**Goal**: a persistence reference held constant, both mean-square errors computed, a
recomputable skill score, and an explicit state when the model loses.

**Independent Test**: score measurements against a forecast and a held reference whose
errors are known by construction; check the published score by hand.

### Tests for User Story 2

- [x] T016 [P] [US2] Unit test for the persistence reference: it is the field current
  immediately before the latest publication, held constant; the reference identifier
  changes only at a publication boundary; the first ever publication yields
  `insufficient-reference`, in
  `services/telemetry/tests/test_persistence_reference.py`.
- [x] T017 [P] [US2] Unit test for the skill computation: score matches the formula
  applied to the two reported mean-square errors; `not-beating-persistence` is set
  exactly when the model error is not smaller; the reported figures are sufficient to
  recompute the score, in `services/telemetry/tests/test_skill.py`.
- [x] T018 [P] [US2] Unit test asserting no score is published below the minimum
  sample count, and that the message carries `insufficient-samples` with no score, no
  zero and no carried-forward value, in
  `services/telemetry/tests/test_insufficient_samples.py`.
- [x] T019 [P] [US2] Integration test with a deliberately degraded forecast asserting
  the not-beating-persistence state appears within one telemetry interval, in
  `tests/integration/test_skill_against_persistence.py`.

### Implementation for User Story 2

- [x] T020 [US2] Implement the persistence reference: capture at publication
  boundaries through the coverage read port — not through the query layer — hold
  constant, and expose values for scoring, deriving the reference sound speed by
  calling `harness_core`'s shared implementation rather than any local copy of the
  equation (ADR-0005), in
  `services/telemetry/src/harness_telemetry/persistence_reference.py`.
- [x] T021 [US2] Implement the mean-square error pair, the skill score, the state
  determination and the plain-language statement that accompanies
  `not-beating-persistence`, in `services/telemetry/src/harness_telemetry/skill.py`.
- [x] T022 [US2] Extend publication to emit `forecast-skill` messages carrying both
  errors, the sample count, the score, both identifiers and the state, in
  `services/telemetry/src/harness_telemetry/publish.py`.

**Checkpoint**: the harness can say, with a checkable figure, whether its forecast is
earning its compute.

---

## Phase 5: User Story 3 — Degradation is loud (P3)

**Goal**: freshness state on every statistic, `stale` within a bounded window when
inputs stop, and no configuration-derived claim about what exists.

**Independent Test**: stop the residual stream and watch every affected statistic go
stale within the configured window.

### Tests for User Story 3

- [x] T023 [P] [US3] Unit test for the freshness state machine: transition to `stale`
  within the window, return to `fresh` on resumption with the stale span recorded, and
  no statistic ever published as `fresh` with a last-update time older than the
  window, in `services/telemetry/tests/test_freshness.py`.
- [x] T024 [P] [US3] Test asserting telemetry publishes no component list, no enabled
  flag and no configuration-derived claim about what is running, and that a poor skill
  score is published unmodified, in `services/telemetry/tests/test_no_suppression.py`.

### Implementation for User Story 3

- [x] T025 [US3] Implement the freshness state machine and last-update tracking in
  simulation time, in `services/telemetry/src/harness_telemetry/freshness.py`.
- [x] T026 [US3] Attach freshness state and last-update time to every published
  statistic and skill message, and implement the restart behaviour — report `warming`,
  publish nothing until the minimum sample count is reached again, reconstruct nothing
  from the store — in `services/telemetry/src/harness_telemetry/publish.py` and
  `service.py`.

**Checkpoint**: a dead input reads as dead. Silent degradation has nowhere to hide.

---

## Phase 6: Polish & Cross-Cutting

- [x] T027 [P] Add the telemetry service to the Compose configuration with its config
  file mount, following the shape feature 005 fixed.
- [x] T028 [P] Run the wall-clock, seeded-RNG, literal-path and forbidden-vocabulary
  lint gates over the package and fix anything they surface, confirming that the only
  surviving `# harness:allow-wallclock` marker is the heartbeat emission citing
  ADR-0006, and that a search of the package for a second sound-speed implementation
  returns nothing (SC-010).
- [x] T029 [P] Add C-16 to the component reference in `docs/architecture/`, naming
  silent degradation as the failure mode it owns, and record the skill-score formula,
  the persistence-reference definition and the incremental moment arithmetic in
  `docs/algorithms/`.
- [x] T030 Replay test asserting an identical ordered sequence of telemetry messages
  with identical payloads across two runs from the same manifest, in
  `services/telemetry/tests/test_replay.py`.
- [x] T031 [P] Test that with the clock rate pinned to zero for longer than the
  declared liveness window, telemetry's heartbeat continues on its real-time cadence
  carrying an unchanging simulation time, while statistics publication — which is on
  simulation time — correctly stops (SC-011, ADR-0006), in
  `services/telemetry/tests/test_heartbeat_under_rate_zero.py`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all three stories, and blocks
  feature 009's monitor and scheduler publication tasks, which validate against T002.
- **US1 (Phase 3)**: depends on Phase 2 only.
- **US2 (Phase 4)**: depends on US1's accumulator and scoping, since skill is scored
  over the same sample bookkeeping.
- **US3 (Phase 5)**: depends on US1 for statistics to mark fresh or stale; it extends
  US2's messages too, so it is cleanest after both.
- **Polish (Phase 6)**: depends on the stories it documents.

### Story Dependencies

- **US1** depends on feature 009 emitting residual reports. Until it does, US1 is
  fully testable from recorded fixtures.
- **US2** depends on US1 and on the coverage read port for reference values.
- **US3** depends on US1, and touches US2's messages.

### Within Each Story

- Unit tests are written first and must fail before implementation.
- Config loading precedes anything that reads config.
- The accumulator precedes the scoping that uses it; scoping precedes publication.
- Publication precedes the integration tests that observe it on the broker.

### Parallel Opportunities

- T003, T005 and T006 in parallel with each other; T002 is written first because the
  config schema and the contract tests both reference the payload shapes.
- All test tasks marked `[P]` within a story are separate files and run in parallel.
- T012 runs in parallel with T011.
- T027, T028 and T029 in parallel.

---

## Parallel Example: Phase 4 tests

```bash
Task: "Unit test for the persistence reference in services/telemetry/tests/test_persistence_reference.py"
Task: "Unit test for the skill computation in services/telemetry/tests/test_skill.py"
Task: "Unit test for insufficient samples in services/telemetry/tests/test_insufficient_samples.py"
Task: "Integration test with a degraded forecast in tests/integration/test_skill_against_persistence.py"
```

---

## Implementation Strategy

### MVP first

Phase 1, Phase 2, then US1. Running statistics of residuals already computed is the
whole of FR-37, requires no new measurement, and gives the client something true to
show on the first day telemetry exists.

### Incremental delivery

1. Setup and Foundational — the telemetry contract lands, unblocking feature 009's
   producers as well as this feature.
2. US1 — residual statistics published, attributed and bounded.
3. US2 — skill against persistence, with the figures that make it checkable.
4. US3 — freshness, staleness and the refusal to suppress an unflattering number.

### Notes

- `[P]` means different files with no dependency.
- Commit after each task or coherent group.
- The rule that no figure is ever suppressed or defaulted applies to every task in
  this feature; a test that passes by hiding a number is a defect.
