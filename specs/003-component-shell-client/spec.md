> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: Greyed-Out Component Shell

**Feature Branch**: `003-component-shell-client`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD FR-45, FR-01, FR-52, FR-53, C-18, §10 delivery priority 3, §11 resolved question 3. Constitution VII is the load-bearing principle.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The whole architecture, dark, and an honest label (Priority: P1)

Someone opens drogna in a browser on the first day, when almost nothing exists. They see the entire
component layout — all eighteen components and the flow between them — with every component greyed
out, and a plain statement that this is a learning harness running synthetic data and fake numerics.
Nothing on the page suggests anything is working, because nothing is.

**Why this priority**: §10 puts the shell third because it is the feedback surface, the
always-showable artefact and the anchor for the Playwright loop. FR-01 rides with it: the moment
there is a page, the page must say what it is.

**Independent Test**: Load the built client with no broker, no clock service and no network beyond
the static assets. The layout renders complete and dark, and the statement is visible without
scrolling or interaction.

**Acceptance Scenarios**:

1. **Given** a fresh build served with nothing else running, **When** the page loads, **Then** all
   eighteen components render, all dark, and no error state hides the layout.
2. **Given** the page has loaded, **When** a viewer reads it without interacting, **Then** the
   statement that this is a learning harness with synthetic data and fake numerics is already
   visible at both a desktop and a phone-width viewport.
3. **Given** the broker and the clock service are unreachable, **When** the page loads, **Then** the
   layout still renders and the page says plainly that it is hearing nothing, rather than showing a
   blank screen or an empty diagram.
4. **Given** the page is open, **When** a viewer inspects the layout, **Then** it is labelled as a
   drawing of the intended architecture, so a dark component reads as "not heard from" rather than
   "broken" or "imaginary".

---

### User Story 2 - Components light up because they said something (Priority: P2)

A component starts, publishes a heartbeat on `ctl/heartbeat`, and its node lights. It keeps
heartbeating and stays lit. It stops, and after its declared liveness window has elapsed in
simulation time, it goes dark again. Nothing else can light it: not a configuration file, not a
flag, not a list in the client's source, and not a mock.

**Why this priority**: Constitution VII, promoted to non-negotiable in version 1.1.0, and the whole
evidential value of drogna. A display that can claim a component exists when it does not makes every
other claim suspect.

**Independent Test**: Publish heartbeats for one component id, then stop. The node lights within one
interval and darkens within its declared window. With no heartbeats at all, no node lights, whatever
any configuration document contains.

**Acceptance Scenarios**:

1. **Given** no heartbeats have been received, **When** the client renders, **Then** every node is
   dark regardless of what any configuration document contains.
2. **Given** a valid heartbeat for a component with a declared liveness window, **When** it is
   received, **Then** that node lights within one render frame and shows its reported status.
3. **Given** a lit component, **When** heartbeats stop and simulation time advances past the
   declared window, **Then** the node returns to dark without any other input.
4. **Given** a heartbeat that fails schema validation, **When** it arrives, **Then** it lights
   nothing, is counted as discarded, and the count is visible on the page.
5. **Given** a heartbeat carrying a component id that is not in the layout, **When** it arrives,
   **Then** it is displayed as an unmapped live component rather than dropped, because the display
   must never hide something that is genuinely alive.
6. **Given** the simulation clock is paused, **When** heartbeats stop, **Then** nothing decays,
   because decay is measured in simulation time, and the paused clock state is displayed
   prominently so a frozen display is not read as a healthy one.
7. **Given** the clock is unreachable or stale beyond tolerance, **When** the client renders,
   **Then** liveness is shown as indeterminate rather than lit or dark, and the clock is shown as
   stale.

---

### User Story 3 - The clock is the first thing that lights (Priority: P3)

The simulation clock from feature 001 publishes a heartbeat on the control namespace. The client
derives that component's illumination from it, and that single lit node — against seventeen dark
ones — is drogna's first genuine liveness signal and the pattern every later component follows. It
is also what makes a screenshot worth taking: an all-grey shell yields an image that never changes,
so the capture pipeline could be shown to run but never shown to discriminate.

