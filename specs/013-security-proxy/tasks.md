---

description: "Task list for 013-security-proxy"
---

# Tasks: Security Proxy and Exposure Boundary

**Input**: Design documents from `/specs/013-security-proxy/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. Test tasks are included and, within a story, are
written before the implementation they describe.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Paths are exact and relative to the repository root

## Path Conventions

This feature owns `proxy/`, `tests/leakage/` and `docs/adr/0001-binary-access.md`, and
adds `contracts/schemas/config.proxy.schema.json` additively. No task touches anything
else.

---

## Phase 1: Setup

**Purpose**: The directories, the configuration shape, and a proxy that starts and
refuses everything.

- [ ] T001 Create `proxy/` with `templates/`, `tests/` and an empty `__init__.py`, and add the package to the `uv` workspace member list in the workspace manifest.
- [ ] T002 Write `contracts/schemas/config.proxy.schema.json` with `component`, `clock`, `seed`, `broker`, `logging` `$ref`d from `config.common.schema.json`, plus a `proxy` section carrying `listen`, `upstream`, `released_prefix`, `released_collections`, `released_variables`, `tls.certificate`, `tls.key`, `credentials_file`, `identification_radius_m` and `quantisation_step`.
- [ ] T003 [P] Write `config/local/proxy.json` and `config/droplet/proxy.json` with the same shape and per-destination values, no value duplicated into source.
- [ ] T004 [P] Write `proxy/tests/test_config_schema.py` asserting the example configurations validate and that omitting `released_collections` is a validation error rather than an empty release.

**Checkpoint**: The configuration shape exists and is validated.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Rendering and path normalisation, which every story depends on.

**No user story work can begin until this phase is complete.**

- [ ] T005 Write `proxy/tests/test_policy.py` covering path normalisation: percent-encoded traversal, duplicate slashes, trailing dot, mixed case, and a released identifier that is a string prefix of an unreleased one. Tests must fail before T006.
- [ ] T006 Implement `proxy/policy.py`: normalise a request path, map a released collection identifier to an exact location, and refuse any path that does not normalise unambiguously (FR-001, FR-004).
- [ ] T007 Write `proxy/tests/test_render_config.py` covering: one location emitted per released collection, deterministic ordering, value escaping, and a rendered configuration containing no value absent from the input configuration.
- [ ] T008 Implement `proxy/render_config.py`: read `HARNESS_CONFIG`, validate against `config.proxy.schema.json` before any other I/O, render `proxy/templates/harness.conf.j2`, write to the location given by configuration (FR-008).
- [ ] T009 Write `proxy/templates/harness.conf.j2`: a default location that refuses, one exact location per released collection beneath the released prefix, TLS from configuration, and refusal logging with the matched rule (FR-001, FR-007, FR-020).
- [ ] T010 Write `proxy/entrypoint.sh`: render, run `nginx -t` against the rendered file, fail loudly on a validation error, then exec nginx. No path literal in the script; all locations from the rendered configuration.

**Checkpoint**: A proxy that starts, validates, and refuses everything.

---

## Phase 3: User Story 1 - Nothing is reachable that was not deliberately released (Priority: P1) 🎯 MVP

**Goal**: One released prefix answers; every other path is refused before reaching
upstream.

**Independent Test**: Enumerate the paths the query layer advertises, request each
through the proxy, assert only released paths answer and nothing else reaches upstream.

### Tests for User Story 1

- [ ] T011 [P] [US1] Write `proxy/tests/test_request_matrix.py` with a stub upstream that records every request it receives, and a matrix covering released paths, unreleased paths, native query-layer paths, and nonexistent paths (FR-001, FR-002, FR-003).
- [ ] T012 [P] [US1] Extend the matrix with method coverage: `GET`, `HEAD`, `OPTIONS` and a CORS preflight against an unreleased path, asserting the refusal is not method-dependent.
- [ ] T013 [P] [US1] Add a matrix case asserting the query layer's emitted specification and conformance documents are refused, since they enumerate withheld collections.

### Implementation for User Story 1

- [ ] T014 [US1] Wire the released-collection list from configuration through `policy.py` into the template so a collection absent from the list has no location at all (FR-003).
- [ ] T015 [US1] Add the upstream access-log assertion to the matrix harness: an unreleased request must leave no record upstream, which is the difference between refusing and proxying-then-refusing (FR-001).
- [ ] T016 [US1] Add the stability test: start the stub upstream with an additional collection it did not have before, re-run the matrix without re-rendering, and assert the response matrix is byte-identical (FR-003, SC-002).
- [ ] T017 [US1] Add refusal logging with the normalised path and the matched rule, and a test asserting a refused request is diagnosable from the log alone (FR-020).

**Checkpoint**: The exposure boundary stands on its own, with no authentication yet.

---

## Phase 4: User Story 2 - Access is binary, and recorded as such (Priority: P2)

**Goal**: One clearance, all released data or none, no response rewriting, and the
assumption written down.

**Independent Test**: Drive the matrix with and without a credential; compare bodies
byte-for-byte against upstream; read the ADR.

### Tests for User Story 2

- [ ] T018 [P] [US2] Extend `proxy/tests/test_request_matrix.py` with an uncleared caller over a released path, an unreleased path and a nonexistent path, asserting the three responses are identical in status, body and headers (FR-006).
- [ ] T019 [P] [US2] Add a body-fidelity test comparing the proxied response byte-for-byte with the stub upstream's response for the same request, including a response large enough to be chunked (FR-005).
- [ ] T020 [P] [US2] Write `proxy/tests/test_adr_present.py` asserting `docs/adr/0001-binary-access.md` exists and carries Status, Context, Decision and Consequences headings (FR-009).

### Implementation for User Story 2

- [ ] T021 [US2] Add TLS termination and credential checking to the template, with certificate, key and credential file locations from configuration (FR-007).
- [ ] T022 [US2] Add the uniform-challenge behaviour: uncleared callers receive one response for every path; cleared callers receive not-found for unreleased paths (FR-006).
- [ ] T023 [US2] Assert in `proxy/tests/test_render_config.py` that no directive capable of rewriting a response body appears in the rendered configuration (FR-005).
- [ ] T024 [US2] Write `docs/adr/0001-binary-access.md`: context (SRD FR-39, FR-40), decision (binary clearance, no per-field redaction), rejected alternative (tiered access with body inspection), consequences (path-prefix policy becomes sufficient; softening the assumption changes the architecture, not the configuration).

**Checkpoint**: The boundary is closed, credentialled, and the assumption is on record.

---

## Phase 5: User Story 3 - Exported files carry no provenance that identifies the sampling (Priority: P3)

**Goal**: An allow-list scanner over released artefacts, with a control that proves it
can detect a leak.

**Independent Test**: Scan a clean bundle and a leaky fixture; the first passes, the
second is flagged, neither needs a running system.

### Tests for User Story 3

- [ ] T025 [P] [US3] Create `tests/leakage/fixtures/clean_bundle/` from a seeded fixture run, with a README recording the seed and what it represents.
- [ ] T026 [P] [US3] Create `tests/leakage/fixtures/leaky_bundle/` as a deliberate control: `history` carrying a command line and input paths, a variable attribute naming a sensor identifier, and a global attribute holding a measurement coordinate. Document in the fixture README that it is deliberately leaky.
- [ ] T027 [P] [US3] Write `tests/leakage/test_provenance.py` asserting zero hits on the clean bundle, a flagged result naming the offending attribute on the leaky bundle, and a non-zero exit (FR-011, FR-013).
- [ ] T028 [P] [US3] Add a test case for an unanticipated global attribute with a harmless value, asserting the allow-list flags it rather than ignoring it (FR-012).
- [ ] T029 [P] [US3] Add a test case for a bundle member in an unrecognised format, asserting it is a failure and not a skip.

### Implementation for User Story 3

- [ ] T030 [US3] Write `tests/leakage/rules/attribute_allowlist.yaml` and `tests/leakage/rules/identifying_patterns.yaml` as data, not code, so a rule change is reviewable as a diff (FR-012).
- [ ] T031 [US3] Implement `tests/leakage/scanner.py`: walk global attributes, variable attributes, variable names, dimension names and embedded text members; apply the allow-list and the identifying patterns; emit a leakage report whether or not anything was found (FR-011, FR-012).
- [ ] T032 [US3] Add coordinate proximity checking to the scanner: flag any value parseable as a coordinate pair falling within the configured identification radius of a measurement location in the run manifest (FR-012).
- [ ] T033 [US3] Add the released-variable allow-list check: any variable in an artefact that is not on the configured list is a hit (FR-014).
- [ ] T034 [US3] Write `tests/leakage/test_released_list.py` asserting that the SensorThings collections over the observation store and the planner's route output do not appear in the released collection list of either destination configuration (FR-010).

**Checkpoint**: Provenance leakage is gated by a test with demonstrated power.

---

## Phase 6: User Story 4 - The shape of the released update does not redraw the sampling path (Priority: P4)

**Goal**: A statistical test on successive released products that fails when the change
mask recovers the measurement geometry, and that proves its own power on a control.

**Independent Test**: Compute the recovery statistic on a mitigated pair and an
unmitigated pair from committed fixtures; assert both bounds.

### Tests for User Story 4

- [ ] T035 [P] [US4] Create `tests/leakage/fixtures/mitigated_pair/` — two successive released products from a seeded run in which the platform moves, produced with whole-domain rewrite and with age-driven variables excluded, plus the run manifest's measurement geometry.
- [ ] T036 [P] [US4] Create `tests/leakage/fixtures/unmitigated_pair/` as a deliberate control — the same run with the whole-domain rewrite disabled, so only cells near recent measurements are refreshed. Document it as deliberately leaky.
- [ ] T037 [P] [US4] Write `tests/leakage/test_updated_region.py` asserting the mitigated statistic is at or below the chance bound *and* the unmitigated statistic is at or above the detection bound, failing the run if the control is not detected (FR-016).
- [ ] T038 [P] [US4] Add inconclusive-case tests: an empty change mask, a pair of products on different grids, a pair with different variable sets, and a run whose measurement geometry does not span more than the identification radius. Each must fail as inconclusive, never pass (FR-017).
- [ ] T039 [P] [US4] Add a case in which an age-driven variable is present in the released set, asserting the statistic rises above the chance bound and the test fails (FR-014, spec US4 scenario 3).

### Implementation for User Story 4

- [ ] T040 [US4] Implement the change mask in `tests/leakage/updated_region.py`: cells whose released value differs by more than the configured quantisation step, computed per released variable and unioned (FR-015).
- [ ] T041 [US4] Implement the recovery statistic: rasterise the measurement geometry to the product grid, buffer it by the identification radius, and score how well mask membership predicts buffered-geometry membership. Report the figure, the bounds and the cell counts on both sides (FR-015).
- [ ] T042 [US4] Add the inconclusive detection: empty mask, mismatched grid or variable set, and insufficient geometry span, each returning an explicit inconclusive outcome that the test treats as failure (FR-017).

**Checkpoint**: Both leakage paths named in SRD FR-42 are held by tests that can fail.

---

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T043 [P] Add the leakage gate as a single command runnable from a clean checkout, taking a candidate bundle path from configuration, and wire it into CI as a distinct job (FR-018, FR-019, SC-008).
- [ ] T044 [P] Add the request matrix to CI as a container job that stands nginx and the stub upstream up and tears them down.
- [ ] T045 Record in `proxy/README.md` what the proxy is and is not: plumbing, not a port; policy lives in the template and the configuration; the rendered file is a build artefact and is never edited (Constitution VI).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all four stories.
- **US1 (Phase 3)**: depends on Foundational. No dependency on other stories.
- **US2 (Phase 4)**: depends on Foundational; shares `test_request_matrix.py` with US1, so T018 and T019 follow T011.
- **US3 (Phase 5)**: depends on Foundational only. Independent of US1 and US2 — the
  scanner runs over an artefact and never touches the proxy.
- **US4 (Phase 6)**: depends on Foundational only, and on fixtures it creates itself.
  Independent of US1 to US3.
- **Polish (Phase 7)**: depends on the stories that are being delivered.

### External Dependencies

- T025, T035 and T036 need a bundle producer. Until feature 014 exists, the fixtures
  are generated by a throwaway script committed with the fixture and recorded in its
  README; the tests never depend on that script at run time.
- The measurement geometry in the fixtures comes from the run manifest defined by
  feature 004. The tests read only the fields they need and fail loudly on a missing
  field rather than defaulting.

### Within Each User Story

- Tests before implementation, and each test must fail before the implementation that
  satisfies it exists.
- Rules as data (T030) before the scanner that reads them (T031).
- Fixtures (T025, T026, T035, T036) before the tests that consume them.

### Parallel Opportunities

- T003 and T004 in Setup.
- T011, T012 and T013 in US1: separate matrix cases.
- T018, T019 and T020 in US2, after T011.
- T025 to T029 in US3: separate fixtures and separate test files.
- T035 to T039 in US4.
- US3 and US4 can be worked in parallel with US1 and US2 by different people: they
  share no file.

---

## Parallel Example: User Story 3

```bash
# Fixtures and their tests are independent files:
Task: "Create tests/leakage/fixtures/clean_bundle/ from a seeded fixture run"
Task: "Create tests/leakage/fixtures/leaky_bundle/ as a deliberate control"
Task: "Write tests/leakage/test_provenance.py"
Task: "Add the unanticipated-attribute case"
Task: "Add the unrecognised-format case"
```

---

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2: a proxy that renders, validates and refuses everything.
2. Phase 3: the released prefix answers and nothing else does.
3. Stop and validate: run the request matrix against a query layer holding withheld
   collections, and confirm from the upstream log that nothing unreleased arrived.

### Incremental delivery

Each story closes a distinct hole and can be demonstrated on its own: the boundary
(US1), the clearance and its ADR (US2), the provenance gate (US3), the update-shape
gate (US4). Nothing later weakens anything earlier.

### Notes

- Both leaky fixtures are deliberate controls. Each carries a README saying so, and the
  tests assert they are detected. A control that stops being detected is the signal
  that the gate has stopped working.
- The recovery statistic, both bounds, the identification radius and the quantisation
  step are configuration, not constants in test source.
- FR-021 is open. Until it is resolved, the template emits no protocol-upgrade location
  at all, which is the safe reading of default-deny.
