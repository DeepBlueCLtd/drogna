---

description: "Task list for 003-component-shell-client"
---

# Tasks: Greyed-Out Component Shell

**Input**: Design documents from `/specs/003-component-shell-client/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 001 supplies the clock service and its heartbeat,
which is the only component expected to be lit when this feature is demonstrated.

**Tests**: Requested. `vitest` unit tests are written before the code they cover. Tests feed
constructed heartbeat values to a pure function; that is not mocked traffic driving a display, and no
such path exists in the built client.

**Organization**: Grouped by user story so each can be implemented, tested and shown on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story the task serves

## Path Conventions

All client paths are under `client/`. Two schemas are added under `contracts/schemas/`.

---

## Reconciliation, 27 August 2026

This list was written before the code and had never been ticked, so it claimed the client did not
exist. It does: the shell, the layout map, the reducer, the transports and their tests all landed,
and `client/` today runs 446 tests across 46 files. Most of that is not this feature's — feature
012 took the client from 92 tests to 369 and added the loop, controls, inspector, uncertainty and
route work, and feature 016 added `client/e2e/`. **Judge these forty tasks against this feature's
own scope**, which ends at the dark shell, the liveness reducer and the clock.

Thirty-seven are ticked, two are partial and one is not done. What this list turned out to be wrong
about is recorded on the tasks rather than tidied away, including on tasks that are ticked:

1. **The liveness window is real time, not simulation time** (T017, T021, T029, T031). Four tasks
   here say otherwise and ADR-0006 overruled all four, for a reason this feature could not have
   seen from where it stood: a window in simulation time expires every component at once at a rate
   of zero, which is precisely the state FR-53 pins for a screenshot. Indeterminate likewise turned
   out to belong to a client that cannot listen, not to a clock that has gone quiet.
2. **Feature 012 removed work delivered here** (T034). The shell drew host-derived elapsed figures
   — "12 s ago" under each box and in the clock panel — and they made a pinned page differ from
   itself frame to frame, leaving feature 016's SC-009 unsatisfiable. `secondsWords` and its three
   callers were deleted by 012's FR-009. T034 asked for exactly the property that removal bought,
   so it is ticked, and the note under it says who actually earned it. `client/src/ui/states.ts`
   keeps the reason where the function used to be.
3. **The end-to-end demonstration was never run** (T033, left partial). Both halves are tested
   separately — the clock publishes a heartbeat that validates against the master, and the client
   lights on a validated heartbeat — but no record exists of a browser lighting a box from a
   running clock service.
4. **The wall-clock count is no longer zero** (T038, left partial). Two marked exemptions now live
   in `client/src/`, under ADR-0006 and ADR-0007. The gate passes, which is the part that was
   asserted for the wrong reason.

What is still open: the cold-cache first paint over the droplet link (T040) has never been
measured, and SC-001's two-second criterion is therefore unscored.

---

## Phase 1: Setup

- [x] T001 Scaffold the client package: `client/package.json` (pnpm, React, TypeScript 5, Vite,
      vitest, deck.gl as a dependency for later map surfaces), `client/tsconfig.json`, eslint
      configuration, and the empty `client/src/generated/` reserved for feature 006's output.
- [x] T002 [P] Add the client's lint, type-check, test and build commands so they can be called by a
      single command from the repository root, matching the constitution's quality gates. All four
      are `client/package.json` scripts and `pnpm check` runs them in sequence, callable from the
      root as `pnpm -C client check`. CI runs them as four separate steps in
      `.github/workflows/ci.yml` deliberately, so that a lint failure and a test failure are told
      apart without reading a log; they are not registered in `scripts/gates.registry`, which runs
      Python and reads the whole tree.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The message contract, the runtime configuration contract, and the drawing.

**Blocking**: no user story work starts until this phase is complete.

- [x] T003 Author `contracts/schemas/heartbeat.schema.json` with `$id`
      `https://schemas.harness.invalid/heartbeat.schema.json`: component id, simulation time, tick,
      status enumeration, declared heartbeat interval, declared liveness window, run id, config
      digest, optional detail. Reject unknown keys.
- [x] T004 [P] Author `contracts/schemas/config.client.schema.json`: broker WebSocket endpoint, clock
      endpoint, staleness tolerance, and the capture-relevant display settings. Reject unknown keys.
- [x] T005 Write `client/src/layout/components.ts`: the layout map derived from the SRD component
      table — eighteen nodes with id, name, responsibility, bespoke-or-plumbing, and position — plus
      the edges, including the control loop cycle. Document at the top that this is a drawing and
      determines only what is drawn, never what is lit.
- [x] T006 Write `client/index.html` carrying the FR-001 honesty statement in the initial payload, so
      it is present before any script runs.
