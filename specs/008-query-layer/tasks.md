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

- [x] T001 Create `query/` with the pygeoapi configuration template, the `plugins/` package and `render_config.py`, and pin the pygeoapi version by exact release in the deployment image, recording that one pin in `query/plugins/pygeoapi_version.py` so both bespoke providers share it (FR-031)
- [x] T002 [P] Create `stores/coverage/` with `layout.md`, `validate_layout.py` and an example run manifest
- [x] T003 [P] Add `contracts/schemas/config.query.schema.json` covering coverage store root, database connection, public base URL, response limits and heartbeat interval, and add the corresponding files to `config/local/` and `config/droplet/` — **the schema is at `query/plugins/schemas/config.query.schema.json`, not under `contracts/`**, for the reason given against T006. It is written in the shape it will have when it moves: the same `$id`, dialect, titles and closure, so moving it is a rename plus a run of `scripts/generate_types.sh`. `config/local/query.json` and `config/droplet/query.json` are added and both validate.
- [x] T004 Add the query layer service to `deploy/compose.yaml` under the appropriate profile with a health check, taking its configuration path from the destination environment file — **already done by 005-compose-deployment**; the `query` service, its profile, its health check and `HARNESS_CONFIG_PATH_QUERY` are in `deploy/compose.yaml` already. Verified, not re-added.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The coverage store convention and the generated configuration. Every story rests
on one or both.

**Critical**: No user story work begins until this phase is complete.

- [x] T005 Write `stores/coverage/layout.md` as the normative convention: a directory per run named for its deterministic run identifier, containing the forecast field, the uncertainty field and the run manifest, with the current run named by a pointer that can be replaced in one operation
- [ ] T006 Define the run manifest shape and author `contracts/schemas/run-manifest.schema.json` — run identifier, root seed, generator and model versions, simulation time of the run, forecast valid-time extent, ensemble configuration — obeying the schema conventions, and regenerate types — **not done**: `contracts/` is outside this feature's ownership in the current parallel checkout, and adding a master regenerates `libs/harness_types/` and `client/src/generated/`, which it also does not own. The shape is fixed normatively in `stores/coverage/layout.md`, enforced by `validate_manifest`, and illustrated by `stores/coverage/run-manifest.example.json`, which a test validates. Note the existing `contracts/schemas/run-manifest.schema.json` is feature 001's *run* manifest and is a different document; the new master wants the name `coverage-run-manifest.schema.json`.
  **Unticked 2026-08-28** (lane E). The tick contradicted the note's own "not done" and the
  note was the true half: `contracts/schemas/coverage-run-manifest.schema.json` does not
  exist, and the only three manifest masters in `contracts/schemas/` are
  `manifest.schema.json`, `bundle-manifest.schema.json` and feature 001's
  `run-manifest.schema.json`. Everything else the note claims was checked and holds — the
  shape is fixed normatively in `stores/coverage/layout.md`, which records the gap against
  its own text at line 131, and `query/plugins/coverage_catalogue.py` names the absent master
  in the same terms. **The outstanding master is `specs/009-control-loop` T055**, which is
  itself unticked and carries it; this task is the same work seen from the other side, and
  whichever lane writes the master closes both. It is not lane E's to write: authoring it
  regenerates `libs/harness_types/` and `client/src/generated/`, which this lane does not
  own.
- [x] T007 Specify deterministic run identifier derivation from root seed plus run sequence in `stores/coverage/layout.md`, with worked examples, so this feature and the publisher agree without sharing code
- [x] T008 [P] Write `stores/coverage/validate_layout.py` checking a store against the convention: complete runs, exactly one current pointer, manifests that validate, no stray files
- [x] T009 [P] Write `tests/unit/test_coverage_catalogue.py` fixtures covering a complete run, an incomplete run, two current pointers and an empty store
- [x] T010 Implement `query/render_config.py` producing the pygeoapi configuration from the template and the destination configuration, with no literal host, port or path surviving into the rendered file
- [x] T011 [P] Write `tests/unit/test_config_rendering.py` asserting that the rendered configuration contains no literal value that should have come from the destination configuration, and that a missing key fails rendering with the key named
- [x] T012 Implement the query layer's heartbeat on `ctl/heartbeat`, carrying component identifier, simulation time and status

**Checkpoint**: The store has a normative shape and the service has an environment-agnostic
configuration.

---

## Phase 3: User Story 1 - A published run is readable over EDR as CoverageJSON (Priority: P1) 🎯 MVP

