---

description: "Task list for 008-query-layer"
---

# Tasks: The Query Layer and the Coverage Store Convention

**Input**: Design documents from `/specs/008-query-layer/`

**Prerequisites**: `spec.md`, `plan.md`. Consumes the clock and configuration ports from
`001-deterministic-foundations`; the finding from `002-edr-trajectory-spike`; the environment
field and ground-truth manifest from `004-environment-generator`; the Compose configuration
from `005-compose-deployment`; the generator chain from `006-generated-types`; the
`observations` schema and its select-only role from `007-observation-path`.

**Tests**: Requested for this project. Test tasks are included and precede the implementation
they cover. Acceptance test AT-01 is delivered by this feature.

**Organisation**: Grouped by user story so each can be finished, tested and demonstrated on
its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an unfinished task.
- **[Story]**: The user story the task serves.

## Path Conventions

Repository root paths throughout, per the structure decision in `plan.md`. This feature writes
under `query/`, `stores/coverage/`, its own tests, and one service entry plus two configuration
files in the shared Compose and destination files.

---

## Phase 1: Setup

**Purpose**: The service's place in the stack and its pinned version.

- [ ] T001 Create `query/` with the pygeoapi configuration template, the `plugins/` package and `render_config.py`, and pin the pygeoapi version by exact release in the deployment image
- [ ] T002 [P] Create `stores/coverage/` with `layout.md`, `validate_layout.py` and an example run manifest
- [ ] T003 [P] Add `contracts/schemas/config.query.schema.json` covering coverage store root, database connection, public base URL, response limits and heartbeat interval, and add the corresponding files to `config/local/` and `config/droplet/`
- [ ] T004 Add the query layer service to `deploy/compose.yaml` under the appropriate profile with a health check, taking its configuration path from the destination environment file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The coverage store convention and the generated configuration. Every story rests
on one or both.

**Critical**: No user story work begins until this phase is complete.

- [ ] T005 Write `stores/coverage/layout.md` as the normative convention: a directory per run named for its deterministic run identifier, containing the forecast field, the uncertainty field and the run manifest, with the current run named by a pointer that can be replaced in one operation
- [ ] T006 Define the run manifest shape and author `contracts/schemas/run-manifest.schema.json` — run identifier, root seed, generator and model versions, simulation time of the run, forecast valid-time extent, ensemble configuration — obeying the schema conventions, and regenerate types
- [ ] T007 Specify deterministic run identifier derivation from root seed plus run sequence in `stores/coverage/layout.md`, with worked examples, so this feature and the publisher agree without sharing code
- [ ] T008 [P] Write `stores/coverage/validate_layout.py` checking a store against the convention: complete runs, exactly one current pointer, manifests that validate, no stray files
- [ ] T009 [P] Write `tests/unit/test_coverage_catalogue.py` fixtures covering a complete run, an incomplete run, two current pointers and an empty store
- [ ] T010 Implement `query/render_config.py` producing the pygeoapi configuration from the template and the destination configuration, with no literal host, port or path surviving into the rendered file
- [ ] T011 [P] Write `tests/unit/test_config_rendering.py` asserting that the rendered configuration contains no literal value that should have come from the destination configuration, and that a missing key fails rendering with the key named
- [ ] T012 Implement the query layer's heartbeat on `ctl/heartbeat`, carrying component identifier, simulation time and status

**Checkpoint**: The store has a normative shape and the service has an environment-agnostic
configuration.

---

## Phase 3: User Story 1 - A published run is readable over EDR as CoverageJSON (Priority: P1) 🎯 MVP

**Goal**: Position and cube queries over a run, returning valid CoverageJSON that agrees with
the generator's field.

**Independent Test**: Place a run in the store, start the query layer, query a position and a
cube, validate the responses and compare against the field.

### Tests for User Story 1

