---

description: "Task list for 016-visual-capture"
---

# Tasks: Visual Capture — Three Mechanisms, One Browser

**Input**: Design documents from `/specs/016-visual-capture/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. Test tasks are included, and the two tests that
carry the feature — the empty no-change diff and the separation test — each have a
deliberately broken control asserting they can fail.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Paths are exact and relative to the repository root

## Path Conventions

This feature owns `client/e2e/`, `scripts/capture/` and `.github/workflows/capture.yml`,
and adds `contracts/schemas/config.capture.schema.json` additively. It writes nothing
under `client/src/` and nothing under `site/`.

---

## Phase 1: Setup

- [ ] T001 Create `client/e2e/` with `shared/`, `specs/` and `tests/`, and `scripts/capture/` with `glance/`, `pair/` and `curate/`, and add the Playwright dependency and the three `pnpm` scripts — one per mechanism, none of them a flag on another.
- [ ] T002 Write `contracts/schemas/config.capture.schema.json`: client address, the three output areas, viewport, device scale factor, readiness timeout, browser and container pins, and the published-screenshot location owned by feature 015.
- [ ] T003 [P] Write `config/local/capture.json` and `config/droplet/capture.json` with the same shape and per-destination values.
- [ ] T004 [P] Pin the Playwright browser version and the container image, and record in `scripts/capture/README.md` that an unpinned browser makes pairs incomparable across machines.
- [ ] T005 [P] Add the session area and the branch-scoped area to `.gitignore`, and leave the published-screenshot location tracked.

**Checkpoint**: Three empty mechanisms with three configurations and one ignored-output rule.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The narrow shared library, and nothing wider.

- [ ] T006 Implement `client/e2e/shared/config.ts`: load and validate the capture configuration before any browser is launched, failing with a readable message naming the address it will use.
- [ ] T007 Implement `client/e2e/shared/readiness.ts`: wait on the client's settled signal, with the timeout from configuration, and report plainly when readiness never arrives (FR-019).
- [ ] T008 [P] Implement `client/e2e/shared/pages/`: page objects and selectors for the component layout, the clock rate control and the message inspector — application knowledge only, with no notion of glance, pair or curated (FR-002).
- [ ] T009 [P] Add a lint rule over `client/e2e/` and `scripts/capture/` forbidding fixed sleeps, and a test asserting the rule catches one (FR-019, SC-011).

**Checkpoint**: A browser can find things in the client and knows when the client is settled.

---

## Phase 3: User Story 1 - The agent shows the author what it just did (Priority: P1) 🎯 MVP

**Goal**: An immediate screenshot of the client as it stands, that changes nothing.

**Independent Test**: Invoke the glance against a running client; an image appears in the
session area within seconds, nothing else is written, the clock rate is unchanged.

### Tests for User Story 1

- [ ] T010 [P] [US1] Write `client/e2e/tests/glance.test.ts` asserting the clock rate observed before and after a glance is identical (FR-003, SC-002).
- [ ] T011 [P] [US1] Add a test asserting the glance writes only into the session area and that nothing it writes is tracked by git (FR-004, SC-008).
- [ ] T012 [P] [US1] Add a test asserting a glance against an unreachable client fails within a few seconds and names the configured address (spec US1 scenario 4).

### Implementation for User Story 1

- [ ] T013 [US1] Write `client/e2e/glance.config.ts`: its own output directory, no retries, the shortest workable timeout.
- [ ] T014 [US1] Write `client/e2e/specs/glance.spec.ts`: wait on readiness, capture the viewport, write to the session area.
- [ ] T015 [US1] Write `scripts/capture/glance/run.mjs`: the entry point, printing the image path and the observed clock rate so a frozen system is never presented as a live one (FR-005).
- [ ] T016 [US1] Confirm by inspection and by test that the glance path contains no clock write, no scenario reset and no state-changing navigation (FR-003).

**Checkpoint**: The session feedback loop works and is the only mechanism that exists.

---

## Phase 4: User Story 2 - A change is evidenced by a pair that differs only where the change does (Priority: P2)

**Goal**: A before/after pair with the clock pinned to zero, a comparability guard, and an
empty diff when nothing changed.

**Independent Test**: A pair across a known visual delta isolates it; a pair across no
change is empty three times running.

### Tests for User Story 2

- [ ] T017 [P] [US2] Write `client/e2e/tests/fingerprint.test.ts`: two fingerprints differing in browser version, viewport, device scale, seed or capture environment are refused, and the refusal names the field (FR-009, FR-010, SC-005).
- [ ] T018 [P] [US2] Write the no-change determinism test: capture a pair with nothing changed, three consecutive times, asserting an empty difference each time (FR-011, SC-003).
- [ ] T019 [P] [US2] Write the clock-restore test with injected failures at each step of the pair — after pinning, mid-capture, before restoring — asserting the previous rate is restored in every case (FR-007, SC-006).
- [ ] T020 [P] [US2] Write the liveness-under-pin test: assert every component lit before the pin is still lit in the captured image, and that the capture fails if any fell dark (FR-008, SC-007). It is a regression test on ADR-0006 — real-time cadence, simulation time as payload — not a hedge against an undecided question, and its failure means a component has reverted to a simulation-time cadence.
- [ ] T021 [P] [US2] Write the canonical first-pair test: capture across the simulation clock's grey-to-lit transition and assert the difference is confined to that component (FR-006, SC-004).

### Implementation for User Story 2

- [ ] T022 [US2] Write `client/e2e/pair.config.ts`: its own output directory under the branch-scoped area, no retries — a retry that succeeds after a failure is a comparability hazard, not a rescue.
- [ ] T023 [US2] Implement `scripts/capture/pair/fingerprint.mjs`: gather browser version, container image, viewport, device scale factor, scenario seed, simulation time and entry-point version, and compare two fingerprints field by field (FR-009).
- [ ] T024 [US2] Implement clock pinning in `scripts/capture/pair/run.mjs`: set the rate to zero through the client's own rate control, capture, restore the previous rate, and restore it on every failure path (FR-007).
- [ ] T025 [US2] Add the lit-component check around the pin, so a pinned clock cannot produce an all-grey pair that looks like a passing capture, and name ADR-0006 in the failure message so whoever meets it knows which decision has been broken (FR-008).
- [ ] T026 [US2] Implement `scripts/capture/pair/diff.mjs`: refuse to diff when the fingerprints differ, otherwise produce the difference image and a summary of what changed (FR-009, FR-011).
- [ ] T027 [US2] Write `client/e2e/specs/pair.spec.ts` and wire the before and after halves so that both are captured in the same environment, refusing a pair assembled from two environments (FR-010).
- [ ] T028 [US2] Add the concurrent-capture guard: a second pair capture beginning while one holds the pin is refused rather than restoring a rate it did not observe (spec edge cases).

**Checkpoint**: A change within a feature can be evidenced by a comparison that means
something.

---

## Phase 5: User Story 3 - A finished feature gets a picture worth publishing (Priority: P3)

**Goal**: Curated, durable, PR-01-clean images with provenance records, committed by a
person.

**Independent Test**: Run the curated capture against a working feature; candidates and
records appear in the review area; a committed one lands where the site expects it.

### Tests for User Story 3

- [ ] T029 [P] [US3] Write the curated dimension test: every curated image in the repository has the same dimensions and device scale factor (FR-015, SC-009).
- [ ] T030 [P] [US3] Write the provenance record test: each record gives seed, simulation time, viewport, device scale and entry-point version, and contains no filesystem path, hostname or user name (FR-016).
- [ ] T031 [P] [US3] Write the chrome test: a curated image contains no browser chrome, address bar or window title, and an in-page hostname is masked (FR-017).
- [ ] T032 [P] [US3] Write a test asserting the curated run commits nothing and writes only into the review area (FR-013).

### Implementation for User Story 3

- [ ] T033 [US3] Write `client/e2e/curate.config.ts`: the fixed blog viewport and device scale factor, taken from configuration so the whole blog shares one value.
- [ ] T034 [US3] Write `client/e2e/specs/curate.spec.ts`: capture the viewport only, with the masks for anything that legitimately varies or names a host.
- [ ] T035 [US3] Implement `scripts/capture/curate/sidecar.mjs`: write the provenance record beside each candidate, scrubbed of paths, hostnames and user names (FR-016).
- [ ] T036 [US3] Implement `scripts/capture/curate/run.mjs`: write candidates and records into the review area, print what was produced, and commit nothing (FR-013).
- [ ] T037 [US3] Document the hand-off in `scripts/capture/README.md`: the author reviews candidates and moves the chosen ones into the published-screenshot location feature 015 defines (FR-014).
- [ ] T038 [US3] Produce the first curated set for a working feature and confirm the site build finds the committed images in the expected location.

**Checkpoint**: The blog has pictures, and they are the only capture output in the
repository.

---

## Phase 6: User Story 4 - The three mechanisms stay three mechanisms (Priority: P4)

**Goal**: The separation is enforced and its reasons are written down where they will be
read.

**Independent Test**: Run the separation test against a deliberately merged fixture tree
and confirm it fails.

### Tests for User Story 4

- [ ] T039 [P] [US4] Write `client/e2e/tests/separation.test.ts`: no entry point imports another; the only shared module is `client/e2e/shared/`; the three output areas are disjoint; only the curated area is tracked by git (FR-022).
- [ ] T040 [P] [US4] Create `client/e2e/tests/fixtures/merged-tree/` in which the glance imports the pair's clock pinning, and assert the separation test rejects it, naming the import (FR-022, SC-010).
- [ ] T041 [P] [US4] Add an assertion that nothing in `client/e2e/shared/` refers to a glance, a pair or a curated shot, so capture policy cannot leak into the shared library (FR-002).

### Implementation for User Story 4

- [ ] T042 [US4] Write `scripts/capture/README.md` in full: the three mechanisms, their triggers, consumers, storage, lifetimes, clock behaviour and gates as a table, followed by the five reasons they do not share plumbing, and a note that FR-53 binds the pair alone because only the pair is a comparison (FR-023).
- [ ] T043 [US4] Write `.github/workflows/capture.yml`: the pair on pull requests with a declared artefact retention period, no glance job at all, and the curated mechanism on manual trigger producing a reviewable candidate that the workflow does not commit (FR-021, FR-012).

---

## Phase 7: Polish and Cross-Cutting Concerns

- [ ] T044 [P] Add a size budget for curated images and fail the curated run when a candidate exceeds it, before it can be committed.
- [ ] T045 [P] Add the whole capture test suite to CI, excluding the glance, which has no CI role by design.
- [ ] T046 Record in `scripts/capture/README.md` the outcome of the liveness-under-pin assertion in practice, since it is the one interaction with the clock this feature asserts rather than controls, and cite ADR-0006 as the decision it regression-tests.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks all four stories.
- **US1 (Phase 3)**: depends on Foundational only.
- **US2 (Phase 4)**: depends on Foundational, and on the client exposing its rate control
  (SRD FR-49) and at least one genuinely live component to change. Independent of US1.
- **US3 (Phase 5)**: depends on Foundational, and on feature 015 having defined the
  published-screenshot location before T038.
- **US4 (Phase 6)**: depends on all three mechanisms existing.
- **Polish (Phase 7)**: depends on the stories being delivered.

### External Dependencies

- The client's readiness signal and the component layout selectors come from the client
  features. Until they exist, `shared/` targets a documented test identifier and the
  capture specs fail loudly rather than guessing.
- The clock rate control comes from feature 001 and the client's control from SRD FR-49.
  US2 cannot be completed before both exist.
- The first genuine before/after pair is the simulation clock's illumination transition
  (SRD FR-52). There is no mocked alternative, so US2's canonical test waits on the clock
  being live.
- The published-screenshot location is owned by feature 015; T038 needs it.

### Within Each User Story

- Tests before implementation, and each must fail first.
- The shared library before any mechanism, and nothing added to it afterwards that a
  mechanism could have kept to itself.
- The fingerprint before the diff, because the diff's first act is to refuse.

### Parallel Opportunities

- T003, T004 and T005 in Setup; T008 and T009 in Foundational.
- T010 to T012 in US1.
- T017 to T021 in US2: five separate test concerns in separate files.
- T029 to T032 in US3.
- T039 to T041 in US4.
- US1 and US2 can be worked by different people once Foundational is done; they share
  only `client/e2e/shared/`, which neither modifies after T008.

---

## Parallel Example: User Story 2

```bash
# The five test concerns are independent:
Task: "Write client/e2e/tests/fingerprint.test.ts"
Task: "Write the no-change determinism test"
Task: "Write the clock-restore test with injected failures"
Task: "Write the liveness-under-pin test"
Task: "Write the canonical first-pair test over the clock's grey-to-lit transition"
```

---

## Implementation Strategy

### MVP first

1. Phases 1 and 2, then Phase 3: a glance the agent can use in every session.
2. Stop and validate: use it for a day's work before building anything else. If it is not
   fast enough to use without thinking, nothing later fixes that.

### Incremental delivery

US1 gives feedback within a session. US2 gives evidence within a change. US3 gives an
artefact that outlives both. US4 keeps them from collapsing into each other. Each is
demonstrable without the next.

### Notes

- The temptation this feature must resist is a shared entry point with a mode flag. That
  is shared plumbing with a disguise, and the moment it exists the gate, the retention
  rule and the clock behaviour begin converging on whichever the loudest caller wants.
- There is no fixture mode and no demo mode, in any mechanism, at any time
  (SRD FR-52, Constitution VII). A screenshot showing a lit component is evidence that the
  component was alive, and it has to stay that way to be worth capturing.
- The no-change diff and the separation test both carry deliberate controls. A run in
  which a control is not caught is a failure of the test, not a pass of the code.