**Why this priority**: SRD FR-52 settles the question of whether the shell needs mocked traffic, and
the answer is no. One genuinely live component supplies the change, and the clock is already first
in the delivery order for unrelated reasons.

**Independent Test**: Run the clock service and nothing else. Exactly one node is lit. Stop the
clock service and, once simulation time has passed the declared window — which requires the clock,
so the display correctly becomes indeterminate instead — the page says what it can no longer tell.

**Acceptance Scenarios**:

1. **Given** the clock service is running and no other component exists, **When** the page loads,
   **Then** exactly one node is lit, and it is the simulation clock.
2. **Given** the clock's heartbeat is the only traffic on `ctl/heartbeat`, **When** a later component
   begins heartbeating, **Then** it lights by exactly the same path, with no client change.
3. **Given** a capture pins the clock rate to zero, **When** the page is captured, **Then** it
   renders correctly with the rate at zero, shows the clock as paused rather than stale, and nothing
   decays for the duration of the capture, because simulation time is not advancing.
4. **Given** two captures taken with the rate pinned to zero, **When** they are compared, **Then**
   they are identical outside regions the capture configuration declares dynamic.
5. **Given** the built client, **When** it is searched for a way to light a node without a received
   heartbeat, **Then** there is none: no demo mode, no fixture mode, no populate-for-screenshot
   path, no query parameter, no build flag.

---

### User Story 4 - The picture is the loop (Priority: P4)

The layout is a flow chart with a loop in it, not a hexagon and not a box diagram: the sense →
decide → act → publish cycle is visible as a cycle, and the parts that are genuinely bespoke are
distinguished from the parts that are well-chosen plumbing.

**Why this priority**: SRD §2 says the architecture's interesting property is temporal and that a
static structural diagram obscures it, and §2.2 says the visualisation makes the core and plumbing
distinction visible rather than hiding it. It is fourth because it refines a layout that already
works.

**Independent Test**: A reader who has not read the SRD can trace the cycle around the diagram and
say which components hold bespoke logic.

**Acceptance Scenarios**:

1. **Given** the layout, **When** a reader follows the control loop, **Then** the cycle is drawn as
   a closed path through monitor, scheduler, model runner and publisher, and reads as a cycle.
2. **Given** the layout, **When** a reader looks for the bespoke parts, **Then** components holding
   bespoke logic are distinguished from plumbing by a stated visual convention with a legend.
3. **Given** the distinction is drawn, **When** it is compared with SRD §2.2, **Then** it matches:
   nothing is claimed as bespoke that is a broker, a store, a proxy or the query layer.

---

### Edge Cases

- Lit means heard from, not working. A component that heartbeats while failing at its actual job is
  lit. The page says what lit means, so the claim stays inside what the evidence supports.
- The client's own node. The client cannot hear itself over the broker, and pretending otherwise
  would be theatre; its node is lit by its own presence and labelled as such.
- Short-lived components. The environment generator runs, publishes heartbeats, finishes and goes
  dark. That is truthful, not a fault, and the layout does not imply it should be permanently lit.
- Heartbeats arriving out of order. State is keyed to the most recent simulation time carried in the
  message, not to arrival order.
- Two components publishing the same component id. Both are shown, and the conflict is displayed
  rather than resolved silently.
- A heartbeat whose simulation time is ahead of the client's last received tick, which happens when
  the client's tick stream lags. Within one tick this is treated as current; beyond that it is
  flagged.
- The clock rate is pinned to zero for a long real interval during a capture. Nothing decays and the
  display is stable, which is the point; the clock state shows paused throughout so the stillness is
  never read as health.
- Rate zero and clock unreachable look similar to a casual glance and mean opposite things. Paused
  is a state received from the clock; stale is the absence of any state. They are rendered
  differently and labelled.
- High rate multipliers. Rendering is throttled to the display's frame budget, but liveness is
  computed from every heartbeat received, never from a sampled subset.
- Broker reachable, no traffic at all. The page distinguishes "connected and hearing nothing" from
  "not connected", because they mean different things.
- The runtime configuration document is missing or invalid. The static shell and the FR-001
  statement still render; the transport does not start, and the failure is shown.
- A very small viewport. The layout remains legible or becomes scrollable, and the honesty statement
  is never the thing that gets dropped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The landing view MUST state plainly, without interaction and above the fold at both
  desktop and phone widths, that this is a learning harness with synthetic data and fake numerics.
  (SRD FR-01, Constitution V)
