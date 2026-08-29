> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: Control Loop, Route and Uncertainty Visualisation

**Feature Branch**: `012-visualisation`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD §5.9 FR-46, FR-47, FR-48, FR-49, FR-52, FR-53; SRD §2.2 (core versus
plumbing). Extends the browser client (C-18) whose shell and liveness-driven component
layout are delivered by feature 003.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The loop turns, and you can look at the message that just passed (Priority: P1)

The client shows the sense → decide → act → publish cycle turning in real time.
Messages are drawn crossing the boundaries between components as they are actually
published, and a viewer can stop on any boundary and read the last message that
crossed it: its topic, its payload, the simulation time it carried, and the schema it
validates against.

**Why this priority**: This is FR-46 and it is the reason the harness exists as a
running thing rather than a diagram. It is also the client half of AT-02: a threshold
breach must be visibly traceable end to end without anybody opening a terminal. The
message inspector is what turns "there is an architecture" into "here is the byte that
crossed the boundary".

**Independent Test**: Publish a known sequence of control messages onto the broker and
assert that the client renders one transit per message on the correct boundary, in
order, and that selecting each boundary reveals the payload, topic, simulation time
and schema name of the most recent message that crossed it.

**Acceptance Scenarios**:

1. **Given** the client is connected and the loop is running, **When** a message is
   published on a control topic, **Then** a transit is drawn on the boundary between
   the publishing component and its consumers, and no transit is drawn for any
   boundary no message crossed.
2. **Given** a transit has been drawn, **When** the viewer selects that boundary,
   **Then** the message that just passed is shown in full: topic, payload, the
   simulation time it carried, and the name of the JSON Schema it validates against.
3. **Given** the sequence `ctl/divergence` → `ctl/run-request` → `ctl/run-started` →
   `ctl/run-published`, **When** it occurs, **Then** the cycle is visibly traversed in
   that order and the phase currently active is distinguished from the others.
4. **Given** the broker connection drops, **When** the client notices, **Then** the
   loop is shown as stopped and disconnected, not as a loop that happens to be quiet.
   A frozen display that looks healthy is the failure this scenario exists to prevent.
5. **Given** a burst of messages arriving faster than the display can draw them,
   **When** the client renders, **Then** transits are coalesced with the number
   coalesced shown, and the message buffer stays within its configured bound.
6. **Given** the client in any state whatever, **When** its code and behaviour are
   examined, **Then** there is no demo mode, no fixture mode and no
   populate-for-the-screenshot path: every transit drawn and every component lit
   traces to a message genuinely received. (SRD FR-52)

---

### User Story 2 - The viewer sets the speed and the clock obeys (Priority: P2)

The client exposes the simulation speed control. Changing it asks the clock service
for a new rate, and the display shows the rate the clock acknowledged, not the rate
that was asked for.

**Why this priority**: FR-49, and small. It comes second because everything else in
this feature is worth more when the viewer can slow the loop down to watch a single
cycle, or speed it up to watch uncertainty decay over hours of simulated time in a
minute of demonstration. It is also the requirement that keeps FR-10's rate control on
the browser side, where the SRD puts it, and the requirement screenshot capture leans
on: FR-53 pins the rate to zero for the duration of a capture so a before-and-after
pair differs only where the change under evidence differs.

**Independent Test**: Set the control to each supported rate and assert that the
observed advance of displayed simulation time changes accordingly, and that the
displayed rate always matches what the clock service reports rather than what was
requested.

**Acceptance Scenarios**:

1. **Given** the client is connected to the clock service, **When** the viewer changes
   the speed control, **Then** a rate change is requested and the displayed rate
   updates only once the clock service has acknowledged it.
2. **Given** the clock service refuses or clamps a requested rate, **When** it
   responds, **Then** the display shows the rate actually in force and indicates that
   the request was adjusted.
3. **Given** the rate is changed, **When** displayed simulation time is observed,
   **Then** its rate of advance changes accordingly and no displayed timestamp is
   derived from the viewer's own machine.
4. **Given** the clock service becomes unreachable, **When** the client notices,
   **Then** displayed simulation time stops and is marked stale rather than continuing
   to advance from the browser's own clock.
5. **Given** the rate is set to zero, **When** the clock acknowledges it, **Then** the
   rate of zero is treated as a legitimate rate in force: simulation time stops, every
   time-driven animation stops, and the display says paused rather than appearing
   broken or disconnected. (SRD FR-53)
