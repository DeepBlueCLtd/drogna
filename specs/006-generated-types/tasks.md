---

description: "Task list for 006-generated-types"
---

# Tasks: Neutral Masters and the Generator Chain

**Input**: Design documents from `/specs/006-generated-types/`

**Prerequisites**: `spec.md`, `plan.md`. Consumes `contracts/schemas/config.common.schema.json`
from `001-deterministic-foundations` where it exists; otherwise ships a fixture of the same
shape for its own tests.

**Tests**: Requested for this project. Test tasks are included and precede the implementation
they cover.

**Organisation**: Grouped by user story so each can be finished and demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an unfinished task.
- **[Story]**: The user story the task serves.

## Path Conventions

Repository root paths throughout, per the structure decision in `plan.md`. This feature writes
under `contracts/openapi/`, `libs/harness_types/`, `client/src/generated/`, five named
`scripts/` entries, and its own tests.

---

## Phase 1: Setup

**Purpose**: The chain's skeleton and its pinned tooling.

- [x] T001 Create `contracts/openapi/` with `harness.openapi.yaml` carrying only its document header and an empty component section, and `generators.toml` as the generator manifest
- [x] T002 Pin the Python generation tools in the `uv` workspace — `datamodel-code-generator` and the reference bundler — by exact version, and record each in `contracts/openapi/generators.toml`
- [x] T003 [P] Pin the TypeScript generation tools in the client's `pnpm` manifest — `json-schema-to-typescript` and `openapi-typescript` — by exact version, and record each in `contracts/openapi/generators.toml`
- [x] T004 [P] Create `libs/harness_types/` and `client/src/generated/` with package scaffolding, a `README` in each stating that the directory is generated, and an ignore rule preventing hand-edits from being formatted by the ordinary formatters

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The conventions and the banner rule, without which generated output cannot be
told from hand-written output.

**Critical**: No user story work begins until this phase is complete.

- [x] T005 Write the schema conventions into `contracts/schemas/README.md`: JSON Schema 2020-12 dialect, file naming `<topic-noun>.schema.json`, identifier form `https://schemas.harness.invalid/<name>.schema.json`, unknown properties forbidden on message schemas, mandatory title and description, at least one example per message schema, and time expressed as a simulation-clock instant
- [x] T006 Write `scripts/check_schema_conventions.py` enforcing every rule in T005 and validating each declared example against its own schema, reporting all violations rather than the first
- [x] T007 [P] Write `tests/unit/test_schema_conventions.py` with fixture schemas covering each rule, passing and failing
- [x] T008 Define the banner convention and implement banner insertion as a post-generation step, so every generated file names its source file and the script that produced it regardless of which generator made it
- [x] T009 Implement output normalisation as a post-generation step: stable member ordering, no embedded generation timestamp, no absolute paths, consistent line endings

**Checkpoint**: The masters have rules and the generated output is identifiable and stable.

---

## Phase 3: User Story 1 - A shape is written once and arrives in both languages (Priority: P1) 🎯 MVP

**Goal**: One JSON Schema file plus one script yields a Python model and a TypeScript type.

**Independent Test**: Add a schema, run `scripts/generate_types.sh`, confirm both artefacts
appear, import, and validate the schema's own example; run twice and confirm no diff.

### Tests for User Story 1

- [x] T010 [P] [US1] Write `tests/unit/test_generation_idempotence.py` asserting that two consecutive runs over unchanged sources leave a byte-identical tree
- [x] T011 [P] [US1] Write a round-trip test asserting that each message schema's declared example parses through its generated Python model and that a payload violating the schema is rejected
- [x] T012 [P] [US1] Add a `vitest` case and a `tsc --noEmit` step asserting that the generated TypeScript compiles and that each schema's example type-checks against its generated type

### Implementation for User Story 1

- [x] T013 [US1] Implement JSON Schema to Python generation in `scripts/generate_types.sh`, writing Pydantic v2 models into `libs/harness_types/messages/` and applying the banner and normalisation steps
- [x] T014 [US1] Implement JSON Schema to TypeScript generation, writing into `client/src/generated/messages/` with the same banner and normalisation steps
- [x] T015 [US1] Implement the reference bundling step, writing bundles to a scratch directory that is never committed, and fail generation on any reference that cannot be resolved from within the repository
- [x] T016 [US1] Make generation fail loudly on a type-name collision between two schemas, naming both source files
- [x] T017 [US1] Bring the configuration schemas into the chain, generating configuration models into `libs/harness_types/config/` so no component hand-writes its configuration shape
- [x] T018 [US1] Commit the generated output for whatever schemas exist, and document in `contracts/schemas/README.md` the two-step routine for adding a shape: write the schema, run the script

**Checkpoint**: A shape written once is available in both languages, reproducibly.

---

## Phase 4: User Story 2 - Drift cannot survive CI (Priority: P2)

**Goal**: Committed generated output cannot disagree with its source without CI saying so.

**Independent Test**: Edit a schema without regenerating, and hand-edit a generated file; both
must fail the drift check with a readable diff. Regenerate and it passes.

### Tests for User Story 2