- [x] T007 Implement `client/src/config/runtime.ts`: fetch the runtime configuration document from
      the single permitted relative bootstrap URL, marked with an inline exemption marker and its
      reason, validate it against its schema, and expose it. No transport opens before validation
      returns.

**Checkpoint**: the contracts exist and the page has something honest to say before it can say
anything else.

---

## Phase 3: User Story 1 - The whole architecture, dark, and an honest label (Priority: P1) 🎯 MVP

**Goal**: The complete layout, all dark, with the honesty statement, rendering with nothing else
running.

**Independent Test**: Serve the build with no broker and no clock. All eighteen nodes render dark
and the statement is visible without interaction.

### Tests for User Story 1

- [x] T008 [P] [US1] `client/tests/bootstrap.test.ts`: with configuration fetch failing, the shell
      and the honesty statement still render, the transport does not open, and the failure is
      surfaced.
- [x] T009 [P] [US1] `client/tests/layout.test.ts`: every component in the layout map renders, every
      node starts dark, and each carries its stable test identifier.

### Implementation for User Story 1

- [x] T010 [US1] Implement `client/src/ui/HonestyBanner.tsx` and its placement, so the statement is
      visible above the fold at desktop and phone widths and survives a narrow viewport.
- [x] T011 [US1] Implement `client/src/layout/ComponentDiagram.tsx`: the SVG node-link diagram of all
      eighteen components, all dark by default, each node carrying a stable test identifier.
- [x] T012 [US1] Label the diagram as a drawing of the intended architecture, with the wording that
      makes a dark node read as "not heard from".
- [x] T013 [US1] Implement `client/src/ui/ConnectionState.tsx` showing not connected, connected and
      silent, or receiving, and wire its initial state.
- [x] T014 [US1] Implement `client/src/main.tsx`: render the shell first, then validate configuration,
      then start the transport, in that order.
- [x] T015 [US1] Make lit and dark distinguishable by more than colour, so the state survives a
      greyscale screenshot.

**Checkpoint**: there is a page, it is honest, and it claims nothing.

---

## Phase 4: User Story 2 - Components light up because they said something (Priority: P2)

**Goal**: Illumination driven by heartbeats and simulation time, and by nothing else.

**Independent Test**: Publish heartbeats for one component id and stop; the node lights within one
interval and darkens within its declared window.

### Tests for User Story 2

- [x] T016 [P] [US2] `client/tests/reducer.test.ts`: the reducer is pure; given heartbeats and a
      simulation time it produces per-component state; given a configuration document it produces no
      change at all.
- [x] T017 [P] [US2] `client/tests/window.test.ts`: the liveness window is evaluated in simulation
      time using the window the heartbeat declares; a heartbeat older than its window yields dark; a
      heartbeat within it yields lit. **The file exists and asserts the opposite of this task's
      first clause.** ADR-0006 settled that the window is evaluated in **real** time — "measures the
      window in host seconds" and "stays lit while simulation time does not advance" are two of its
      ten tests — because a window measured in simulation time would expire every component at once
      at a rate of zero and grey out a running system during exactly the capture FR-53 pins the rate
      for. The rest of the task is as written: the sender's declared window is used, with the
      declared interval and then the receiver's tolerance as fallbacks.
- [x] T018 [P] [US2] `client/tests/validation.test.ts`: a heartbeat failing schema validation lights
      nothing and increments the discard count by exactly one.
- [x] T019 [P] [US2] `client/tests/ordering.test.ts`: out-of-order heartbeats resolve to the most
      recent simulation time, not the most recent arrival; a heartbeat one tick ahead of the last
      received tick is treated as current; further ahead it is flagged.
- [x] T020 [P] [US2] `client/tests/unmapped.test.ts`: a heartbeat with a component id absent from the
      layout produces an unmapped live component rather than being dropped.

### Implementation for User Story 2

- [x] T021 [US2] Implement `client/src/liveness/window.ts`: simulation-time window evaluation,
      including the indeterminate state when the clock is stale. **Built, and decided against this
      description on both counts** (ADR-0006, and the module says so at the top). The window is
      evaluated in real time, not simulation time; and indeterminate is produced when the *client*
      could not listen — a disconnected transport — not when the clock is stale, because a client
      that has gone deaf cannot honestly report a death whereas a silent clock says nothing about
      whether a component is alive.
- [x] T022 [US2] Implement `client/src/liveness/reducer.ts`: heartbeats and simulation time in,
      per-component state out. No other input is accepted by its signature.
- [x] T023 [US2] Implement `client/src/transport/mqtt.ts`: a read-only subscription to
      `ctl/heartbeat` that publishes nothing, with connection state reported.
- [x] T024 [US2] Validate every inbound heartbeat against `heartbeat.schema.json` before it reaches
      the reducer, and count discards.
