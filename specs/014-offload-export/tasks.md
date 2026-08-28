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

- [x] T001 Create `services/offload/harness_offload/` and `services/offload/tests/`, add the package to the `uv` workspace member list, and add its `ruff` configuration inheritance.
- [x] T002 Write `contracts/schemas/config.offload.schema.json`: common sections `$ref`d from `config.common.schema.json`, plus `staging`, `ledger`, `destination`, `retention`, `attributes.allowlist`, `compliance.convention_version` and `export.window`.
- [x] T003 [P] Write `contracts/schemas/bundle-manifest.schema.json` and `contracts/schemas/offload-receipt.schema.json`, with `$id` values following the repository naming rule.
- [x] T004 [P] Write `config/local/offload.json` and `config/droplet/offload.json` with the same shape and per-destination values.
- [x] T005 Implement `services/offload/harness_offload/config.py`: read `HARNESS_CONFIG`, validate against the schema before any other I/O, fail at startup with a readable message.

**Checkpoint**: The component starts, validates its configuration, and does nothing else.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bundle identity, digests and the clock wiring that every story depends on.

- [x] T006 Write `services/offload/tests/test_bundle.py` covering deterministic bundle identity from run identity and logical position, sidecar manifest contents, and digest computation over a multi-member bundle. Tests fail before T007.
- [x] T007 Implement `services/offload/harness_offload/bundle.py`: bundle identifier derivation, SHA-256 digests, sidecar manifest construction against `bundle-manifest.schema.json` (FR-005, FR-006).
- [x] T008 Wire `harness_core.clock.Clock` and `harness_core.rng.rng_for` through `config.py`, and add a unit test asserting no module in the package imports a host time or global RNG function (FR-004, Constitution I and II).
- [x] T009 [P] Implement `services/offload/harness_offload/telemetry.py`: heartbeat on `ctl/heartbeat` with component identifier, simulation time and status; bundle-state counts on `ctl/telemetry` (FR-020).

**Checkpoint**: Bundles can be named and hashed deterministically.

---

## Phase 3: User Story 1 - A run leaves as a file another tool can read (Priority: P1) 🎯 MVP

**Goal**: A CF-conforming `trajectoryProfile` NetCDF bundle from a recorded run.

**Independent Test**: Package a fixture run; the CF compliance check reports zero
errors; the sidecar manifest matches the bytes on disk.

### Tests for User Story 1

- [x] T010 [P] [US1] Write `services/offload/tests/test_writer.py` asserting the file declares `Conventions` and `featureType = "trajectoryProfile"`, carries trajectory and profile instance variables with their `cf_role`, per-profile time and position, and a depth coordinate declaring its sign convention (FR-001, FR-002).
- [x] T011 [P] [US1] Add a ragged-representation test: profiles of differing length are written with explicit row-count variables and no fill values inside any profile (FR-003).
- [x] T012 [P] [US1] Add boundary cases to `test_writer.py`: a bundle of one profile, a profile of one depth level, and a window with no profiles at all (which writes nothing and records a skip) (FR-001, spec edge cases).
- [x] T013 [P] [US1] Write `services/offload/tests/test_determinism.py`: package the same fixture run twice and assert byte-identical files and equal bundle identifiers, with the library version pinned (FR-005).
- [x] T014 [P] [US1] Add a time-encoding test asserting the time coordinate's reference epoch is the simulation epoch from the run manifest and that no value in the file corresponds to host time (FR-004).

### Implementation for User Story 1

- [x] T015 [US1] Implement `services/offload/harness_offload/profiles.py`: read a run's profiles for a simulation time window into the export model, ordered along the sampling path.
- [x] T016 [US1] Implement `services/offload/harness_offload/writer.py`: the `trajectoryProfile` writer with ragged rows, standard names, units and the depth sign convention (FR-001 to FR-003).
- [x] T017 [US1] Add deterministic write settings to the writer — fixed variable and attribute ordering, fixed chunking, no library-generated identifiers — so byte-identity is a property of the writer rather than an accident (FR-005).
- [x] T018 [US1] Write the sidecar manifest alongside each bundle and validate it against its schema before the bundle is considered staged (FR-006).
- [x] T019 [US1] Add the CF compliance check as a CI job over every fixture bundle, with the convention version taken from configuration, failing the build on any error (FR-007, SC-001).

**Checkpoint**: Bundles exist, are standard, and are reproducible.

---

## Phase 4: User Story 2 - Nothing is deleted until the destination proves it has it (Priority: P2)

