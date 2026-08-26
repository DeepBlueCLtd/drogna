---

description: "Task list for 001-deterministic-foundations"
---

# Tasks: Deterministic Replay Foundations

**Input**: Design documents from `/specs/001-deterministic-foundations/`

**Prerequisites**: `spec.md`, `plan.md`

**Tests**: Requested. Test tasks appear before the implementation they cover, and are expected to
fail when written.

**Organization**: Grouped by user story so each can be implemented, tested and demonstrated on its
own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story the task serves

## Path Conventions

Paths are as given in `plan.md`: `libs/harness_core/`, `services/clock/`, `contracts/`, `config/`,
`scripts/`, `tests/acceptance/`.

---

## Phase 1: Setup

**Purpose**: The workspace, before anything is written into it.

- [ ] T001 Create the `uv` workspace root `pyproject.toml` with the members list, the shared `ruff`
      configuration (line length, target 3.11, rule selection) and the shared `pytest`
      configuration. Later features append their packages to the members list.
- [ ] T002 [P] Create `libs/harness_core/pyproject.toml` and the empty
      `libs/harness_core/src/harness_core/` package with `py.typed`.
- [ ] T003 [P] Create `services/clock/pyproject.toml` and the empty
      `services/clock/src/harness_clock/` package with `py.typed`.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The value types and the minimum config path every story below leans on.

**Blocking**: no user story work starts until this phase is complete.

- [ ] T004 Write `libs/harness_core/tests/test_siminstant.py` covering integer microsecond
      arithmetic, ISO-8601 UTC rendering and parsing, ordering, and refusal of float construction.
- [ ] T005 Implement `SimInstant` and `Tick` in `libs/harness_core/src/harness_core/clock.py`:
      exact integer microseconds since the simulation epoch, tick index, mode and rate carried on
      the tick, ISO-8601 UTC rendering to microsecond precision.
- [ ] T006 Author `contracts/schemas/config.common.schema.json` defining the `component`, `clock`,
      `seed`, `broker` and `logging` shapes as `$defs` plus the base object, with `$id`
      `https://schemas.harness.invalid/config.common.schema.json`.
- [ ] T007 Implement the minimum config loader in
      `libs/harness_core/src/harness_core/config.py`: read `HARNESS_CONFIG`, parse, validate against
      a supplied schema, expose the parsed document and its SHA-256 digest. Diagnostics are hardened
      in User Story 2.
- [ ] T008 [P] Define the clock and RNG port protocols in
      `libs/harness_core/src/harness_core/ports.py`, with docstrings stating that no implementation
      may read a host clock or interpolate between ticks.
- [ ] T009 [P] Implement `ManualClock` in `libs/harness_core/src/harness_core/clock.py` — the test
      implementation of the clock port, advanced only by explicit calls.

**Checkpoint**: simulation instants, the clock port shape and config loading exist.

---

## Phase 3: User Story 1 - One place that says what time it is (Priority: P1) 🎯 MVP

**Goal**: A clock service that is authoritative over the network, a clock port that is a client of
it, and rate control the browser can drive.

**Independent Test**: Start the service and two participant processes; change the rate over HTTP;
both observe identical tick values at the new pace; neither contains a host-clock call.

### Tests for User Story 1

- [ ] T010 [P] [US1] `services/clock/tests/test_state.py`: tick values are `epoch + n × interval`,
      indices are strictly increasing, and a rate or mode change alters no tick value.
- [ ] T011 [P] [US1] `services/clock/tests/test_http.py`: the snapshot endpoint reports mode, rate,
      tick and epoch; the tick stream delivers ticks in order; control requests outside the
      configured rate bounds are rejected and leave the state unchanged.
- [ ] T012 [P] [US1] `libs/harness_core/tests/test_remote_clock.py`: the port returns the last
      received tick, never interpolates, and reports staleness with the last tick and the gap when
      the stream is interrupted.

### Implementation for User Story 1

