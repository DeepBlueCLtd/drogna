# Feature Specification: The Topic Tree

**Feature Branch**: `022-topic-tree`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "The MQTT could prove to be a very useful capability upon
which a diverse set of business processes could sit, as consumers whose process is
triggered by some new measured or modelled output. Add another visualisation that shows
a tree of MQTT topics in tree form, highlighting nodes as they are triggered." Decided
in the interview that shaped this specification: the surface serves three audiences in
stages — demonstration first, with the operator's and integrator's jobs designed for
rather than built; the tree is the declared topology lit by live traffic, never traffic
alone; a trigger in this feature is message arrival, with rule evaluation and consumer
processes named as future features rather than built; consumers appear as a first-class
right-hand column, not only in a detail panel; the browser gains a new read-only role
rather than reusing the client's or hiding behind a relay; effects run in wall time
while every stated figure is simulation time; and the feature proves itself by unit
tests at the state layer, with stack-level assertions recorded as considered and
deliberately not chosen. The sentence the visualisation must land: **from sensor to
decision, visibly**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - From sensor to decision, visibly (Priority: P1)

A stakeholder watches the topic tree panel while the harness runs. The whole declared
topic hierarchy is drawn as a horizontal tree — root at the left, one branch per topic
segment, `obs` opening into things and datastreams, `ctl` into the control topics —
whether or not anything has yet been said on it. Beside the tree, a column lists the
consumer roles the topology declares, each connected to the subtrees its subscription
filters cover. When an observation lands, its leaf pulses; the pulse ripples up through
its ancestors, as a wildcard subscription would see it; and the connection to each role
whose filter matches lights, so the message visibly *arrives at* the consumers that
would be triggered by it. The stakeholder walks away having seen, in one glance, that
every measured and modelled output is an addressable trigger point with named consumers
attached — and room on the page for the ones not yet built.

**Why this priority**: it is the stated point of the feature. The business-exploitation
argument — diverse processes sitting on the broker as consumers — is made by showing
the mechanism working, not by describing it.

**Independent Test**: with the local stack running and the panel open, watch one
observation topic: its leaf pulses on arrival, its ancestors ripple, and every role
whose declared filter matches the topic lights its connection — and no role whose
filter does not match lights anything.

**Acceptance Scenarios**:

1. **Given** the running stack and the panel open, **When** a message arrives on
   `obs/<thing>/<datastream>`, **Then** that leaf pulses and decays, each ancestor up
   to the root shows the ripple, and the connection to every role whose declared
   filter matches the topic lights — all within a perceptible moment of arrival.
2. **Given** the declared topology, **When** the panel first opens with no traffic
   yet observed, **Then** the full declared tree and the full role column are drawn,
   visibly cold — a declared-but-silent topic is information, not absence.
3. **Given** a role whose filters match no part of a message's topic, **When** that
   message arrives, **Then** nothing about that role changes.

---

### User Story 2 - The system has a visible pulse (Priority: P2)

An operator keeps the panel open beside the existing surfaces. Slow streams read as
individual events — pulse, ripple, decay. As a stream's rate rises past what discrete
pulses can convey, its node crosses over to a sustained intensity that tracks recent
rate, and the flow along its edges thickens with it; the operator reads busy and quiet
at a glance without any mode to select. Every stated figure — rate, last-seen — is in
simulation time with the acceleration factor in force shown beside it, while the
animation itself runs at wall-clock pace so it always reads correctly to the eye. A
stream that goes quiet cools visibly; a paused clock is stated as paused rather than
letting stillness claim idleness.

**Why this priority**: liveness is the operator's job growing into the surface, and it
falls out of the same activity model the demonstration needs — but the demonstration
stands without the crossover behaviour being tuned.

**Independent Test**: at a low simulated rate, individual arrivals are separately
visible on a chosen topic; raise the clock rate and the same node reads as sustained
intensity without any user action; pause the clock and the panel states the pause
while stated per-simulation-second rates are unchanged by the acceleration.

