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

**Organization**: Grouped by user story so each can be finished, tested and demonstrated on
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

- [ ] T001 Create `services/sensors/` as the `harness_sensors` package in the `uv` workspace, with its `tests/` directory and a `main.py` that loads and validates configuration and does nothing else
- [ ] T002 [P] Create `services/ingest/` as the `harness_ingest` package in the same shape
- [ ] T003 [P] Create `stores/observations/` and `stores/features/` with their `migrations/`, `roles.sql` and `README.md` stubs
- [ ] T004 [P] Create `deploy/broker/` with `mosquitto.conf` taking its listener, persistence path and credential file from the destination environment file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The message definition, the data model and the roles. Every story rests on these.

**Critical**: No user story work begins until this phase is complete.

- [ ] T005 Author `contracts/schemas/observation.schema.json`: SensorThings vocabulary for one observation — thing, datastream, observed property, sensor, feature of interest, phenomenon time as a simulation-clock instant, result, location, depth — forbidding unknown properties, carrying a title, a description and at least one example, and obeying the identifier convention
- [ ] T006 Run `scripts/generate_types.sh` and commit the generated Python and TypeScript observation types, confirming the drift check passes
- [ ] T007 Write the first migration in `stores/observations/migrations/` creating the `observations` schema and its observation table, keyed by the deterministic observation identifier, with a PostGIS geography point, a depth, a phenomenon time column that has no default, and an index on phenomenon time
- [ ] T008 Add a comment block to the migration stating that no column may carry a `now()` or `current_timestamp` default, with the reason, and add a test asserting no such default exists in the applied schema
- [ ] T009 [P] Write `stores/observations/roles.sql` granting insert to the ingest role alone and select to the query layer and telemetry roles
- [ ] T010 [P] Write `stores/features/roles.sql` granting select only to every run-time role, with write permission held solely by the provisioning role
- [ ] T011 Write `scripts/`-invoked migration application into the store's tooling so a fresh instance and a migrated one agree, and wire it into the seeding path owned by the Compose feature
- [ ] T012 Add the configuration schemas `contracts/schemas/config.sensors.schema.json` and `contracts/schemas/config.ingest.schema.json` covering broker endpoint and credentials, sampling rate, noise parameters, batch bounds, queue bound, heartbeat interval and rejection-retention bound, and add the corresponding files to `config/local/` and `config/droplet/`

**Checkpoint**: The message has one definition, the store has a shape, and the roles exist.

---

## Phase 3: User Story 1 - Observations reach the store, end to end (Priority: P1) 🎯 MVP

**Goal**: Sensors publish, ingest writes, and what is stored is what was published.

**Independent Test**: Run a fixed-length scenario; compare stored count against published
count and stored values against the generator's field.

### Tests for User Story 1

- [ ] T013 [P] [US1] Write `tests/integration/test_observation_path.py` asserting one stored row per published message with no duplicates and no losses over a fixed run
- [ ] T014 [P] [US1] Add a case sampling the generated field at stored observations' own coordinates and simulation times and reporting the difference as a figure against the declared noise model
- [ ] T015 [P] [US1] Add a determinism case asserting that two runs from the same root seed produce identical stores including identifiers
- [ ] T016 [P] [US1] Write unit tests in `services/sensors/tests/` for the deterministic identifier derivation and for noise drawn from the RNG port

### Implementation for User Story 1

- [ ] T017 [US1] Implement `services/sensors/harness_sensors/sensor.py`: sample the environment at a given position and simulation time, apply seeded noise from `rng_for(stream)`, and emit an observation of the generated type
- [ ] T018 [US1] Implement deterministic observation identifiers derived from root seed plus thing, datastream and sequence, with no entropy and no database sequence
- [ ] T019 [US1] Implement `services/sensors/harness_sensors/publisher.py` as a thin wrapper over the broker client, publishing on `obs/<thing-id>/<datastream-id>` with the endpoint and credentials from configuration
- [ ] T020 [US1] Implement `services/sensors/harness_sensors/main.py`: configuration load and validation before any I/O, clock port for every time value, bounded reconnection backoff driven by the simulation clock
- [ ] T021 [US1] Implement `services/ingest/harness_ingest/subscriber.py` subscribing to `obs/#` with an acknowledgement policy that defers acknowledgement until the batch is written
- [ ] T022 [US1] Implement `services/ingest/harness_ingest/batcher.py` with bounds on message count and on simulation-time interval, taking both from configuration
- [ ] T023 [US1] Implement `services/ingest/harness_ingest/writer.py` writing one batch per transaction, with redelivery of an already-stored identifier as a no-op
- [ ] T024 [US1] Implement heartbeat publication on `ctl/heartbeat` for both services, carrying component identifier, simulation time and status, at the interval from configuration
- [ ] T025 [US1] Add both services to `deploy/compose.yaml` under the appropriate profile, with health checks, and their configuration files to both destination directories
- [ ] T026 [US1] Write `stores/observations/README.md` describing the data model and stating plainly which fields exist and why none of them constitutes an entity, a contact or a track