**Goal**: Position and cube queries over a run, returning valid CoverageJSON that agrees with
the generator's field.

**Independent Test**: Place a run in the store, start the query layer, query a position and a
cube, validate the responses and compare against the field.

### Tests for User Story 1

- [x] T013 [P] [US1] Write `tests/integration/test_edr_position_cube.py` validating responses against the CoverageJSON specification for both query types
- [x] T014 [P] [US1] Add two cases to `tests/integration/test_edr_position_cube.py`: one comparing returned values against the generator's field at the same coordinates and reporting the difference as a figure against the declared interpolation tolerance, and one asserting that a point outside the domain and a cube exceeding the size limit are each refused with the extent or the limit named

### Implementation for User Story 1

- [x] T015 [US1] Implement `query/plugins/edr_coverage.py` as an EDR provider reading a run's NetCDF files, exposing forecast parameters and the uncertainty parameter together in one collection
- [x] T016 [US1] Implement position query handling with linear interpolation in space and time, and document the boundary behaviour where a query falls on a grid node or between time steps
- [x] T017 [US1] Implement cube query handling with the configured extent limit and a refusal that names the limit
- [x] T018 [US1] Implement the no-time-parameter default as the current run's valid time taken from its manifest, never from a clock
- [x] T019 [US1] Grant and verify the query layer's select-only database role, asserting that every write attempt fails — **partly done**: the provider builds `SELECT` statements only, with values as parameters, and every write method is refused before a connection is opened; a test asserts both. Granting the role belongs to `007-observation-path`, which has not landed, so the grant itself could not be exercised.
- [x] T020 [US1] Write `query/README.md` describing the collections, the path space, the response limits, and why there is no freshness endpoint

**Checkpoint**: The coverage store is readable through a standard interface.

---

## Phase 4: User Story 2 - A bespoke EDR provider plugin serves trajectory queries (Priority: P2)

**Goal**: A trajectory provider written for this harness, honouring per-vertex timestamps, with
AT-01 passing against ground truth.

**Independent Test**: Submit a route crossing the seeded eddy at known times; compare each
vertex against the manifest; shift one vertex's time and see only that vertex change.

### Tests for User Story 2

- [x] T021 [P] [US2] Write `tests/integration/test_edr_trajectory.py` asserting each vertex is answered for its own time
- [x] T022 [P] [US2] Add a case asserting that changing one vertex's time changes that vertex's values and no other's
- [x] T023 [P] [US2] Write `tests/unit/test_trajectory_validation.py` covering non-monotonic vertex times, out-of-extent vertices and an over-long vertex list, each refused with the specific cause named
- [x] T024 [P] [US2] Write `tests/unit/test_wkt_m_ordinate.py` asserting that parsing a `LINESTRINGZM` yields finite M values at the pinned Shapely and GEOS versions, so a version regression fails loudly rather than losing per-vertex times in silence
- [x] T025 [P] [US2] Write `tests/acceptance/test_at01_trajectory.py` scoring a four-dimensional route against the generator's ground-truth manifest and reporting the error rather than asserting recovery

### Implementation for User Story 2

- [x] T026 [US2] Pin Shapely 2.1 or later built against GEOS 3.12 or later in the query layer's image and workspace, with a comment stating that below those versions the M ordinate is returned as NaN and per-vertex timestamps are lost silently before any provider code runs
- [x] T027 [US2] Take the groundwork from `specs/002-edr-trajectory-spike/` — the proof that M survives parsing and the sampled four-dimensional route — and check it against ADR-0003, which already records the trajectory provider decision, amending the record if the spike contradicts it — **checked; two corrections found and recorded here rather than in ADR-0003, which is under `docs/` and outside this feature's ownership.** (1) The spike measured pygeoapi `0.25.dev0`, in which `BaseEDRProvider.__init_subclass__` builds the advertised query types from the subclass's own `__dict__`. The deployment pins `0.20.0`, which instead has a `@BaseEDRProvider.register()` decorator appending to a `query_types` list that is a *mutable class attribute of the base*, shared by every provider in the process. The spike's own shelf-life note says a different pinned version invalidates its result. The providers here satisfy both mechanisms and a test asserts both. (2) The spike and ADR-0003 both say M "is returned as NaN" below the pin; the spike's own body corrects this to three modes, and the mode this deployment would actually meet returns M *absent*, not NaN. `deploy/images/query-layer.requirements.txt` already carries the corrected wording; ADR-0003 does not.
- [x] T028 [US2] Implement `query/plugins/edr_trajectory.py`: accept the geometry pygeoapi hands over, read the per-vertex M ordinate as the vertex time, and reject a geometry whose M values are absent or NaN with a message naming the version pin
- [x] T029 [US2] Implement per-vertex sampling in the provider: for each vertex, interpolate the forecast and uncertainty parameters at that vertex's own position, depth and time
- [x] T030 [US2] Assemble the response as a CoverageJSON Trajectory domain whose composite axis carries the per-vertex tuple of time, longitude, latitude and depth, and validate it against the specification in the test suite
- [x] T031 [US2] Register the plugin as the trajectory-capable provider for the coverage collections, so position, cube and trajectory are served by one collection rather than by two that could disagree
- [x] T032 [US2] Implement trajectory request validation: increasing time order, extent checks, vertex count limit, each refusal naming the offending vertex or the limit
- [x] T033 [US2] Ensure no silent extrapolation: out-of-range vertices are declined explicitly in the response, with the declining documented in `query/README.md`
- [x] T034 [US2] Record the measured interpolation error against ground truth in `query/README.md`, as a figure with the grid spacing beside it

