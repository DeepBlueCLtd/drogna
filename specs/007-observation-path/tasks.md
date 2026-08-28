---

description: "Task list for 007-observation-path"
---

# Tasks: The Observation Path

**Input**: Design documents from `/specs/007-observation-path/`

**Prerequisites**: `spec.md`, `plan.md`. Consumes the clock port, the RNG port, the
configuration loader and the manifest from `001-deterministic-foundations`; the environment
field and its ground-truth manifest from `004-environment-generator`; the Compose
configuration and destination directories from `005-compose-deployment`; the generator chain
from `006-generated-types`.

**Tests**: Requested for this project. Test tasks are included and precede the implementation
they cover.

**Organisation**: Grouped by user story so each can be finished, tested and demonstrated on
its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an unfinished task.
- **[Story]**: The user story the task serves.

## Path Conventions

Repository root paths throughout, per the structure decision in `plan.md`. This feature writes
under `services/sensors/`, `services/ingest/`, `stores/observations/`, `stores/features/`,
`deploy/broker/`, `contracts/schemas/observation.schema.json`, its own integration tests, and
one service entry plus two configuration files per component in the shared Compose and
destination files.

---

## Phase 1: Setup

**Purpose**: Package skeletons and their place in the workspace.

- [x] T001 Create `services/sensors/` as the `harness_sensors` package in the `uv` workspace, with its `tests/` directory and a `main.py` that loads and validates configuration and does nothing else
- [x] T002 [P] Create `services/ingest/` as the `harness_ingest` package in the same shape
- [x] T003 [P] Create `stores/observations/` and `stores/features/` with their `migrations/`, `roles.sql` and `README.md` stubs
- [x] T004 [P] Create `deploy/broker/` with `mosquitto.conf` taking its listener, persistence path and credential file from the destination environment file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The message definition, the data model and the roles. Every story rests on these.

**Critical**: No user story work begins until this phase is complete.

- [x] T005 Author `contracts/schemas/observation.schema.json`: SensorThings vocabulary for one observation — thing, datastream, observed property, sensor, feature of interest, phenomenon time as a simulation-clock instant, result, location, depth — forbidding unknown properties, carrying a title, a description and at least one example, and obeying the identifier convention. The observed property is an enumeration of exactly temperature, salinity and pressure, with a comment naming ADR-0005 as the reason sound speed is absent
- [x] T006 Run `scripts/generate_types.sh` and commit the generated Python and TypeScript observation types, confirming the drift check passes
- [x] T007 Write the first migration in `stores/observations/migrations/` creating the `observations` schema and its observation table, keyed by the deterministic observation identifier, with a PostGIS geography point, a depth, a phenomenon time column that has no default, and an index on phenomenon time, carrying a comment block stating that no column may take a `now()` or `current_timestamp` default and why
- [x] T008 [P] Write `stores/observations/roles.sql` granting insert to the ingest role alone and select to the query layer and telemetry roles, and `stores/features/roles.sql` granting select only to every run-time role with write permission held solely by the provisioning role
- [x] T009 Write `scripts/`-invoked migration application into the store's tooling so a fresh instance and a migrated one agree, and wire it into the seeding path owned by the Compose feature
  **Done** 2026-08-28 (long-run-01). `deploy/seed.d/010-observations.sh`. `apply.py` composes the SQL and connects to nothing, so the composing runs on the host — it imports only `hashlib`, `pathlib`, `sys` and `collections.abc`, which is what keeps `deploy/README.md`'s promise that a destination needs a bare interpreter — and the applying runs inside the database container. Watched converging over two runs, and watched refusing: a line appended to an already-applied migration produced "migration 0001_observations.sql was applied from different content", the step failed, and no seeding record was written.
- [x] T010 Add the configuration schemas `contracts/schemas/config.sensors.schema.json` and `contracts/schemas/config.ingest.schema.json` covering broker endpoint and credentials, sampling rate, noise parameters, batch bounds, queue bound, heartbeat interval and rejection-retention bound, and add the corresponding files to `config/local/` and `config/droplet/`

**Checkpoint**: The message has one definition, the store has a shape, and the roles exist.

---

## Phase 3: User Story 1 - Observations reach the store, end to end (Priority: P1) 🎯 MVP

**Goal**: Sensors publish, ingest writes, and what is stored is what was published.

**Independent Test**: Run a fixed-length scenario; compare stored count against published
count and stored values against the generator's field.

### Tests for User Story 1

