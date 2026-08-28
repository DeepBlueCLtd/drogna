# Feature Specification: The Operator Plane

**Feature Branch**: `021-operator-plane`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Introduce a REST API that allows deeper querying of the
status of system components, plus the ability to push commands to them. In particular:
change the simulation time rate from the drogna web UI, and view the throughput of the
system components as the time acceleration factor is changed. For some monitoring,
listening on MQTT topics is satisfactory — such as new data products being created or
transmitted." Decided in the interview that shaped the v0.5 amendment: one system
controller rather than per-concern services; exposure through the boundary rather than
beside it; process-level lifecycle rather than logical quiesce; commands ephemeral and
outside the replay claim; the graphical EDR request composer deferred to a later
amendment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn the dial, watch the system respond (Priority: P1)

An operator watching the running harness changes the simulation rate from the client —
any value within the clock's configured bounds, not only the offered set — and watches,
beside the speed control, the throughput of the components respond: work counted per
simulation second, each component's reported pace, and where the harness begins to
saturate as the rate rises. A refused rate comes back as a refusal with the bound
named, on screen, rather than as silence.

**Why this priority**: it is the stated point of the feature — cause and effect on one
screen — and it is the strand that repairs an existing promise (SRD FR-10) where only
the boundary is published. Everything else in this feature deepens what this story
makes visible.

**Independent Test**: with the stack running, set a rate not in the offered set from
the client; observe acknowledgement on the clock topic and the displayed rate change;
observe the throughput panel reflect the change within one reporting interval; request
a rate beyond the configured bounds and read the refusal, with the bound, in the
client.

**Acceptance Scenarios**:

1. **Given** a running stack reachable only through the boundary, **When** the
   operator sets a rate, **Then** the request travels through the proxy, the
   acknowledged rate arrives on the clock topic, and the display shows only what was
   acknowledged — requested and acknowledged remain separate facts.
2. **Given** the clock's configured bounds, **When** a rate outside them is
   requested, **Then** the refusal names the bound, the client displays both, and the
   clock's state is unchanged.
3. **Given** components publishing throughput telemetry, **When** the rate changes,
   **Then** the panel beside the speed control updates within one reporting cadence,
   and every figure shown is one a component published per simulation second — never
   a rate the client computed from arrival times.
4. **Given** a pinned clock (screenshot capture in progress), **When** a rate change
   is requested, **Then** the refusal says the clock is pinned, and the capture's
   guarantee (SRD FR-53) is undisturbed.

---

### User Story 2 - The system is observable in depth (Priority: P2)

An operator, or a script, asks the operator plane's REST surface for a deeper account
of any component than the shell displays: the last heartbeat and reported status, the
component's own published counters, and a rolling recent window of the same — enough
to see a trend across a rate change without a store behind it. The same account is on
screen: selecting a component in the client opens its detail view, carrying the same
facts the REST surface serves. Event-style monitoring needs no REST at all: a plain
subscriber on the control namespace sees data products announced as they are created,
and now also as they are transmitted.

**Why this priority**: "deeper querying of status" is the feature's second half, and
the transmission announcement closes the one gap in event observability — creation is
already announced, departure is not.

**Independent Test**: query the controller for a live component and receive its last
heartbeat, counters and recent window; select the same component in the client and
read the same account; query for a component that has never spoken and receive
"unheard", not an error and not an invention; subscribe to the control namespace,
drive one offload transfer to verified receipt, and observe the transmission
announcement.

**Acceptance Scenarios**:

1. **Given** a component publishing heartbeats and telemetry, **When** its status is
   queried, **Then** the answer contains only facts the component itself published,
   each carrying its simulation time, with the aggregate's own freshness stated.
2. **Given** a component that has never published, **When** its status is queried,
   **Then** it is reported as unheard — the absence of report, not the absence of the
   component.
3. **Given** a controller restarted mid-scenario, **When** its window is queried
   before it has re-observed, **Then** the window says it is empty and young rather
   than presenting a gap as a quiet period.
4. **Given** the client with the plane deployed, **When** a drawn component is
   selected, **Then** its detail view shows the deeper account — last heartbeat,
   reported status, counters, recent window — every fact one the component
   published; a component never heard from shows as unheard, and with the plane
   absent the view states that and disables rather than disappearing.