6. **Given** a capture is about to be taken, **When** the rate has been set to zero,
   **Then** the client exposes the acknowledged rate in a form the capture path can
   read, so the capture begins only once the pin has taken effect and two shots of the
   same state are identical. (SRD FR-53)

---

### User Story 3 - What is bespoke and what is bought is visible (Priority: P3)

Every component and every boundary in the layout is shown as either bespoke core or
well-chosen plumbing, and the bespoke items are named: the residual and divergence
rules, the scheduling policy, the sound speed computation, the quality flagging, the
uncertainty and planning mathematics, and the data dictionary made executable. The
message inspector shows the schema that governs each message, which is what makes the
data dictionary executable rather than merely documented.

**Why this priority**: SRD §2.2 asks the visualisation to make this distinction
visible rather than hiding it, and it is the difference between a demonstration that
claims a lot and one that claims exactly what it built. It is third because it is a
treatment applied to a layout and an inspector that User Story 1 must first produce.

**Independent Test**: Assert that every component and boundary rendered carries a
classification, that the named bespoke items each appear against the component that
owns them, and that the classification cannot cause a component to appear or to be
lit — removing a live component's heartbeat greys it out regardless of its
classification.

**Acceptance Scenarios**:

1. **Given** the rendered layout, **When** any component or boundary is inspected,
   **Then** it carries a classification of bespoke core or plumbing, with no
   unclassified elements.
2. **Given** a component classified as bespoke, **When** the viewer inspects it,
   **Then** the specific bespoke logic it contains is named, not merely asserted.
3. **Given** a component classified as bespoke core, **When** its heartbeat stops,
   **Then** it greys out exactly as any other component does. Classification changes
   appearance; only liveness changes illumination.
4. **Given** a message in the inspector, **When** the viewer looks at it, **Then** the
   schema governing it is shown alongside the payload, so the contract and the
   instance are visible together.

---

### User Story 4 - Uncertainty decays, and then it refreshes (Priority: P4)

The client renders the uncertainty field over the map. Between model runs it decays
visibly as simulation time passes, and when a run is published it refreshes. The
client shows what has been published and what the planner projects; it does not invent
its own uncertainty mathematics.

**Why this priority**: FR-48, and the most legible single piece of evidence that the
control loop is doing something. It is fourth because it needs a published uncertainty
field from feature 009, and its decay presentation reads best once the speed control
of User Story 2 exists.

**Independent Test**: With a published uncertainty field and a projection, advance
simulation time and assert the rendered field changes accordingly; publish a new run
and assert the field refreshes within one animation cycle, with no polling request
having been issued to the query layer.

**Acceptance Scenarios**:

1. **Given** a published uncertainty field, **When** simulation time advances between
   runs, **Then** the rendered field visibly decays in confidence terms, following the
   projection the planner published rather than a decay curve computed in the browser.
2. **Given** a new run is announced on `ctl/run-published`, **When** the client
   receives it, **Then** the uncertainty overlay refreshes, and the client has issued
   no polling request to the query layer to discover that the run existed.
3. **Given** telemetry reports that the forecast is not beating its persistence
   reference, **When** the client renders forecast quality, **Then** it says so in
   plain words, together with the sample count and the two errors behind the figure.
4. **Given** telemetry reports a statistic as stale, **When** the client renders it,
   **Then** it is shown as stale with the simulation time of its last update, and not
   as a current value.
5. **Given** an uncertainty field with more cells than can usefully be drawn, **When**
   it is rendered, **Then** it is downsampled and the display states the resolution it
   is showing.

---

### User Story 5 - The route is a curve through a volume, and it is a recommendation (Priority: P5)

The planned route is drawn as a four-dimensional curve through the forecast volume:
horizontal path, depth, and the time of arrival at each vertex. A time control moves
along it and shows the conditions forecast for the moment of arrival at each point,
not the conditions at the moment of asking. It is labelled a recommendation, and there
is nothing on the screen to accept, task or execute it.

**Why this priority**: FR-47, and the client's centrepiece. It is last because it
depends on the planner (feature 011), which the SRD's delivery priorities put below
the line, and on EDR trajectory queries with per-vertex timestamps (FR-20), whose
viability is the subject of the spike in feature 002.