- **FR-002**: The client MUST render the full component layout — every component in the SRD
  component table — from the first commit, with components greyed out until they are heard from.
  (SRD FR-45)
- **FR-003**: A component MUST be lit only because a heartbeat from it arrived within its declared
  liveness window. (SRD FR-45, Constitution VII)
- **FR-004**: No configuration document, feature flag, build-time list, query parameter or mocked
  message may cause a component to be lit. The liveness computation's only inputs are heartbeats
  received from the broker and the simulation time. (SRD FR-52, Constitution VII)
- **FR-005**: The client MUST contain no demo mode, no fixture mode and no
  populate-for-the-screenshot path, in any build. A mock asserts the existence of something that does
  not exist, which is the failure FR-45 exists to prevent. (SRD FR-52, Constitution VII)
- **FR-006**: The liveness window MUST be evaluated in simulation time, comparing the current
  simulation time from the clock service against the simulation time carried in the heartbeat, using
  the window the heartbeat itself declares. (SRD FR-09, FR-45)
- **FR-007**: The client MUST take simulation time from the clock service (C-01) and MUST NOT read
  the browser clock in any operational path. (SRD FR-09, Constitution I)
- **FR-008**: The client MUST derive the simulation clock's illumination from its heartbeat on
  `ctl/heartbeat`, by the same path every later component uses. (SRD FR-52)
- **FR-009**: The client MUST display the clock state — mode, rate, current tick, and staleness —
  and MUST render a paused clock and a stale clock differently, since one is a state received and
  the other is the absence of any state. (SRD FR-10, FR-53, FR-45)
- **FR-010**: A clock rate of zero MUST be a legitimate displayed state: the page renders correctly,
  liveness does not decay because simulation time is not advancing, and the display remains stable
  for the duration of a capture. (SRD FR-53, PR-10)
- **FR-011**: When the clock is stale beyond the configured tolerance, liveness MUST be displayed as
  indeterminate rather than as lit or dark. (SRD FR-09, FR-45)
- **FR-012**: The heartbeat message MUST be defined once in
  `contracts/schemas/heartbeat.schema.json`, with `$id`
  `https://schemas.harness.invalid/heartbeat.schema.json`, carrying at least: component id,
  simulation time, tick, status, declared heartbeat interval, declared liveness window, run id and
  config digest. (SRD NFR-02, FR-52, repo layout)
- **FR-013**: A heartbeat failing schema validation MUST light nothing, MUST be counted, and the
  count MUST be visible. (SRD NFR-02, FR-45)
- **FR-014**: A heartbeat carrying a component id absent from the layout MUST be displayed as an
  unmapped live component, never silently discarded. (Constitution VII)
- **FR-015**: Reported status MUST be rendered distinguishably — at least starting, ok, degraded and
  stopping — so a degraded component is not shown as a healthy one. (SRD FR-45)
- **FR-016**: The layout MUST be labelled as a drawing of the intended architecture, so that a dark
  node reads as "not heard from". (SRD FR-45, Constitution VII)
- **FR-017**: The layout MUST render the control loop as a closed cycle, matching SRD §2, and MUST
  distinguish components holding bespoke logic from plumbing with a legend, matching SRD §2.2.
  (SRD §2, §2.2)
- **FR-018**: The client MUST obtain its runtime configuration from a served document validated
  against `contracts/schemas/config.client.schema.json` before it opens any transport, and MUST
  contain no other literal host, port or URL. (SRD NFR-04, Constitution IV)
- **FR-019**: The static shell and the FR-001 statement MUST render before, and independently of,
  any successful network call. (SRD FR-45)
- **FR-020**: The client MUST be read-only on the broker: it subscribes to `ctl/heartbeat` and
  publishes nothing on any topic. (SRD FR-14, Constitution X)
- **FR-021**: Connection state MUST be displayed, distinguishing not connected from connected but
  silent. (SRD FR-45)
- **FR-022**: Every component node and every status region MUST carry a stable test identifier, so
  that capture and end-to-end work can address them without depending on layout. (PR-10)
