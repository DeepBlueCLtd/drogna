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

## Reconciliation, 27 August 2026

This list was written before the deployment and has been reconciled against the tree rather
than rewritten to match it. Forty of the forty-five tasks are done, four are partly done and
one is not done at all; each of those five carries its reason where it stands.

Four things the plan turned out to be wrong about, recorded rather than tidied away.

1. **The parity checker is a shell entry point over a library.** T007 named
   `scripts/check_destination_parity.py`. It is `scripts/check_destination_parity.sh`, a
   three-line wrapper over `deploy/lib/destination_parity.py`, so that every one of this
   feature's checks is reached the same way and every one of them lives beside the Compose
   file it is about. The work is done and the behaviour T008 asked for is asserted.
2. **The configuration validator does not use the loader from `libs/harness_core`.** T006
   said it should. It does not, deliberately: `deploy/lib/validate_config.py` uses
   `jsonschema` where it is installed and falls back to a small validator otherwise, because
   the case this feature exists to serve is a freshly provisioned droplet carrying a
   container runtime and nothing else. The fallback refuses a schema using a keyword it does
   not implement, so it can never be quietly more permissive than the reference. It
   validates against `contracts/schemas/config.<component>.schema.json` and names the file,
   the key and the reason, which is the whole of what T006 was for.
3. **The run scripts became two layers.** T014 and T015 described `scripts/run_local.sh`
   doing the rendering, the checking, the bring-up, the health wait and the URL. It does all
   of that through `scripts/up.sh`, which both destinations share; `run_local.sh` and
   `run_droplet.sh` are the two destination entry points over it. Splitting them is what
   stops the droplet path drifting away from the local one, which is the property T022 was
   asking for.
4. **The literal-address check is not part of the literal-path gate.** See T025.

### Three findings that are not tasks, and are worth more than the bookkeeping

**`profiles.active` is `["core"]` at both destinations.** One command still brings the stack
up, and the profile still comes from the destination configuration exactly as T038 requires
— but what it selects today is the observation store alone. Sixteen features have landed
since and none of them advanced this value, so `scripts/run_local.sh` starts one service out
of seventeen. No task here owns that: the mechanism is right and the configured value is
stale.

**`deploy/README.md`'s "Which services are live today" table is badly out of date.** It
lists C-01 through C-18 as "Declared, not built", and says of the browser client that its
image "has never been built, because `client/` does not exist yet". `client/` exists and
carries 446 tests; every service named in that table has a package behind it. The table
announces that it is a manifest for people to read and is consulted by nothing, which is
true and is why nothing broke — but a reader is being told the opposite of the truth. It is
folded into T045, which is the task that exists to correct documentation that proved wrong.

**`deploy/seed.d/` is empty.** See T030. The seeding driver, its contract and its record are
all built and tested; no component has ever installed a step in it, and the stores that
exist today are filled by one-shot Compose services instead. `deploy/README.md` says both
"All content comes from `scripts/seed.sh`" and "Today there are no seeding steps", and its
volume table credits `scripts/seed.sh` with seeding steps for the observation and feature
schemas that do not exist. Those three statements cannot all be true.

### What is still open

The reset-and-reseed comparison that User Story 3 exists to make good has never been run as
a test (T028), and the integration module that would hold it,
`tests/integration/test_seed_idempotence.py`, does not exist even though
`tests/unit/test_seeding_record.py` names it in its own docstring as the place the
end-to-end claim lives (T027). No seeding step has ever been installed (T030). The droplet
has never been deployed to (T045). T025's first clause was answered by a different mechanism
than the one it named.

---

## Phase 1: Setup

**Purpose**: The skeleton the rest of the feature hangs from.

