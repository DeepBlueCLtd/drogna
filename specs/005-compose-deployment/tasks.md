---

description: "Task list for 005-compose-deployment"
---

# Tasks: One Environment-Agnostic Compose Configuration

**Input**: Design documents from `/specs/005-compose-deployment/`

**Prerequisites**: `spec.md`, `plan.md`. Consumes the configuration loader and schema
conventions from `001-deterministic-foundations`.

**Tests**: Requested for this project. Test tasks are included and precede the
implementation they cover.

**Organisation**: Tasks are grouped by user story so each story can be finished, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an unfinished task.
- **[Story]**: The user story the task serves.

## Path Conventions

Repository root paths throughout, per the structure decision in `plan.md`. This feature
writes only under `deploy/` (excluding `deploy/broker/`), `config/local/`, `config/droplet/`,
the six named `scripts/` entries, and its own tests.

---

## Phase 1: Setup

**Purpose**: The skeleton the rest of the feature hangs from.

- [ ] T001 Create `deploy/` with `compose.yaml`, `env.template`, `images/` and `README.md` stubs, and add the ignore rule for the generated per-destination environment file to `.gitignore`
- [ ] T002 [P] Create `config/local/` and `config/droplet/` each containing `common.json`, carrying the `component`, `clock`, `seed`, `broker` and `logging` sections in the shape fixed by `docs/architecture/repo-layout.md`
- [ ] T003 [P] Write `deploy/images/python-service.Dockerfile` with its base image pinned by digest, installing dependencies from the `uv` workspace lock and taking `HARNESS_CONFIG` as its only meaningful environment variable
- [ ] T004 [P] Write `deploy/images/client.Dockerfile` with its base images pinned by digest, building the client with `pnpm` and serving the built assets from a static server whose listen port comes from the environment file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The configuration contract and its enforcement, on which every story depends.

**Critical**: No user story work begins until this phase is complete.

- [ ] T005 Define the destination environment contract in `deploy/env.template`: image tags, published ports, host paths for bind mounts, the active profile, and the container-side `HARNESS_CONFIG` path pattern, each with a comment naming the configuration key it mirrors
- [ ] T006 Write `scripts/check_config.sh` to validate every file in a named destination directory against `contracts/schemas/config.<component>.schema.json` using the loader from `libs/harness_core`, failing with the file, the key and the reason
- [ ] T007 [P] Write `scripts/check_destination_parity.py` asserting that `config/local/` and `config/droplet/` carry identical file sets and identical key sets per file, reporting every difference rather than the first
- [ ] T008 [P] Write `tests/unit/test_destination_parity.py` covering the parity checker: matching directories pass, an added key fails, a missing file fails, differing values pass
- [ ] T009 [P] Write `tests/unit/test_config_validation.py` covering the validation wrapper: a valid destination passes, a wrong-typed key fails naming the key, a missing required key fails naming the file
- [ ] T010 Establish the Compose conventions in `deploy/compose.yaml`: a shared service fragment carrying the `HARNESS_CONFIG` variable, the logging driver, the restart policy and the health-check shape, with every value drawn from the environment file and none written literally

**Checkpoint**: A destination can be validated and compared before anything is started.

---

## Phase 3: User Story 1 - Bring the harness up locally with one command (Priority: P1) 🎯 MVP

**Goal**: One command takes a clean checkout to a healthy stack, repeatably, including in an
ephemeral agent session.

**Independent Test**: Clone into an empty directory, run `scripts/run_local.sh`, confirm the
advertised URL serves and every health check reports healthy.

### Tests for User Story 1

- [ ] T011 [P] [US1] Write `tests/integration/test_compose_bringup.py` asserting that a bring-up in the shell-only profile reaches health for every expected service and fails informatively when a required port is occupied
- [ ] T012 [P] [US1] Add a case to `tests/integration/test_compose_bringup.py` asserting that a second bring-up over a running stack converges and exits zero

### Implementation for User Story 1

- [ ] T013 [US1] Add the service definitions that exist at this point to `deploy/compose.yaml` — Postgres with PostGIS, the broker, the client — each with a health check, a profile membership and configuration supplied by path
- [ ] T014 [US1] Write `scripts/run_local.sh`: generate the environment file from `deploy/env.template` and `config/local/`, run `scripts/check_config.sh`, bring the active profile up, wait for health, print the client URL taken from configuration
- [ ] T015 [US1] Implement the readable failure path in `scripts/run_local.sh` for an occupied port, a missing configuration file and an unhealthy service, each naming the service and the configuration key
- [ ] T016 [US1] Make the bring-up independent of outbound network access beyond image pull: no service may block on an external host, and any dependency ordering is expressed as Compose health conditions
- [ ] T017 [US1] Document the local destination in `deploy/README.md`: prerequisites, the one command, the teardown command and what an ephemeral session may and may not rely on