- [x] T025 [US2] Render status distinguishably — starting, ok, degraded, stopping — and render the
      discard count where a viewer will see it.
- [x] T026 [US2] Render unmapped live components in their own region of the page, with an explanation
      of what an unmapped component means.
- [x] T027 [US2] Render the client's own node as lit by its own presence, labelled as such, since it
      cannot hear itself over the broker.
- [x] T028 [US2] Throttle rendering to the frame budget while folding every received heartbeat into
      liveness state, so a high clock rate degrades the frame rate and never the truth.

**Checkpoint**: the display says exactly what it has heard, and nothing more.

---

## Phase 5: User Story 3 - The clock is the first thing that lights (Priority: P3)

**Goal**: One genuinely live component, and a page that is stable when the clock rate is zero.

**Independent Test**: Run feature 001's clock service and nothing else. Exactly one node is lit.

### Tests for User Story 3

- [x] T029 [P] [US3] `client/tests/clockstate.test.ts`: a paused clock and a stale clock render
      differently; rate zero is a normal state; staleness beyond tolerance renders liveness as
      indeterminate rather than lit or dark. The first two clauses are asserted directly ("is paused
      at a rate of zero, however long ago the last sample was", "is stale, not paused, once the
      clock is no longer heard from"). The third clause is asserted the other way round, following
      ADR-0006 and T021: "decays nothing, because liveness is measured in real time" — clock
      staleness changes the clock panel and leaves component illumination alone.
- [x] T030 [P] [US3] `client/tests/no-mock.test.ts`: a search of the built bundle and the source
      finds no demo mode, fixture module, query parameter or build flag capable of lighting a node,
      and the reducer has no input other than heartbeats and simulation time.

### Implementation for User Story 3

- [x] T031 [US3] Implement `client/src/transport/clock.ts`: subscribe to the clock service's tick
      stream, expose the current simulation time, mode, rate and tick, and detect staleness against
      the configured tolerance. No browser clock is read. **Built; the last sentence no longer
      holds.** Samples arrive by subscription on `ctl/clock` rather than from a tick stream
      (ADR-0009), and the module holds them exactly as received without interpolating. Staleness is
      measured in host seconds through `liveness/window.ageSeconds`, so a browser clock *is* read —
      once, in `client/src/time/host.ts`, under the ADR-0006 exemption marker. See T038.
- [x] T032 [US3] Implement `client/src/ui/ClockState.tsx`: mode, rate, tick and staleness, with
      paused rendered prominently and distinctly from stale.
- [~] T033 [US3] Run the real clock service and confirm end to end that its heartbeat lights exactly
      one node, that stopping it leads to indeterminate rather than a false dark, and that no client
      change was needed to light it. **Both halves are proved separately; the join is not.** On the
      publishing side `tests/integration/test_clock_liveness.py` runs the clock component through its
      own entry point and asserts that what it puts on `ctl/heartbeat` validates against
      `contracts/schemas/heartbeat.schema.json` — the same master the client validates against — and
      that at rate zero it keeps publishing liveness while simulation time stops. On the receiving
      side `client/tests/` covers lighting from a validated heartbeat, darkening past the window and
      indeterminate when the page cannot listen. Nothing in the tree records a browser rendering a
      heartbeat from a running clock: `.github/workflows/capture.yml` serves the built client and
      nothing else, and says so where it explains why no clock answers there. The third clause is
      the one that is genuinely satisfied — no client change was needed, because the client was
      built against the master rather than against the clock.
- [x] T034 [US3] Confirm the page is stable to the pixel while the clock rate is pinned to zero, and
      that nothing decays for the duration, so a capture pair differs only where the change under
      evidence differs. **True now, and it was not true when this feature delivered it.** The shell
      as built here drew host-derived elapsed figures — `secondsWords`, "12 s ago" — under the boxes
      and in the clock panel, which made the rendered page differ from one frame to the next and
      left feature 016's SC-009 unsatisfiable. Feature 012's FR-009 removed that function and the
      three places that called it; `client/src/ui/states.ts` and
      `client/src/layout/ComponentDiagram.tsx` both carry the reason where the code used to be, and
      the elapsed figure remains in the view model where liveness reasons about it. The standing evidence is
      `client/e2e/specs/determinism.spec.ts` ("a pair captured across no change is empty, three
      consecutive times", with a companion test that plants a frame-varying display and shows the
      comparison catching it) and `client/tests/clockstate.test.ts` ("decays nothing, because
      liveness is measured in real time").

**Checkpoint**: drogna's first liveness signal is on the screen, and a screenshot of it means
something.

---

## Phase 6: User Story 4 - The picture is the loop (Priority: P4)

**Goal**: The cycle reads as a cycle, and bespoke is distinguished from plumbing.

**Independent Test**: A reader traces the loop and names the bespoke components without the SRD.

- [x] T035 [P] [US4] `client/tests/diagram.test.ts`: the control loop edges form a closed path
      through monitor, scheduler, model runner and publisher, and the bespoke-or-plumbing flag in the
      layout map matches SRD §2.2 for every node.
- [x] T036 [US4] Draw the control loop as a closed cycle in `ComponentDiagram.tsx`, with direction
      indicated, rather than as a row of boxes with arrows.
- [x] T037 [US4] Render the bespoke-and-plumbing distinction with a legend that states the convention
      in words.

---

## Phase 7: Polish and cross-cutting

- [~] T038 [P] Confirm the wall-clock gate passes over `client/`, with zero occurrences of
      `Date.now`, `new Date` or `performance.now` in operational source. **The gate passes; the
      count is no longer zero.** `client/src/` now holds two marked exemptions, both appearing in
      the inventory `scripts/gates.sh` prints: `time/host.ts:22` reads `performance.now` under
      ADR-0006, because heartbeat cadence and liveness windows are real time and the whole liveness
      window rests on it (see T017 and T021); and `controls/interpolatedClock.ts:178` under
      ADR-0007, added by feature 012 so a frame timestamp can interpolate between two received clock
      samples without reaching anything outside that module. There is one further occurrence with no
      marker — `controls/simInstant.ts:48` constructs a `new Date` from a simulation instant to
      format it, which reads no clock and which the gate does not treat as a violation. Left partial
      because the property this task asserts is not the property the tree now has, and a reader
      would otherwise trust the zero.
- [x] T039 [P] Confirm the literal-path gate passes over `client/`, with exactly one exemption — the
      relative bootstrap URL — carrying its reason in the inventory. Exactly one in `client/src/`, at
      `config/runtime.ts:72`, with its reason. `client/e2e/shared/config.ts:42` carries a second, for
      that module's own position in the tree; it belongs to feature 016 and names no deployment
      location.
- [ ] T040 Measure the cold-cache first paint over the droplet link and record it against the
      two-second criterion, adjusting asset loading if it misses. **Not done, and nothing stands in
      for it.** SC-001 in `spec.md` and the performance goal in `plan.md` both state the two-second
      figure, and no measurement of it exists anywhere in the tree — not in `client/`, not in
      `deploy/`, not in the capture pipeline, which measures pixel differences rather than timing.
      The client is a single Vite bundle with the honesty statement in the served HTML, so the
      statement half of the criterion is met by construction (T006, and the test in
      `client/tests/layout.test.tsx` that puts it before the mount point); the paint time of the
      complete dark layout has never been observed over the droplet link.

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) depends on Setup and blocks every user story.
- User Story 1 (Phase 3) depends on Phase 2 only, and needs nothing else in drogna to be running.
- User Story 2 (Phase 4) depends on Phase 2, and on a broker being reachable for its end-to-end
  check; its unit tests need neither.
- User Story 3 (Phase 5) depends on User Story 2 and on feature 001's clock service being deliverable.
- User Story 4 (Phase 6) depends on User Story 1's diagram.
- Polish (Phase 7) depends on the stories it checks.

### Within each story

- Tests are written first and must fail before the implementation lands.
- Schemas before the validation that uses them.
- The reducer before the transport that feeds it, so the transport cannot quietly become the place
  where liveness is decided.
- The diagram before the loop styling that refines it.

### Parallel opportunities

- T003 and T004; T008 and T009.
- All five test tasks of User Story 2 (T016 to T020).
- T029 and T030; T038 and T039.

---

## Parallel Example: User Story 2

```bash
# The five failing tests first, in parallel:
Task: "client/tests/reducer.test.ts — purity, and immunity to configuration"
Task: "client/tests/window.test.ts — simulation-time liveness window"
Task: "client/tests/validation.test.ts — invalid heartbeats light nothing"
Task: "client/tests/ordering.test.ts — most recent simulation time wins"
Task: "client/tests/unmapped.test.ts — a live component is never hidden"
```

---

## Implementation Strategy

1. Phases 1 and 2, then User Story 1. At that point drogna has a page that renders the whole
   architecture, dark, and says what it is. That is showable on the droplet on its own.
2. Add User Story 2, and the display becomes capable of telling the truth about liveness, even
   though there is not yet much truth to tell.
3. Add User Story 3, and the clock lights. This is the first moment a screenshot of drogna carries
   information, which is why the capture work anchors here.
4. Add User Story 4, and the picture becomes the flow chart with a loop in it that the SRD asks for.

## Notes

- There is no mock. If a stage of this work seems to need one, the answer is to deliver feature 001's
  clock service, not to synthesise a heartbeat.
- Lit means heard from. Every label on the page must stay inside that claim.
- Commit after each task or coherent group. Tasks are sized to be one commit each.