5. **Given** an offload bundle reaching verified receipt, **When** the control
   namespace is watched, **Then** one transmission announcement appears for it,
   schema-validated, and re-delivery changes nothing.

---

### User Story 3 - The clock is steerable, not just throttleable (Priority: P3)

The operator pauses the clock, steps it forward by a stated simulated interval to
reach a moment of interest, and resumes — from the client, with each operation
acknowledged or refused visibly. Stepping while running is refused; the refusal says
why.

**Why this priority**: stepping makes demonstration deliberate — "advance to just
before the breach" — but rate control and observability deliver value without it.

**Independent Test**: pause from the client, step by a stated interval, observe sim
time advance by exactly that interval on the clock topic while ticks remain
well-formed, resume, and confirm downstream components followed without complaint.

**Acceptance Scenarios**:

1. **Given** a paused clock, **When** a step of a stated simulated interval is
   requested, **Then** simulation time advances by exactly that interval and every
   subscriber observes the same instants it would have observed at any rate.
2. **Given** a running clock, **When** a step is requested, **Then** it is refused
   with the reason, and the clock runs on undisturbed.

---

### User Story 4 - Components can be commanded, and the display stays honest (Priority: P4)

The operator pushes commands at components from the client's own command surfaces —
in the web UI, beside the state they act on: a trigger — request a model run now, as
an ordinary control-namespace message — or process-level lifecycle, stopping,
starting or restarting a named component's container through the container runtime.
Every acknowledgement or refusal is shown as it arrived. The display never takes the
plane's word for any of it: a stopped component goes dark because its heartbeats
cease within the liveness window, and lights again on its first real heartbeat after
restart.

**Why this priority**: deliberately last. It carries the feature's only privileged
surface (the runtime socket) and its only interaction with the replay claim, and the
demonstration value of the first three stories stands without it.

**Independent Test**: stop a component from the client and watch it go dark by
liveness alone; restart it from the client and watch it return on a real heartbeat;
issue a trigger and watch the ordinary loop machinery answer it; confirm an
uncommanded replay of the scenario is byte-identical as before.

**Acceptance Scenarios**:

1. **Given** a running component, **When** the operator stops its container from the
   client, **Then** the component goes dark only when its liveness window lapses,
   and nothing in the client consulted the plane to decide that.
2. **Given** a stopped component, **When** the operator starts it from the client,
   **Then** it is lit only on its first real heartbeat, arriving with a status of
   its own choosing.
3. **Given** a trigger requesting a model run, **When** it is dispatched, **Then** it
   travels as an ordinary control-namespace message, subject to the scheduler's
   existing right to refuse (duplicate or too-soon requests), and the outcome is
   observable where scheduler decisions already are.
4. **Given** a command naming a component that does not exist, **When** it is
   dispatched, **Then** it is refused by name and nothing is attempted.
5. **Given** a run in which lifecycle or trigger commands were issued, **When**
   replay is claimed, **Then** the claim is withheld for that run and the withholding
   is visible; a run whose only commands were rate and pause changes replays
   byte-identically.

---

### Edge Cases

- The controller cannot reach the container runtime: lifecycle commands are refused
  with the reason, status aggregation and clock commands continue, and the
  controller's own heartbeat reports degraded — it is alive and cannot do part of its
  job, and says so.
- Throughput at rate zero: per-simulation-second figures are stated as paused rather
  than shown as zero — a stopped clock accumulates no simulated seconds, and zero
  would claim idleness the harness cannot know.
- A component stops publishing telemetry but not heartbeats: the aggregate serves the
  last counters with their simulation time and its freshness statement; staleness is
  the reader's judgement, made possible rather than made for them.
- The controller is itself a component: it heartbeats, appears in the shell greyed
  until genuinely alive, and its own throughput kind counts the commands it
  dispatched and the refusals it returned. Nothing exempts the watcher from being
  watched.
- Two operators command at once: the components' own rules arbitrate, as they already
  do for competing rate requests — last acknowledged wins, and every acknowledgement
  is published where all subscribers see the same answer.
- Resource sampling while a container restarts: the sample for that component is
  absent for the interval, and absence is served as absence.
- A trigger arrives while the loop is already acting on a genuine divergence: the
  scheduler's existing duplicate and minimum-interval rules apply unchanged; the
  operator enjoys no priority over the weather.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A system controller MUST aggregate component state solely from messages
  components publish on the control namespace, serve it over REST with each fact
  carrying its simulation time and the aggregate carrying its freshness, and report a
  never-heard component as unheard. It MUST invent nothing (Constitution VII applied
  to an API).
