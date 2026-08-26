---

description: "Task list for 014-offload-export"
---

# Tasks: Offload Packaging and Verified Eviction

**Input**: Design documents from `/specs/014-offload-export/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. Test tasks are included and, within a story, are
written before the implementation they describe.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Paths are exact and relative to the repository root

## Path Conventions

This feature owns `services/offload/` and `docs/standards/cf-conventions.md`, adds three
schema files to `contracts/schemas/` additively, and adds two files to the existing
`tests/integration/`. No task touches anything else.

---

## Phase 1: Setup

- [ ] T001 Create `services/offload/harness_offload/` and `services/offload/tests/`, add the package to the `uv` workspace member list, and add its `ruff` configuration inheritance.
- [ ] T002 Write `contracts/schemas/config.offload.schema.json`: common sections `$ref`d from `config.common.schema.json`, plus `staging`, `ledger`, `destination`, `retention`, `attributes.allowlist`, `compliance.convention_version` and `export.window`.
- [ ] T003 [P] Write `contracts/schemas/bundle-manifest.schema.json` and `contracts/schemas/offload-receipt.schema.json`, with `$id` values following the repository naming rule.
- [ ] T004 [P] Write `config/local/offload.json` and `config/droplet/offload.json` with the same shape and per-destination values.
- [ ] T005 Implement `services/offload/harness_offload/config.py`: read `HARNESS_CONFIG`, validate against the schema before any other I/O, fail at startup with a readable message.

**Checkpoint**: The component starts, validates its configuration, and does nothing else.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bundle identity, digests and the clock wiring that every story depends on.

- [ ] T006 Write `services/offload/tests/test_bundle.py` covering deterministic bundle identity from run identity and logical position, sidecar manifest contents, and digest computation over a multi-member bundle. Tests fail before T007.
- [ ] T007 Implement `services/offload/harness_offload/bundle.py`: bundle identifier derivation, SHA-256 digests, sidecar manifest construction against `bundle-manifest.schema.json` (FR-005, FR-006).
- [ ] T008 Wire `harness_core.clock.Clock` and `harness_core.rng.rng_for` through `config.py`, and add a unit test asserting no module in the package imports a host time or global RNG function (FR-004, Constitution I and II).
- [ ] T009 [P] Implement `services/offload/harness_offload/telemetry.py`: heartbeat on `ctl/heartbeat` with component identifier, simulation time and status; bundle-state counts on `ctl/telemetry` (FR-020).

**Checkpoint**: Bundles can be named and hashed deterministically.

---

## Phase 3: User Story 1 - A run leaves as a file another tool can read (Priority: P1) 🎯 MVP

**Goal**: A CF-conforming `trajectoryProfile` NetCDF bundle from a recorded run.

**Independent Test**: Package a fixture run; the CF compliance check reports zero
errors; the sidecar manifest matches the bytes on disk.

### Tests for User Story 1

- [ ] T010 [P] [US1] Write `services/offload/tests/test_writer.py` asserting the file declares `Conventions` and `featureType = "trajectoryProfile"`, carries trajectory and profile instance variables with their `cf_role`, per-profile time and position, and a depth coordinate declaring its sign convention (FR-001, FR-002).
- [ ] T011 [P] [US1] Add a ragged-representation test: profiles of differing length are written with explicit row-count variables and no fill values inside any profile (FR-003).
- [ ] T012 [P] [US1] Add boundary cases to `test_writer.py`: a bundle of one profile, a profile of one depth level, and a window with no profiles at all (which writes nothing and records a skip) (FR-001, spec edge cases).
- [ ] T013 [P] [US1] Write `services/offload/tests/test_determinism.py`: package the same fixture run twice and assert byte-identical files and equal bundle identifiers, with the library version pinned (FR-005).
- [ ] T014 [P] [US1] Add a time-encoding test asserting the time coordinate's reference epoch is the simulation epoch from the run manifest and that no value in the file corresponds to host time (FR-004).

### Implementation for User Story 1

- [ ] T015 [US1] Implement `services/offload/harness_offload/profiles.py`: read a run's profiles for a simulation time window into the export model, ordered along the sampling path.
- [ ] T016 [US1] Implement `services/offload/harness_offload/writer.py`: the `trajectoryProfile` writer with ragged rows, standard names, units and the depth sign convention (FR-001 to FR-003).
- [ ] T017 [US1] Add deterministic write settings to the writer — fixed variable and attribute ordering, fixed chunking, no library-generated identifiers — so byte-identity is a property of the writer rather than an accident (FR-005).
- [ ] T018 [US1] Write the sidecar manifest alongside each bundle and validate it against its schema before the bundle is considered staged (FR-006).
- [ ] T019 [US1] Add the CF compliance check as a CI job over every fixture bundle, with the convention version taken from configuration, failing the build on any error (FR-007, SC-001).

**Checkpoint**: Bundles exist, are standard, and are reproducible.

---

## Phase 4: User Story 2 - Nothing is deleted until the destination proves it has it (Priority: P2)

**Goal**: Eviction gated on an independently computed, locally re-verified receipt.

**Independent Test**: Drive the state machine against a stub destination through every
failure it can present and assert the local bytes survive each one.

### Tests for User Story 2

- [ ] T020 [P] [US2] Write `services/offload/tests/test_ledger.py`: transitions are monotonic, records are written before their side effect, and an unknown or backwards transition is rejected (FR-011).
- [ ] T021 [P] [US2] Write `services/offload/tests/test_verify.py` including the echoing-destination case: a transfer request carrying a deliberately wrong declared digest, a destination that computes its own, and an assertion that verification fails (FR-010, SC-005).
- [ ] T022 [P] [US2] Write `tests/integration/test_offload_receipt_paths.py` covering: no receipt body, malformed receipt, receipt for another bundle identifier, right digest with wrong byte count, duplicate receipt, and destination unreachable. After each, assert the local file is byte-for-byte intact (FR-008, FR-009, FR-016, SC-002).
- [ ] T023 [P] [US2] Write `services/offload/tests/test_evict.py`: a verified bundle with no retention pressure is not evicted; a verified bundle whose file changed after verification is not evicted (FR-013, FR-014).

### Implementation for User Story 2

- [ ] T024 [US2] Implement `services/offload/harness_offload/ledger.py`: append-only durable records with fsync, write-ahead ordering, and a state machine with the six declared states (FR-011).
- [ ] T025 [US2] Implement `services/offload/harness_offload/transfer.py`: send under a temporary name at the destination, reveal atomically on completion, then request the receipt (FR-015).
- [ ] T026 [US2] Implement `services/offload/harness_offload/verify.py`: recompute the local digest from the file on disk, compare against the receipt, validate the receipt against its schema, and record it durably before any state change (FR-008 to FR-010).
- [ ] T027 [US2] Implement `services/offload/harness_offload/evict.py`: retention policy as the only trigger, pre-delete digest re-check, abort on mismatch (FR-013, FR-014).
- [ ] T028 [US2] Implement `services/offload/harness_offload/main.py`: the cycle that orders stage, transfer, verify and evict, with each step's failure reported on `ctl/telemetry` and never swallowed (FR-016, FR-020).
- [ ] T029 [US2] Add the staging-area exhaustion behaviour: when the destination is unreachable and staging is full, stop producing bundles and report, rather than making room (spec edge cases).

**Checkpoint**: The owned failure mode is closed under every failure the destination can
present while the process is running.

---

## Phase 5: User Story 3 - An interrupted offload is safe on restart (Priority: P3)

**Goal**: The guarantee survives a kill at every transition.

**Independent Test**: Inject a kill at each transition boundary, restart, assert no
unjustified eviction and convergence without intervention.

### Tests for User Story 3

- [ ] T030 [P] [US3] Write `tests/integration/test_offload_crash_recovery.py` with a side-effect layer that aborts at a named point, and a case for each transition on both sides of the ledger write (FR-012, SC-003).
- [ ] T031 [P] [US3] Add a partial-transfer case: kill mid-transfer, assert the destination never acknowledges the partial object and the retry succeeds (FR-015).
- [ ] T032 [P] [US3] Add a filesystem-divergence case: a staged bundle deleted by hand, asserting the packager reports the disagreement rather than silently re-staging or forgetting (spec edge cases).
- [ ] T033 [P] [US3] Add a replay case: the same seed produces the same bundle identifier for a bundle already in the ledger, asserting it is treated as the same logical bundle and not a duplicate fault (FR-005, spec edge cases).

### Implementation for User Story 3

- [ ] T034 [US3] Implement ledger recovery on start: every intermediate entry is re-verified against the destination and the local file before any promotion (FR-012).
- [ ] T035 [US3] Make each side effect idempotent under retry, so a record written before an interrupted side effect leads to the same outcome on the second attempt (FR-012, FR-015).
- [ ] T036 [US3] Report the count of covered transitions from the crash-injection suite, so a new transition added later without a test is visible (SC-003).

**Checkpoint**: The guarantee holds across interruption, and the coverage is counted.

---

## Phase 6: User Story 4 - The exported file says nothing about where the measurements were taken beyond the data itself (Priority: P4)

**Goal**: Allow-listed attributes, an opaque run reference, and a primer that documents
both what is emitted and what is not.

**Independent Test**: Scan a produced bundle against the allow-list; run feature 013's
provenance scanner over the same bundle; read the primer against the file.

### Tests for User Story 4

- [ ] T037 [P] [US4] Write `services/offload/tests/test_attributes.py` asserting every global and variable attribute in a produced bundle is on the configured allow-list, and that no value contains a filesystem path, hostname, user name, command line or sensor identifier (FR-017).
- [ ] T038 [P] [US4] Add a test asserting the run reference in the file is an opaque derivation of the run manifest digest and that the manifest itself is not embedded (FR-017).
- [ ] T039 [P] [US4] Add a test asserting the staging area is not reachable through the released path prefix configured for the deployment (FR-018).
- [ ] T040 [P] [US4] Add a CI step running feature 013's provenance scanner over a produced bundle, asserting zero hits (SC-006).

### Implementation for User Story 4

- [ ] T041 [US4] Implement `services/offload/harness_offload/attributes.py`: apply the allow-list at write time, so a disallowed attribute cannot be written and then removed later (FR-017).
- [ ] T042 [US4] Suppress library-written provenance where the library permits it, and record in the primer any attribute the library writes that cannot be suppressed, with its content (FR-017).
- [ ] T043 [US4] Write `docs/standards/cf-conventions.md`: what CF is and what conformance buys; the discrete sampling geometries and why `trajectoryProfile` fits a series of profiles along a sampling path; ragged versus rectangular representation and why ragged; the required `cf_role`, `standard_name`, `units` and depth sign convention; time encoding against the simulation epoch; the attributes deliberately not emitted and the FR-42 reason (FR-021, SRD PR-09).
- [ ] T044 [US4] Add the primer's worked example — open a produced bundle with a standard CF-aware reader and plot one profile — and run it in CI so the primer cannot drift from the file (SC-007).

---

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T045 [P] Add the packager to the Compose configuration consumed from `config/`, with the stub destination as a second service, taking no literal address in either.
- [ ] T046 [P] Add a one-command local run that packages a fixture run, transfers it, verifies it and reports the ledger state, for demonstrability.
- [ ] T047 Record in `services/offload/README.md` that the coverage output is a genuine port and the destination transport is not, so nobody adds an interface over the transport without an ADR (Constitution VI).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all four stories.
- **US1 (Phase 3)**: depends on Foundational. Independent of US2 to US4.
- **US2 (Phase 4)**: depends on Foundational; needs a bundle to transfer, so in practice
  it follows US1, though its tests can run against a fixture bundle of arbitrary bytes.
- **US3 (Phase 5)**: depends on US2, because it attacks the state machine US2 builds.
- **US4 (Phase 6)**: depends on US1 only. Can be worked in parallel with US2 and US3.
- **Polish (Phase 7)**: depends on the stories being delivered.

### External Dependencies

- The run manifest shape comes from feature 004 and the simulation clock from feature
  001. Until both exist, the tests use a recorded fixture manifest committed with them.
- T040 needs feature 013's scanner. Until it exists, the allow-list test in T037 stands
  alone and T040 is the wiring task that follows.

### Within Each User Story

- Tests before implementation, and each test must fail first.
- Bundle identity and digests (Phase 2) before anything that transfers or verifies.
- The ledger before transfer, verification and eviction, because each records its state
  before acting.
- The attribute allow-list is applied at write time, not as a later pass.

### Parallel Opportunities

- T003 and T004 in Setup.
- T010 to T014 in US1: separate test concerns, separate files where possible.
- T020 to T023 in US2: separate test files.
- T030 to T033 in US3.
- T037 to T040 in US4.
- US4 can be worked alongside US2 and US3 once US1 produces a bundle; they share no
  module.

---

## Parallel Example: User Story 2

```bash
# The four test tasks touch four different files:
Task: "Write services/offload/tests/test_ledger.py"
Task: "Write services/offload/tests/test_verify.py including the echoing-destination case"
Task: "Write tests/integration/test_offload_receipt_paths.py"
Task: "Write services/offload/tests/test_evict.py"
```

---

## Implementation Strategy

### MVP first

1. Phases 1 and 2, then Phase 3: a CF-conforming bundle from a fixture run.
2. Stop and validate: open the bundle in a CF-aware tool that knows nothing about this
   project and plot a profile.

### Incremental delivery

US1 gives a file. US2 gives the guarantee while running. US3 gives the guarantee across
a crash. US4 makes the file safe to hand on. Each is demonstrable without the next.

### Notes

- The echoing-destination test is the one that proves the verification is real. A
  destination that returns the digest it was sent must fail verification; if it passes,
  the local check is trusting its own input.
- No test in this feature may assert an eviction happened as its only assertion. Every
  eviction test asserts what survived.
- Byte-identity is claimed for a fixed code and library version, and the test pins that
  version deliberately rather than accidentally.