**Independent Test**: With a published plan, assert the route renders with depth and
per-vertex arrival times, that moving the time control shows conditions matching the
EDR trajectory response for that vertex's timestamp, and that no control exists to
accept or task the route.

**Acceptance Scenarios**:

1. **Given** a plan published on `ctl/plan`, **When** it is rendered, **Then** the
   route appears as an ordered curve carrying horizontal position, depth and arrival
   simulation time at each vertex.
2. **Given** the route is displayed, **When** the viewer moves the time control along
   it, **Then** the conditions shown for each point are those forecast for that point's
   arrival time, obtained from an EDR trajectory query with per-vertex timestamps.
3. **Given** a route vertex whose arrival time lies beyond the forecast's valid range,
   **When** the viewer reaches it, **Then** the display says there is no forecast for
   that moment rather than showing the nearest available field as though it applied.
4. **Given** the route display, **When** the whole interface is examined, **Then**
   there is no control to accept, task, execute or order the route, and the route is
   labelled a recommendation.
5. **Given** the planner recommends an empty route, **When** it is rendered, **Then**
   the stated reason is shown — nothing worth sampling, or budget too small — rather
   than an empty map with no explanation.

---

### Edge Cases

- **No control traffic at all.** The loop renders as idle and connected, which is a
  different state from idle and disconnected, and the two are visually distinct.
- **A message arrives for a component the shell has never heard from.** The transit is
  drawn to a greyed component; liveness is not inferred from the fact that somebody
  addressed it.
- **A message that fails schema validation.** It is shown in the inspector as
  received, marked invalid, with the validation error. It is not hidden and it is not
  rendered as though valid.
- **Very long session.** Message buffers are bounded per topic and evict oldest first;
  the client's memory footprint is stable over an hour of demonstration.
- **Speed set to zero.** Zero is a rate, not an error. Simulation time stops
  advancing, animations that represent simulation time stop, the display says paused,
  and the acknowledged rate is readable so a capture can know the pin took effect
  (SRD FR-53).
- **Clock service unreachable.** Displayed simulation time stops and is marked stale.
  Nothing falls back to the browser's clock as a source of truth.
- **No plan has ever been published.** The route surface says so. It does not draw a
  straight line between two points as a placeholder.
- **Uncertainty field published with no projection yet available.** The field renders
  and is marked as not decaying, because the client does not compute decay itself.
- **Window resized or map rotated mid-animation.** Transits and the route survive the
  reprojection; nothing is anchored to screen coordinates captured once.

## Requirements *(mandatory)*

### Functional Requirements

#### The loop and the message inspector

- **FR-001**: The client MUST subscribe to the control namespace over the broker's
  WebSocket listener and MUST render one transit per received message on the boundary
  between its publisher and its consumers. (SRD FR-46)
- **FR-002**: The client MUST render the sense → decide → act → publish cycle as a
  cycle, with the currently active phase distinguished, driven by the control messages
  actually received. (SRD FR-46, SRD §2)
- **FR-003**: The client MUST NOT draw a transit for a message it did not receive, and
  MUST NOT infer that a message was sent from the fact that a later one was.
  (Constitution VII)
- **FR-004**: The viewer MUST be able to select any boundary and inspect the most
  recent message that crossed it, seeing its topic, its full payload, the simulation
  time it carried and the name of the schema it validates against. (SRD FR-46, §2.2)
- **FR-005**: A received message that fails validation against its schema MUST be
  shown as received and marked invalid with the validation error, never hidden and
  never presented as valid.
- **FR-006**: Message buffers MUST be bounded per topic by a configured depth, evicting
  oldest first, so a long session's memory footprint is stable.
- **FR-007**: When the broker connection is lost, the client MUST render the loop as
  stopped and disconnected, distinguishably from idle and connected. (Constitution VII)
- **FR-008**: When messages arrive faster than the display can draw them, the client
  MUST coalesce transits and show the number coalesced rather than dropping them
  silently or falling behind unboundedly.

#### Liveness