- [x] T019 [P] [US2] Write `tests/integration/test_types_drift_gate.py` covering a modified schema without regeneration, a hand-edited generated file, and the clean case
- [x] T020 [P] [US2] Add a case asserting that the drift check leaves the working tree unmodified whether it passes or fails
- [x] T021 [P] [US2] Add a case asserting that the drift check passes with networking disabled

### Implementation for User Story 2

- [x] T022 [US2] Write `scripts/check_types_drift.sh`: regenerate into a scratch directory, compare against the committed trees, print a readable diff and exit non-zero on any difference
- [x] T023 [US2] Wire the drift check and the convention lint into CI as quality gates 5 and its companion, and into a single local command alongside the other gates
- [x] T024 [US2] Measure and, if necessary, reduce the drift check's runtime so it stays under the sixty-second budget on the CI runner, recording the measured figure in `contracts/schemas/README.md`
- [ ] T025 [US2] Verify cross-platform stability by running generation on a second operating system and confirming an empty diff; where a generator is unstable, extend the normalisation step rather than relaxing the check

**Checkpoint**: Constitution III is enforced by machine in the regeneration direction.

---

## Phase 5: User Story 3 - HTTP types come from the query layer's own specification (Priority: P3)

**Goal**: The client's HTTP types derive from the specification the query layer actually emits.

**Independent Test**: Refresh the vendored specification, regenerate, and confirm the client's
HTTP types follow and that the diff is reviewable.

### Tests for User Story 3

- [x] T026 [P] [US3] Write a test asserting that the vendored specification is in canonical form with stable key ordering, so a refresh diff shows interface change and nothing else
- [x] T027 [P] [US3] Write a test asserting that no HTTP request or response shape is declared by hand under `client/src/` outside the generated directory

### Implementation for User Story 3

- [x] T028 [US3] Write `scripts/refresh_query_layer_spec.sh`, preferring the query layer's offline emission command and falling back to bringing it up in the local destination, capturing, canonicalising and tearing down
- [ ] T029 [US3] Add OpenAPI to TypeScript generation for `contracts/openapi/query-layer.openapi.json`, writing into `client/src/generated/http/`
- [ ] T030 [US3] Add OpenAPI to Python generation for the same document where a service needs to call the query layer, writing into `libs/harness_types/`
- [ ] T031 [US3] Handle the version difference between the vendored document and the hand-written one by invoking the generators separately with per-document options recorded in the manifest; do not merge the documents
- [x] T032 [US3] Document the refresh routine in `contracts/openapi/README.md`: when to refresh, how to read the diff, and why the drift check never needs a running query layer

**Checkpoint**: The served interface, not an idea of it, is what the client is typed against.

---

## Phase 6: User Story 4 - Shapes shared between transport and HTTP are declared once (Priority: P4)

**Goal**: A coinciding shape has one definition and two references.

**Independent Test**: Reference a message schema from the harness OpenAPI document, regenerate,
and confirm each language carries exactly one definition of the shape.

### Tests for User Story 4

- [x] T033 [P] [US4] Write a test asserting that a shape referenced from the OpenAPI document produces exactly one Python definition and one TypeScript definition, not two
- [x] T034 [P] [US4] Write `tests/unit/test_handwritten_type_lint.py` covering the boundary-type lint: a hand-written model of a message payload fails, an unrelated internal dataclass passes

### Implementation for User Story 4

- [x] T035 [US4] Populate `contracts/openapi/harness.openapi.yaml` with the harness's own HTTP surface, referencing message schemas by file wherever a shape coincides
- [x] T036 [US4] Write `scripts/check_handwritten_types.py` detecting Python models and TypeScript interfaces for message payloads or HTTP bodies declared outside the generated directories, with a documented exemption marker for genuine internal shapes
- [x] T037 [US4] Wire the boundary-type lint into CI and into the single local gate command
- [x] T038 [US4] Extend the forbidden-vocabulary gate's file list to cover `contracts/`, so a stray entity vocabulary in a schema fails the build

**Checkpoint**: One vocabulary, one chain, and both directions of Constitution III enforced.

---

## Phase 7: Polish

- [ ] T039 [P] Write `docs/architecture/generated-types.md` describing the chain end to end: masters, bundling, generators, banners, normalisation, drift, and how to add a shape
- [ ] T040 [P] Record an ADR for the generator selection, naming the alternatives considered and why each generator was chosen, since replacing one later is a whole-tree regeneration
- [x] T041 Run the full quality-gate set over this feature's files and fix what they report
- [x] T042 Rehearse the failure modes in `spec.md`: a colliding type name, an unresolvable reference, a non-deterministic generator, and a hand-written boundary type; confirm each fails with the message the specification promises

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every story: without the conventions,
  the banner and the normalisation, generated output is neither identifiable nor stable.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP.
- **User Story 2 (Phase 4)**: Depends on User Story 1, since there must be generated output to
  check for drift.
- **User Story 3 (Phase 5)**: Depends on User Story 1 for the chain, and on a query layer
  existing in some runnable form for the refresh. The generation half can be built against a
  captured specification before the query layer feature is complete.