**Acceptance Scenarios**:

1. **Given** a stream slow enough for events to read individually, **When** messages
   arrive, **Then** each is a distinct pulse-and-decay; **Given** the same stream at
   a rate where pulses would blur, **When** messages arrive, **Then** the node holds
   a sustained intensity that follows recent rate, and the transition between the two
   readings is the panel's decision, not a user toggle.
2. **Given** a changed clock rate, **When** rates are read from the panel, **Then**
   every rate is stated per simulation time with the factor in force displayed, and
   the stated per-simulation-time rate does not change with the acceleration.
3. **Given** a paused clock, **When** the panel is read, **Then** it states the pause,
   in-flight decays complete in wall time, and no figure claims the system idle.
4. **Given** a lost broker connection, **When** the panel is read, **Then** it states
   the disconnection — a severed feed is never presented as a quiet system.

---

### User Story 3 - Where a new process would plug in (Priority: P3)

Someone designing a new consumer — an alerting rule, a workflow kicked off by a
published run, a derived-product pipeline, an external subscriber beyond the boundary —
uses the panel as the integration catalogue. Selecting any node reveals: the most
recent payload, pretty-printed and otherwise uninterpreted, with its arrival stated in
simulation time; rate and recency; the roles holding read or write on a matching
filter, which is the exploitation story made concrete — *this is where your process
would attach, and this is the grant it would need*; and which declared schema governs
payloads on the topic, tying the tree back to the contracts that make a consumer
writable without archaeology.

**Why this priority**: the integrator's job is the staged third audience. It deepens
the panel without changing its shape, and the first two stories deliver without it.

**Independent Test**: select an observation leaf and read its last payload, its
simulation-time stats, the roles with read and write access on matching filters, and
the schema that governs it; select a topic that has never spoken and read the declared
facts with the observed ones honestly absent.

**Acceptance Scenarios**:

1. **Given** a topic that has received traffic, **When** its node is selected, **Then**
   the detail shows the last payload verbatim and pretty-printed, its simulation-time
   arrival, rate and recency, the matching roles with their access, and the governing
   schema where one is declared.
2. **Given** a declared topic never yet observed, **When** it is selected, **Then**
   the declared facts — matching roles, governing schema — are shown, and the observed
   facts are stated as not yet observed rather than invented or zero-filled.
3. **Given** any topic, **When** its detail names roles, **Then** every role named
   holds a declared filter matching the topic under broker wildcard semantics, and no
   matching role is omitted.

---

### Edge Cases

- A message arrives on a topic no declared filter covers: it is shown — grafted into
  the tree where its segments place it — and visibly marked as undeclared. An
  undeclared topic is a finding about the topology, and quietly absorbing it would
  hide exactly what a governance audience should see.
- The declared topology contains wildcard filters (`obs/#`): the declared skeleton
  expands them only as far as deployed configuration names concrete segments (things
  and datastreams from the sensor configuration; the control topics by name). A
  concrete topic observed under a declared wildcard but not named by configuration
  appears as observed-under-declaration, distinct from undeclared.
- The connection opens onto retained messages: the initial burst is activity like any
  other, but last-seen honestly reflects the retained message's own time where it
  carries one, and the panel does not present connection time as arrival time.
- A payload is not JSON, or is too large to render comfortably: the detail says so and
  shows what it safely can — the panel treats payloads as opaque and never fails on
  their content.
- The page is refreshed: the tree returns to cold and says it is young. No history is
  persisted, and a cold tree after refresh must not read as a system that stopped.
- Many things and datastreams make a branch wide: a subtree can be collapsed to a
  summary node that carries the aggregate of its children's activity, so the panel
  degrades to density rather than to noise.
- The broker route is not deployed in the running profile: the panel states its
  absence and disables, as the shell's other surfaces already do without their
  routes — it never draws a dead tree as a live one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The panel MUST build its declared skeleton from the derived topology
  (`contracts/topology.json`) joined with deployed configuration for the concrete
  segments wildcards cover, and MUST draw every declared topic and every declared role
  whether or not traffic has been observed. The skeleton MUST NOT be hand-maintained
  anywhere: the derivation chain is the authority, and drift remains the existing
  gate's to catch.
