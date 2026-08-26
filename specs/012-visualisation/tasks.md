---

description: "Task list for 012-visualisation"
---

# Tasks: Control Loop, Route and Uncertainty Visualisation

**Input**: Design documents from `/specs/012-visualisation/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 003 (client shell, component layout,
liveness from `ctl/heartbeat`, broker connection), feature 001 (simulation clock and
its heartbeat) and feature 006 (generated TypeScript types) must be in place. User
Story 4 needs feature 009's published uncertainty field and feature 011's projection;
User Story 5 needs feature 011's plans and feature 008's EDR trajectory provider.

**Tests**: Requested. Test tasks are included and are written before the
implementation they cover. Test doubles live inside `__tests__/` only and never in a
shipped path (SRD FR-52).

**Organization**: Grouped by user story so each can be implemented, tested and
demonstrated on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: US1 loop and inspector, US2 speed control, US3 core versus plumbing,
  US4 uncertainty over time, US5 the route

## Path Conventions

All work is under `client/src/`, in the directories named in `plan.md`. Unit and
component tests are colocated in `__tests__/` beside the module they cover. Nothing
outside `client/src/` is touched.

---

## Phase 1: Setup

- [ ] T001 Create the six new directories under `client/src/` — `loop/`, `inspector/`,
  `controls/`, `legibility/`, `uncertainty/`, `route/` — each with its `__tests__/`,
  and register them in the client's module and test configuration.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the control-namespace subscription, the bounded buffers and the static
architectural description that transit routing and classification both read.

**CRITICAL**: no user story work begins until this phase is complete.

- [ ] T002 Extend `client/src/data/controlSubscription.ts` to subscribe to the control
  namespace over the broker's WebSocket listener, using the connection feature 003
  established and the topic prefixes from runtime configuration.
- [ ] T003 Implement bounded per-topic message buffers with oldest-first eviction and
  a configured depth, in `client/src/data/buffers.ts`, with a test asserting the bound
  holds over a long message stream, in `client/src/data/__tests__/buffers.test.ts`.
- [ ] T004 [P] Implement the static architectural description — for each control topic,
  its publishing component and its consuming components; for each component and
  boundary, its bespoke-or-plumbing classification and the named bespoke logic — in
  `client/src/loop/transitRouting.ts` and `client/src/legibility/classification.ts`,
  with a test asserting every component and boundary in the layout is classified, in
  `client/src/legibility/__tests__/classification.test.ts`.
- [ ] T005 [P] Add the runtime configuration entries this feature needs — buffer
  depths, coalescing threshold, displayed-resolution limits — to the client's existing
  runtime configuration surface, with no literal broker URL, path or prefix anywhere in
  the new source.

**Checkpoint**: control messages arrive, are bounded, and can be attributed to a
boundary. Stories may proceed.

---

## Phase 3: User Story 1 — The loop turns, and you can look at the message that just passed (P1) 🎯 MVP

**Goal**: the sense → decide → act → publish cycle animated from real traffic, with
transits on the correct boundaries and the last message on any boundary inspectable
against its schema.

**Independent Test**: publish a known sequence of control messages and assert one
transit per message on the correct boundary, in order, each inspectable in full.

### Tests for User Story 1

- [ ] T006 [P] [US1] Test asserting one transit is rendered per received message on the
  boundary its topic maps to, that no transit is rendered for a boundary no message
  crossed, and that a message addressed to a component with no heartbeat does not light
  that component, in `client/src/loop/__tests__/transits.test.ts`.
- [ ] T007 [P] [US1] Test for cycle phase activation from the four control messages in
  order, in `client/src/loop/__tests__/cycle.test.ts`.
- [ ] T008 [P] [US1] Test for burst coalescing: transits are coalesced with the count
  shown, none is silently dropped, and the buffer bound holds, in
  `client/src/loop/__tests__/coalesce.test.ts`.
- [ ] T009 [P] [US1] Test for the inspector: topic, full payload, carried simulation
  time and schema name are all shown for the most recent message on a boundary, and an
  invalid payload is shown as received and marked invalid with its validation error, in
  `client/src/inspector/__tests__/inspector.test.ts`.
- [ ] T010 [P] [US1] Test asserting the loop renders as stopped and disconnected on
  broker loss, distinguishably from idle and connected, in
  `client/src/loop/__tests__/disconnected.test.ts`.

### Implementation for User Story 1

- [ ] T011 [US1] Implement transit rendering and boundary attribution in
  `client/src/loop/Transit.tsx`.
- [ ] T012 [US1] Implement the cycle view with the active phase distinguished, in
  `client/src/loop/CycleView.tsx`.
- [ ] T013 [P] [US1] Implement burst coalescing with visible coalesced counts in
  `client/src/loop/coalesce.ts`.
- [ ] T014 [P] [US1] Implement message validation state against the generated schemas
  in `client/src/inspector/validation.ts`.
- [ ] T015 [US1] Implement the message inspector in
  `client/src/inspector/MessageInspector.tsx`, showing topic, payload, carried
  simulation time and validation state.
- [ ] T016 [US1] Implement the disconnected and idle states so a stopped loop never
  reads as a quiet healthy one, in `client/src/loop/CycleView.tsx` and
  `client/src/data/controlSubscription.ts`.

**Checkpoint**: the loop turns from real traffic and any message that crossed a
boundary can be read in full. AT-02 is watchable in the client.

---

## Phase 4: User Story 2 — The viewer sets the speed and the clock obeys (P2)

**Goal**: the simulation speed control, showing the rate in force rather than the rate
requested, with zero as a legitimate pinned rate readable by the capture path.

**Independent Test**: set each supported rate, including zero, and assert displayed
simulation time advances accordingly and the displayed rate always matches the clock's
acknowledgement.

### Tests for User Story 2

- [ ] T017 [P] [US2] Test for requested-versus-acknowledged rate: the display shows the
  rate in force, a clamped or refused request is shown as adjusted, and the requested
  rate is never displayed as though in force, in
  `client/src/controls/__tests__/rateState.test.ts`.
- [ ] T018 [P] [US2] Test for a rate of zero as a legitimate rate: simulation time
  stops, time-driven animation stops, the display says paused, and the state is
  distinguishable from disconnected. In the same file, assert that components lit
  before the pin stay lit through it, because liveness windows are real time and the
  heartbeats keep arriving (ADR-0006, SC-015), and that nothing host-derived — an age
  since last heartbeat, say — is rendered, so the frame-to-frame output stays stable
  while pinned. In `client/src/controls/__tests__/pinnedRate.test.ts`.
- [ ] T019 [P] [US2] Test asserting the acknowledged rate is readable from outside the
  React tree so a capture can wait for the pin to take effect, and that the rendered
  output does not change between frames while pinned, in
  `client/src/controls/__tests__/captureReadiness.test.ts`.
- [ ] T020 [P] [US2] Test asserting displayed simulation time stops and is marked stale
  when the clock service is unreachable, and never advances from the browser's clock,
  in `client/src/controls/__tests__/clockUnreachable.test.ts`.

### Implementation for User Story 2

- [ ] T021 [US2] Implement rate state — requested, acknowledged, adjusted, pinned — in
  `client/src/controls/rateState.ts`.
- [ ] T022 [US2] Implement the speed control component in
  `client/src/controls/SpeedControl.tsx`.
- [ ] T023 [US2] Implement capture readiness: expose the acknowledged rate and the
  pinned state where the capture path can read them, in
  `client/src/controls/captureReadiness.ts`.
- [ ] T024 [US2] Implement the frame-interpolation module against ADR-0007's three
  rules: interpolate only between two received clock samples, never extrapolate beyond
  the latest, snap to every arriving sample and discard the interpolation rather than
  blending it, and hold at the last sample when arrival stops. Carry the
  `// harness:allow-wallclock` marker naming ADR-0007, keep the read in this one
  module, and keep the render-on-clock-samples path selectable as the fallback, in
  `client/src/controls/rateState.ts` and the animation hook it exposes.