**Checkpoint**: A scenario produces a store whose contents can be scored against ground truth.

---

## Phase 4: User Story 2 - Flows cannot contaminate one another (Priority: P2)

**Goal**: The broker enforces the namespace split, and physical separation is a configuration
change.

**Independent Test**: Attempt forbidden publishes and subscriptions from sensor credentials;
bring the system up on two brokers with no source change.

### Tests for User Story 2

- [ ] T027 [P] [US2] Write `tests/integration/test_topic_isolation.py` asserting that sensor credentials cannot publish outside `obs/` and cannot subscribe to `ctl/#`
- [ ] T028 [P] [US2] Add a case asserting the ingest client can subscribe to `obs/#` and publish on `ctl/heartbeat` and `ctl/telemetry`, and nothing else
- [ ] T029 [P] [US2] Add a case enumerating the topics in use during a run and asserting they match the naming convention exactly
- [ ] T030 [P] [US2] Add a case asserting that a control-shaped message published on an `obs/` topic is rejected by the ingest client as failing the observation schema

### Implementation for User Story 2

- [ ] T031 [US2] Write `deploy/broker/acl` with per-role rules: the sensor role publishes under `obs/` only, the ingest role subscribes to `obs/#` and publishes on the declared `ctl/` topics, control consumers subscribe to `ctl/#`
- [ ] T032 [US2] Produce broker credentials from the deployment template at deploy time, per role rather than per client, with no credential value in any tracked file
- [ ] T033 [US2] Record refused attempts in the broker's log and surface a count on `ctl/telemetry`, so a misconfigured component is visible rather than merely failing
- [ ] T034 [US2] Write `deploy/broker/two-broker/` as the documented physical-separation fallback: a second broker service and the destination configuration values that point control traffic at it
- [ ] T035 [US2] Demonstrate the fallback once and record the diff in `deploy/broker/README.md`, showing that it touches configuration values only and no source file

**Checkpoint**: The failure mode the SRD assigns to the broker is prevented and demonstrated.

---

## Phase 5: User Story 3 - Nothing invalid reaches the store (Priority: P3)

**Goal**: Validation before writing, rejections retained and counted, and one writer only.

**Independent Test**: Publish a malformed and a well-formed message in one batch; confirm the
outcome and confirm no other role can insert.

### Tests for User Story 3

- [ ] T036 [P] [US3] Write tests in `services/ingest/tests/` covering validation: a violating message is rejected with a reason, and a mixed batch stores the valid messages only
- [ ] T037 [P] [US3] Write an integration case asserting that every database role other than the ingest role is refused on insert into the `observations` schema
- [ ] T038 [P] [US3] Add a case asserting that the rejection count appears on `ctl/telemetry` and that retained rejections are bounded

### Implementation for User Story 3

- [ ] T039 [US3] Implement `services/ingest/harness_ingest/validation.py` validating each message against the generated observation type before it enters the batch
- [ ] T040 [US3] Implement bounded rejection retention with the reason for each rejection, and report when the bound is reached rather than silently discarding
- [ ] T041 [US3] Ensure a mixed batch is not abandoned wholesale: valid messages are written, invalid ones are diverted, and the transaction covers the valid set
- [ ] T042 [US3] Apply `stores/observations/roles.sql` in the provisioning path and assert the grants after application, so a drifted grant fails the run rather than being discovered later

**Checkpoint**: The single ingestion seam is a seam that cannot be walked around.

---

## Phase 6: User Story 4 - Backpressure is bounded and visible, never silent (Priority: P4)

**Goal**: The queue has a limit, reaching it costs latency and not data, and the condition is
reported.