- **FR-009**: The client MUST derive the simulation clock component's illumination
  from the clock's heartbeat on the control namespace. That heartbeat is drogna's first
  liveness signal and the pattern every later component follows. Liveness windows MUST
  be evaluated in **real time**: the simulation time a heartbeat carries is payload,
  not schedule, because liveness answers "is this process alive?", which is a fact
  about the host and not about the simulated world. A rate of zero therefore leaves
  every live component lit, which is what a capture at rate zero requires (SRD FR-53)
  and what an observer would expect, since pausing the simulated world does not kill
  the processes simulating it. The evaluation carries the `// harness:allow-wallclock`
  marker with ADR-0006 as its reason, and illumination is the only thing it may drive:
  the client MUST NOT display an elapsed time since a component was last heard from, or
  any other host-derived quantity, so a rate-zero capture is stable between frames.
  (SRD FR-52, FR-45, FR-53; Constitution I, Constitution VII, ADR-0006)
- **FR-010**: No mocked, synthesised or fixture-sourced traffic may drive illumination
  or a transit. The client MUST contain no demo mode, no fixture mode and no
  populate-for-the-screenshot path, because a mock asserts the existence of something
  that does not exist and so defeats FR-45. (SRD FR-52, Constitution VII)

#### Simulation speed

- **FR-011**: The client MUST expose the simulation speed control. (SRD FR-49, FR-10)
- **FR-012**: A rate change MUST be a request to the clock service, and the displayed
  rate MUST be the rate the clock service reports in force, not the rate requested.
  Where a request is clamped or refused, the display MUST say so. (SRD FR-10)
- **FR-013**: Every time the client displays MUST be simulation time obtained from the
  clock service. When the clock service is unreachable, displayed time MUST stop and
  be marked stale, and MUST NOT continue to advance from the browser's clock.
  The client MAY read the browser's animation frame timestamp for the sole purpose of
  interpolating between two received simulation clock samples for display, under three
  binding rules. First, it MUST NOT extrapolate past the most recent sample, so the
  display cannot invent a simulation time the clock has not reached. Second, every
  arriving sample is authoritative and snaps the display to it: the interpolation is
  discarded on arrival rather than blended, so error cannot accumulate. Third, no value
  derived from it may leave the render path — not to a query, not into a message, not
  into a recorded observation, not into a screenshot's recorded time, and not into a
  test assertion. The read carries the `// harness:allow-wallclock` marker with
  ADR-0007 as its reason and is confined to one module. Rendering on clock samples
  alone remains a supported mode, so dropping interpolation costs smoothness and
  nothing else if those three rules ever become hard to hold; and if sample arrival
  stops, the display holds at the last sample rather than drifting forward, which makes
  a rate of zero indistinguishable from a paused display, correctly.
  (Constitution I, ADR-0007; SRD FR-46 to FR-48)
- **FR-014**: A rate of zero MUST be a legitimate rate. Setting it pins the clock:
  simulation time stops, every time-driven animation stops, and the display says paused
  rather than showing an error or a disconnection. (SRD FR-49, FR-53)
- **FR-015**: The client MUST expose the acknowledged rate in force in a form the
  screenshot capture path can read, so a capture can set the rate to zero and know the
  pin has taken effect before it shoots. (SRD FR-53)

#### Core versus plumbing

- **FR-016**: Every component and every boundary rendered MUST carry a classification
  of bespoke core or well-chosen plumbing, with no unclassified elements. (SRD §2.2)
- **FR-017**: Components classified as bespoke MUST name the specific logic that makes
  them so — residual and divergence rules, scheduling policy, sound speed computation,
  quality flagging, uncertainty and planning mathematics, the executable data
  dictionary — rather than asserting bespokeness in the abstract. (SRD §2.2)
- **FR-018**: Classification MUST affect appearance only. It MUST NOT cause a
  component to appear in the layout, MUST NOT light a component, and MUST NOT
  substitute for a heartbeat. Illumination remains liveness-driven.
  (Constitution VII, SRD FR-45)
- **FR-019**: The message inspector MUST display the governing schema alongside the
  payload, so the data dictionary is visible in execution rather than only in
  documentation. (SRD §2.2)

#### Uncertainty over time

- **FR-020**: The client MUST render the uncertainty field published by the model
  runner, and MUST refresh it on receipt of `ctl/run-published`. (SRD FR-48, FR-31)
- **FR-021**: The client MUST NOT poll the query layer to discover that a new run
  exists. Freshness arrives as an announcement. (SRD FR-31)
- **FR-022**: Between runs, the client MUST render the decay of confidence using the
  projection the planner publishes, and MUST NOT compute its own decay model. Where no
  projection is available, the field MUST be rendered and marked as not decaying.
  (SRD FR-48, FR-34)
