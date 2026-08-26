# Feature Specification: Greyed-Out Component Shell

**Feature Branch**: `003-component-shell-client`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD FR-45, FR-01, C-18, §10 delivery priority 3, §11 open question 3. Constitution VII is the load-bearing principle.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The whole architecture, dark, and an honest label (Priority: P1)

Someone opens the harness in a browser on the first day of the project, when nothing else exists.
They see the entire component layout — all eighteen components and the flow between them — with
every component greyed out, and a plain statement that this is a learning harness running synthetic
data and fake numerics. Nothing on the page suggests anything is working, because nothing is.

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
   "planned but nonexistent" or "broken".

---

### User Story 2 - Components light up because they said something (Priority: P2)

A component starts, publishes a heartbeat on `ctl/heartbeat`, and its node lights. It keeps
heartbeating and stays lit. It stops, and after its declared liveness window has elapsed in
simulation time, it goes dark again. Nothing else can light it: not a configuration file, not a
flag, not a list in the client's source.

**Why this priority**: Constitution VII, and the whole evidential value of the harness. A display
that can claim a component exists when it does not makes every other claim suspect.

**Independent Test**: Publish heartbeats for one component id from a script, and stop. The node
lights within one interval and darkens within its declared window. Delete every heartbeat and no
node lights, whatever the configuration says.

**Acceptance Scenarios**:

1. **Given** no heartbeats have been received, **When** the client renders, **Then** every node is
   dark regardless of what any configuration document contains.
2. **Given** a valid heartbeat for component `C-01` with a declared liveness window, **When** it is
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

### User Story 3 - Known states, on demand, for capture (Priority: P3)

Playwright needs the shell in a specific state — everything dark, three components lit, one
degraded, one unmapped, the clock paused, the broker silent — without the rest of the harness
existing. A fixture feed replays recorded heartbeats into the same transport boundary the real
broker connection uses, so the illumination path under test is the real one.

**Why this priority**: This answers SRD §11 open question 3. The harness's starting position is
that liveness-driven illumination alone cannot exercise the capture pipeline, because early on
there is nothing alive to light anything; but the mock must be traffic, not configuration, or
Constitution VII is broken by the test harness itself.

**Independent Test**: Drive the fixture feed to each declared state and capture a screenshot.
Repeat; the captures match apart from regions declared dynamic.

**Acceptance Scenarios**:

1. **Given** a capture build, **When** a fixture scenario is selected, **Then** heartbeats are
   injected at the transport boundary and travel the same reducer path as broker traffic.
2. **Given** any fixture scenario, **When** the page renders, **Then** it is visibly labelled as
   replaying recorded traffic, so no capture can be mistaken for a live system.
3. **Given** a deployed, non-capture build, **When** it is inspected, **Then** the fixture feed is
   not reachable and no scenario can be selected.
4. **Given** the same fixture scenario is run twice, **When** two captures are compared, **Then**
   they are identical outside the regions the capture configuration declares dynamic.
5. **Given** a fixture scenario, **When** the liveness reducer runs on it, **Then** it receives only
   heartbeats and simulation time, exactly as it does from the broker.

---

### User Story 4 - The picture is the loop (Priority: P4)

The layout is a flow chart with a loop in it, not a hexagon and not a box diagram: the sense →
decide → act → publish cycle is visible as a cycle, and the parts that are genuinely bespoke are
distinguished from the parts that are well-chosen plumbing.

**Why this priority**: SRD §2 says the architecture's interesting property is temporal and that a
static structural diagram obscures it, and §2.2 says the visualisation makes the core/plumbing
distinction visible rather than hiding it. It is fourth because it is a refinement of a layout that
already works.

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
- High rate multipliers. Rendering is throttled to the display's frame budget, but liveness is
  computed from every heartbeat received, never from a sampled subset.
- Broker reachable, no traffic at all. The page distinguishes "connected and hearing nothing" from
  "not connected", because they mean different things.
- The runtime configuration document is missing or invalid. The static shell and the FR-01 statement
  still render; the transport does not start, and the failure is shown.
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
- **FR-004**: No configuration document, feature flag, build-time list or hardcoded set may cause a
  component to be lit. The liveness computation's only inputs are received heartbeats and the
  simulation time. (Constitution VII)
- **FR-005**: The liveness window MUST be evaluated in simulation time, comparing the current
  simulation time from the clock service against the simulation time carried in the heartbeat, using
  the window the heartbeat itself declares. (SRD FR-09, FR-45)
- **FR-006**: The client MUST take simulation time from the clock service (C-01) and MUST NOT read
  the browser clock in any operational path. (SRD FR-09, Constitution I)
- **FR-007**: The client MUST display the clock state — mode, rate, current tick, and staleness —
  and MUST display a paused or stale clock prominently, because both freeze the liveness display.
  (SRD FR-10, FR-45)
- **FR-008**: When the clock is stale beyond the configured tolerance, liveness MUST be displayed as
  indeterminate rather than as lit or dark. (SRD FR-09, FR-45)
- **FR-009**: The heartbeat message MUST be defined once in
  `contracts/schemas/heartbeat.schema.json`, with `$id`
  `https://schemas.harness.invalid/heartbeat.schema.json`, carrying at least: component id,
  simulation time, tick, status, declared heartbeat interval, declared liveness window, run id and
  config digest. (SRD NFR-02, repo layout)
- **FR-010**: A heartbeat failing schema validation MUST light nothing, MUST be counted, and the
  count MUST be visible. (SRD NFR-02, FR-45)