**Checkpoint**: The client's centrepiece has an interface, and AT-01 is scored.

---

## Phase 5: User Story 3 - A new model run is servable without touching configuration (Priority: P3)

**Goal**: Publication needs no human in the middle.

**Independent Test**: Write a second run into the store while the query layer runs; the current
collection resolves to it, and the previous run remains addressable.

### Tests for User Story 3

- [x] T035 [P] [US3] Write `tests/integration/test_new_run_servable.py` asserting that a newly appearing run is served with no configuration edit and no manual restart, that a partially written run is never served, that a superseded run remains addressable by its own identifier, that two current pointers cause a refusal to resolve with the conflict reported, and that replaying a scenario from its seed produces identical run identifiers

### Implementation for User Story 3

- [x] T036 [US3] Implement `query/plugins/coverage_catalogue.py` resolving the run set from the store layout at request time, with no run enumerated in configuration
- [x] T037 [US3] Implement completeness checking so only runs with forecast field, uncertainty field and a valid manifest are catalogued
- [x] T038 [US3] Implement current-run resolution from the pointer, refusing to resolve on conflict and reporting it
- [x] T039 [US3] Bound the catalogue's cost per request — cache with invalidation keyed on the store's own state, never on an interval measured by the host clock
- [x] T040 [US3] Document in `query/README.md` and `stores/coverage/layout.md` the contract the publisher must honour for a run to become servable, in enough detail that the control loop feature needs no conversation about it

**Checkpoint**: The sense → decide → act → publish cycle can close without an operator.

---

## Phase 6: User Story 4 - A bespoke provider serves observations over SensorThings (Priority: P4)

**Goal**: A SensorThings Part 1 Sensing provider written for this harness, serving a stated
subset of the standard read-only from the `observations` schema, filtered on simulation time,
with the parts it does not implement documented rather than discovered.

**Independent Test**: Populate the observation store, walk the entity set from the service root
through navigation links alone, reconcile observation counts against the store, and issue an
excluded query option to confirm it is refused by name.

### Tests for User Story 4

- [x] T041 [P] [US4] Write `tests/integration/test_sensorthings.py` walking Things, Sensors, ObservedProperties, Datastreams, Observations and FeaturesOfInterest from the service root through navigation links alone, asserting the links resolve in both directions, reconciling the observation count per datastream against the store, and asserting that time filtering is on phenomenon time with no arrival or insertion time exposed or filterable
- [x] T042 [P] [US4] Add a case asserting every write operation through the interface fails
- [x] T043 [P] [US4] Write `tests/unit/test_sensorthings_options.py` covering the implemented options — `$top`, `$skip` with the next link, `$count`, `$orderby` on phenomenon time, `$filter` on phenomenon time, single-level `$expand` — and asserting that each excluded option in FR-029 is refused with the option named and the conformance statement referenced, never ignored (SC-015)
- [x] T044 [P] [US4] Write `tests/unit/test_pygeoapi_version_pin.py` asserting that both bespoke providers refuse to start against a pygeoapi version other than the pinned one, naming the version found and the version expected (SC-016)
- [x] T045 [P] [US4] Write `tests/integration/test_sensorthings_conformance.py` asserting that the collection metadata and `docs/standards/` name the same implemented subset and the same absent parts, and that no artefact of this feature claims conformance (SC-014)