- **FR-023**: Where telemetry reports that the forecast is not beating its persistence
  reference, the client MUST say so in plain words, alongside the sample count and the
  two errors behind the figure. Where telemetry reports a statistic stale, the client
  MUST render it as stale with its last-update simulation time. (SRD FR-38,
  Constitution IX)
- **FR-024**: A field too large to draw usefully MUST be downsampled with the displayed
  resolution stated, never silently.

#### The route

- **FR-025**: The client MUST render the planned route as a four-dimensional curve
  through the forecast volume: horizontal path, depth, and arrival simulation time at
  each vertex. (SRD FR-47)
- **FR-026**: The client MUST provide a time control along the route which shows, for
  each point, the conditions forecast for the moment of arrival at that point,
  obtained from an EDR trajectory query with per-vertex timestamps. (SRD FR-47, FR-20)
- **FR-027**: Where a vertex's arrival time falls outside the forecast's valid range,
  the client MUST say there is no forecast for that moment rather than substituting
  the nearest available field. (SRD FR-20)
- **FR-028**: The route MUST be labelled a recommendation, and the interface MUST
  contain no control to accept, task, execute or order it. (SRD FR-36,
  Constitution VIII)
- **FR-029**: An empty recommended route MUST be rendered with the reason the planner
  gave. (SRD FR-36)

#### Cross-cutting

- **FR-030**: All message and API types used by these additions MUST come from
  `client/src/generated/`. No shape crossing the language boundary may be
  hand-written here. (Constitution III)
- **FR-031**: Broker URL, query layer base path and topic prefixes MUST arrive from
  runtime configuration served to the client, never as literals in source.
  (Constitution IV)
- **FR-032**: No display element may present a tracked entity, contact, detection or
  track. The sampling platform is a position marker; the route is a recommendation
  over cells. (Constitution V)

### Key Entities

- **Transit**: one received control message rendered as a crossing of one boundary,
  carrying its topic, its simulation time, its payload and its validation state.
- **Boundary**: an edge in the rendered layout between a publishing component and its
  consumers, holding the bounded buffer of the messages that crossed it and its
  core-or-plumbing classification.
- **Cycle phase**: one of sense, decide, act, publish, made active by the arrival of
  the control message that marks it.
- **Classification**: the static architectural fact that a component or boundary is
  bespoke core or well-chosen plumbing, together with the named bespoke logic where
  applicable. Never a claim that anything exists or is running.
- **Rate state**: the simulation rate requested by the viewer, the rate the clock
  service reports in force, whether the two differ, and whether the rate in force is
  zero — the pinned state a screenshot capture depends on.
- **Uncertainty overlay**: the published uncertainty field, the projection governing
  its displayed decay, the identifier of the run it came from, and its displayed
  resolution.
- **Route display**: the plan's committed route as an ordered set of vertices with
  horizontal position, depth and arrival time, plus the conditions retrieved for each
  vertex's arrival moment, the plan identifier, and the empty-route reason where there
  is one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a published sequence of control messages, the count of rendered
  transits equals the count of received messages (after declared coalescing), and the
  count of transits with no corresponding received message is zero.
- **SC-002**: The most recent message on every boundary that has carried traffic is
  inspectable, showing topic, payload, simulation time and schema name, in 100% of
  cases.
- **SC-003**: A viewer watching only the client can observe a threshold breach lead to
  a published run — the AT-02 sequence — without recourse to a terminal or a log.
- **SC-004**: The client's memory footprint is stable to within 10% over an hour of
  demonstration at the maximum supported simulation rate.
- **SC-005**: The displayed simulation rate equals the rate the clock service reports
  in force in 100% of samples, including after a clamped or refused request.
- **SC-006**: With the clock service disconnected, the count of displayed timestamps
  that continue to advance is zero.
- **SC-007**: 100% of rendered components and boundaries carry a classification, and
  removing a component's heartbeat greys it out regardless of classification in 100%
  of trials.
- **SC-008**: With only the simulation clock alive, exactly one component is lit —
  the clock — and it is lit by its heartbeat. With nothing alive, the count of lit
  components is zero. A search of the client for a fixture, demo or seeded-traffic path
  capable of lighting a component returns nothing.
- **SC-009**: With the rate pinned to zero and acknowledged, the client's rendered
  output does not change between frames, so two captures of the same state are
  identical.