- **FR-002**: The panel MUST receive live traffic by subscription through the
  boundary's WebSocket upgrade, under a new role granting read on the observation and
  control namespaces and write on nothing. The role MUST be declared in the tracked
  sources the topology derivation reads, so the topology document and the broker's
  ACLs agree by construction. The visualisation MUST be structurally read-only: no
  publish call exists in its code, the same checkable promise the existing transport
  makes.
- **FR-003**: Message arrival MUST be presented as one rate-adaptive system with no
  user-selected modes: a discrete pulse with decay at rates where events read
  individually, rippling through ancestor nodes as a wildcard subscription would see
  it; crossing over to a sustained per-node intensity tracking recent rate as rates
  rise; with edge flow intensity following the same activity. Animation MUST run in
  wall-clock time (within the display-smoothing exemption of ADR-0007), and every
  stated figure MUST be simulation time with the acceleration factor in force shown
  (Constitution I).
- **FR-004**: Consumer roles MUST be first-class: a column beside the tree, each role
  connected to the topic regions its declared filters cover, with an arrival visibly
  reaching every matching role and no non-matching one. Filter matching MUST follow
  broker wildcard semantics (`+`, `#`) and MUST be a pure, unit-testable function.
- **FR-005**: Selecting a node MUST reveal: the last payload verbatim and
  pretty-printed, treated as opaque content; arrival, rate and recency stated in
  simulation time; the roles holding read or write on matching filters, with their
  access; and the declared schema governing the topic's payloads where one exists.
  Facts not yet observed MUST be stated as unobserved, never invented (Constitution
  VII applied to a display).
- **FR-006**: An observed topic no declared filter covers MUST be shown and marked as
  undeclared; a topic observed under a declared wildcard but not named by deployed
  configuration MUST be distinguishable from both the declared-and-configured and the
  undeclared cases.
- **FR-007**: The panel MUST state, rather than dissemble, the conditions under which
  its picture is not the system's: broker disconnection, a paused clock, a cold start
  after refresh, and an undeployed broker route (stated absence, disabled surface).
  Silence on the wire and silence in the feed MUST never look the same.
- **FR-008**: Activity state MUST be session-only: nothing is persisted, nothing is
  replayed, and the panel claims no history it does not hold.
- **FR-009**: Any shape crossing a boundary for this feature MUST be a declared schema
  with generated types on both sides of the chain (Constitution III). The topology
  document's existing schema is the expected sole boundary shape; if the plan finds
  another crossing, the schema comes first.
- **FR-010**: The panel MUST live in the component-shell client beside the existing
  surfaces, sharing its transport patterns, configuration document and time model, and
  MUST NOT alter what any existing surface displays. Component illumination elsewhere
  in the shell remains liveness-driven and untouched.
- **FR-011**: The feature's verification is unit tests at the state layer: skeleton
  construction from topology and configuration, wildcard filter matching, activity
  accumulation and decay, the rate-adaptive crossover decision, and the honesty states
  of FR-007 — each covered by the client's test suite, and each seen to fail on the
  fault it describes before it is trusted.

### Key Entities

- **Topic node**: one segment-path in the tree — its declared status (declared and
  configured, observed under declaration, undeclared), its activity state, and its
  children.
- **Declared filter**: a role's access statement from the derived topology — filter
  pattern, access, owning role — the join between the tree and the column.
- **Consumer role**: a broker role drawn as a first-class element; the visible answer
  to "who is triggered by this".
- **Activity state**: a node's recent story — last arrival in simulation time, recent
  rate, decay phase — the single model from which pulse, ripple, heat and flow all
  read.
- **Arrival event**: one message's landing — topic, simulation-time stamp, payload
  held as opaque content for the detail view.