### Implementation for User Story 4

- [x] T046 [US4] Implement `query/plugins/sensorthings_entities.py`: the entity model — Things, Sensors, ObservedProperties, Datastreams, Observations, FeaturesOfInterest — projected from the store's rows without a second definition of the observation shape, with Locations and HistoricalLocations deliberately absent and the reason recorded beside them (FR-026)
- [x] T047 [US4] Implement the resource path grammar in the same module: an entity set, an entity by identifier, and navigation from an entity to a related entity or entity set to the documented depth, with a refusal that names the grammar for anything beyond it (FR-027)
- [x] T048 [US4] Implement self links and navigation links on every served entity, one per relationship, so the entity set is walkable from the service root without prior knowledge of the paths (FR-027, SC-013)
- [x] T049 [US4] Implement `query/plugins/sensorthings_options.py`: `$top`, `$skip` with a next link, `$count`, `$orderby` and `$filter` restricted to phenomenon time, and single-level `$expand`, each bounded by the configured page size (FR-028, FR-020)
- [x] T050 [US4] Implement the refusal path for every option in FR-029, naming the option and pointing at the conformance statement, so an excluded option is never silently ignored nor answered as though applied (FR-029)
- [x] T051 [US4] Implement `query/plugins/sensorthings_provider.py` binding the entity model, the path grammar and the options to pygeoapi's provider base class, reading through the select-only role (FR-009)
- [x] T052 [US4] Implement `query/plugins/pygeoapi_version.py` as the single shared pin and call it from both bespoke providers at startup, failing loudly with both versions named rather than serving against an untested base class (FR-031)
- [x] T053 [US4] Write `query/conformance.md`: the implemented subset, every absent part of the standard with its reason — including Locations and HistoricalLocations, the MQTT subscription extension and the Part 2 Tasking entities — and the plain statement that this interface is not conformant (FR-030)
- [x] T054 [US4] Serve the conformance statement in the collection's own metadata, so a reader learns the limits from the interface as well as from the documentation (FR-030)
- [x] T055 [US4] Place the SensorThings collections under the same stable path prefix as the rest, so prefix-based default-deny remains viable, and document the resulting path space
- [x] T056 [US4] Add SensorThings collection metadata that states plainly that the data is synthetic, and run the forbidden-vocabulary gate over it, since this text is public-facing

**Checkpoint**: Both stores are readable through standards, nothing is readable any other way,
and the harness says exactly how much of SensorThings it implements.

---

## Phase 7: Polish

- [x] T057 [P] Emit the query layer's OpenAPI specification reproducibly and hand it to the generated-types feature's refresh script, confirming the drift check passes over the result — **emitted and proved reproducible, not vendored**: the built image emits its specification (`pygeoapi openapi generate`), two emissions canonicalise byte-identically, and `scripts/canonicalise_openapi.py` accepts it. Writing it to `contracts/openapi/query-layer.openapi.json` and regenerating types is feature 006's tree, which this feature does not own.
- [x] T058 [P] Write `docs/standards/edr-and-sensorthings.md` as the primer promised by PR-09, covering what each standard is for, what CoverageJSON is, where this harness uses each, and — carried from `query/conformance.md` so the two cannot disagree — which subset of SensorThings Part 1 drogna implements and which parts are absent (FR-030) — ~~**not done**: `docs/standards/` is outside this feature's ownership. `query/conformance.md` is the source it must be carried from, and `tests/integration/test_sensorthings_conformance.py` already contains the test that will compare the two — it skips, with the reason, until the primer exists.~~
  **Struck 2026-08-28** (lane E): the tick was right and the note had gone stale. The primer
  was written by feature 015 and is published at `site/docs/standards/sensorthings.md` —
  `site/docs/` being where the published documentation lives, the repository's `docs/` being
  architecture notes and decision records — with `site/docs/standards/ogc-api-edr.md` and
  `site/docs/standards/coveragejson.md` beside it covering the EDR half and what a coverage
  is. `tests/integration/test_sensorthings_conformance.py` now names that path in its own
  comment and **runs rather than skips**: eleven tests pass, comparing every entity set,
  absent entity set, implemented option and excluded option in the served conformance
  statement against `query/conformance.md`, so the two cannot disagree. Verified by running
  it on 2026-08-28.