- [ ] T013 [US1] Author `contracts/openapi/clock.openapi.yaml` describing the snapshot, tick stream
      and control operations, referencing `config.common.schema.json` where shapes are shared. Read
      and control operations sit under distinct path prefixes.
- [ ] T014 [US1] Implement tick arithmetic, modes (`realtime`, `accelerated`, `paused`) and the
      participant registry in `services/clock/src/harness_clock/state.py`.
- [ ] T015 [US1] Implement the real-time driver in `services/clock/src/harness_clock/driver.py`,
      carrying the single `# harness:allow-wallclock` marker with its reason, and translating rate
      into emission pace without touching tick values.
- [ ] T016 [US1] Implement the snapshot and tick-stream endpoints in
      `services/clock/src/harness_clock/http.py` using server-sent events for the stream.
- [ ] T017 [US1] Implement the control endpoints (mode, rate, pause, resume) under the control path
      prefix, validating against the configured bounds, with pin-to-zero and release idempotent so a
      screenshot capture can hold the system still without breaking the tick sequence (SRD FR-53).
- [ ] T018 [US1] Implement `services/clock/src/harness_clock/__main__.py`: read `HARNESS_CONFIG`,
      validate, and only then bind a socket.
- [ ] T019 [US1] Author `contracts/schemas/config.clock.schema.json` referencing the common schema
      and adding the clock's own section (epoch, tick interval, rate bounds, default mode, lockstep
      deadline, manifest directory), and write `config/local/clock.json` and
      `config/droplet/clock.json` — same shape, different values.
- [ ] T020 [US1] Implement `RemoteClock` in `libs/harness_core/src/harness_core/clock.py`: subscribe
      to the tick stream, expose `now()`, `tick()`, `await_tick()` and `await_sim_time()`, report
      staleness beyond the configured tolerance, and refuse to interpolate.
- [ ] T021 [US1] Implement heartbeat publication in
      `services/clock/src/harness_clock/heartbeat.py` on `ctl/heartbeat`, carrying component id,
      simulation time, status, run id and config digest.

**Checkpoint**: time has one source, the browser can change the rate, and nothing computes time
locally.

---

## Phase 4: User Story 2 - A component starts only from a validated named config (Priority: P2)

**Goal**: The startup contract every later component inherits.

**Independent Test**: Run a stub with a valid config, an invalid config and no `HARNESS_CONFIG`;
check exit codes, diagnostics, and that no I/O precedes validation.

### Tests for User Story 2

- [ ] T022 [P] [US2] `libs/harness_core/tests/test_config.py`: missing `HARNESS_CONFIG`, unreadable
      file, malformed JSON, schema-invalid document and unknown key each produce a distinct non-zero
      exit and a message naming the file and, where applicable, the failing JSON pointer.
- [ ] T023 [P] [US2] `libs/harness_core/tests/test_config_no_io.py`: an injected I/O recorder
      confirms that no socket, database or file access other than reading the config itself occurs
      before validation returns.

### Implementation for User Story 2

- [ ] T024 [US2] Harden the loader in `libs/harness_core/src/harness_core/config.py`: JSON-pointer
      diagnostics, one message per failure, distinct exit codes for absent variable, unreadable
      file, malformed document and invalid document, and public exposure of the config digest for
      the heartbeat and the manifest.
- [ ] T025 [US2] Add unknown-key rejection to `contracts/schemas/config.common.schema.json` and
      `contracts/schemas/config.clock.schema.json` for the sections each defines.

**Checkpoint**: configuration is named, validated first, and fails loudly.

---

## Phase 5: User Story 3 - Randomness that can be replayed, recorded in a manifest (Priority: P3)

**Goal**: One route to randomness, and a document from which a run can be started again.

**Independent Test**: Identical sequences from identical root seed and stream in two processes;
different sequences from a different root; reconstruction from the manifest alone.

### Tests for User Story 3

- [ ] T026 [P] [US3] `libs/harness_core/tests/test_rng.py`: the same root seed and stream produce
      identical sequences across processes; different streams do not collide; a repeated request for
      one stream returns the same generator; derived identifiers are stable across runs and differ
      across logical positions.