**Goal**: Eviction gated on an independently computed, locally re-verified receipt.

**Independent Test**: Drive the state machine against a stub destination through every
failure it can present and assert the local bytes survive each one.

### Tests for User Story 2

- [x] T020 [P] [US2] Write `services/offload/tests/test_ledger.py`: transitions are monotonic, records are written before their side effect, and an unknown or backwards transition is rejected (FR-011).
- [x] T021 [P] [US2] Write `services/offload/tests/test_verify.py` including the echoing-destination case: a transfer request carrying a deliberately wrong declared digest, a destination that computes its own, and an assertion that verification fails (FR-010, SC-005).
- [x] T022 [P] [US2] Write `tests/integration/test_offload_receipt_paths.py` covering: no receipt body, malformed receipt, receipt for another bundle identifier, right digest with wrong byte count, duplicate receipt, and destination unreachable. After each, assert the local file is byte-for-byte intact (FR-008, FR-009, FR-016, SC-002).
- [x] T023 [P] [US2] Write `services/offload/tests/test_evict.py`: a verified bundle with no retention pressure is not evicted; a verified bundle whose file changed after verification is not evicted (FR-013, FR-014).

### Implementation for User Story 2

- [x] T024 [US2] Implement `services/offload/harness_offload/ledger.py`: append-only durable records with fsync, write-ahead ordering, and a state machine with the six declared states (FR-011).
- [x] T025 [US2] Implement `services/offload/harness_offload/transfer.py`: send under a temporary name at the destination, reveal atomically on completion, then request the receipt (FR-015).
- [x] T026 [US2] Implement `services/offload/harness_offload/verify.py`: recompute the local digest from the file on disk, compare against the receipt, validate the receipt against its schema, and record it durably before any state change (FR-008 to FR-010).
- [x] T027 [US2] Implement `services/offload/harness_offload/evict.py`: retention policy as the only trigger, pre-delete digest re-check, abort on mismatch (FR-013, FR-014).
- [x] T028 [US2] Implement `services/offload/harness_offload/main.py`: the cycle that orders stage, transfer, verify and evict, with each step's failure reported on `ctl/telemetry` and never swallowed (FR-016, FR-020).
- [x] T029 [US2] Add the staging-area exhaustion behaviour: when the destination is unreachable and staging is full, stop producing bundles and report, rather than making room (spec edge cases).

**Checkpoint**: The owned failure mode is closed under every failure the destination can
present while the process is running.

---

## Phase 5: User Story 3 - An interrupted offload is safe on restart (Priority: P3)

**Goal**: The guarantee survives a kill at every transition.

**Independent Test**: Inject a kill at each transition boundary, restart, assert no
unjustified eviction and convergence without intervention.

### Tests for User Story 3

- [x] T030 [P] [US3] Write `tests/integration/test_offload_crash_recovery.py` with a side-effect layer that aborts at a named point, and a case for each transition on both sides of the ledger write (FR-012, SC-003).
- [x] T031 [P] [US3] Add a partial-transfer case: kill mid-transfer, assert the destination never acknowledges the partial object and the retry succeeds (FR-015).
- [x] T032 [P] [US3] Add a filesystem-divergence case: a staged bundle deleted by hand, asserting the packager reports the disagreement rather than silently re-staging or forgetting (spec edge cases).
- [x] T033 [P] [US3] Add a replay case: the same seed produces the same bundle identifier for a bundle already in the ledger, asserting it is treated as the same logical bundle and not a duplicate fault (FR-005, spec edge cases).

### Implementation for User Story 3

- [x] T034 [US3] Implement ledger recovery on start: every intermediate entry is re-verified against the destination and the local file before any promotion (FR-012).
- [x] T035 [US3] Make each side effect idempotent under retry, so a record written before an interrupted side effect leads to the same outcome on the second attempt (FR-012, FR-015).
- [x] T036 [US3] Report the count of covered transitions from the crash-injection suite, so a new transition added later without a test is visible (SC-003).

**Checkpoint**: The guarantee holds across interruption, and the coverage is counted.

---

## Phase 6: User Story 4 - The exported file says nothing about where the measurements were taken beyond the data itself (Priority: P4)

**Goal**: Allow-listed attributes, an opaque run reference, and a primer that documents
both what is emitted and what is not.

**Independent Test**: Scan a produced bundle against the allow-list; run feature 013's
provenance scanner over the same bundle; read the primer against the file.

### Tests for User Story 4