- **Selection detail**: the integrator's account of one node — last payload, stats,
  matching roles with access, governing schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the local stack running, a message published on a declared
  observation topic produces visible activity at its leaf, along its ancestors, and at
  every matching role — and at no non-matching role — within a perceptible moment of
  arrival, observed in one session through the boundary with no port published beside
  the proxy.
- **SC-002**: A reader who has never seen the system can point, unprompted, to a
  declared-but-silent topic, an active topic, and (when one is planted) an undeclared
  topic, and say which is which — the three states are that distinct.
- **SC-003**: For every topic in the tree, the roles the panel names agree exactly
  with the derived topology under broker wildcard semantics — verified by unit test
  against `contracts/topology.json` itself, not against a fixture that could drift
  from it.
- **SC-004**: Changing the clock rate changes no stated per-simulation-time figure
  beyond tolerance, and the acceleration factor in force is readable on the panel
  whenever any rate is — the capture rule's guarantee, kept by the live surface too.
- **SC-005**: A reviewer finds no path by which the visualisation can publish to the
  broker: no publish call in its code, and no write grant in its role.

## Assumptions

- **Staging**: the three audiences are served in the priority order of the stories —
  demonstration (P1), operator (P2), integrator (P3) — and each story is a viable
  stopping point. The panel's shape (tree plus role column plus detail) is settled by
  this specification; its visual tuning is the plan's.
- **Future exploitation is named, not built.** The interview identified four consumer
  classes this surface exists to make credible: threshold alerting (a measurement or
  model output crossing a bound raising an advisory), workflow orchestration (control
  events such as a published run kicking off multi-step processes, kin to the existing
  offload path), derived-product pipelines (consumers that publish results back onto
  new topics — the tree growing new branches as capability is added), and
  external-system integration (curated subsets crossing the boundary). Each is
  recorded here as intent, deliberately unspecified. A declarative trigger-rule
  contract — topic filter plus condition, with "message arrived" distinguished from
  "rule fired" — and a first demonstration consumer were both weighed in the interview
  and deferred: in this feature a trigger is message arrival, full stop.
- **Non-goals, decided in the interview**: the panel never publishes, even for
  demonstration; no history is persisted and no replay is offered; no rule engine, no
  thresholds, no condition evaluation; payloads are opaque beyond pretty-printing —
  no plotting, no unit-aware display.
- **An ADR is owed at the plan phase.** ADR-0008 routed only the control namespace to
  the browser, and the existing transport documents that observation traffic
  deliberately does not reach it. FR-002 extends that decision: the observation
  namespace reaches the browser, read-only, under a new role. The plan must argue
  this where the original decision was argued — same upgrade location, clearance
  delegated as ADR-0020 settled, the widened grant carried by an explicit role rather
  than a widened existing one — or find the alternative. The interview weighed
  restricting the tree to the client's current grant (the tree would misrepresent the
  system) and a server-side digest relay (an added service to keep the browser's
  grant narrow) and chose the explicit role; the ADR should record all three.
- **Verification scope is deliberately narrow.** The interview considered and did not
  choose: inclusion in the glance capture, a stack-level live-activity assertion, and
  a declared-versus-observed reconciliation gate. Unit tests at the state layer are
  the chosen proof (FR-011). The three unchosen checks remain available to later
  features — the reconciliation gate in particular is itself a governance story this
  surface makes easy to tell — and their non-selection here is a decision, recorded
  so it is not reread as an oversight.
- **Rates and thresholds are derived, not typed.** Where the rate-adaptive crossover
  needs a boundary, it is derived from the activity model's own measured recent rate,
  not a constant tuned into a test — the repository's standing preference for bounds
  read from something real.
- **Parallelism**: this feature owns the new panel's code in the client, the new
  read-only role's declaration in the tracked sources the topology derivation reads,
  and this specification's directory. It appends to shared files where the role
  declaration requires it and rewrites none of them; it touches no store, no service,
  no schema master unless FR-009 finds a new boundary shape, and no existing surface.
