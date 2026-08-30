# Feature Specification: The Operator flow chart, and the platform

**Feature Branch**: `113-operator-flowchart`

**Created**: 29 August 2026

**Status**: Draft

**Input**: "We have an Operator tab, which lists the system components, and provides
some stop/restart buttons. In V1 we had a flow diagram to display this data. Write a
spec, and design a UI for a flowchart based new implementation of this tab. For each
component, do custom design of the element for that component, showing things such as
last updated, a sparkline for current value and drift level that will trigger new
forecast, volume/number of stored records, trigger for new incoming vector-based
forecast item. Add new system component for 'platform' that includes motion simulator.
It should have demanded and current course, speed, depth. A future 'adaptive sampling'
component should be able to send in demanded course and speed. Current position will be
a new measurement (integrated into SensorThings messaging). The map view will display
historic ownship track."

## Context

Features 101 to 109 have landed, so this feature is written against a running tree
rather than a plan for one. The Operator tab exists (`app/src/panels/operator/
OperatorPanel.tsx`, 137 lines): a telemetry paragraph, a step button, and one table of
components with stop/start/restart buttons. It is honest and it works. What it does not
do is show the thing the architecture is *about*.

`harness-srd.md` §2 said it plainly for V1, and the sentence survived the V2 rewrite
unchallenged:

> The organising diagram is a **flow chart with a loop in it**, not a hexagon. The
> architecture's interesting property is temporal — the cycle — and a static structural
> diagram obscures it.

A table has no cycle in it. Stopping the sensors in the current tab changes one word in
one row; what it *means* — that ingestion goes quiet, that the observation store stops
growing, that the monitor has nothing to score and says so, that the loop stops turning
— is spread across two other tabs and reconstructed by the reader. This feature draws
the sentence the SRD already wrote, live.

The second half of the feature is a component the harness has been missing since 103.
The platform's position is currently a closed-form loiter evaluated inside the sensors
(`Sensors.positionAt`, a circle from `config.sensors.platform.loiter`). It cannot be
commanded, it has no state between ticks, it has no course or speed at all, and nothing
downstream can see where it has been. **Feature 113 gives the platform its own
component with a motion simulator, publishes its state as measurements, and the map
draws the track that falls out.**

**Feature number.** `docs/v2/plan.md` §5 reserves 110 for interactive walkthrough
machinery; 111 is the Background tab, which took 111 for exactly that reason. This was
specified as **112** and is now **113**: while it was in flight, `main` landed the
mobile-support work under 112, took SRD-v2 §5.11 and used FR-47 to FR-51. The tree is
the authority and the record is a claim about it, so this moved rather than argued —
the directory, the SRD section (now §5.12), its requirements (now FR-52 to FR-60) and
every reference to them. The walkthrough's §5.12 moved to §5.13 with it.