- **FR-023**: The liveness computation MUST be a pure function of received heartbeats and simulation
  time, unit tested independently of rendering. Constructing heartbeat values as inputs to that
  function in a unit test is testing a function, not driving a display, and no such path exists in
  the built client. (Constitution VII)
- **FR-024**: Lit and dark MUST be distinguishable by more than colour alone, so the state survives
  a greyscale screenshot in the blog. (PR-08)
- **FR-025**: The client's own node MUST be lit by its own presence and labelled as such, since it
  cannot hear itself over the broker. (Constitution VII)

### Key Entities

- **Component node**: One entry in the layout: component id, name, responsibility, whether it holds
  bespoke logic, and its position in the flow.
- **Layout map**: The static drawing of the intended architecture — nodes and edges, including the
  control loop cycle. Documentation, carrying no claim about existence.
- **Heartbeat**: The message that is the only evidence of liveness: component id, simulation time,
  tick, status, declared interval, declared liveness window, run id, config digest.
- **Liveness state**: Per component: last heartbeat, last status, and the derived state of lit,
  dark, indeterminate or unmapped.
- **Clock state**: Mode, rate, current tick, simulation time, staleness, as read from the clock
  service. A rate of zero is a normal value.
- **Connection state**: Not connected, connected and silent, or receiving.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With no broker and no clock service reachable, the page renders the complete dark
  layout and the honesty statement within two seconds of load over the droplet link on a cold cache.
- **SC-002**: With the clock service running and nothing else, exactly one node is lit, and it is the
  simulation clock.
- **SC-003**: A component that begins publishing heartbeats is lit within one declared interval, and
  returns to dark within its declared liveness window plus one tick after they stop.
- **SC-004**: The built client contains no code path that lights a node from anything other than a
  received heartbeat: no demo mode, no fixture module, no query parameter and no build flag, as
  demonstrated by inspection of the bundle and by the reducer's unit tests.
- **SC-005**: The client's operational source contains zero occurrences of `Date.now`, `new Date`
  or `performance.now`, as demonstrated by the wall-clock gate.
- **SC-006**: An invalid heartbeat never lights a node, and the visible discard count increments by
  exactly one per invalid message.
- **SC-007**: Two captures taken with the clock rate pinned to zero are identical outside regions the
  capture configuration declares dynamic.
- **SC-008**: A heartbeat carrying an unmapped component id becomes visible on the page within one
  declared interval.
- **SC-009**: The honesty statement is present in the initial HTML payload, not only after
  hydration, and remains visible at a 375-pixel-wide viewport.

## Assumptions

- SRD §11 records the mocked-traffic question as resolved: the shell needs no mocked traffic, because
  the clock's heartbeat is the first real liveness signal and capture pins the clock rate to zero.
  This feature implements that answer rather than reopening it, which is why it depends on feature
  001 being delivered first — as the delivery order already requires.
- The broker exposes an MQTT-over-WebSocket listener the browser can reach. Its configuration and its
  exposure through the reverse proxy belong to the deployment and proxy features; this feature
  consumes them and records the dependency.
- Deck.gl is a dependency of the client package because the map surfaces of later features need it.
  The component shell itself is a node-link diagram rendered as SVG, because Deck.gl adds nothing to
  a diagram of eighteen boxes and an abstraction for its own sake is a constitution violation.
- The layout map is derived from the SRD component table (C-01 to C-18) and held as a static data
  module inside the client, labelled as a drawing. This is not a breach of Constitution VII: it
  determines what is drawn, never what is lit.
- One relative bootstrap URL for the runtime configuration document is unavoidable in a browser
  application. It is the single permitted literal in the client, carries an inline exemption marker
  with its reason, and appears in the exemption inventory.
- `contracts/schemas/config.client.schema.json` is created by this feature as the first to need it.
- The simulation speed control of SRD FR-49 belongs to the visualisation feature, and pinning the
  rate to zero for a capture (FR-53) is done by the capture feature against the clock's control
  surface. This feature displays clock state and offers no control, so the control surface is
  designed once.
- The heartbeat's declared liveness window is chosen per component and carried in the message, so
  the client holds no table of expected intervals.
- Screenshot capture and its plumbing belong to feature 016. This feature provides the stable test
  identifiers and the honest states that capture needs.