- [x] T001 Create `deploy/` with `compose.yaml`, `env.template`, `images/` and `README.md` stubs, and add the ignore rule for the generated per-destination environment file to `.gitignore`
- [x] T002 [P] Create `config/local/` and `config/droplet/` each containing `common.json`, carrying the `component`, `clock`, `seed`, `broker` and `logging` sections in the shape fixed by `docs/architecture/repo-layout.md`
- [x] T003 [P] Write `deploy/images/python-service.Dockerfile` with its base image pinned by digest, installing dependencies from the `uv` workspace lock and taking `HARNESS_CONFIG` as its only meaningful environment variable
- [x] T004 [P] Write `deploy/images/client.Dockerfile` with its base images pinned by digest, building the client with `pnpm` and serving the built assets from a static server whose listen port comes from the environment file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The configuration contract and its enforcement, on which every story depends.

**Critical**: No user story work begins until this phase is complete.

- [x] T005 Define the destination environment contract in `deploy/env.template`: image tags, published ports, host paths for bind mounts, the active profile, and the container-side `HARNESS_CONFIG` path pattern, each with a comment naming the configuration key it mirrors
- [x] T006 Write `scripts/check_config.sh` to validate every file in a named destination directory against `contracts/schemas/config.<component>.schema.json` using the loader from `libs/harness_core`, failing with the file, the key and the reason
- [x] T007 [P] Write `scripts/check_destination_parity.py` asserting that `config/local/` and `config/droplet/` carry identical file sets and identical key sets per file, reporting every difference rather than the first
- [x] T008 [P] Write `tests/unit/test_destination_parity.py` covering the parity checker: matching directories pass, an added key fails, a missing file fails, differing values pass
- [x] T009 [P] Write `tests/unit/test_config_validation.py` covering the validation wrapper: a valid destination passes, a wrong-typed key fails naming the key, a missing required key fails naming the file
- [x] T010 Establish the Compose conventions in `deploy/compose.yaml`: a shared service fragment carrying the `HARNESS_CONFIG` variable, the logging driver, the restart policy and the health-check shape, with every value drawn from the environment file and none written literally

**Checkpoint**: A destination can be validated and compared before anything is started.

---

## Phase 3: User Story 1 - Bring the harness up locally with one command (Priority: P1) 🎯 MVP

**Goal**: One command takes a clean checkout to a healthy stack, repeatably, including in an
ephemeral agent session.

**Independent Test**: Clone into an empty directory, run `scripts/run_local.sh`, confirm the
advertised URL serves and every health check reports healthy.

### Tests for User Story 1

- [x] T011 [P] [US1] Write `tests/integration/test_compose_bringup.py` asserting that a bring-up in the shell-only profile reaches health for every expected service and fails informatively when a required port is occupied
- [x] T012 [P] [US1] Add a case to `tests/integration/test_compose_bringup.py` asserting that a second bring-up over a running stack converges and exits zero

### Implementation for User Story 1

- [x] T013 [US1] Add the service definitions that exist at this point to `deploy/compose.yaml` — Postgres with PostGIS, the broker, the client — each with a health check, a profile membership and configuration supplied by path
- [x] T014 [US1] Write `scripts/run_local.sh`: generate the environment file from `deploy/env.template` and `config/local/`, run `scripts/check_config.sh`, bring the active profile up, wait for health, print the client URL taken from configuration
- [x] T015 [US1] Implement the readable failure path in `scripts/run_local.sh` for an occupied port, a missing configuration file and an unhealthy service, each naming the service and the configuration key
- [x] T016 [US1] Make the bring-up independent of outbound network access beyond image pull: no service may block on an external host, and any dependency ordering is expressed as Compose health conditions
- [x] T017 [US1] Document the local destination in `deploy/README.md`: prerequisites, the one command, the teardown command and what an ephemeral session may and may not rely on

**Checkpoint**: The harness starts locally from nothing, with one command.

---

## Phase 4: User Story 2 - The same configuration runs on the droplet (Priority: P2)

**Goal**: The droplet serves a persistent URL from the same Compose file, differing only in
destination values, and survives a reboot unattended.

**Independent Test**: Deploy to a freshly provisioned droplet, confirm the persistent URL
serves the client, and confirm the destination directories differ only in values.

### Tests for User Story 2