- [x] T037 [P] [US4] Write `services/offload/tests/test_attributes.py` asserting every global and variable attribute in a produced bundle is on the configured allow-list, and that no value contains a filesystem path, hostname, user name, command line or sensor identifier (FR-017).
- [x] T038 [P] [US4] Add a test asserting the run reference in the file is an opaque derivation of the run manifest digest and that the manifest itself is not embedded (FR-017).
- [x] T039 [P] [US4] Add a test asserting the staging area is not reachable through the released path prefix configured for the deployment (FR-018).
- [x] T040 [P] [US4] Add a CI step running feature 013's provenance scanner over a produced bundle, asserting zero hits (SC-006).

### Implementation for User Story 4

- [x] T041 [US4] Implement `services/offload/harness_offload/attributes.py`: apply the allow-list at write time, so a disallowed attribute cannot be written and then removed later (FR-017).
- [x] T042 [US4] Suppress library-written provenance where the library permits it, and record in the primer any attribute the library writes that cannot be suppressed, with its content (FR-017).
- [x] T043 [US4] Write `docs/standards/cf-conventions.md`: what CF is and what conformance buys; the discrete sampling geometries and why `trajectoryProfile` fits a series of profiles along a sampling path; ragged versus rectangular representation and why ragged; the required `cf_role`, `standard_name`, `units` and depth sign convention; time encoding against the simulation epoch; the attributes deliberately not emitted and the FR-42 reason (FR-021, SRD PR-09).
- [x] T044 [US4] Add the primer's worked example — open a produced bundle with a standard CF-aware reader and plot one profile — and run it in CI so the primer cannot drift from the file (SC-007).

---

## Phase 7: Polish and Cross-Cutting Concerns

- [x] T045 [P] Add the packager to the Compose configuration consumed from `config/`, with the stub destination as a second service, taking no literal address in either.
- [x] T046 [P] Add a one-command local run that packages a fixture run, transfers it, verifies it and reports the ledger state, for demonstrability.
- [x] T047 Record in `services/offload/README.md` that the coverage output is a genuine port and the destination transport is not, so nobody adds an interface over the transport without an ADR (Constitution VI).

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

---

## Delivery notes

Three tasks were not ticked, and each was a decision rather than an omission. All three
are ticked now; what each note said, and what was actually found in the tree when lane D
came back to them on 28 August 2026, is below. Two of the three notes had gone stale in the
way `CLAUDE.md` describes — the tree had moved and the record had not — and the delivery
plan, which listed these as "the only unticked tasks in the repository with no reason
recorded", was itself wrong: the notes were here all along, under this heading.

- **T040** — done, 28 August 2026 (lane D), by establishing that it already was and saying
  so, which is what this task's status being unknown had cost. The scanner runs over a
  produced bundle on every build: `tests/integration/test_offload_provenance_scan.py` is
  collected by `uv run pytest`, which is the `checks` job's Tests step, and it needs no
  container and no optional tooling — checked, on 28 August, that it runs there rather than
  skipping, because a test that skips everywhere is the outcome `CLAUDE.md` warns reads
  exactly like a clean one. A second named step in `ci.yml` running the same test was
  considered and not added: it would be a second way to invoke one test, which is the
  duplication this repository keeps deciding against, and it would not make the assertion
  any truer.

  The substance of the original note stands unchanged, and is the part worth keeping:

  Feature 013's provenance scanner finds **zero** identifying hits: no path, host, user,
  sensor, thing, datastream or in-radius coordinate, in the NetCDF or the sidecar. What it does report is that 013's attribute allow-list is
  calibrated for the gridded coverage products the proxy releases and does not carry the
  `trajectoryProfile` geometry — `cf_role`, `sample_dimension`, `instance_dimension`,
  `coordinates`, the three dimension names, `featureType = "trajectoryProfile"` and a CF
  time units string. Those are pinned by name in that test so a hit which is *not* one of
  them fails. Widening `tests/leakage/rules/attribute_allowlist.yaml` is a deliberate
  reviewable edit by 013's own design, and an offload bundle is not a released artefact in
  any case, so the entry is left for 013 rather than added here. "Zero hits" in SC-006's
  sense is therefore asserted; "zero findings from an unmodified rule file" is not, and the
  difference is written down instead of being smoothed over.