**Independent Test**: Drive a burst at five times the sustainable rate; watch the bound hold,
the indicator appear, the backlog drain and the counts reconcile.

### Tests for User Story 4

- [ ] T043 [P] [US4] Write `tests/integration/test_backpressure.py` driving a burst and asserting the queue never exceeds its bound and no observation is lost once the burst ends
- [ ] T044 [P] [US4] Add a case asserting the backpressure indicator appears on `ctl/telemetry` within one telemetry interval of the bound being reached, and clears afterwards
- [ ] T045 [P] [US4] Add a case asserting that broker-side loss, if it occurs, is counted and reported rather than silently absorbed

### Implementation for User Story 4

- [ ] T046 [US4] Implement `services/ingest/harness_ingest/backpressure.py`: a bounded queue that stops taking messages from the broker at its limit rather than discarding or growing
- [ ] T047 [US4] Publish queue depth, write rate, rejection count and broker-side loss on `ctl/telemetry` at the configured interval
- [ ] T048 [US4] Handle store unavailability with a full batch: retain, do not acknowledge, write on return, and prove no loss and no double write
- [ ] T049 [US4] Document the observed sustainable rate, the queue bound and the burst behaviour in `services/ingest/README.md`, with the measured figures rather than estimates

**Checkpoint**: The failure mode the SRD assigns to the ingest client is bounded and visible.

---

## Phase 7: User Story 5 - The feature store is provisioned by script and read-only during a run (Priority: P5)

**Goal**: Static spatial reference exists before the run and cannot change during it.

**Independent Test**: Provision into an empty instance, compare digests, then attempt writes
as every run-time role.

### Tests for User Story 5

- [ ] T050 [P] [US5] Write `tests/integration/test_feature_store_readonly.py` asserting every run-time role is refused on insert, update and delete in the `features` schema
- [ ] T051 [P] [US5] Add a case asserting that provisioning twice with the same root seed yields identical content digests
- [ ] T052 [P] [US5] Add a case asserting that `observations` and `features` are two schemas in one instance, not two instances

### Implementation for User Story 5

- [ ] T053 [US5] Implement `stores/features/provision.py` producing synthetic bathymetry and coastlines for the seeded environment's domain from the root seed, with no host-clock and no unseeded randomness
- [ ] T054 [US5] Write the `features` schema migration with PostGIS geometry columns and the indexes the query layer and client will need
- [ ] T055 [US5] Wire provisioning into the seeding path so it runs at scenario start, contributes its digests to the seeding record, and applies `stores/features/roles.sql` afterwards
- [ ] T056 [US5] Write `stores/features/README.md` stating that the content is synthetic, represents no real place, and is the harness analogue of pre-sail loading

**Checkpoint**: FR-12 and FR-13 are both satisfied and both testable.

---

## Phase 8: Polish

- [ ] T057 [P] Write `docs/architecture/observation-path.md` describing the path end to end, the two failure modes and how each is bounded
- [ ] T058 [P] Record an ADR for the decision that sound speed is derived downstream rather than published or derived at ingest, naming the alternative and its consequences
- [ ] T059 Run the full quality-gate set over this feature's files — lint, format, wall-clock gate, seeded-RNG gate, drift check, literal-path gate, forbidden-vocabulary gate — and fix what they report
- [ ] T060 Walk the edge cases in `spec.md` deliberately: broker absent at start, store absent mid-batch, duplicate delivery, out-of-order arrival, process death mid-batch; confirm each behaves as specified and record what was learned

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
- `009-control-loop` subscribes to `obs/#` directly and derives sound speed; it does not query
  the store during normal operation.
- `010-telemetry-quality` consumes `ctl/telemetry`.

### Within Each User Story

Tests precede implementation and are expected to fail first. Schema and roles precede services;
services precede their Compose entries; measured figures precede the documentation quoting
them.

### Parallel Opportunities

- T002, T003 and T004 touch different directories and can proceed together.
- T009 and T010 are independent.
- Every test task marked `[P]` within a story can be written together before its
  implementation begins.
- User Story 5 is independent of User Stories 1 to 4 and can be worked alongside them.

---

## Parallel Example: User Story 1

```bash
Task: "Write tests/integration/test_observation_path.py count reconciliation"
Task: "Add the ground-truth comparison case"
Task: "Add the same-seed determinism case"
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