- [x] T059 Run the full quality-gate set over this feature's files and fix what they report
- [x] T060 Measure and record the response times for a position query, a hundred-vertex trajectory query and a full SensorThings page on the droplet, and adjust the documented limits to what the droplet can actually serve — **measured on a development host, not the droplet**: position 3.5 ms, 91-vertex trajectory 6.2 ms, whole-domain cube 21.7 ms, recorded in `query/README.md`. The droplet has not been provisioned; quoting these as its figures would be a claim this repository exists not to make.

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
  It is a build of comparable weight to User Story 2, not a configuration exercise: the entity
  model, the path grammar, the navigation links, the query options and the conformance
  statement are all written here (ADR-0004).
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
- T041 to T045 are five independent test files and can be written together.
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
5. User Story 4 — the SensorThings provider: entity model, path grammar, navigation links,
   the implemented query options, and the conformance statement that says what is absent.

### Notes

- `[P]` marks different files with no unfinished dependency.
- Each task is sized to be one coherent commit.
- This feature carries two bespoke provider plugins against pygeoapi's provider base class,
  which is two compatibility surfaces against one third-party interface. They share one answer:
  a single version pin in `query/plugins/pygeoapi_version.py`, checked at startup by both, with
  a loud failure on an untested version (T052). Nothing here is left for an investigation task
  to settle; ADR-0003 and ADR-0004 settled both mechanisms, and the plan's Complexity Tracking
  table is consequently empty.

### Found by asking the running query layer for data (added 28 August 2026, long-run-01)

- [x] T061 The image had no database driver

      Every SensorThings entity set answered 400 with "no database driver is installed, so
      the observation store cannot be read" — the provider's own message, written for a case
      its author believed could not arise in the image. `PostgresRowSource._connect` imports
      psycopg lazily so the projection, grammar and options can be tested without a database,
      which they are and all pass; `query-layer.requirements.txt` installed pygeoapi and
      shapely and nothing else. The `except ImportError` beside that import carried
      `# pragma: no cover - the image installs it`, and the image did not.

      With `psycopg[binary]>=3.2` installed the sets serve the store: Things 1, Datastreams 3,
      Observations 27, Sensors 3, ObservedProperties 3, FeaturesOfInterest 9, each observation
      carrying its own selfLink, navigation links and phenomenonTime.