- [x] T011 [P] [US1] Write `tests/integration/test_observation_path.py` asserting one stored row per published message with no duplicates and no losses over a fixed run
- [x] T012 [P] [US1] Add two cases to `tests/integration/test_observation_path.py`: one sampling the generated field at stored observations' own coordinates and simulation times and reporting the difference as a figure against the declared noise model, and one asserting that two runs from the same root seed produce identical stores including identifiers
- [x] T013 [P] [US1] Write unit tests in `services/sensors/tests/` for the deterministic identifier derivation and for noise drawn from the RNG port

### Implementation for User Story 1

- [x] T014 [US1] Implement `services/sensors/harness_sensors/sensor.py`: sample the environment at a given position and simulation time, apply seeded noise from `rng_for(stream)`, and emit an observation of the generated type
- [x] T015 [US1] Implement deterministic observation identifiers derived from root seed plus thing, datastream and sequence, with no entropy and no database sequence
- [x] T016 [US1] Implement `services/sensors/harness_sensors/publisher.py` as a thin wrapper over the broker client, publishing on `obs/<thing-id>/<datastream-id>` with the endpoint and credentials from configuration
- [x] T017 [US1] Implement `services/sensors/harness_sensors/main.py`: configuration load and validation before any I/O, clock port for every time value, bounded reconnection backoff driven by the simulation clock
- [x] T018 [US1] Implement `services/ingest/harness_ingest/subscriber.py` subscribing to `obs/#` with an acknowledgement policy that defers acknowledgement until the batch is written
- [x] T019 [US1] Implement `services/ingest/harness_ingest/batcher.py` with bounds on message count and on simulation-time interval, taking both from configuration
- [x] T020 [US1] Implement `services/ingest/harness_ingest/writer.py` writing one batch per transaction, with redelivery of an already-stored identifier as a no-op
- [x] T021 [US1] Implement heartbeat publication on `ctl/heartbeat` for both services, carrying component identifier, simulation time and status, at the interval from configuration
- [x] T022 [US1] Add both services to `deploy/compose.yaml` under the appropriate profile, with health checks, and their configuration files to both destination directories
- [x] T023 [US1] Write `stores/observations/README.md` describing the data model and stating plainly which fields exist and why none of them constitutes an entity, a contact or a track

**Checkpoint**: A scenario produces a store whose contents can be scored against ground truth.

---

## Phase 4: User Story 2 - Flows cannot contaminate one another (Priority: P2)

**Goal**: The broker enforces the namespace split, and physical separation is a configuration
change.

**Independent Test**: Attempt forbidden publishes and subscriptions from sensor credentials;
bring the system up on two brokers with no source change.

### Tests for User Story 2

- [x] T024 [P] [US2] Write `tests/integration/test_topic_isolation.py` asserting that sensor credentials cannot publish outside `obs/` and cannot subscribe to `ctl/#`, and that the ingest client may subscribe to `obs/#` and publish on `ctl/heartbeat` and `ctl/telemetry` and nothing else
- [x] T025 [P] [US2] Add two cases: one enumerating the topics in use during a run and asserting they match the naming convention exactly, and one asserting that a control-shaped message published on an `obs/` topic is rejected by the ingest client as failing the observation schema

### Implementation for User Story 2

- [x] T026 [US2] Write `deploy/broker/acl` with per-role rules: the sensor role publishes under `obs/` only, the ingest role subscribes to `obs/#` and publishes on the declared `ctl/` topics, control consumers subscribe to `ctl/#`
- [x] T027 [US2] Produce broker credentials from the deployment template at deploy time, per role rather than per client, with no credential value in any tracked file
  **Done**, reconciled 2026-08-28 (long-run-01). `deploy/env.template` declares five empty secrets, one per ACL role (`SENSOR`, `INGEST`, `CONTROL`, `VIEWER`, `QUERY`) — per role, not per client. `deploy/lib/render_credentials.py` fills them and invokes `mosquitto_passwd`; `deploy/broker/passwd` and `deploy/broker/**/passwd` are both gitignored, and no tracked file carries a value (the only tracked occurrences are names in `env.template` and fixed test constants). Watched working end to end this session: the broker log reads `New client connected ... as clock (p5, c1, k30, u'drogna_control')`.
- [ ] T028 [US2] Record refused attempts in the broker's log and surface a count on `ctl/telemetry`, so a misconfigured component is visible rather than merely failing
- [x] T029 [US2] Write `deploy/broker/two-broker/` as the documented physical-separation fallback — a second broker service and the destination configuration values that point control traffic at it — then demonstrate it once and record the diff in `deploy/broker/README.md`, showing that it touches configuration values only and no source file

**Checkpoint**: The failure mode the SRD assigns to the broker is prevented and demonstrated.