- **User Story 4 (Phase 6)**: Depends on User Story 1, and on User Story 3 only where a
  coinciding shape appears in the query layer's own surface.
- **Polish (Phase 7)**: Depends on the stories being delivered.

### External Dependencies

- `contracts/schemas/config.common.schema.json` comes from `001-deterministic-foundations`.
- `contracts/schemas/observation.schema.json` comes from `007-observation-path`.
- The query layer's emitted specification comes from `008-query-layer`. User Story 3 is
  completable only once that feature can be brought up; the rest of this feature is not
  blocked on it.
- The client's build must consume `client/src/generated/`, which belongs to
  `003-component-shell-client`; that feature imports the generated types and does not
  hand-write them.

### Within Each User Story

Tests precede implementation and are expected to fail first. Conventions precede generation;
generation precedes checking; checking precedes documentation of the routine.

### Parallel Opportunities

- T003 and T004 are independent of one another.
- T007 can be written alongside T006's implementation.
- T010, T011 and T012 are independent test tasks and can be written together.
- T019, T020 and T021 likewise.
- User Stories 3 and 4 are independent of each other once User Story 1 is complete.

---

## Parallel Example: User Story 1

```bash
Task: "Write tests/unit/test_generation_idempotence.py"
Task: "Write the example round-trip test for generated Python models"
Task: "Add the vitest and tsc --noEmit checks for generated TypeScript"
```

---

## Implementation Strategy

### MVP first

Phases 1 to 3 give a single command that turns a schema into types in both languages. That is
enough to unblock the first message with a second consumer, which is the condition SRD §10
attaches to this feature.

### Incremental delivery

1. Setup and Foundational — conventions, banners, stable output.
2. User Story 1 — the chain. Stop and validate on a real message schema.
3. User Story 2 — the CI gate, which is what makes the committed output trustworthy.
4. User Story 3 — the query layer's own specification as source.
5. User Story 4 — cross-referencing and the hand-written-type lint.

### Notes

- `[P]` marks different files with no unfinished dependency.
- Each task is sized to be one coherent commit.
- A generated file is never edited, including to fix a failing test. The fix goes into the
  master, the generator options, or the normalisation step.

---

## What was delivered, and what was not

Recorded here rather than left to be inferred from the checkboxes, because three of the
tasks were completed differently from the way they were written and six were not completed
at all.

### Completed differently

- **T002, T003 — the generators.** `datamodel-code-generator` 0.75.1 writes the Python, as
  the specification assumed, pinned in the workspace and checked against what is installed
  before generation runs. The TypeScript half is **not** `json-schema-to-typescript` in the
  client's `pnpm` manifest. It is a small emitter in `scripts/schema_to_typescript.py`,
  versioned and pinned in `contracts/openapi/generators.toml` like any other tool, and the
  argument is recorded there beside the pin: FR-009 requires the drift check to run with no
  network fetch and no service, and a Node generator makes the gate depend on
  `pnpm install` inside the Python job that runs every other gate. The emitter covers the
  JSON Schema subset the masters use and fails by name on anything else, rather than
  emitting a plausible wrong type. If the OpenAPI half outgrows it, the honest move is
  `openapi-typescript` in the client's own toolchain with the drift check split in two —
  not a Python-only gate that quietly stops examining the TypeScript.
- **T015 — the reference bundler.** No third-party bundler is pinned. Bundling is a step in
  `scripts/generate_types.py`: masters are copied to a scratch directory with external
  references rewritten to bundle-relative form, every reference is resolved there and then,
  and one that names a document outside the repository fails the run. The generator is
  installed without its `[http]` extra, so a missed reference cannot fetch instead.
- **T035 — the harness OpenAPI document.** `paths` is empty and stays empty: no component
  in the harness serves HTTP yet, and a document describing an endpoint nobody answers
  would be the approximation NFR-01 exists to remove. What is populated is the vocabulary —
  `components/schemas` references `clock.schema.json`, and generation emits an alias rather
  than a second definition, which is the mechanism US4 is about and which is tested.

### Not done

- **T025 — a second operating system.** This session has one. What could be done without a
  second machine was: byte-exact reads and writes so no platform rewrites a line ending, a
  check that no scratch path leaks into the output, pinned generator and formatter versions
  verified before generation, and `--disable-timestamp`. The remaining risk is a genuine
  gap and is named here rather than claimed as covered.
- **T029, T030, T031 — generation from the query layer's specification.** There is no
  vendored document to generate from: feature 008 does not exist. `scripts/
  refresh_query_layer_spec.sh` is written and its canonicalisation is tested; its capture
  half fails with a message saying why until there is a query layer to capture from. The
  chain already reads each OpenAPI document separately and never merges them, which is the
  half of T031 that can be settled before a second document exists.
- **T039, T040 — the architecture note and the ADR.** Both live under `docs/`, which this
  session was not given. The material for both is written: `contracts/openapi/README.md`
  and `contracts/schemas/README.md` describe the chain end to end and the routine for
  adding a shape, and `contracts/openapi/generators.toml` carries the generator selection
  with the alternatives and the reason for each. Moving that into `docs/architecture/` and
  an ADR is a copy-and-edit for whoever owns `docs/`.