- [ ] T013 [P] [US1] Write `tests/integration/test_edr_position_cube.py` validating responses against the CoverageJSON specification for both query types
- [ ] T014 [P] [US1] Add a case comparing returned values against the generator's field at the same coordinates and reporting the difference as a figure against the declared interpolation tolerance
- [ ] T015 [P] [US1] Add cases for a point outside the domain and for a cube exceeding the size limit, asserting each is refused with the extent or the limit named

### Implementation for User Story 1

- [ ] T016 [US1] Implement `query/plugins/edr_coverage.py` as an EDR provider reading a run's NetCDF files, exposing forecast parameters and the uncertainty parameter together in one collection
- [ ] T017 [US1] Implement position query handling with linear interpolation in space and time, and document the boundary behaviour where a query falls on a grid node or between time steps
- [ ] T018 [US1] Implement cube query handling with the configured extent limit and a refusal that names the limit
- [ ] T019 [US1] Implement the no-time-parameter default as the current run's valid time taken from its manifest, never from a clock
- [ ] T020 [US1] Grant and verify the query layer's select-only database role, asserting that every write attempt fails
- [ ] T021 [US1] Write `query/README.md` describing the collections, the path space, the response limits, and why there is no freshness endpoint

**Checkpoint**: The coverage store is readable through a standard interface.

---

## Phase 4: User Story 2 - A bespoke EDR provider plugin serves trajectory queries (Priority: P2)

**Goal**: A trajectory provider written for this harness, honouring per-vertex timestamps, with
AT-01 passing against ground truth.

**Independent Test**: Submit a route crossing the seeded eddy at known times; compare each
vertex against the manifest; shift one vertex's time and see only that vertex change.

### Tests for User Story 2

- [ ] T022 [P] [US2] Write `tests/integration/test_edr_trajectory.py` asserting each vertex is answered for its own time
- [ ] T023 [P] [US2] Add a case asserting that changing one vertex's time changes that vertex's values and no other's
- [ ] T024 [P] [US2] Write `tests/unit/test_trajectory_validation.py` covering non-monotonic vertex times, out-of-extent vertices and an over-long vertex list, each refused with the specific cause named
- [ ] T025 [P] [US2] Write `tests/unit/test_wkt_m_ordinate.py` asserting that parsing a `LINESTRINGZM` yields finite M values at the pinned Shapely and GEOS versions, so a version regression fails loudly rather than losing per-vertex times in silence
- [ ] T026 [P] [US2] Write `tests/acceptance/test_at01_trajectory.py` scoring a four-dimensional route against the generator's ground-truth manifest and reporting the error rather than asserting recovery

### Implementation for User Story 2

- [ ] T027 [US2] Pin Shapely 2.1 or later built against GEOS 3.12 or later in the query layer's image and workspace, with a comment stating that below those versions the M ordinate is returned as NaN and per-vertex timestamps are lost silently before any provider code runs
- [ ] T028 [US2] Take the groundwork from `specs/002-edr-trajectory-spike/` — the proof that M survives parsing and the sampled four-dimensional route — and record the trajectory provider decision as an ADR under PR-03
- [ ] T029 [US2] Implement `query/plugins/edr_trajectory.py`: accept the geometry pygeoapi hands over, read the per-vertex M ordinate as the vertex time, and reject a geometry whose M values are absent or NaN with a message naming the version pin
- [ ] T030 [US2] Implement per-vertex sampling in the provider: for each vertex, interpolate the forecast and uncertainty parameters at that vertex's own position, depth and time
- [ ] T031 [US2] Assemble the response as a CoverageJSON Trajectory domain whose composite axis carries the per-vertex tuple of time, longitude, latitude and depth, and validate it against the specification in the test suite
- [ ] T032 [US2] Register the plugin as the trajectory-capable provider for the coverage collections, so position, cube and trajectory are served by one collection rather than by two that could disagree
- [ ] T033 [US2] Implement trajectory request validation: increasing time order, extent checks, vertex count limit, each refusal naming the offending vertex or the limit
- [ ] T034 [US2] Ensure no silent extrapolation: out-of-range vertices are declined explicitly in the response, with the declining documented in `query/README.md`
- [ ] T035 [US2] Record the measured interpolation error against ground truth in `query/README.md`, as a figure with the grid spacing beside it