---

## Phase 5: User Story 3 - Nothing invalid reaches the store (Priority: P3)

**Goal**: Validation before writing, rejections retained and counted, and one writer only.

**Independent Test**: Publish a malformed and a well-formed message in one batch; confirm the
outcome and confirm no other role can insert.

### Tests for User Story 3

- [x] T030 [P] [US3] Write tests in `services/ingest/tests/` covering validation: a violating message is rejected with a reason, and a mixed batch stores the valid messages only
- [x] T031 [P] [US3] Write integration cases asserting that every database role other than the ingest role is refused on insert into the `observations` schema, that the rejection count appears on `ctl/telemetry`, and that retained rejections are bounded

### Implementation for User Story 3

- [x] T032 [US3] Implement `services/ingest/harness_ingest/validation.py` validating each message against the generated observation type before it enters the batch, with a mixed batch storing its valid messages rather than being abandoned wholesale
- [x] T033 [US3] Implement bounded rejection retention with the reason for each rejection, and report when the bound is reached rather than silently discarding
- [x] T034 [US3] Apply `stores/observations/roles.sql` in the provisioning path and assert the grants after application, so a drifted grant fails the run rather than being discovered later

**Checkpoint**: The single ingestion seam is a seam that cannot be walked around.

---

## Phase 6: User Story 4 - Backpressure is bounded and visible, never silent (Priority: P4)

**Goal**: The queue has a limit, reaching it costs latency and not data, and the condition is
reported.

**Independent Test**: Drive a burst at five times the sustainable rate; watch the bound hold,
the indicator appear, the backlog drain and the counts reconcile.

### Tests for User Story 4

- [x] T035 [P] [US4] Write `tests/integration/test_backpressure.py` driving a burst and asserting the queue never exceeds its bound, that no observation is lost once the burst ends, that the indicator appears on `ctl/telemetry` within one telemetry interval and clears afterwards, and that any broker-side loss is counted and reported

### Implementation for User Story 4

- [x] T036 [US4] Implement `services/ingest/harness_ingest/backpressure.py`: a bounded queue that stops taking messages from the broker at its limit rather than discarding or growing
- [x] T037 [US4] Publish queue depth, write rate, rejection count and broker-side loss on `ctl/telemetry` at the configured interval
- [x] T038 [US4] Handle store unavailability with a full batch: retain, do not acknowledge, write on return, and prove no loss and no double write
- [x] T039 [US4] Document the observed sustainable rate, the queue bound and the burst behaviour in `services/ingest/README.md`, with the measured figures rather than estimates

**Checkpoint**: The failure mode the SRD assigns to the ingest client is bounded and visible.

---

## Phase 7: User Story 5 - The feature store is provisioned by script and read-only during a run (Priority: P5)

**Goal**: Static spatial reference exists before the run and cannot change during it.

**Independent Test**: Provision into an empty instance, compare digests, then attempt writes
as every run-time role.

### Tests for User Story 5

- [x] T040 [P] [US5] Write `tests/integration/test_feature_store_readonly.py` asserting every run-time role is refused on insert, update and delete in the `features` schema, that provisioning twice with the same root seed yields identical content digests, and that `observations` and `features` are two schemas in one instance

### Implementation for User Story 5

- [x] T041 [US5] Implement `stores/features/provision.py` producing synthetic bathymetry and coastlines for the seeded environment's domain from the root seed, with no host-clock and no unseeded randomness
- [x] T042 [US5] Write the `features` schema migration with PostGIS geometry columns and the indexes the query layer and client will need
- [x] T043 [US5] Wire provisioning into the seeding path so it runs at scenario start, contributes its digests to the seeding record, and applies `stores/features/roles.sql` afterwards
  **Done** 2026-08-28 (long-run-01). `deploy/seed.d/020-features.sh` invoking the C-07 one-shot, which is `services/features` — built this session, because the compose file had declared it since 005 and nothing had ever built it. It could not be a host-side step like its sibling: `provision.py` needs `harness_core`, and the destination is promised a bare interpreter. The store definitions are bind-mounted rather than copied into the image, so ten services that never provision do not carry provisioning code. The digest report goes to standard output and everything else to standard error, so `scripts/seed.sh` digests the report into the seeding record. 651 bathymetry rows and one coastline; two consecutive runs give identical digests rather than 1,302 rows. Watched refusing an unmounted definitions directory, and `mount_lint` watched refusing an undeclared one.
- [x] T044 [US5] Write `stores/features/README.md` stating that the content is synthetic, represents no real place, and is the harness analogue of pre-sail loading