- **T045** — done, 28 August 2026 (lane D). Two thirds of this note had gone stale before
  it was read again. The `offload` service does now mount its staging area and its ledger,
  on one volume, and no longer mounts the coverage store — all three corrected in the tree
  without this note following. What was still true, and was the whole of the task, is that
  **there was no stub-destination service**: `config/*/offload.json` has named `archive`
  since the packager was written, nothing answered there, and the deployed component could
  therefore stage a bundle and could never transfer one. Nothing noticed because every test
  that exercises the transfer path presents its own destination in-process, which is right
  for what those tests assert and is exactly why none of them could see this.

  `deploy/archive/stub.py` answers now, declared as `archive` in `deploy/compose.yaml`,
  configured from `config/*/archive.json`, with no literal address at either end. It is a
  stub in the sense the whole harness is: objects live in memory and a restart forgets them.
  What it does not fake is the digest — it computes its own over the bytes that arrived,
  which is the only reason a receipt is worth having, and
  `tests/integration/test_offload_destination_stub.py` declares a deliberately wrong digest
  and asserts the destination contradicts it. It holds no clock, so a receipt's `sim_time`
  comes from C-01 and no receipt is issued at all when the clock cannot be read: "the
  destination said yes and told us nothing" is a modelled outcome, and better than a
  simulation time this program invented (Constitution I).

  The blocker this note recorded — "`deploy/` belongs to 005" — is what lane D exists to
  clear, so it no longer applies.
- **T046** — done, 28 August 2026 (lane D), and the note's reasoning was sound but is now
  answered rather than overtaken. `scripts/check_cf_conformance.py` does package a fixture
  run through the packager's own code path on every build, and that remains the check. What
  it cannot show, because it never leaves the process, is a transfer: it stops at the file.
  Once T045 gave the deployment a destination that answers, the second entry point the note
  deferred had something to demonstrate, so `scripts/offload_demo.sh` was added.

  It writes a fixture run, packages it, transfers it to the **deployed** stub over the
  address `deployment.json` publishes, verifies the receipt and prints the ledger — staged,
  transferred, verified, with the digest the destination computed and the simulation instant
  it received at. The fixture comes from `offload_support.write_run`, the generator the
  tests already use, rather than a second one written here: `offload_support.configuration`
  reads `config/local/offload.json` itself, so a value that drifts there fails in the
  demonstration too. It writes nothing into the deployment's volumes and evicts nothing from
  them; the scratch tree goes away with the run.

  The task said "for demonstrability" and that is what it is. It is not a gate and is not
  registered as one.

Two other things worth knowing for whoever picks this up.

`encode_netcdf` moved from `harness_env_generator.writer` to `harness_core.netcdf`, this
package being its third consumer. The reader of the same format did not move and is still
`harness_monitor.netcdf`, which is why this package depends on `harness-monitor`.

`docs/standards/cf-conventions.md` in plan.md is spelt `site/docs/standards/cf-conventions.md`
in the tree, which already held a stub of that page awaiting this component. The stub was
replaced rather than a second primer created.

---

## Added after delivery: the measurement geometry producer

- [ ] T047 [US4] Write the run's measurement geometry into the bundle's copy of the run
  manifest, in `services/offload/src/harness_offload/`, as the optional
  `measurement_geometry` block declared in `contracts/schemas/run-manifest.schema.json`:
  the identification radius the run was released under, the interval in simulation seconds,
  and every position and simulation time a measurement was taken at during it. Validate the
  document through `harness_types.messages.run_manifest.DrognaRunManifest` before writing
  it, like every other document this component writes.

**Why this is here and not done.** The geometry is the ground truth the updated-region half
of the leakage gate scores a change mask against (FR-015, FR-42). It had no declared shape
and no producer: `tests/leakage/fixtures/` carried a standalone `geometry.json` that nothing
in the harness wrote. The contract half is now closed — the manifest master carries the
block, the generated model is committed, and `tests/leakage/updated_region.py:load_geometry`
validates against it and refuses loudly rather than defaulting. The producer half is not.

**Whose decision this was.** The user chose this component as the producer, over C-01 and
the publisher, on 2026-08-27. The reasoning that follows from it is worth keeping: C-01
writes the run's own manifest to the run-data volume as the run starts and holds no
observations, so it cannot write the block and must keep writing a manifest without it —
which is why the block is optional in the master rather than required. This component writes
the copy that travels beside a bundle, knows the window the bundle covers, and is already
the component that decides what does and does not leave the boundary.

**What it needs that this component does not have.** A source of measurement positions and
simulation times for a window, which today means reading the observation store. This
component has no such dependency and acquiring one is a real change: `stores/` is not in
this feature's path conventions, and Constitution VI says the observation store is not a
port to be dressed as one. That is the work T047 is, and it is why it is a task rather than
an omission.