**Checkpoint**: The client's centrepiece has an interface, and AT-01 is scored.

---

## Phase 5: User Story 3 - A new model run is servable without touching configuration (Priority: P3)

**Goal**: Publication needs no human in the middle.

**Independent Test**: Write a second run into the store while the query layer runs; the current
collection resolves to it, and the previous run remains addressable.

### Tests for User Story 3

- [ ] T036 [P] [US3] Write `tests/integration/test_new_run_servable.py` asserting a newly appearing run is served with no configuration edit and no manual restart
- [ ] T037 [P] [US3] Add a case asserting a partially written run is never served, and a case asserting a superseded run remains addressable by its own identifier
- [ ] T038 [P] [US3] Add a case asserting that two current pointers cause a refusal to resolve, with the conflict reported rather than one chosen
- [ ] T039 [P] [US3] Add a case asserting that replaying a scenario from its seed produces identical run identifiers

### Implementation for User Story 3

- [ ] T040 [US3] Implement `query/plugins/coverage_catalogue.py` resolving the run set from the store layout at request time, with no run enumerated in configuration
- [ ] T041 [US3] Implement completeness checking so only runs with forecast field, uncertainty field and a valid manifest are catalogued
- [ ] T042 [US3] Implement current-run resolution from the pointer, refusing to resolve on conflict and reporting it
- [ ] T043 [US3] Bound the catalogue's cost per request — cache with invalidation keyed on the store's own state, never on an interval measured by the host clock
- [ ] T044 [US3] Document in `query/README.md` and `stores/coverage/layout.md` the contract the publisher must honour for a run to become servable, in enough detail that the control loop feature needs no conversation about it

**Checkpoint**: The sense → decide → act → publish cycle can close without an operator.

---

## Phase 6: User Story 4 - Observations are readable over SensorThings (Priority: P4)

**Goal**: SensorThings Part 1 Sensing over the observation store, read-only, filtered on
simulation time.

**Independent Test**: Populate the observation store, walk the entity set, and reconcile
observation counts against the store.

### Tests for User Story 4

- [ ] T045 [P] [US4] Write `tests/integration/test_sensorthings.py` walking Things, Sensors, ObservedProperties, Datastreams and Observations and asserting navigation between them
- [ ] T046 [P] [US4] Add a case reconciling the observation count per datastream against the store
- [ ] T047 [P] [US4] Add a case asserting time filtering is on phenomenon time and that no arrival or insertion time is exposed or filterable
- [ ] T048 [P] [US4] Add a case asserting every write operation through the interface fails

### Implementation for User Story 4

- [ ] T049 [US4] Establish against the pinned pygeoapi version whether the SensorThings entity set can be served from the `observations` schema directly, by a harness-authored provider plugin, or only by a companion implementation; record the finding and, if it is the third, raise an ADR and add a Complexity Tracking entry to `plan.md`
- [ ] T050 [US4] Implement `query/plugins/sensorthings_provider.py` for the chosen mechanism, projecting the store's rows onto the entity set without a second definition of the observation shape
- [ ] T051 [US4] Implement entity navigation and the expansion the client needs, bounded by the configured response limits
- [ ] T052 [US4] Place the SensorThings collections under the same stable path prefix as the rest, so prefix-based default-deny remains viable, and document the resulting path space
- [ ] T053 [US4] Add SensorThings collection metadata that states plainly that the data is synthetic, and run the forbidden-vocabulary gate over it, since this text is public-facing

**Checkpoint**: Both stores are readable through standards, and nothing is readable any other
way.