**Checkpoint**: FR-12 and FR-13 are both satisfied and both testable.

---

## Phase 8: Polish

- [ ] T045 [P] Write `docs/architecture/observation-path.md` describing the path end to end, the two failure modes and how each is bounded
- [x] T046 [P] Add a case to the schema tests asserting that an observation carrying a sound-speed observed property is rejected, and that the enumeration is exactly temperature, salinity and pressure, so a fourth datastream cannot arrive without amending ADR-0005 (FR-023, FR-024, SC-012)
- [x] T047 Run the full quality-gate set over this feature's files — lint, format, wall-clock gate, seeded-RNG gate, drift check, literal-path gate, forbidden-vocabulary gate — and fix what they report
- [x] T048 Walk the edge cases in `spec.md` deliberately: broker absent at start, store absent mid-batch, duplicate delivery, out-of-order arrival, process death mid-batch; confirm each behaves as specified and record what was learned

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies beyond the workspace existing.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every story: the message schema, the
  data model and the roles are shared by all five.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP.
- **User Story 2 (Phase 4)**: Depends on User Story 1 for traffic to isolate. Its access
  control lists constrain the credentials User Story 1 uses, so the two are best taken in
  order rather than together.
- **User Story 3 (Phase 5)**: Depends on User Story 1. Independent of User Stories 2, 4 and 5.
- **User Story 4 (Phase 6)**: Depends on User Story 1 and, for the rejection counter on the
  same telemetry topic, benefits from User Story 3 preceding it.
- **User Story 5 (Phase 7)**: Depends only on Foundational and can be taken at any point after
  it, in parallel with the others.
- **Polish (Phase 8)**: Depends on the stories being delivered.

### External Dependencies

- Clock port, RNG port, configuration loader, run manifest: `001-deterministic-foundations`.
- The environment field and its ground-truth manifest, which the sensors sample:
  `004-environment-generator`. Until it exists, sensors sample a fixed analytic field behind
  the same interface, and the substitution is a one-line change.
- Compose configuration, destination directories, seeding path: `005-compose-deployment`.
- The generator chain, which turns the observation schema into types: `006-generated-types`.

### Downstream Consumers

- `008-query-layer` reads the `observations` schema with a select-only role.
- `009-control-loop` subscribes to `obs/#` directly and derives sound speed at the point of use
  through the shared implementation in `libs/harness_core` (ADR-0005); it does not query the
  store during normal operation, and it does not read a stored sound speed, because there is
  none.
- `010-telemetry-quality` consumes `ctl/telemetry`.

### Within Each User Story

Tests precede implementation and are expected to fail first. Schema and roles precede services;
services precede their Compose entries; measured figures precede the documentation quoting
them.

### Parallel Opportunities

- T002, T003 and T004 touch different directories and can proceed together.
- T008 and T010 touch different files and are independent of one another.
- Every test task marked `[P]` within a story can be written together before its
  implementation begins.
- User Story 5 is independent of User Stories 1 to 4 and can be worked alongside them.

---

## Parallel Example: User Story 1

```bash
Task: "Write tests/integration/test_observation_path.py count reconciliation"
Task: "Add the ground-truth comparison and same-seed determinism cases"
Task: "Write unit tests for identifier derivation and seeded noise"
```

---

## Implementation Strategy

### MVP first

Phases 1 to 3 give observations flowing from sensors into a store that can be scored against
the generator's ground truth. That is the slice the monitor, the telemetry component and the
SensorThings collections all wait on.

### Incremental delivery

1. Setup and Foundational — one message definition, one data model, explicit roles.
2. User Story 1 — the path end to end. Stop and validate against ground truth.
3. User Story 2 — namespace isolation and the two-broker fallback.
4. User Story 3 — validation and the sole writer.
5. User Story 4 — backpressure, once there is enough traffic to make it real.
6. User Story 5 — the feature store, at any convenient point.

### Notes

- `[P]` marks different files with no unfinished dependency.
- Each task is sized to be one coherent commit.
- Three places in this feature will reach for the host clock if left alone: the observation
  timestamp, the batch flush interval and the reconnection backoff. All three take the
  simulation clock, and the gate will catch any that slips.

---

## What was done, and what was not

Implemented in one pass, out of wave order: feature 009's control loop was being built
against an observation path that did not exist, so this is the spine arriving late rather
than an extra.

### Not done, and why

Five tasks are unchecked above. Each is blocked on a file another feature owns, and none is
blocked on a decision this feature could have made.