**Checkpoint**: the loop can be slowed to watch a single cycle, sped up to watch hours
pass, or pinned to zero so a capture means something.

---

## Phase 5: User Story 3 — What is bespoke and what is bought is visible (P3)

**Goal**: every component and boundary classified, the bespoke logic named, and the
schema shown beside the instance in the inspector.

**Independent Test**: assert full classification coverage, that the named bespoke items
appear against their owning components, and that classification never lights anything.

### Tests for User Story 3

- [ ] T025 [P] [US3] Test asserting classification affects appearance only: a component
  classified bespoke greys out when its heartbeat stops, exactly as any other, and no
  classification path can light a component, in
  `client/src/legibility/__tests__/classificationDoesNotLight.test.ts`.
- [ ] T026 [P] [US3] Test asserting each named bespoke item — residual and divergence
  rules, scheduling policy, sound speed computation, quality flagging, uncertainty and
  planning mathematics, the executable data dictionary — appears against the component
  that owns it, in `client/src/legibility/__tests__/bespokeDetail.test.ts`.

### Implementation for User Story 3

- [ ] T027 [US3] Implement the classification treatment across components and
  boundaries in `client/src/legibility/BespokeDetail.tsx` and the layout styling it
  applies.
- [ ] T028 [US3] Implement the schema panel so the governing schema is shown beside the
  payload, making the data dictionary visible in execution, in
  `client/src/inspector/SchemaPanel.tsx`.