**Checkpoint**: The harness starts locally from nothing, with one command.

---

## Phase 4: User Story 2 - The same configuration runs on the droplet (Priority: P2)

**Goal**: The droplet serves a persistent URL from the same Compose file, differing only in
destination values, and survives a reboot unattended.

**Independent Test**: Deploy to a freshly provisioned droplet, confirm the persistent URL
serves the client, and confirm the destination directories differ only in values.

### Tests for User Story 2

- [ ] T018 [P] [US2] Extend `tests/unit/test_destination_parity.py` with the real `config/local/` and `config/droplet/` directories as a fixture, so drift between the shipped destinations fails the suite
- [ ] T019 [P] [US2] Add a test asserting that `deploy/compose.yaml` contains no literal hostname, port, absolute path or URL, by parsing the file rather than by eye

### Implementation for User Story 2

- [ ] T020 [US2] Populate `config/droplet/common.json` with the droplet's values — persistent hostname, published ports, container paths, resource sizing — keeping the key set identical to `config/local/common.json`
- [ ] T021 [US2] Write `deploy/droplet/provision.sh`: idempotent first-run host preparation, installing the container runtime, creating the deployment directory and reporting what it changed
- [ ] T022 [US2] Write `scripts/run_droplet.sh` mirroring `scripts/run_local.sh` against `config/droplet/`, with progress reporting during image build so a slow build does not read as a hang
- [ ] T023 [US2] Write `deploy/droplet/systemd/harness.service` so the stack restarts unattended after a host reboot, and have `provision.sh` install and enable it
- [ ] T024 [US2] Add image and volume pruning of this deployment's own artefacts to `scripts/run_droplet.sh`, so repeated deployments do not fill the disk
- [ ] T025 [US2] Extend the literal-path gate's file list to cover `deploy/compose.yaml`, `deploy/images/`, `config/local/` and `config/droplet/`, and wire both destination checks into CI
- [ ] T026 [US2] Document the droplet destination in `deploy/README.md`: provisioning from nothing, the one deployment command, every configuration key and its meaning, and the expected resource envelope

**Checkpoint**: Both destinations run from one configuration, and drift between them fails CI.

---

## Phase 5: User Story 3 - Seed, reset, and be sure a fresh instance is a true instance (Priority: P3)

**Goal**: All content comes from scripts; reset returns an instance to a fresh one's state;
equivalence is measured rather than asserted.

**Independent Test**: Seed, digest, reset, reseed, compare; then compare against a second
independent instance.

### Tests for User Story 3

- [ ] T027 [P] [US3] Write `tests/integration/test_seed_idempotence.py` asserting that two seeding runs with the same root seed produce identical seeding records
- [ ] T028 [P] [US3] Add a case asserting that reset followed by reseed reproduces the seeding record of a freshly created instance
- [ ] T029 [P] [US3] Add a case asserting that no volume declared in `deploy/compose.yaml` is absent from the volume table in `deploy/README.md`

### Implementation for User Story 3

- [ ] T030 [US3] Write `scripts/seed.sh` to run each component's seeding step for the active profile, taking the root seed from the destination configuration and passing it down, never generating one
- [ ] T031 [US3] Implement the seeding record in `scripts/seed.sh`: root seed, seeding script version, and a digest per seeded artefact, written only on successful completion so an interrupted run does not claim success
- [ ] T032 [US3] Make `scripts/seed.sh` idempotent and convergent, so re-running after an interruption completes rather than double-seeding
- [ ] T033 [US3] Write `scripts/reset.sh` to stop the stack, remove every volume carrying derived data, bring it back up and reseed with the same root seed
- [ ] T034 [US3] Ensure no seeded value is stamped with host time: any time written during seeding comes from the scenario start instant in the destination configuration
- [ ] T035 [US3] Add the volume table to `deploy/README.md`, naming each volume, the script that fills it and what is lost by removing it

**Checkpoint**: A fresh instance and a reset instance are demonstrably the same instance.

---

## Phase 6: User Story 4 - Start only the components that exist (Priority: P4)