- [x] T018 [P] [US2] Extend `tests/unit/test_destination_parity.py` with the real `config/local/` and `config/droplet/` directories as a fixture, so drift between the shipped destinations fails the suite
- [x] T019 [P] [US2] Add a test asserting that `deploy/compose.yaml` contains no literal hostname, port, absolute path or URL, by parsing the file rather than by eye

### Implementation for User Story 2

- [x] T020 [US2] Populate `config/droplet/common.json` with the droplet's values — persistent hostname, published ports, container paths, resource sizing — keeping the key set identical to `config/local/common.json`
- [x] T021 [US2] Write `deploy/droplet/provision.sh`: idempotent first-run host preparation, installing the container runtime, creating the deployment directory and reporting what it changed
- [x] T022 [US2] Write `scripts/run_droplet.sh` mirroring `scripts/run_local.sh` against `config/droplet/`, with progress reporting during image build so a slow build does not read as a hang
- [x] T023 [US2] Write `deploy/droplet/systemd/harness.service` so the stack restarts unattended after a host reboot, and have `provision.sh` install and enable it
- [x] T024 [US2] Add image and volume pruning of this deployment's own artefacts to `scripts/run_droplet.sh`, so repeated deployments do not fill the disk
- [~] T025 [US2] Extend the literal-path gate's file list to cover `deploy/compose.yaml`, `deploy/images/`, `config/local/` and `config/droplet/`, and wire both destination checks into CI

      **Partly done**, and the first clause was answered by something else. The
      literal-path gate deliberately does not scan `deploy/` or `config/`, and says so in
      its own docstring: those are the places whose whole job is to name locations, and
      a gate that flagged them would be flagging them for existing. What covers `deploy/`
      instead is `deploy/lib/compose_lint.py`, asserted by
      `tests/unit/test_compose_contract.py::test_the_deployment_carries_no_literal_address`,
      which walks every file under `deploy/` including `compose.yaml` and `images/` and
      knows the two exemptions a generic gate could not — an image reference, which is an
      identity rather than an address, and a path inside somebody else's image.
      `config/local/` and `config/droplet/` are not scanned by anything and should not be.
      The second clause is done: both destination checks run in CI, through
      `test_the_shipped_destinations_validate` and
      `test_the_shipped_destinations_agree_in_shape` rather than through the shell scripts,
      which are not in `scripts/gates.registry`.
- [x] T026 [US2] Document the droplet destination in `deploy/README.md`: provisioning from nothing, the one deployment command, every configuration key and its meaning, and the expected resource envelope

**Checkpoint**: Both destinations run from one configuration, and drift between them fails CI.

---

## Phase 5: User Story 3 - Seed, reset, and be sure a fresh instance is a true instance (Priority: P3)

**Goal**: All content comes from scripts; reset returns an instance to a fresh one's state;
equivalence is measured rather than asserted.

**Independent Test**: Seed, digest, reset, reseed, compare; then compare against a second
independent instance.

### Tests for User Story 3

- [~] T027 [P] [US3] Write `tests/integration/test_seed_idempotence.py` asserting that two seeding runs with the same root seed produce identical seeding records

      **Partly done**: the property is asserted, but not of two seeding *runs*.
      `tests/unit/test_seeding_record.py::test_the_record_is_a_function_of_its_inputs`
      builds the record twice and compares, and
      `tests/integration/test_feature_store_readonly.py::test_provisioning_twice_from_one_root_seed_gives_the_same_content`
      does the same for the one store that has provisioning. The file this task names,
      `tests/integration/test_seed_idempotence.py`, does not exist — and
      `tests/unit/test_seeding_record.py` names it in its own docstring as the place the
      end-to-end claim lives, so the gap is currently disguised by a reference to a file
      that was never written.