**Checkpoint**: the display claims exactly what drogna built, and shows the contract
next to the instance.

---

## Phase 6: User Story 4 — Uncertainty decays, and then it refreshes (P4)

**Goal**: the uncertainty field rendered, decaying between runs from the planner's
projection, refreshing on announcement, with forecast quality stated in words.

**Independent Test**: advance simulation time and watch the field decay; publish a run
and watch it refresh, with no polling request issued.

### Tests for User Story 4

- [ ] T029 [P] [US4] Test asserting the overlay refreshes on `ctl/run-published` within
  one animation cycle and that the client issues no polling request to the query layer
  for freshness, in `client/src/uncertainty/__tests__/refresh.test.ts`.
- [ ] T030 [P] [US4] Test asserting displayed decay follows the planner's published
  projection, that with no projection available the field renders and is marked as not
  decaying rather than decaying by a browser-side model, and that an over-large field is
  downsampled with the displayed resolution stated rather than silently, in
  `client/src/uncertainty/__tests__/decayFromProjection.test.ts` and
  `client/src/uncertainty/__tests__/downsample.test.ts`.
- [ ] T031 [P] [US4] Test asserting a not-beating-persistence report is rendered in
  plain words with the sample count and both errors, and a stale statistic is rendered
  stale with its last-update simulation time, in
  `client/src/uncertainty/__tests__/qualityStatement.test.ts`.

### Implementation for User Story 4

- [ ] T032 [US4] Implement the uncertainty Deck.gl layer with downsampling and stated
  resolution in `client/src/uncertainty/UncertaintyLayer.ts`.
- [ ] T033 [US4] Implement projection-driven decay in
  `client/src/uncertainty/decayFromProjection.ts`.
- [ ] T034 [US4] Implement the quality statement — skill in plain words, staleness as
  staleness — in `client/src/uncertainty/QualityStatement.tsx`.

**Checkpoint**: confidence visibly ages between runs and visibly returns when the loop
does its work.

---

## Phase 7: User Story 5 — The route is a curve through a volume, and it is a recommendation (P5)

**Goal**: the plan's route as a four-dimensional curve with a time control showing
conditions at arrival, labelled a recommendation, with nothing to accept or execute.

**Independent Test**: render a published plan; move the time control and compare the
conditions shown against the EDR trajectory response for each vertex's timestamp.

### Tests for User Story 5

- [ ] T035 [P] [US5] Test asserting the route renders with horizontal position, depth
  and arrival simulation time at each vertex, in
  `client/src/route/__tests__/routeLayer.test.ts`.
- [ ] T036 [P] [US5] Test asserting the conditions shown for each point are those from
  the EDR trajectory response for that vertex's timestamp, and that a vertex beyond the
  forecast's valid range says there is no forecast rather than showing the nearest
  field, in `client/src/route/__tests__/arrivalConditions.test.ts`.
- [ ] T037 [P] [US5] Test asserting the interface contains no control to accept, task,
  execute or order a route, that the route is labelled a recommendation, and that an
  empty recommended route renders with the planner's stated reason rather than as a
  placeholder line — an interaction and vocabulary test over the rendered output, in
  `client/src/route/__tests__/noInstruction.test.ts` and
  `client/src/route/__tests__/emptyRoute.test.ts`.

### Implementation for User Story 5

- [ ] T038 [US5] Implement the route Deck.gl layer carrying depth and per-vertex
  arrival time, in `client/src/route/RouteLayer.ts`.
- [ ] T039 [US5] Implement the EDR trajectory query with per-vertex timestamps against
  feature 008's provider, using generated response types, in
  `client/src/route/trajectoryQuery.ts`.
- [ ] T040 [US5] Implement the arrival time control and the out-of-range statement in
  `client/src/route/ArrivalTimeControl.tsx`.
- [ ] T041 [US5] Implement the recommendation label and the empty-route reason display
  in `client/src/route/RecommendationLabel.tsx`.

**Checkpoint**: the client's centrepiece renders, and it recommends rather than orders.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T042 [P] Run the wall-clock, literal-path, generated-types-drift and
  forbidden-vocabulary gates over the client additions, and confirm that the client
  carries exactly two `harness:allow-wallclock` markers — liveness evaluation naming
  ADR-0006 and frame interpolation naming ADR-0007 — and no third (SC-013).