- [ ] T027 [P] [US3] `libs/harness_core/tests/test_manifest.py`: a manifest validates against its
      schema, contains no configuration values, and is finalised atomically — an interrupted write
      leaves the previous document intact.

### Implementation for User Story 3

- [ ] T028 [US3] Implement `libs/harness_core/src/harness_core/rng.py`: `rng_for(stream)` deriving
      entropy from a versioned rule over the root seed and stream name, per-stream caching,
      deterministic identifier derivation from seed and logical position, and a module docstring
      stating the rule and its version.
- [ ] T029 [US3] Author `contracts/schemas/run-manifest.schema.json`: run id, root seed, derivation
      rule and version, clock configuration, code version, participants with their config digests,
      exit state, final tick, and an explicit list of fields declared non-reproducible.
- [ ] T030 [US3] Implement `libs/harness_core/src/harness_core/manifest.py`: write the manifest at
      run start, append participants as they are observed, finalise atomically by write-and-rename.
- [ ] T031 [US3] Wire manifest writing into the clock service: it holds run identity, writes the
      manifest at start, and records each participant's config digest as heartbeats arrive.
- [ ] T032 [US3] Implement manifest-driven startup: given a manifest, the clock service and
      `harness_core` reconstruct run id, root seed and clock configuration with no other input.

**Checkpoint**: a run is describable, and its randomness is reproducible.

---

## Phase 6: User Story 4 - The rules are enforced by a machine (Priority: P4)

**Goal**: Three gates and one command.

**Independent Test**: Each gate flags every violation fixture and no clean fixture.

### Tests for User Story 4

- [ ] T033 [P] [US4] Create the fixture tree `scripts/tests/fixtures/gates/` with violating and
      clean Python, TypeScript and SQL files for each of the three rules, including a marker with a
      reason and a marker without one.
- [ ] T034 [P] [US4] `scripts/tests/test_gates.py`: each gate exits non-zero on each violation
      fixture, zero on each clean fixture, and treats a reasonless marker as a violation.

### Implementation for User Story 4

- [ ] T035 [US4] Implement `scripts/_gate_lib.py`: the shared file walk, the single exclusion list
      (generated directories, test fixtures, `spikes/`), marker parsing, and the reporting format
      with file, line, expression and rule id.
- [ ] T036 [P] [US4] Implement `scripts/check_no_wallclock.py`: Python syntax-tree detection of the
      prohibited calls named in Constitution I, pattern detection for TypeScript and SQL, marker
      handling.
- [ ] T037 [P] [US4] Implement `scripts/check_seeded_rng.py`: flag module-level and global
      generators and entropy-derived identifiers anywhere except `harness_core.rng`, and name
      `rng_for` as the required route in the message.
- [ ] T038 [P] [US4] Implement `scripts/check_no_literal_paths.py`: flag path-like, host-like,
      URL-like and port-like literals in component source and any environment variable read other
      than `HARNESS_CONFIG`.
- [ ] T039 [US4] Implement `scripts/gates.sh`: run the gates in a fixed order, aggregate exit codes,
      print the exemption inventory, and take gates from a registry list so later features append
      rather than edit.
- [ ] T040 [US4] Run the gates over the tree produced by stories 1 to 3 and remove every finding;
      the only surviving operational exemption in drogna is the clock service's real-time driver.

**Checkpoint**: the principles are enforced without relying on anyone remembering them.

---

## Phase 7: User Story 5 - A run replays byte for byte (Priority: P5)

**Goal**: Lockstep mode, and a proof that the mechanism holds.

**Independent Test**: A 1,000-tick two-participant scenario run twice from one manifest produces
byte-identical output.

### Tests for User Story 5

- [ ] T041 [P] [US5] `services/clock/tests/test_lockstep.py`: tick `n+1` waits for every registered
      participant's acknowledgement of tick `n`; a silent participant stalls the clock and is named
      in the reported state; no tick is skipped.