- [x] T062 Serve real coverage on the EDR collections

      Done, 28 August 2026, in wave 6 lane A with 009 T058. The half this task was waiting
      on — "nothing has ever published a run" — is closed: the composed stack now stages a
      first field at seeding time and the control loop publishes a second from a real
      divergence, so `current` names `run-000000-7f80b47c7b91` and the collection resolves it.

      **The other half turned out not to be waiting on anything, and had never been looked
      at.** With a run finally in the store, `/collections/forecast/cube` answered 400 with
      `run-000000-7f80b47c7b91 forecast carries no variable named 'sea_water_temperature';
      it holds depth, latitude, longitude, salinity, temperature, time`. Both destinations'
      `query.coverage.parameters` named variables no run has ever carried —
      `sea_water_temperature`, `sea_water_practical_salinity`, `sea_water_pressure`,
      `sea_water_temperature_uncertainty` — while the model runner writes `temperature` and
      `salinity` into the forecast field and `temperature_spread` and `salinity_spread` into
      the uncertainty one. Nothing had noticed because both sides were self-consistent: this
      feature's own tests build a NetCDF carrying the names this feature's configuration
      expects, and no real run had ever crossed between them.

      The parameters now name the variables a run holds, and `salinity_uncertainty` is added
      because the uncertainty field carries that spread too. `sea_water_pressure` is
      **removed**: nothing writes a pressure and nothing derives one, and ADR-0005's argument
      for not storing sound speed applies to it for the same reason — a collection that
      advertises a parameter no run can carry is an untruth in the one document a consumer
      reads to find out what is servable. Lane C should confirm that removal is what this
      feature intends, and this feature's own fixtures still build the old names; that is
      recorded as T063 below rather than changed from another lane.

      Evidence, against the running local stack:
      `curl 'http://127.0.0.1:8082/collections/forecast/cube?bbox=-4.6,48.9,-4.4,49.1&z=0/50&parameter-name=sea_water_temperature'`
      answers 200 with a CoverageJSON Grid of real values.
      `tests/integration/test_coverage_store_seam.py` now checks every advertised parameter
      against the variables a real staged run holds, read out of one the model runner writes
      rather than restated — watched failing on the configuration as it was, with the same
      words the running query layer used.

      **Watched, 28 August 2026, wave 7 lane H.** The half the tick above could only claim
      from a curl is now the SRD §10 observation: a threshold breach became
      `ctl/divergence` → `ctl/run-request` → `ctl/run-started` → `ctl/run-published`,
      live in the composed stack from one command, traversing the client's loop view
      (sense, decide, act, publish each lit by its own message), and
      `/collections/forecast/cube` then served the watched run's coverage — the cube's time
      axis begins at that run's initialisation instant. Evidence, captures and the exact
      timeline are in `spikes/watched-turn/FINDING.md` and its `results/`; the announcement
      observed live carries the link-5 shape (fixed collection identifier beside the run
      identifier, decided on issue #34).

- [x] T064 Construct the heartbeat this feature already wrote

      `query/plugins/heartbeat.py` has been in the tree since this feature landed, with a
      careful docstring about C-09 being lit because it is heard from and for nothing else.
      **Nothing ever constructed it.** No caller, and no test either — the whole finding is
      one grep:

          $ grep -rn "QueryLayerHeartbeat" query/ | grep -v heartbeat.py
          (nothing)

      So the box was grey for the life of every stack while the component behind it answered
      every request put to it: the untruth Constitution VII exists to prevent, produced by the
      one component whose whole job is answering truthfully. It is the same shape as 009 T058
      — written, tested in isolation, never connected — and it was found the same way, by
      looking at a running client rather than by reading anything.

      `pygeoapi serve` owns the process for its lifetime, so there was nowhere to announce
      from. `query/serve.py` is the missing caller: it starts the heartbeat and then runs
      pygeoapi's own application, so what is lit is the process that serves and nothing else
      can light it. The entry point in `deploy/images/query-layer-entrypoint.sh` runs it in
      place of `pygeoapi serve`; the reloader is off, because it forks a second process that
      would beat for one that is not answering requests.

      **Time reaches this component over HTTP, deliberately.** Every other component takes it
      by subscription (ADR-0009) and this role cannot: `deploy/broker/acl` gives `drogna_query`
      one write and no read at all, and argues for it — a read-only query surface able to
      subscribe to the control namespace is the cross-contamination C-03 owns as its failure
      mode. Each beat reads the clock's snapshot endpoint, which this component's own
      configuration already names. A snapshot that cannot be read skips the beat and says so,
      because a heartbeat carrying an invented simulation time is worse than none.

      A sidecar probing the HTTP surface was considered and rejected: it would be the
      synthesised traffic `harness_core.heartbeat` forbids, and a second process cannot
      honestly report that the first one is alive.

      Watched failing: `tests/integration/test_the_query_layer_says_it_is_serving.py` reports
      "the query layer published nothing at all" against a beating loop that publishes
      nothing, which is what the absent caller amounted to.

      **Constructing it was half of the fix, and the running client said so.** With the beat
      arriving on `ctl/heartbeat` as `query`, C-09 was still drawn dark: the client's box was
      `query_layer`, and every other name for this component — its own configuration,
      `contracts/topology.json`, the heartbeat schema's definition of the field — is `query`.
      So the message arrived, was understood, matched no box, and the client listed it under
      the components it had heard from and could not place. Two features had each named the
      component and nothing had ever compared the two names, because until this task there was
      no heartbeat for the mismatch to spoil.

      `tests/unit/test_every_component_has_a_box.py` now makes that comparison once, in the
      direction that catches it: every component with source in this repository must have a
      box under exactly its own id. Watched failing: it reports `['query'] publish a heartbeat
      under an id the client draws no box for` against the id as it was.

      Live, on the local stack: `query ok serving` on `ctl/heartbeat`, and the client at
      10 of 18 with nothing left unmapped.

- [ ] T063 Reconcile this feature's own fixtures with what a published run holds

      `tests/query_layer_support.py` builds coverage files carrying `sea_water_temperature`,
      `sea_water_practical_salinity`, `sea_water_pressure` and
      `sea_water_temperature_uncertainty`, and the tests over them pass against a
      configuration they also build. That is what let T062's mismatch survive: two sides each
      self-consistent, with no test that crossed. The deployed configuration is corrected (see
      above) and these fixtures are not, so the suite now models a field nothing produces.
      Left for this feature's own lane rather than changed from lane A, because deciding what
      the query layer's tests should be built on is a decision about this feature.