**SRD change.** New §5.12 carries FR-52 to FR-60. FR-22 (sensing), FR-35/FR-36 (the
operator's view) and FR-40 (the map) are amended in place rather than left disagreeing
with the tree, and §4's component table gains **V2-C21 Platform**.

### What the interview settled, and what it rules out

| Decision | Consequence |
|---|---|
| The picture is a **flow chart with a loop in it**, not an org chart of boxes | Ranks run left to right along the arc; the assimilation cycle is drawn as a genuine cycle, not four boxes in a row with a long arrow underneath |
| **Edges come from the topology master**, not from a hand-drawn picture | A new publish rule appears as a new edge with no edit to the panel. The diagram cannot silently go stale — and a gate holds it to that |
| Three kinds of thing on screen, never mixed: **declared**, **reported**, **observed** | Structure is declared; a figure is either something a component said about itself or something the shell counted from traffic it heard. Each has its own typographic treatment and the legend names all three (Constitution VII) |
| Every component gets a **bespoke face**, not a shared gauge | A store shows volume and growth; the monitor shows drift against the threshold that will fire; the runner shows its ensemble. A generic card would have told the reader nothing they could not get from the table |
| The table **stays**, as an equal view | An SVG graph is not a keyboard surface and not a screen-reader surface. Both views carry the same facts and the same controls, and neither is the "accessible fallback" of the other |
| The platform is a **component**, with its own config, seed stream, heartbeat and stop button | Stopping it is a demonstrable cause with visible consequences: no position, therefore no samples, therefore no residuals |
| Ownship state is **measured**, through the ordinary observation path | No second write path, no private channel to the map. The track is served by the query layer because the observations are in the store |
| The planner still **never** commands the platform | The planner→platform edge is not drawn, because it does not exist. Where a reader expects it, the picture says why (Constitution VIII) |
| Adaptive sampling is drawn as an **open socket**, not a ghost node | A component that has never existed must not appear in a display of what exists. The topic and its rules are real and are drawn; the absent publisher is stated in words |

---

## User scenarios

### Story 1 — Stop something, and watch what it costs (Priority: P1)

An operator stops the platform from its node in the flow chart. Within one heartbeat
window the platform node goes dark. The edge from it to the sensors fades to dead. The
sensors node — still lit, still beating — changes its own sentence to *"no position
heard since tick 4 812; publishing nothing"*, and its observation counter stops
climbing. The observation store's growth sparkline flattens with a visible break rather
than a smooth landing. The monitor states that it has no fresh residuals. The reader
watches consequence propagate along the arrows, in one view, and then presses start and
watches it come back.

**Why this priority**: it is the whole argument for replacing the table. Every fact in
that paragraph is already available today, in three tabs, to a reader who knows where to
look.

**Independent test**: with the harness running, stop `platform` from the flow chart;
observe the node darken from heartbeat silence, the sensors' sentence change, the
observation-store growth break, and the monitor's quiet reason change; start it and
observe each recover.

### Story 2 — Turn the ship (Priority: P1)

The operator opens the platform's node, sets a demanded course of 090° and a demanded
speed of 3.0 m/s, and submits. The demand needle on the course dial jumps to 090; the
current needle begins to swing toward it at the declared turn-rate limit, and the node
names the limit that is binding. Over the following ticks the map's ownship track bends
and the demanded-course ray swings ahead of the platform marker. Asking for 12 m/s when
the platform's declared maximum is 4.0 m/s applies 4.0 and says the shortfall in words.

**Why this priority**: it is the demand path — the same path a future adaptive sampler
will publish on — exercised by hand today. Building the socket without ever putting a
plug in it is how V1's proxy credential fault survived for a whole release.

**Independent test**: publish a demand through the seam; observe demanded and current
diverge and reconverge under the limit; observe the track bend in the Map panel; request
a speed beyond the limit and read the shortfall.

### Story 3 — See the loop about to turn (Priority: P2)

A reader watches the monitor's face: a residual sparkline in m/s with the breach
threshold drawn as a rule across it, and beneath it three slots of a persistence streak,
two of them filled. On the next breaching sample the third fills, a divergence pulse
travels the edge to the scheduler, and the scheduler's face shows the decision it made
and why — accepted, or declined with the minimum-interval bar showing how much
simulation time is left to run. On acceptance the pulse continues to the model runner,
whose five ensemble members fill, and a new holding lands on the coverage store's stack.

**Why this priority**: "a divergence becomes a published run" is AT-02's descendant and
the demo's central claim. Today it is witnessed by reading heartbeat details in a table.

**Independent test**: run until a divergence; observe streak, pulse, decision, ensemble
and holding in sequence in one view, and check each figure against the message that
carried it in the Messages tab.

### Story 4 — The same facts, without the picture (Priority: P2)

A keyboard-only reader tabs into the Operator tab, switches to the list view, and reaches
every component, every figure and every control in reading order. A screen reader
announces the component, its status, when it was last heard, and its bespoke figures as
text. The controls refuse identically in both views, in the same words.

**Independent test**: drive the panel by keyboard alone in both views; assert the same
control set and the same refusal strings.

---

## Requirements

Local numbering. The SRD requirements this feature adds are FR-52 to FR-60 of `srd.md`
§5.12; the mapping is in the table at the end of this section.

### The flow chart

- **FR-001** The Operator tab shall present the declared components as a directed flow
  chart, laid out left to right along the arc, with the assimilation cycle drawn as a
  cycle.
- **FR-002** Node **structure** — which components exist, their labels, their rank and
  lane — comes from the shell's configuration document. Nothing in it may light
  anything (Constitution VII).
- **FR-003** **Edges** are of two kinds, drawn distinctly, and neither is authored in
  panel code:
  - a **topic edge** is derived from the broker topology artefact
    (`contracts/topology.json`) — an edge exists from role A to role B where A's publish
    rules and B's subscribe rules overlap on a topic filter;
  - a **port edge** is a coupling that carries no broker traffic — the world-sampler
    port, and the store interfaces — declared in the shell's configuration document, and
    drawn dashed because it can never pulse. Without them the environment generator,
    which publishes nothing but heartbeats, would sit isolated in a picture of a system
    it is the source of.
  A wildcard subscription is drawn as a tap on a **namespace bus** rather than as one
  edge per subscriber. Every edge is still present and still countable; the bus is a
  drawing convention, not a suppression, and the gate of FR-005 counts taps.
- **FR-004** Two topic namespaces are **suppressed** from the edge set because drawing
  them would connect every node to every node: `ctl/clock` and `ctl/heartbeat`. They are
  drawn instead as *the plane the flow runs on*, and the panel names the suppression in
  words. Any other suppression requires amending this requirement.
- **FR-005** A gate shall fail the build when the flow chart's node set does not equal
  the declared component set, when a topology edge is neither drawn (directly or as a bus
  tap) nor named in the suppression list, or when a declared port edge names a component
  that does not exist. The gate is a line appended to `scripts/gates.registry`.
- **FR-006** Illumination is heartbeats and nothing else, on the System tab's rule: a
  node is lit only while a heartbeat from it has arrived within its declared liveness
  window; otherwise it is *silent* if one ever arrived and *unheard* if none ever did,
  and the two are different words on screen.
- **FR-007** An edge is drawn **dead** when either endpoint is dark, and **carrying**
  when the shell has received a message matching its filter within a stated window of
  simulation time. Traffic animation is driven by messages actually received, never by a
  timer standing in for one.
- **FR-008** Every figure on screen is one of exactly three kinds, visually distinct,
  with the legend naming all three:
  - **declared** — from the configuration document (labels, thresholds, limits, cadences);
  - **reported** — carried in a message the component published about itself;
  - **observed** — counted by the shell from traffic it received itself.
  A figure shall not change kind between states, and no figure may be presented as
  reported when it was computed in the shell.
- **FR-009** The shell holds a bounded rolling window of received samples per node for
  the sparklines: in memory, discarded on reload, never persisted and never served. The
  bound is configured, not typed into the panel.
- **FR-010** A series with no samples yet states that it has none. It shall not be drawn
  as a flat line at zero, and a gap in a series shall be drawn as a gap.
- **FR-011** Every face states the **simulation time** at which its figures were last
  updated, and how far that is behind the current simulation instant.

### The faces

- **FR-012** Each component's node carries an instrument designed for that component. The
  minimum content of each is specified in "The faces, component by component" below, and
  the visual design is `mockup.html`, which this requirement governs.
- **FR-013** Selecting a node opens a detail drawer carrying that component's full
  account: last heartbeat verbatim, its declared configuration figures, its bespoke
  instrument at full size, its controls, and the last refusal it produced.
- **FR-014** Controls are exactly the controls the operator surface already serves —
  stop, start, restart, clock step — plus the platform demand of FR-021. Refusals are
  surfaced verbatim, at the node that refused, and a stopped component is shown stopped
  by the silence of its heartbeats and never by a command's success response.
- **FR-015** A list view carries every fact and every control the flow chart carries,
  reachable by keyboard and readable by assistive technology, and the two views are
  switchable without losing selection.
- **FR-016** The graph respects `prefers-reduced-motion`: traffic animation becomes a
  count and a timestamp, and nothing moves.
- **FR-017** The graph shall be legible in greyscale: state is carried by shape, weight
  and label as well as by hue.

### The platform

- **FR-018** A new component, **platform** (V2-C21), holds ownship state — latitude,
  longitude, course over ground, speed over ground and depth — and integrates it once
  per tick.
- **FR-019** The platform holds a **demanded** course, speed and depth alongside the
  current ones. The two are never conflated in state, in messages, or on screen.
- **FR-020** Integration is rate-limited by declared limits: maximum speed, maximum
  depth, turn rate, longitudinal acceleration and dive rate. Where current lags demanded,
  the component names the limit that is binding.
- **FR-021** Demands arrive as messages on a demand topic. The platform applies the last
  demand heard. A demand beyond a limit is applied as far as the limit allows and the
  shortfall is stated in the platform's own report — never silently clipped.
- **FR-022** The demand topic's publish rules admit the operator surface today. They are
  written to admit a second publisher — a future **adaptive sampling** component — and
  the panel draws the socket and states, in words, that no such publisher has ever been
  heard. No node is drawn for a component that does not exist.
- **FR-023** The planner shall not publish demands. Its recommendations reach the demand
  path only through a component that decides, and no such component exists yet
  (Constitution VIII). The flow chart draws the planner's edge terminating at its
  recommendation topic and says why it goes no further.
- **FR-024** Motion is deterministic: a pure function of the clock, the demands heard
  and the platform's declared seed stream. No host clock, no unseeded randomness.

### Ownship state as measurement

- **FR-025** The platform publishes its state as SensorThings observations on its own
  Thing, through the same broker topics, ingestion seam and observation store as every
  other measurement. There is no second write path.
- **FR-026** `observation.schema.json`'s observed-property enumeration grows by exactly
  the ownship quantities — course over ground, speed over ground and depth — and the
  master states in the same commit why this does not reopen ADR-0005's closure: these
  are the motion simulator's own primary state, measured by the platform's navigation
  instruments with a declared noise model, not a quantity derived from other stored
  values.
- **FR-027** Position is **not** a scalar result. It is the `location` every observation
  already carries; the ownship datastream is what makes a series of them a track. The
  master's note that a sampling location "is not a place anything went" is amended to
  say where a track is now admitted and where it still is not.
- **FR-028** The sensors sample at the position they last heard from the platform. When
  they have heard none they publish nothing and say so. No component computes the
  platform's position a second time.
- **FR-029** An ownship observation is not a sample of the ocean. The planner's
  observation-age field excludes the ownship datastreams **by name**, and the exclusion
  carries a test that fails when a name is removed — the planner informs on whatever
  arrives, so what it must ignore has to be named. *Amended during implementation:* the
  monitor needs no such list and must not carry one. Its `pairs` names the thing and the
  two datastreams it scores, which is an allowlist and stronger; a denylist was written
  beside it, planted against, and found unable to fail, so it was removed and the master
  no longer admits the field.
- **FR-030** The ingestion seam's quality flagging covers the ownship properties with
  their own range rules (course within a revolution, speed within the declared maximum,
  depth non-negative and within the declared maximum).
- **FR-031** SensorThings `HistoricalLocations` stays refused by name. The track is
  served as Observations carrying locations; a second representation of the same fact
  through a second entity set would be two answers that can disagree.

### The map

- **FR-032** The Map panel draws the platform's **historic track** from a genuine query
  over the ownship datastreams through the seam, as a path ordered by phenomenon time.
- **FR-033** The map draws the **demanded course** as a ray from the current position,
  visually distinct from the track, and the demanded speed as its length against a
  stated scale.
- **FR-034** Where no ownship observations have been served, the map says so rather than
  drawing a stub, a straight line between two points, or the configured loiter circle.
- **FR-035** The track is drawn from what the query answered. The map does not
  extrapolate the platform's position between observations for the track; the existing
  route interpolation for the *plan* is unchanged and stays visually distinct from it.

### Mapping to SRD-v2

| SRD | Covers |
|---|---|
| FR-52 | FR-018 to FR-020, FR-024 |
| FR-53 | FR-021 to FR-023 |
| FR-54 | FR-025 to FR-027, FR-031 |
| FR-55 | FR-028 |
| FR-56 | FR-029, FR-030 |
| FR-57 | FR-001 to FR-011 |
| FR-58 | FR-012, FR-013 |
| FR-59 | FR-014 to FR-017 |
| FR-60 | FR-032 to FR-035 |
| FR-22 amended | FR-028 |
| FR-35, FR-36 amended | pointer to §5.12 for presentation; the surface's own behaviour is unchanged |
| FR-40 amended | FR-032 to FR-035 |

---

## The faces, component by component

Each entry is the minimum an implementation must show. The visual design is
`mockup.html`; where the two disagree, this list is the requirement and the mockup is
the proposal. Every face also carries the common chrome of FR-006 and FR-011 (state
word, last-heard simulation time, lag) and its controls or its `protected` mark.

| Component | The instrument | Kind of each figure |
|---|---|---|
| **clock** *(protected)* | Tick counter, current rate against its configured bounds, simulation instant, and the step control. A rate change is the one figure here that is both declared (the bounds) and reported (the acknowledged rate) — the acknowledged rate is shown, never the requested one | declared bounds, reported rate and tick |
| **broker** *(protected)* | Messages per simulation second by namespace (`obs/`, `ctl/`, `cov/`, `adv/`) as four stacked micro-bars, and the number of distinct topics seen | observed — the shell subscribes to `#` and counts what reaches it |
| **release gate** *(protected)* | Allowed and denied counts, the last denied path verbatim, and the allow-prefix list as declared | declared prefixes, reported counts |
| **env-generator** | A cadence bar filling toward the next now-cast authoring (`interval_ticks`), the domain's extent, and the ground-truth manifest digest of the current field | declared cadence, reported digest |
| **platform** | **The bespoke centrepiece.** A course dial with two needles — demanded as a hollow ghost needle, current as solid — a speed tape and a depth tape with the same two-mark treatment, the binding limit named beneath, a 60-sample heading sparkline, the demand inlet with its topic and its publishers, and the demand control | declared limits, reported state, observed sparkline |
| **sensors** | One row per instrument: name, last value with unit, and a sparkline of the last N reported results. Beneath: sample cadence bar, observations published, and the position sentence — the tick at which a position was last heard, or that none has been | declared cadence, reported values, observed sparkline |
| **ingest** | Two lanes, accepted and flagged, with the flag reasons tallied by name | reported |
| **observation-store** | **Volume.** Row count, oldest and newest phenomenon time, a growth sparkline in rows per simulation minute, and the count by datastream as a small stacked bar so the ownship rows are visibly a share of the whole | reported counts, observed growth |
| **feature-store** | Read-only mark, feature count, and the feature ids | declared |
| **query** | A request tape: the last N paths served with their status, tallies by standard (EDR, SensorThings, features), and the refusal count with the last refusal's named cause | reported |
| **coverage-store** | **Volume.** A stack of holdings, newest at the top and highlighted, each bar's length its size in bytes; total bytes; the current instance id; and the arrival pulse when a new holding is published | reported |
| **monitor** | **Drift.** A residual sparkline in m/s with the breach threshold (`threshold_m_per_s`) drawn as a rule across it and breaching samples marked; beneath it the persistence streak as `persistence_count` slots, filled as the streak grows — this is the drift level that will trigger a new forecast, drawn as the thing it is. Plus the run id being scored against, and the quiet reason verbatim | declared threshold and streak length, reported residuals |
| **scheduler** | A decision ledger — accepted, minimum-interval, duplicate-outstanding — with two bars: simulation ticks remaining on the minimum interval, and ticks remaining to the cadence floor. The in-flight run request, if any, named | declared intervals, reported decisions |
| **model-runner** | **The incoming forecast trigger.** An inbound pulse when a run request arrives; the ensemble as `ensemble_size` members filling as the run proceeds; the kernel name and the forecast horizon (`steps` × `step_seconds`); the last run's duration in simulation seconds | declared kernel and ensemble size, reported progress |
| **planner** | Uncertainty saturation bar against `usable_threshold`, the committed route as a thumbnail with its stop count, the projection horizon, and the replan cadence bar. The outbound edge terminates at the recommendation topic with the Constitution VIII note | declared thresholds, reported plan |
| **telemetry** | The skill gauge against persistence, carrying the component's own sentence verbatim — including "the model is not earning its compute" — with the stale mark when input has dried up; residual statistics; throughput per simulation second | reported |
| **operator surface** | Commands dispatched and refused, and the last refusal verbatim. The node carries a note that this is the surface being looked through | reported |
| **advisory-source** | Advisories authored, the next authoring cadence bar | reported |
| **advisory-store** | Append-only mark, count, and a validity strip showing which advisories are valid at the displayed instant | reported |
| **offload** | Packages announced, staged bytes against the declared staging bound, and the last departure announcement | declared bound, reported counts |

---

## Key entities and masters

| Master | Change |
|---|---|
| `contracts/schemas/config.platform.schema.json` | **New.** Identity, seed stream, topics (clock, demand, observation prefix), heartbeat, initial state, limits, instrument noise models, Thing and Datastream context |
| `contracts/schemas/platform-demand.schema.json` | **New.** The demanded course, speed and depth, with the publisher's component id and the simulation instant it was issued at |
| `contracts/schemas/platform-state.schema.json` | **New.** What the platform reports about itself for its face: demanded and current, the binding limit, and the shortfall against an unreachable demand |
| `contracts/schemas/observation.schema.json` | **Amended.** The observed-property enumeration grows by the ownship quantities, with the reason and the ADR-0005 note (FR-026); the location note amended per FR-027 |
| `contracts/schemas/config.shell.schema.json` | **Amended.** Components gain a rank and a lane for the flow chart's layout; the declared port edges (FR-003) join the document; `beat` widens past 109; the sparkline window bound joins the document |
| `contracts/schemas/config.sensors.schema.json` | **Amended.** The `platform.loiter` block retires; the sensors gain the ownship topic they take position from |
| `contracts/schemas/config.monitor.schema.json`, `config.planner.schema.json` | **Amended.** The excluded ownship datastreams, by name (FR-029) |
| `contracts/topology.json` | **Regenerated.** The platform role publishes `obs/ownship/+` and `ctl/platform/state`, subscribes `ctl/platform/demand` and `ctl/clock`; the operator role publishes `ctl/platform/demand`; the sensors role subscribes `obs/ownship/+` |
| `docs/architecture/query-subsets.md` | **Amended.** The ownship datastreams are servable through the existing SensorThings resources; `HistoricalLocations` stays refused, with FR-031's reason recorded beside the refusal |

---

## Success criteria

- **SC-001** With the harness running, stopping the platform from the flow chart
  produces, without any further interaction: the platform node dark, its outbound edges
  dead, the sensors' position sentence naming the last tick a position was heard, the
  observation store's growth series breaking rather than sloping to zero, and the
  monitor's quiet reason changed. Starting it recovers each. Captured as a watched turn
  (Constitution IX).
- **SC-002** A demand of 090° at 3.0 m/s issued through the seam is visible as demanded
  on the platform's face within one heartbeat, converges to current at no more than the
  declared turn rate, and bends the map's track. A demand of 12 m/s applies the declared
  maximum and states the shortfall.
- **SC-003** Every ownship observation validates against the amended observation master,
  reaches the observation store through the ordinary ingestion seam, and is served by the
  SensorThings subset without a new resource.
- **SC-004** The monitor's pairing and the planner's age field are unchanged by ownship
  traffic: with ownship observations flowing and no ocean samples, the monitor scores no
  residuals and the planner's age field does not refresh. Removing the exclusion turns
  this test red.
- **SC-005** The completeness gate fails when a component is added to the shell's
  configuration and not to the flow chart, and when a topology publish rule is added
  whose edge is neither drawn nor listed as suppressed. Both watched failing, then
  reverted.
- **SC-006** Every figure on screen traces to its kind: the panel test asserts, for each
  face, that a reported figure came from a message the test published and that no
  reported figure survives the component going silent as though it were current.
- **SC-007** The list view exposes the same component set, the same figures and the same
  controls as the graph, asserted against one shared source rather than two lists.
- **SC-008** Replay holds: a scenario replayed from its manifest with the platform in the
  loop and a demand issued at a recorded tick is byte-identical, and `pnpm replay-proof`
  covers it.

---

## Deliberately not in this feature

- **A manual "request a forecast run" command.** It would let the operator manufacture
  the loop's cause, and the demo's claim is that the loop turns because the world
  diverged. The scheduler's decision ledger already shows the policy that would refuse.
- **An adaptive sampling component.** FR-022 builds the socket and puts one genuine plug
  in it. Deciding *where* to sample from the planner's recommendations is a component
  with its own spec, its own policy and its own argument against Constitution VIII —
  it is not a panel change and must not arrive as one.
- **A ghost node for that component.** Rejected on Constitution VII: a display of what
  exists must not draw what has never existed. The topic and its rules are real and are
  drawn; the absent publisher is stated in words.
- **Graph auto-layout.** Ranks and lanes are declared. A force-directed layout that moves
  between renders would make the picture unlearnable and untestable, and a stable layout
  computed from the graph is a solver nobody asked for.
- **Persisting the sparkline windows across a reload.** V2 persists nothing between
  visits by design, and a rolling window that outlived the page would be a second store.
  An empty series says it is empty (FR-010).
- **`ctl/clock` and `ctl/heartbeat` as drawn edges.** Every component subscribes to both;
  drawing them is a hairball that hides the edges that carry meaning. They are the plane,
  named as such (FR-004).
- **Ownship position as a scalar observation result.** A latitude is not a measurement
  result in SensorThings' sense, and inventing a `position` property whose result is a
  number would misuse the vocabulary this harness exists to demonstrate honestly.
- **SensorThings `HistoricalLocations`.** FR-031: one representation of the track, not
  two that can disagree. Recorded beside the refusal so the reason survives the next
  reader who wonders.
- **Retiring the current table.** It becomes the list view of FR-015 and keeps its tests.