- **T009 and T043 — wiring the two stores into the seeding path.** Both stores are
  provisioned by script and both scripts work: `stores/observations/apply.py` composes the
  migrations and the grants into one transaction, and `stores/features/provision.py` emits
  its schema, its content and its digest report. The integration tests run against real
  containers through exactly those scripts. What is missing is a step file in
  `deploy/seed.d/`, which belongs to `005-compose-deployment`; the contract in
  `deploy/seed.d/README.md` is one executable per store and each is a few lines of `psql`.
- **T027 — producing broker credentials at deploy time.** The shape is decided and
  documented in `deploy/broker/README.md`: a generated secret per role in
  `deploy/env.template`, a `mosquitto_passwd` invocation in the render, and
  `deploy/broker/passwd` added to `.gitignore`. All three files belong to
  `005-compose-deployment`. The integration tests generate the credential file the same way
  the deployment will, so what is untested is the render step and not the mechanism.
- **T028 — surfacing a count of refused broker attempts on `ctl/telemetry`.** Refusals are
  logged: `mosquitto.conf` enables the log types that record them and
  `tests/integration/test_topic_isolation.py` asserts a refused publish appears in the
  broker's log. Publishing a *count* needs a component subscribed to the broker's `$SYS`
  branch, and there is none — the ingest client can only count its own traffic. That
  belongs to `010-telemetry-quality`, whose business the `ctl/telemetry` topic is.
- **T045 — `docs/architecture/observation-path.md`.** `docs/` is outside this feature's
  directories in the current assignment. The material is written and lives in
  `stores/observations/README.md` (the data model and why it holds no entity),
  `services/ingest/README.md` (the path, the two failure modes and the measured figures) and
  `deploy/broker/README.md` (the namespace split and the two-broker fallback).

### Decisions the specification did not settle

- **Sensors and the clock topic.** FR-14 gives sensors no subscription to `ctl/` at all;
  ADR-0009 makes simulation time a subscription to `ctl/clock` for every component. A
  component that cannot receive a clock sample can only pace itself on the host clock, which
  Constitution I forbids, so the sensor and ingest roles are given that one control topic to
  read and refused every other in both directions. Argued at length in
  `deploy/broker/README.md`; the test asserts that a sensor subscribed to `ctl/#` receives
  the clock and nothing else.
- **What the observation message carries.** The SensorThings entities an observation belongs
  to travel on every message, so the store's Thing, Sensor, ObservedProperty, Datastream and
  FeatureOfInterest rows are a function of the traffic rather than of a second table kept in
  step by hand. The ingest client therefore holds no vocabulary of its own.
- **The backpressure indicator reports the interval, not the instant.** A loop that takes
  and writes within one turn is almost never sampled while its queue is full, so an
  instantaneous indicator would report a system under sustained backpressure as comfortable.
  `queue.filled` counts how many times the bound was reached and the indicator is derived
  from it.
- **The broker's in-flight window is the first bound the flow meets.** At Mosquitto's
  default of twenty unacknowledged messages, a batch bound of five hundred can never be
  reached by count and every batch flushes on its simulation-time bound instead.
  `max_inflight_messages` and `max_queued_messages` are now set deliberately in
  `deploy/broker/mosquitto.conf`, with a comment saying what they decide.

### The edge cases in spec.md, walked (T048)

| Case | What happens | Where it is shown |
|---|---|---|
| Broker absent at start | Bounded backoff in simulation time, no heartbeat, exit code 71 | `services/sensors/tests/test_main.py` |
| Store absent mid-batch | Batch retained, nothing acknowledged, written when the store returns | `services/ingest/tests/test_service.py` |
| The same observation delivered twice | Second write is a no-op, counted as a duplicate | `tests/integration/test_observation_path.py` |
| Process dies mid-batch | One transaction per batch; rolled back, so all or none | `services/ingest/tests/test_writer.py` |
| A message whose simulation time precedes the last written | Stored on its own time; the store orders by phenomenon time | `tests/integration/test_observation_path.py` |
| Credentials shared across sensors | Rules are per role, so a second sensor needs none and gains none | `deploy/broker/acl` |
| Retained rejections growing without limit | Bounded, and reaching the bound is itself reported | `services/ingest/tests/test_validation.py` |
| A control message on an `obs/` topic | Refused by the ingest client as not an observation | `services/ingest/tests/test_validation.py` |

### Measured figures

Against the pinned Mosquitto and PostGIS images on the local destination: 20 000
observations published in 0.52 s and drained into the store in 8.7 s — 2 303 observations
per second, in eleven transactions, with none lost and the queue never exceeding its bound.
The plan asked for five hundred a second. `services/ingest/README.md` carries the table.
