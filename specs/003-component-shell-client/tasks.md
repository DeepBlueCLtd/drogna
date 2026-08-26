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

## Phase 1: Setup

- [ ] T001 Scaffold the client package: `client/package.json` (pnpm, React, TypeScript 5, Vite,
      vitest, deck.gl as a dependency for later map surfaces), `client/tsconfig.json`, eslint
      configuration, and the empty `client/src/generated/` reserved for feature 006's output.
- [ ] T002 [P] Add the client's lint, type-check, test and build commands so they can be called by a
      single command from the repository root, matching the constitution's quality gates.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The message contract, the runtime configuration contract, and the drawing.

**Blocking**: no user story work starts until this phase is complete.

- [ ] T003 Author `contracts/schemas/heartbeat.schema.json` with `$id`
      `https://schemas.harness.invalid/heartbeat.schema.json`: component id, simulation time, tick,
      status enumeration, declared heartbeat interval, declared liveness window, run id, config
      digest, optional detail. Reject unknown keys.
- [ ] T004 [P] Author `contracts/schemas/config.client.schema.json`: broker WebSocket endpoint, clock
      endpoint, staleness tolerance, and the capture-relevant display settings. Reject unknown keys.
- [ ] T005 Write `client/src/layout/components.ts`: the layout map derived from the SRD component
      table — eighteen nodes with id, name, responsibility, bespoke-or-plumbing, and position — plus
      the edges, including the control loop cycle. Document at the top that this is a drawing and
      determines only what is drawn, never what is lit.
- [ ] T006 Write `client/index.html` carrying the FR-001 honesty statement in the initial payload, so
      it is present before any script runs.
- [ ] T007 Implement `client/src/config/runtime.ts`: fetch the runtime configuration document from
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

- [ ] T008 [P] [US1] `client/tests/bootstrap.test.ts`: with configuration fetch failing, the shell
      and the honesty statement still render, the transport does not open, and the failure is
      surfaced.
- [ ] T009 [P] [US1] `client/tests/layout.test.ts`: every component in the layout map renders, every
      node starts dark, and each carries its stable test identifier.

### Implementation for User Story 1

- [ ] T010 [US1] Implement `client/src/ui/HonestyBanner.tsx` and its placement, so the statement is
      visible above the fold at desktop and phone widths and survives a narrow viewport.
- [ ] T011 [US1] Implement `client/src/layout/ComponentDiagram.tsx`: the SVG node-link diagram of all
      eighteen components, all dark by default, each node carrying a stable test identifier.
- [ ] T012 [US1] Label the diagram as a drawing of the intended architecture, with the wording that
      makes a dark node read as "not heard from".
- [ ] T013 [US1] Implement `client/src/ui/ConnectionState.tsx` showing not connected, connected and
      silent, or receiving, and wire its initial state.
- [ ] T014 [US1] Implement `client/src/main.tsx`: render the shell first, then validate configuration,
      then start the transport, in that order.
- [ ] T015 [US1] Make lit and dark distinguishable by more than colour, so the state survives a
      greyscale screenshot.

**Checkpoint**: there is a page, it is honest, and it claims nothing.

---

## Phase 4: User Story 2 - Components light up because they said something (Priority: P2)

**Goal**: Illumination driven by heartbeats and simulation time, and by nothing else.

**Independent Test**: Publish heartbeats for one component id and stop; the node lights within one
interval and darkens within its declared window.

### Tests for User Story 2

- [ ] T016 [P] [US2] `client/tests/reducer.test.ts`: the reducer is pure; given heartbeats and a
      simulation time it produces per-component state; given a configuration document it produces no
      change at all.
- [ ] T017 [P] [US2] `client/tests/window.test.ts`: the liveness window is evaluated in simulation
      time using the window the heartbeat declares; a heartbeat older than its window yields dark; a
      heartbeat within it yields lit.
- [ ] T018 [P] [US2] `client/tests/validation.test.ts`: a heartbeat failing schema validation lights
      nothing and increments the discard count by exactly one.
- [ ] T019 [P] [US2] `client/tests/ordering.test.ts`: out-of-order heartbeats resolve to the most
      recent simulation time, not the most recent arrival; a heartbeat one tick ahead of the last
      received tick is treated as current; further ahead it is flagged.