- **SC-010**: The uncertainty overlay refreshes within one animation cycle of a
  `ctl/run-published` message, and the count of polling requests issued to the query
  layer for freshness is zero over a full session.
- **SC-011**: For every vertex of a displayed route, the conditions shown match the EDR
  trajectory response for that vertex's timestamp to within display precision.
- **SC-012**: The interface contains zero controls to accept, task, execute or order a
  route, asserted by an automated interaction and vocabulary test.
- **SC-013**: The wall-clock lint gate reports zero unmarked uses of host time in the
  client additions. Exactly two marked exemptions exist, each naming its ADR: liveness
  evaluation (ADR-0006) and frame interpolation (ADR-0007). A third is a defect until
  argued on its own merits.
- **SC-014**: No value derived from the animation frame timestamp reaches a query, a
  message, a recorded observation, a screenshot's recorded time or a test assertion;
  the count of such values crossing out of the render path is zero, asserted by a test
  rather than by inspection, because this is the rule that would be broken silently.
- **SC-015**: With the clock rate pinned to zero for longer than the declared liveness
  window, the count of components that were lit before the pin and are dark after it is
  zero, and the displayed simulation time does not advance.

## Assumptions

- This feature extends the browser client that feature 003 delivers and adds only to
  `client/src/`. The component layout, the liveness-driven illumination from
  `ctl/heartbeat`, the broker connection and the landing page statement required by
  FR-01 are feature 003's and are consumed here unchanged.
- The client subscribes to the control namespace through the broker's WebSocket
  listener. The SRD names MQTT and separate namespaces but does not state how the
  browser reaches the broker; a WebSocket listener on the same broker is assumed, with
  the client confined to subscribing.
- The mapping from a topic to the boundary it crosses — which component publishes it
  and which consume it — is a static architectural fact, recorded once and shared with
  the classification data. It is used to place a transit, never to claim a component
  exists.
- Visual decay of uncertainty between runs is driven by the planner's published
  projection (SRD FR-34). The alternative — a decay curve computed in the browser —
  would put bespoke mathematics in the client and produce a second, divergent model of
  the same quantity. Recorded here because the SRD requires the decay to be visible
  without saying who computes it.
- Rendering of forecast skill and staleness (FR-019) places words into whatever
  component-status surface feature 003 already provides, rather than creating a second
  status surface. If no such surface exists, this feature adds one panel and no more.
- Frame scheduling uses the browser's animation frame callback, and its timestamp is
  used solely to interpolate smoothly between two simulation-clock samples. This is no
  longer a violation to be argued: ADR-0007 decides it, the constitution carries the
  exemption, and FR-013 states the three rules that bound it. It is never a source of
  truth for any displayed time or any state transition, and the render-on-clock-samples
  fallback stated in the same requirement remains available at the cost of smoothness
  alone.
- The client's second and last use of host time is liveness evaluation, under ADR-0006.
  Both exemptions concern the boundary between the simulated world and the machine
  displaying it, which is the shape of that boundary rather than a slide; a third
  request is evidence the principle is being eroded and must be argued on its own
  merits, never by analogy to these two.
- Screenshot capture, before-and-after pairs and feature-completion shots are feature
  016's, and this feature adds no capture plumbing of its own. What it owes the capture
  path is FR-53's two halves: a rate of zero that pins the clock, and an acknowledged
  rate readable from outside so the capture knows the pin took effect. States are
  otherwise reachable deterministically from a seed and a rate.
- There is no route by which this feature can light a component other than a
  heartbeat. Feature 003 builds the shell against SRD FR-52 and this feature adds no
  demo mode, no fixture mode and no synthesised traffic, in the client or in its tests
  that run against the real client build. Test doubles exist only inside unit tests and
  never in a shipped code path.
- Route rendering depends on EDR trajectory queries with per-vertex timestamps
  (SRD FR-20). Those are served by a bespoke pygeoapi EDR provider plugin (SRD FR-50)
  owned by feature 008, since no supplied provider implements trajectory; the standard
  carries the per-vertex time natively as the M ordinate of a WKT `LINESTRINGM` or
  `LINESTRINGZM`, and the response is CoverageJSON's Trajectory domain. The one
  narrow unknown left is whether M survives WKT parsing, which SRD FR-51 addresses with
  a Shapely and GEOS version pin and a test, and which feature 002's spike proves. This
  feature consumes the resulting responses and implements none of that.