- [x] T028 [P] [US3] Add a case asserting that reset followed by reseed reproduces the seeding record of a freshly created instance — `tests/integration/test_reset_reproduces_a_fresh_instance.py`, 28 August 2026 (lane D). It is the four-command ritual `deploy/README.md` documented, run by the build instead of by a person: down with volumes, up, seed, keep the record, `reset.sh`, compare. Byte for byte, which the record makes possible by carrying no timestamp. The trap this had to close first is that two records saying nothing compare equal, so the record is required to account for every installed seeding step, each with a digested artefact, before the comparison is allowed to mean anything — watched failing on a step made to draw a value the root seed does not fix, and on an empty record.

      **Not done**: nothing anywhere runs `scripts/reset.sh` and compares the record
      that follows against a fresh instance's. `deploy/README.md` sets out the comparison
      by hand — seed, copy the record, reset, diff — and states that it has been run from
      this checkout and that the records matched. That is a person's report of a run,
      not a check, and it is the central claim of User Story 3.
- [x] T029 [P] [US3] Add a case asserting that no volume declared in `deploy/compose.yaml` is absent from the volume table in `deploy/README.md`

### Implementation for User Story 3

- [~] T030 [US3] Write `scripts/seed.sh` to run each component's seeding step for the active profile, taking the root seed from the destination configuration and passing it down, never generating one

      **Partly done**: the driver is written, tested and documented — it takes the root
      seed from the destination configuration and never invents one, runs every `*.sh` in
      `deploy/seed.d/` in lexical order, hands each the seed, the destination and its own
      artefact directory, and stops without writing a record if one fails. What is missing
      is any step: `deploy/seed.d/` holds a README and nothing else. The stores that exist
      today are filled by one-shot Compose services — the `features` provisioning job, the
      environment generator — so `scripts/seed.sh` runs zero steps and seeds nothing, while
      `deploy/README.md` says both that all content comes from it and that no steps are
      installed, and its volume table credits it with seeding steps for the observation and
      feature schemas that do not exist.
- [x] T031 [US3] Implement the seeding record in `scripts/seed.sh`: root seed, seeding script version, and a digest per seeded artefact, written only on successful completion so an interrupted run does not claim success
- [x] T032 [US3] Make `scripts/seed.sh` idempotent and convergent, so re-running after an interruption completes rather than double-seeding
- [x] T033 [US3] Write `scripts/reset.sh` to stop the stack, remove every volume carrying derived data, bring it back up and reseed with the same root seed
- [x] T034 [US3] Ensure no seeded value is stamped with host time: any time written during seeding comes from the scenario start instant in the destination configuration
- [x] T035 [US3] Add the volume table to `deploy/README.md`, naming each volume, the script that fills it and what is lost by removing it

**Checkpoint**: A fresh instance and a reset instance are demonstrably the same instance.

---

## Phase 6: User Story 4 - Start only the components that exist (Priority: P4)

**Goal**: Profiles select what runs; nothing about the profile leaks into what the client
claims is alive.

**Independent Test**: Bring up each profile and confirm the container set; confirm the client
consults no artefact of this feature.

### Tests for User Story 4

- [x] T036 [P] [US4] Write `tests/unit/test_profile_not_liveness.py` asserting that no file under `client/src/` reads the Compose file, the environment file, the active profile, or any configuration key naming a component list
- [x] T037 [P] [US4] Add a case to `tests/integration/test_compose_bringup.py` asserting that the shell-only profile starts exactly the expected container set and no other

### Implementation for User Story 4

- [x] T038 [US4] Add profile membership to every service in `deploy/compose.yaml`, with the active profile read from the destination configuration rather than passed on the command line
- [x] T039 [US4] Define and document the profile names and their contents in `deploy/README.md`, stating plainly that a profile describes what exists today, not what ought to exist
- [x] T040 [US4] Add the convention, in `deploy/README.md`, by which a later feature adds its service under a new profile without touching another feature's entry

**Checkpoint**: Staged delivery is expressible without pretending absent components exist.

---

## Phase 7: Polish