**Goal**: Profiles select what runs; nothing about the profile leaks into what the client
claims is alive.

**Independent Test**: Bring up each profile and confirm the container set; confirm the client
consults no artefact of this feature.

### Tests for User Story 4

- [ ] T036 [P] [US4] Write `tests/unit/test_profile_not_liveness.py` asserting that no file under `client/src/` reads the Compose file, the environment file, the active profile, or any configuration key naming a component list
- [ ] T037 [P] [US4] Add a case to `tests/integration/test_compose_bringup.py` asserting that the shell-only profile starts exactly the expected container set and no other

### Implementation for User Story 4

- [ ] T038 [US4] Add profile membership to every service in `deploy/compose.yaml`, with the active profile read from the destination configuration rather than passed on the command line
- [ ] T039 [US4] Define and document the profile names and their contents in `deploy/README.md`, stating plainly that a profile describes what exists today, not what ought to exist
- [ ] T040 [US4] Add the convention, in `deploy/README.md`, by which a later feature adds its service under a new profile without touching another feature's entry

**Checkpoint**: Staged delivery is expressible without pretending absent components exist.

---

## Phase 7: Polish

- [ ] T041 [P] Add a `deploy/README.md` troubleshooting section covering the eight edge cases in `spec.md`, each with the message the operator will see and the remedy
- [ ] T042 [P] Pin every base image by digest and record the digests with a note on how to refresh them deliberately
- [ ] T043 Run the full quality-gate set against this feature's files — lint, format, wall-clock gate, literal-path gate, forbidden-vocabulary gate — and fix what they report
- [ ] T044 Walk the whole feature from a genuinely clean machine: provision, deploy, seed, reset, reboot; correct the documentation wherever it proved wrong

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories, because every story
  rests on the configuration contract and its two checks.
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP on its own.
- **User Story 2 (Phase 4)**: Depends on User Story 1, since the droplet script mirrors the
  local one and the parity check needs populated destinations.
- **User Story 3 (Phase 5)**: Depends on User Story 1 for something to seed. Independent of
  User Story 2.
- **User Story 4 (Phase 6)**: Depends on User Story 1 for a Compose file with services in it.
  Independent of User Stories 2 and 3.
- **Polish (Phase 7)**: Depends on the stories that are being delivered.

### External Dependencies

- `libs/harness_core` configuration loader and the `contracts/schemas/config.*.schema.json`
  conventions come from `001-deterministic-foundations`. Until they land, T006 uses the
  schema files directly and is revisited when the loader exists.
- `deploy/broker/` and the broker's configuration file are authored by `007-observation-path`.
  This feature declares the broker service and its configuration path only.
- `003-component-shell-client` consumes this feature: the greyed-out shell has to be live on
  the droplet early, which makes User Stories 1 and 2 a prerequisite of that feature's
  demonstration rather than the other way round.

### Within Each User Story

Tests precede the implementation they cover and are expected to fail first. Configuration
shape precedes scripts; scripts precede documentation of those scripts.

### Parallel Opportunities

- T002, T003 and T004 touch different files and can proceed together.
- T007, T008 and T009 are independent of one another.
- All test tasks marked `[P]` within a story can be written together before its
  implementation begins.
- User Stories 2, 3 and 4 are independent of each other once User Story 1 is complete, and
  can be taken in any order or together.

---

## Parallel Example: Foundational Phase

```bash
Task: "Write scripts/check_destination_parity.py"
Task: "Write tests/unit/test_destination_parity.py"
Task: "Write tests/unit/test_config_validation.py"
```

---

## Implementation Strategy

### MVP first

Phases 1 to 3 give a harness that starts locally with one command from a clean checkout.
That alone satisfies the constitution's demonstrability requirement for every feature that
follows, and is worth stopping at to validate.

### Incremental delivery

1. Setup and Foundational — the configuration contract exists and is enforced.
2. User Story 1 — local bring-up. Stop and validate.
3. User Story 2 — the droplet, which unblocks the greyed-out shell being live early.
4. User Story 3 — seeding and reset, which makes the ephemeral case honest.
5. User Story 4 — profiles, needed as soon as the next component arrives.

### Notes

- `[P]` marks different files with no unfinished dependency.
- Each task is sized to be one coherent commit.
- Every later feature adds one service entry, one profile membership and two configuration
  files. If it needs more than that, this feature's structure is wrong and should be amended
  rather than worked around.