- [ ] T042 [US5] Write the two toy participants under `tests/acceptance/participants/`, each drawing
      from a named RNG stream and writing an output file keyed to tick values rather than to counts
      of received ticks, and the acceptance test
      `tests/acceptance/test_at04_replay_mechanism.py` asserting byte-identical output across two
      runs from one manifest.

### Implementation for User Story 5

- [ ] T043 [US5] Add `lockstep` mode, participant registration, acknowledgement and the stall path
      (on deadline expiry, name the outstanding participants in the snapshot and the log, and never
      advance) to `services/clock/src/harness_clock/state.py`, the control surface and
      `contracts/openapi/clock.openapi.yaml`.
- [ ] T044 [US5] Add acknowledgement to `RemoteClock` in
      `libs/harness_core/src/harness_core/clock.py`, active only when the participant is registered
      as a lockstep participant.

**Checkpoint**: AT-04's mechanism is demonstrated; the scenario that AT-04 finally scores comes
later.

---

## Phase 8: Polish and cross-cutting

- [ ] T045 [P] Write the ADR for the clock transport decision in `docs/adr/` (next free number):
      HTTP with server-sent events chosen over a new MQTT control topic, with the rejected
      alternative and its consequences.
- [ ] T046 [P] Write the ADR for lockstep mode in `docs/adr/` (next free number): why byte-identical
      replay needs a barrier, and what the harness claims for the free-running modes instead.
- [ ] T047 Add a one-command run of the clock service and the replay proof to `scripts/`, so the
      feature is demonstrable from a clean checkout as the constitution requires.

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) depends on Setup and blocks every user story.
- User Story 1 (Phase 3) depends on Phase 2 only.
- User Story 2 (Phase 4) depends on Phase 2; it hardens the loader User Story 1 already uses, so it
  can proceed in parallel with Phase 3 provided both respect the loader's public shape.
- User Story 3 (Phase 5) depends on Phase 2; T031 and T032 additionally depend on the clock service
  existing (T018).
- User Story 4 (Phase 6) depends on Phase 2 for the tree it scans; T040 depends on Phases 3 to 5.
- User Story 5 (Phase 7) depends on Phases 3 and 5.
- Polish (Phase 8) depends on the stories it documents.

### Within each story

- Tests are written first and must fail before the implementation lands.
- Schemas before the code that validates against them.
- The clock state machine before the transport that exposes it.
- The transport before the port that consumes it.

### Parallel opportunities

- T002 and T003 in Setup; T008 and T009 in Foundational.
- The three test tasks of User Story 1 (T010 to T012); both of User Story 2 (T022, T023); both of
  User Story 3 (T026, T027).
- The three gate implementations T036, T037, T038, once `_gate_lib.py` (T035) exists.
- The two ADRs, T045 and T046.

---

## Parallel Example: User Story 1

```bash
# The three failing tests first, in parallel:
Task: "services/clock/tests/test_state.py — tick arithmetic and rate independence"
Task: "services/clock/tests/test_http.py — snapshot, stream and control bounds"
Task: "libs/harness_core/tests/test_remote_clock.py — no interpolation, staleness reporting"
```

---

## Implementation Strategy

1. Phases 1 and 2, then User Story 1 alone. At that point drogna has a clock service, a clock
   port and rate control, which is demonstrable and is the prerequisite of every other feature.
2. Add User Story 2, and the startup contract is settled for every component that follows.
3. Add User Story 3, and runs become describable and reproducible in their choices.
4. Add User Story 4, and the principles stop depending on discipline.
5. Add User Story 5, and the replay claim acquires evidence.

Stop at any checkpoint: each leaves the harness in a state that can be shown.

## Notes

- The single permitted operational host-clock read in the whole repository is created in T015. Any
  second one is a defect, and T040 is where that is proved.
- Every consumer added later must key its behaviour to tick values, not to counts of received
  ticks; accelerated mode makes gaps normal.
- Commit after each task or coherent group. Tasks are sized to be one commit each.