- **FR-002**: The controller MUST keep a rolling recent window of the same facts, in
  memory, bounded by validated configuration, claiming no persistence: after restart
  the window states its own youth.
- **FR-003**: The REST surface's types MUST derive from an OpenAPI document under the
  contracts directory, referencing the JSON Schema masters where shapes are shared,
  with both language forms generated by the established chain (Constitution III,
  NFR-01 to NFR-03).
- **FR-004**: Throughput MUST be a new kind in the existing telemetry union — a
  schema master, generated types, registered like every other — published by every
  long-running component: work received, done and refused per simulation second,
  with freshness. Lag and end-to-end latency MUST be expressed in simulation time.
- **FR-005**: The controller MUST sample per-container processor and memory use
  through the container runtime and publish it as telemetry. This MUST NOT be built
  before the wall-clock exemption ADR (SRD FR-70) is accepted, and the client MUST
  present these figures as measures of the machinery, not of the simulation.
- **FR-006**: The clock MUST accept any rate within its configured bounds and MUST
  gain a step operation on a paused clock, advancing simulation time by a stated
  interval. Every refusal MUST name its reason, and the client MUST surface refusals
  and bounds instead of discarding the response body.
- **FR-007**: The controller MUST dispatch commands — clock operations, triggers as
  ordinary control-namespace messages, and container lifecycle — with the effect of
  every command observed on the broker, never assumed from the dispatch. A command
  MUST name its target, and a refusal MUST travel back with its reason.
- **FR-008**: The container runtime socket MUST be held by the controller alone,
  argued in the same ADR as FR-005's exemption, and MUST NOT be reachable through
  any served path.
- **FR-009**: The operator plane MUST be exposed through the reverse proxy under a
  dedicated path prefix with clearance delegated, the clock's control route MUST be
  served the same way, and the boundary's default-deny MUST be shown unchanged for
  every other path. The exposure decision carries the ADR that resolves the clock's
  currently proposed direct exposure.
- **FR-010**: The offload packager MUST announce each verified transmission on the
  control namespace, schema-validated, idempotent under re-delivery, so that product
  creation and departure are each observable by subscription alone.
- **FR-011**: The client MUST present the operator plane's surfaces in the web UI
  itself: the throughput display beside the simulation speed control; a
  per-component detail view — last heartbeat, reported status, counters, recent
  window — opened by selecting a drawn component; and command surfaces for the
  clock, trigger and lifecycle operations, each showing the acknowledgement or
  refusal as it arrived. Every displayed figure MUST be one a component published.
  Where the plane is not deployed, each surface MUST state its absence and disable,
  as the speed control already does without a control route. Component illumination
  MUST remain liveness-driven; no state served by the plane may light, darken or
  re-describe a component in the client.
- **FR-012**: Operator commands MUST be ephemeral — absent from the run record — and
  any surface claiming deterministic replay MUST withhold the claim for a run in
  which lifecycle or trigger commands were issued, visibly. Rate and pause changes
  MUST NOT affect the claim.

### Key Entities

- **Component state aggregate**: one component's story as the controller heard it —
  last heartbeat, reported status, latest counters, each fact with its simulation
  time, the whole with its freshness.
- **Recent window**: the bounded, in-memory trail of aggregates that lets a trend be
  seen across a rate change; honest about its own youth after restart.
- **Throughput report**: a component's own account of its pace — received, done,
  refused, per simulation second — as a kind in the existing telemetry union.
- **Resource sample**: the machinery's cost — processor and memory per container —
  published by the controller under the exemption ADR.
- **Operator command**: a named operation against a named target, dispatched by the
  controller; answered by acknowledgement or a refusal carrying its reason; never
  recorded into the run.
- **Transmission announcement**: the control-namespace statement that a data product
  reached verified receipt at its destination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a client reachable only through the boundary, an operator changes
  the rate to a value not in the offered set and sees it acknowledged; the throughput
  panel reflects the change within one reporting cadence; an out-of-bounds request
  shows a refusal naming the bound. All three observed in one session, with no port
  published beside the proxy.