- [ ] T020 [P] [US2] `client/tests/unmapped.test.ts`: a heartbeat with a component id absent from the
      layout produces an unmapped live component rather than being dropped.

### Implementation for User Story 2

- [ ] T021 [US2] Implement `client/src/liveness/window.ts`: simulation-time window evaluation,
      including the indeterminate state when the clock is stale.
- [ ] T022 [US2] Implement `client/src/liveness/reducer.ts`: heartbeats and simulation time in,
      per-component state out. No other input is accepted by its signature.
- [ ] T023 [US2] Implement `client/src/transport/mqtt.ts`: a read-only subscription to
      `ctl/heartbeat` that publishes nothing, with connection state reported.
- [ ] T024 [US2] Validate every inbound heartbeat against `heartbeat.schema.json` before it reaches
      the reducer, and count discards.
- [ ] T025 [US2] Render status distinguishably — starting, ok, degraded, stopping — and render the
      discard count where a viewer will see it.
- [ ] T026 [US2] Render unmapped live components in their own region of the page, with an explanation
      of what an unmapped component means.
- [ ] T027 [US2] Render the client's own node as lit by its own presence, labelled as such, since it
      cannot hear itself over the broker.
- [ ] T028 [US2] Throttle rendering to the frame budget while folding every received heartbeat into
      liveness state, so a high clock rate degrades the frame rate and never the truth.

**Checkpoint**: the display says exactly what it has heard, and nothing more.

---

## Phase 5: User Story 3 - The clock is the first thing that lights (Priority: P3)

**Goal**: One genuinely live component, and a page that is stable when the clock rate is zero.

**Independent Test**: Run feature 001's clock service and nothing else. Exactly one node is lit.

### Tests for User Story 3

- [ ] T029 [P] [US3] `client/tests/clockstate.test.ts`: a paused clock and a stale clock render
      differently; rate zero is a normal state; staleness beyond tolerance renders liveness as
      indeterminate rather than lit or dark.
- [ ] T030 [P] [US3] `client/tests/no-mock.test.ts`: a search of the built bundle and the source
      finds no demo mode, fixture module, query parameter or build flag capable of lighting a node,
      and the reducer has no input other than heartbeats and simulation time.

### Implementation for User Story 3

- [ ] T031 [US3] Implement `client/src/transport/clock.ts`: subscribe to the clock service's tick
      stream, expose the current simulation time, mode, rate and tick, and detect staleness against
      the configured tolerance. No browser clock is read.
- [ ] T032 [US3] Implement `client/src/ui/ClockState.tsx`: mode, rate, tick and staleness, with
      paused rendered prominently and distinctly from stale.
- [ ] T033 [US3] Run the real clock service and confirm end to end that its heartbeat lights exactly
      one node, that stopping it leads to indeterminate rather than a false dark, and that no client
      change was needed to light it.
- [ ] T034 [US3] Confirm the page is stable to the pixel while the clock rate is pinned to zero, and
      that nothing decays for the duration, so a capture pair differs only where the change under
      evidence differs.

**Checkpoint**: drogna's first liveness signal is on the screen, and a screenshot of it means
something.

---

## Phase 6: User Story 4 - The picture is the loop (Priority: P4)

**Goal**: The cycle reads as a cycle, and bespoke is distinguished from plumbing.

**Independent Test**: A reader traces the loop and names the bespoke components without the SRD.

- [ ] T035 [P] [US4] `client/tests/diagram.test.ts`: the control loop edges form a closed path
      through monitor, scheduler, model runner and publisher, and the bespoke-or-plumbing flag in the
      layout map matches SRD §2.2 for every node.
- [ ] T036 [US4] Draw the control loop as a closed cycle in `ComponentDiagram.tsx`, with direction
      indicated, rather than as a row of boxes with arrows.
- [ ] T037 [US4] Render the bespoke-and-plumbing distinction with a legend that states the convention
      in words.

---

## Phase 7: Polish and cross-cutting

- [ ] T038 [P] Confirm the wall-clock gate passes over `client/`, with zero occurrences of
      `Date.now`, `new Date` or `performance.now` in operational source.
- [ ] T039 [P] Confirm the literal-path gate passes over `client/`, with exactly one exemption — the
      relative bootstrap URL — carrying its reason in the inventory.
- [ ] T040 Measure the cold-cache first paint over the droplet link and record it against the
      two-second criterion, adjusting asset loading if it misses.

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