- **FR-011**: A heartbeat carrying a component id absent from the layout MUST be displayed as an
  unmapped live component, never silently discarded. (Constitution VII)
- **FR-012**: Reported status MUST be rendered distinguishably — at least starting, ok, degraded and
  stopping — so a degraded component is not shown as a healthy one. (SRD FR-45, FR-38 in spirit)
- **FR-013**: The layout MUST be labelled as a drawing of the intended architecture, so that a dark
  node reads as "not heard from". (SRD FR-45, Constitution VII)
- **FR-014**: The layout MUST render the control loop as a closed cycle, matching SRD §2, and MUST
  distinguish components holding bespoke logic from plumbing with a legend, matching SRD §2.2.
  (SRD §2, §2.2)
- **FR-015**: The client MUST obtain its runtime configuration from a served document validated
  against `contracts/schemas/config.client.schema.json` before it opens any transport, and MUST
  contain no other literal host, port or URL. (SRD NFR-04, Constitution IV)
- **FR-016**: The static shell and the FR-001 statement MUST render before, and independently of,
  any successful network call. (SRD FR-45)
- **FR-017**: The client MUST be read-only on the broker: it subscribes to `ctl/heartbeat` and
  publishes nothing on any topic. (SRD FR-14, Constitution X)
- **FR-018**: Connection state MUST be displayed, distinguishing not connected from connected but
  silent. (SRD FR-45)
- **FR-019**: A fixture heartbeat feed MUST exist for capture work, injecting recorded heartbeats at
  the same transport boundary the broker connection uses, so the illumination path under test is the
  production path. (SRD §11 open question 3, PR-10)
- **FR-020**: A build replaying fixture traffic MUST say so on the page, and the fixture feed MUST
  be absent from, and unreachable in, a deployed build. (SRD FR-01, FR-45)
- **FR-021**: At least six fixture scenarios MUST exist: all dark; several lit; one degraded; one
  unmapped component; clock paused; broker silent. (PR-10, SRD §11 open question 3)
- **FR-022**: Every component node and every status region MUST carry a stable test identifier for
  capture and end-to-end work. (PR-10)
- **FR-023**: The liveness computation MUST be a pure function of received heartbeats and simulation
  time, unit tested independently of rendering. (Constitution VII)
- **FR-024**: Lit and dark MUST be distinguishable by more than colour alone, so the state survives
  a greyscale screenshot in the blog. (PR-08)
- **FR-025**: The client's own node MUST be lit by its own presence and labelled as such, since it
  cannot hear itself over the broker. (Constitution VII, honesty)

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
  service.
- **Connection state**: Not connected, connected and silent, or receiving.
- **Fixture scenario**: A named, ordered set of recorded heartbeats and clock states, replayed at
  the transport boundary for capture.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With no broker and no clock service reachable, the page renders the complete dark
  layout and the honesty statement within two seconds of load over the droplet link on a cold cache.
- **SC-002**: A component that begins publishing heartbeats is lit within one declared interval, and
  returns to dark within its declared liveness window plus one tick after they stop.
- **SC-003**: The liveness reducer's unit tests demonstrate that its output changes only in response
  to heartbeats and simulation time; passing it any configuration changes nothing.
- **SC-004**: The client's operational source contains zero occurrences of `Date.now`, `new Date`
  or `performance.now`, as demonstrated by the wall-clock gate.
- **SC-005**: An invalid heartbeat never lights a node, and the visible discard count increments by
  exactly one per invalid message.
- **SC-006**: Playwright drives the shell to each of the six declared fixture states and produces
  captures that are identical across two consecutive runs outside declared dynamic regions.
- **SC-007**: A heartbeat carrying an unmapped component id becomes visible on the page within one
  declared interval.
- **SC-008**: The honesty statement is present in the initial HTML payload, not only after
  hydration, and remains visible at a 375-pixel-wide viewport.

## Assumptions

- The broker exposes an MQTT-over-WebSocket listener that the browser can reach. The listener's
  configuration and its exposure through the reverse proxy belong to the deployment and proxy
  features; this feature consumes them and records the dependency.
- Deck.gl is a dependency of the client package because the map surfaces of later features need it.
  The component shell itself is a node-link diagram rendered as SVG, because Deck.gl adds nothing to
  a diagram of eighteen boxes and an abstraction for its own sake is a constitution violation.
- The layout map is derived from the SRD component table (C-01 to C-18) and held as a static data
  module inside the client, labelled as a drawing. This is not a violation of Constitution VII: it
  determines what is drawn, never what is lit.
- One relative bootstrap URL for the runtime configuration document is unavoidable in a browser
  application. It is the single permitted literal in the client, carries an inline exemption marker
  with its reason, and appears in the exemption inventory.
- `contracts/schemas/config.client.schema.json` is created by this feature as the first to need it.
- The simulation speed control of SRD FR-49 belongs to the visualisation feature. This feature
  displays clock state and does not offer the control, so that the control surface is designed once.
- SRD §11 open question 3 is answered here as: yes, early capture work needs traffic, and the
  traffic is injected at the transport boundary as recorded heartbeats rather than as configuration.
  If a later feature finds this unnecessary once real components exist, the fixture feed can be
  retired without touching the illumination path.
- The heartbeat's declared liveness window is chosen per component and carried in the message, so
  the client holds no table of expected intervals.
- Screenshot capture and its plumbing belong to feature 016. This feature provides the stable test
  identifiers and the deterministic states that capture needs.