- **SC-002**: For every live component, the REST answer agrees with the broker: no
  fact appears in the aggregate that cannot be matched to a published message, and a
  never-heard component queries as unheard. Verified by test against recorded
  traffic, not by inspection. Selecting the same component in the client shows the
  same account, and no fact appears on screen that the REST surface does not serve.
- **SC-003**: With the loop running at two different rates within capacity, each
  component's per-simulation-second throughput agrees between the two runs within a
  stated tolerance — the figures measure the work, not the acceleration — and the
  tolerance is derived from recorded runs, not typed into the test.
- **SC-004**: A component stopped from the client's command surface goes dark within
  its liveness window and returns only on a real heartbeat after start; a reviewer
  finds no path by which the plane's served state could have driven either
  transition.
- **SC-005**: Every offload transfer reaching verified receipt produces exactly one
  transmission announcement observable by a plain subscriber, and replaying delivery
  produces no second one.
- **SC-006**: AT-04 passes unchanged on an uncommanded run after this feature lands;
  a run containing a lifecycle command visibly withholds the replay claim.
- **SC-007**: A step of a stated simulated interval on a paused clock advances
  simulation time by exactly that interval, and a step requested on a running clock
  is refused — both observed on the clock topic, not inferred from the response.

## Assumptions

- The SRD now names the operator plane. The scope extension this specification was
  written against was recorded by the v0.5 amendment of 28 August 2026:
  `harness-srd.md` §5.12 carries FR-67 to FR-76 (the controller and its honest
  aggregation, throughput as a telemetry kind, simulation-time lag and latency, the
  resource-sampling exemption, the deepened clock, command dispatch and the runtime
  socket, ephemeral commands, exposure through the boundary, the transmission
  announcement, and the display beside the speed control), §2 places the plane
  beside the data architecture rather than inside it, §4's component table gains
  C-21 (system controller), §10 places the feature below the line until the control
  loop's turn is demonstrable — excepting the boundary routing of the clock's
  control surface, which repairs FR-10 — and §11 records the resolved question. The
  plan's Constitution Check therefore cites the amendment rather than proposing one.
- Two ADRs are owed under PR-03 and are prerequisites of the plan phase, not of this
  specification: the exposure of the plane and the clock's control surface through
  the boundary, resolving ADR-0021's currently proposed direct exposure; and the
  resource-sampling wall-clock exemption together with the runtime socket's
  confinement to C-21 — argued as a measure of the machinery, kin to ADR-0006's
  heartbeat cadence, and explicitly answering the constitution's warning that a
  third exemption request is evidence of erosion.
- `spikes/operator-plane/FINDING.md` is this feature's evidence base: the display
  needs no change to distinguish provocations, throughput is a missing kind rather
  than a missing channel, and the clock's two-route HTTP interface is the shape a
  command surface copies — request over HTTP, effect observed on the broker, the
  component deciding. The spike's `FaultState` (logical impairment a component owns)
  is complementary and deliberately not this feature's scope: the interview chose
  process-level lifecycle; logical fault injection remains available to a later
  feature on the spike's evidence.
- The `local` profile runs only the foundation, query, edge and shell services; the
  control-loop components whose throughput this feature displays run under the
  control profile, and the `full` profile still names a service that does not exist.
  Demonstrating the P1 story end to end therefore assumes the control-loop services
  are brought up alongside the local profile, and the plan must say how.
- The operator plane's surfaces are part of the drogna web UI itself, not a console
  beside it — decided in review of this specification, tightening what the spike's
  cost table had left open. The detail view, the command surfaces and the throughput
  display are the shell's to show (FR-011); how the client's code organises them,
  and how they are tested within the no-mocked-traffic rule, remains the plan's
  decision, as does nothing else: what the shell shows is settled, and what no
  client code may do (light a component from served state) is settled with it.
- The store browser the spike weighed is out of scope entirely, for the spike's own
  reason: a generic browsing surface is the inverse of the boundary the harness
  exists to demonstrate. Its absence blocks nothing here.
- The graphical composer of EDR requests from the map is recorded in SRD §10 as
  intent, deliberately unspecified, and is not part of this feature.
- **Parallelism**: this feature owns the operator-plane OpenAPI document, the
  throughput and transmission schema masters (appends to contracts), the controller
  service, the clock's new operation and bounds behaviour, the proxy's operator
  locations, and the client's throughput panel and deepened speed control. It shares
  only append-only files with features in flight and touches no store, no holding
  and no advisory path.