---

## Phase 7: Polish

- [ ] T054 [P] Emit the query layer's OpenAPI specification reproducibly and hand it to the generated-types feature's refresh script, confirming the drift check passes over the result
- [ ] T055 [P] Write `docs/standards/edr-and-sensorthings.md` as the primer promised by PR-09, covering what each standard is for, what CoverageJSON is, and where this harness uses each
- [ ] T056 Run the full quality-gate set over this feature's files and fix what they report
- [ ] T057 Measure and record the response times for a position query and a hundred-vertex trajectory query on the droplet, and adjust the documented limits to what the droplet can actually serve

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies beyond the Compose configuration existing.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every story: the layout convention and
  the generated configuration are shared by all four.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP.
- **User Story 2 (Phase 4)**: Depends on User Story 1 for the coverage provider, and on the
  groundwork from `002-edr-trajectory-spike`. It is the largest single piece of work in the
  feature, because the trajectory provider is written here rather than configured.
- **User Story 3 (Phase 5)**: Depends on User Story 1. Independent of User Stories 2 and 4.
- **User Story 4 (Phase 6)**: Depends on Foundational and on `007-observation-path` having
  populated the store. Independent of User Stories 1 to 3, and can be worked alongside them.
- **Polish (Phase 7)**: Depends on the stories being delivered.

### External Dependencies

- `002-edr-trajectory-spike` proves that the M ordinate survives WKT parsing and samples one
  four-dimensional route. That narrow proof is what SRD §10 places second in the delivery order;
  the provider itself is built here.
- `004-environment-generator` supplies the field and the ground-truth manifest that AT-01
  scores against.
- `007-observation-path` supplies the `observations` schema and the select-only role.
- `009-control-loop` consumes `stores/coverage/layout.md` as the contract its publisher must
  honour, and this feature must not begin serving a layout the publisher cannot write.
- `006-generated-types` vendors this feature's emitted OpenAPI specification.
- `013-security-proxy` depends on this feature's path space being stable and predictable.

### Within Each User Story

Tests precede implementation and are expected to fail first. The layout convention precedes the
catalogue; the catalogue precedes the providers; measured figures precede the documentation
quoting them.

### Parallel Opportunities

- T002 and T003 touch different files and can proceed together.
- T008, T009 and T011 are independent of one another.
- Every test task marked `[P]` within a story can be written together before its
  implementation begins.
- User Story 4 is independent of the coverage stories and can be worked alongside them by
  someone else.

---

## Parallel Example: User Story 2

```bash
Task: "Write tests/integration/test_edr_trajectory.py per-vertex assertions"
Task: "Add the single-vertex-time-change case"
Task: "Write tests/unit/test_trajectory_validation.py refusal cases"
Task: "Write tests/unit/test_wkt_m_ordinate.py against the pinned Shapely and GEOS versions"
Task: "Write tests/acceptance/test_at01_trajectory.py against the ground-truth manifest"
```

---

## Implementation Strategy

### MVP first

Phases 1 to 3 give a coverage store with a normative layout and an EDR interface over it. That
is enough for the client to draw a forecast field and for the offload feature to know what it
is exporting.

### Incremental delivery

1. Setup and Foundational — the layout convention and the generated configuration.
2. User Story 1 — position and cube. Stop and validate against the generator's field.
3. User Story 2 — trajectory with per-vertex timestamps, and AT-01 scored.
4. User Story 3 — new runs servable without a configuration edit, which unblocks the control
   loop closing on its own.
5. User Story 4 — SensorThings, once its mechanism is established.

### Notes

- `[P]` marks different files with no unfinished dependency.
- Each task is sized to be one coherent commit.
- One task in this feature is permitted to change the plan: the SensorThings mechanism task may
  add the feature's only Complexity Tracking entry. It is a decision taken on evidence and is
  recorded as an ADR rather than settled quietly.