- [ ] T043 Write the escape test for ADR-0007's third rule: assert that no value
  derived from the animation frame timestamp reaches a query, an outgoing message, a
  recorded observation, a screenshot's recorded time or any other test's assertion —
  by instrumenting the interpolated clock so any value that leaves the render path is
  detectable — in `client/src/controls/__tests__/interpolationDoesNotEscape.test.ts`
  (SC-014). This is the rule that would otherwise be broken silently: the other two
  show up as a wrong picture, this one shows up as a wrong number somewhere else.
- [ ] T044 [P] Long-session test asserting the client's memory footprint is stable to
  within 10% over an hour of demonstration at the maximum supported rate, in
  `client/src/data/__tests__/longSession.test.ts`.
- [ ] T045 [P] Audit the client additions for any path capable of lighting a component
  or drawing a transit from anything but a received message — no demo mode, no fixture
  mode, no seeded traffic — and add a standing test asserting it, in
  `client/src/loop/__tests__/noSynthesisedTraffic.test.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies beyond feature 003's client existing.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story: all five need the
  subscription, the buffers or the static architectural description.
- **US1 (Phase 3)**: depends on Phase 2 only.
- **US2 (Phase 4)**: depends on Phase 2 and on feature 001's clock service. It is
  independent of US1 and can be built in parallel by a second person.
- **US3 (Phase 5)**: depends on US1, since it applies a treatment to the layout and
  extends the inspector.
- **US4 (Phase 6)**: depends on Phase 2, on feature 009's published uncertainty field
  and on feature 011's projection. It reads better after US2 but does not require it.
- **US5 (Phase 7)**: depends on feature 011's plans and feature 008's EDR trajectory
  provider. Last, matching the SRD's delivery ordering.
- **Polish (Phase 8)**: depends on the stories it audits. T043 depends on T024.

### Story Dependencies

- **US1** depends on control traffic existing — feature 009 — but is testable against
  messages published by hand onto the broker.
- **US2** depends on the clock service's rate control only.
- **US3** depends on US1's layout and inspector.
- **US4** depends on features 009 and 011.
- **US5** depends on features 011 and 008.

### Within Each Story

- Tests are written first and must fail before implementation.
- The subscription and buffers precede anything that renders a message.
- Rate state precedes the control that sets it and the interpolation that follows it.
- The layer precedes the control that moves through it.

### Parallel Opportunities

- T004 and T005 in parallel; T002 precedes T003.
- All test tasks marked `[P]` within a story are separate files and run in parallel.
- T013 and T014 in parallel; Phases 3 and 4 in parallel across two people.
- T042, T044 and T045 in parallel.

---

## Parallel Example: Phase 3 tests

```bash
Task: "Transit routing test in client/src/loop/__tests__/transits.test.ts"
Task: "Cycle phase test in client/src/loop/__tests__/cycle.test.ts"
Task: "Coalescing test in client/src/loop/__tests__/coalesce.test.ts"
Task: "Inspector test in client/src/inspector/__tests__/inspector.test.ts"
Task: "Disconnected state test in client/src/loop/__tests__/disconnected.test.ts"
```

---

## Implementation Strategy

### MVP first

Phase 1, Phase 2, then US1. The loop turning from real traffic, with the message that
just passed readable in full, is the client half of AT-02 and the single most
persuasive thing drogna can show. It needs no planner, no route and no uncertainty
field.

### Incremental delivery

1. Setup and Foundational — control traffic arrives, bounded and attributable.
2. US1 — the loop turns and messages are inspectable. AT-02 becomes watchable.
3. US2 — the viewer controls the rate, and capture can pin it to zero.
4. US3 — the display distinguishes what was built from what was bought.
5. US4 — uncertainty ages and refreshes.
6. US5 — the route renders as a four-dimensional curve, and recommends.

### Notes

- `[P]` means different files with no dependency.
- Commit after each task or coherent group.
- Two rules bind every task in this feature and are not deferrable to polish: nothing
  but a received heartbeat may light a component, and nothing but a received message
  may draw a transit. A convenience fixture that lights something during development is
  a constitution violation, not a shortcut.
- Two uses of host time are permitted in the client and no more: liveness evaluation
  (ADR-0006) and frame interpolation (ADR-0007). Both concern the boundary between the
  simulated world and the machine displaying it. A third is a defect until it is argued
  on its own merits, never by analogy to these two.