- [x] T041 [P] Add a `deploy/README.md` troubleshooting section covering the eight edge cases in `spec.md`, each with the message the operator will see and the remedy
- [x] T042 [P] Pin every base image by digest and record the digests with a note on how to refresh them deliberately
- [x] T043 [P] Pin Shapely 2.1 or later against GEOS 3.12 or later in the query layer's image with the reason beside the pin, add the behavioural-pin table to `deploy/README.md`, and assert the pin holds at build time

      The third clause originally read "add a check asserting both destinations resolve
      to the same pinned versions". It was replaced by a stronger check rather than
      dropped. GEOS is bundled inside the Shapely wheel, so no version constraint can
      express the half of FR-51 that decides two of the three failure modes; a
      resolved-version lock would agree across destinations while still shipping a GEOS
      that loses the M ordinate. `deploy/images/query-layer-pin-check.py` runs during the
      build and asserts the behaviour instead — that M comes back exactly *and* that Z is
      still the elevations, since a check on M alone cannot distinguish the third mode —
      and fails the build otherwise. Both destinations build from one Dockerfile and one
      requirements file, so what they share is not merely a version string but a proven
      property: whatever resolves, it demonstrably survives WKT parsing or there is no
      image. The guard is negative-tested against Shapely 2.0.3/GEOS 3.11.3 and
      2.0.7/GEOS 3.11.4, both of which fail the build.
- [x] T044 Run the full quality-gate set against this feature's files — lint, format, wall-clock gate, literal-path gate, forbidden-vocabulary gate — and fix what they report
- [~] T045 Walk the whole feature from a genuinely clean machine: provision, deploy, seed, reset, reboot; correct the documentation wherever it proved wrong

      **Partly done**: the local half has been walked and the documentation corrected
      from it — `deploy/README.md` records bring-up, repeat bring-up, seed, seed again,
      down, up and reset as run from this checkout. The droplet half has not: no droplet
      was available, so `deploy/droplet/provision.sh`, the systemd unit and the pruning
      step in `scripts/run_droplet.sh` have never been executed, and the README says so
      plainly under *What has and has not been verified*. Provision, deploy and reboot are
      therefore untested. The correcting half is also outstanding in a way that has
      nothing to do with the droplet: the *Which services are live today* table still
      describes every component as declared and not built, and the browser client as an
      image that cannot be built because `client/` does not exist. It does.

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

### What starting the promoted profiles found (added 28 August 2026, long-run-01)

Every item here was found by running the stack, not by reading it, and each was invisible to
a green test suite. Recorded as done rather than as new work, because the fixes are on this
branch; listed at all because a task list that says nothing about them would suggest the
deployment had always worked.

- [x] T029 The observation store reported healthy while it was still initialising

      `pg_isready` with no host uses the unix socket, and the postgres entrypoint runs
      `initdb` against a temporary server on that socket and no TCP port. Everything gated on
      `service_healthy` started and met `connection refused`. Probed over TCP now.

- [x] T030 The one-shots were expected to stay up

      `env-generator` writes the field and exits 0, which is success and was reported as
      failure. It is labelled `harness.lifecycle: one-shot` like `features`, and `up.sh`
      waits only on services not so labelled — read from the rendered Compose configuration
      rather than listed in the shell.

- [x] T031 `features` ran twice, the first time before the roles it grants to existed

      It was in `full` as well as `provisioning`. It belongs to the seeding step, which names
      its own profiles and invokes it with `compose run --rm`.

- [x] T032 Three components raced the field they read

      `sensors`, `model-runner` and `planner` need the environment manifest and started
      before C-02 had written it. They wait on `service_completed_successfully`.

- [x] T033 The run-time database roles had no passwords

      `roles.sql` creates them with LOGIN and nothing else, deliberately, because it is
      tracked — and nothing then assigned one, so every DSN naming `drogna_ingest` met
      `fe_sendauth: no password supplied`. Generated with the broker's, rendered into the
      DSNs, and assigned by `ALTER ROLE` in the seeding step from the same values.

- [x] T034 The client image had never been built, and neither had the query layer's

      Two dockerignore files excluded paths a later `COPY` needed; the client's layout was
      flattened one level below where its imports reach; the query layer's entrypoint read an
      environment variable nothing set; and its health check named `wget`, which
      `python:3.11-slim-bookworm` does not carry.

