# Feature 113 — plan

Written against the tree as it stands on `main` after 109 landed, not against the plans
for it. Where the two differ the tree wins (CLAUDE.md, lesson 1).

## Structure

```
contracts/
├── schemas/
│   ├── config.platform.schema.json      NEW — identity, seed stream, topics, initial
│   │                                    state, limits, instrument noise, SensorThings context
│   ├── platform-demand.schema.json      NEW — demanded course/speed/depth + publisher + instant
│   ├── platform-state.schema.json       NEW — demanded vs current, binding limit, shortfall
│   ├── observation.schema.json          AMENDED — observed_property grows by the ownship
│   │                                    quantities (FR-026); the location note (FR-027)
│   ├── config.shell.schema.json         AMENDED — components gain rank + lane; beat range
│   │                                    widens; the sparkline window bound joins the document
│   ├── config.sensors.schema.json       AMENDED — platform.loiter retires; ownship topic joins
│   ├── config.monitor.schema.json       AMENDED — excluded ownship datastreams, by name
│   └── config.planner.schema.json       AMENDED — the same exclusion, for the age field
└── topology.json                        REGENERATED from config by derive-topology.ts

app/
├── config/run.json                      the platform block; the operator's demand topic;
│                                        shell.components gains platform, rank and lane
└── src/
    ├── backend/platform/
    │   ├── platform.ts                  NEW — the component: demand subscription, the
    │   │                                integrator, state report, observation publication
    │   ├── motion.ts                    NEW — the motion simulator, pure: (state, demand,
    │   │                                limits, dt) -> state. No client, no clock, no RNG
    │   └── motion.test.ts               NEW — the limits, the shortfall, the wrap at 360°
    ├── backend/sensors/sensors.ts       AMENDED — positionAt() retires; position comes from
    │                                    the last ownship observation heard
    ├── backend/monitor/monitor.ts       AMENDED — ownship datastreams excluded by name
    ├── backend/planner/planner.ts       AMENDED — the same, for the observation-age field
    ├── backend/ingest/ingest.ts         AMENDED — quality rules for the ownship properties
    ├── backend/runtime/runtime.ts       AMENDED — the platform joins the composition root
    │                                    and the control registry (ADR-0030)
    ├── panels/operator/
    │   ├── OperatorPanel.tsx            REWRITTEN — view switch, selection, drawer
    │   ├── graph.ts                     NEW — pure: declared components + topology master
    │   │                                -> nodes and edges. The gate reads this too
    │   ├── graph.test.ts                NEW — completeness, suppression, dead/carrying
    │   ├── faces/                       NEW — one module per component's instrument
    │   ├── series.ts                    NEW — the bounded rolling windows; gaps are gaps
    │   ├── ListView.tsx                 NEW — the current table, kept, fed from graph.ts
    │   └── operator.css                 NEW
    └── panels/map/
        ├── map-data.ts                  AMENDED — the ownship track from served observations
        └── MapPanel.tsx                 AMENDED — track layer, demanded-course ray, the
                                         "no ownship observations served" statement
scripts/
├── gates/check-flow-completeness.ts     NEW — FR-005
└── gates.registry                       one line appended; the runner still names no gate
docs/adr/
├── 0034-ownship-state-is-measured.md    NEW — the enum amendment and why ADR-0005 stands
└── 0035-the-operator-tab-is-a-flow-chart.md  NEW — edges from the topology master;
                                         the three kinds of figure; the two suppressions
srd.md                                   AMENDED — §5.12 (FR-52 to FR-60); FR-22, FR-35,
                                         FR-36 and FR-40 amended in place; §4 gains V2-C21
docs/v2/plan.md                          AMENDED — §5 notes 112 beside 111's note
```

## The decisions this plan is asking to have argued

### 1. Where the flow chart's edges come from

- **From the topology master** (`contracts/topology.json`, itself derived from the run
  configuration by `scripts/derive-topology.ts`). **Preferred.** The picture is then a
  rendering of the wiring rather than a second description of it, a new publish rule
  shows up as a new edge with no panel edit, and `check-topology-drift.ts` already keeps
  the master honest against the configuration. The completeness gate closes the last gap:
  an edge that exists in the master and is neither drawn nor named as suppressed fails
  the build.
- From an authored edge list in the shell's configuration. Rejected: it is a second
  description of the wiring, and the two would diverge — which is precisely the class of
  fault V1's reconciliation lesson is about.
- From observed traffic alone. Rejected on Constitution VII's second edge: a display may
  not show silence where there is traffic, but neither may it show *nothing* where a
  wire exists and is idle. An edge that appears only when it carries cannot express "this
  path exists and is quiet", which is the whole point of stopping a component.

### 2. What the operator plane may command

FR-021's demand is a genuine new command, and the reflex worry is Principle VIII. It
survives, and the distinction is worth stating because the picture draws it:

- The **planner** publishes recommendations on `ctl/plan` and nothing else. Its edge
  terminates at the topic. It does not gain a publish rule for the demand topic in this
  feature or in any later one without amending Principle VIII.
- The **demand** is a command to a *simulated platform*, issued by an operator. Ownship
  motion is not a decision about a third party; the platform is the harness's own
  vehicle, and Principle V's own text keeps "track" as ordinary navigational English for
  exactly this path.
- A future adaptive sampler that turns recommendations into demands **is** decision
  logic, and Principle VIII does not forbid decision logic — it forbids the planner
  commanding, tasking, or advising a human. That component still needs its own argument,
  which is why FR-022 builds the socket and this feature does not build the plug.

### 3. Declaring what does not exist

Two candidates were considered and one rejected.

- **Rejected: a greyed `adaptive-sampling` node**, declared in the shell's component list
  with a future beat. It reads identically to a component that has stopped, and the
  System tab's own footnote says the display cannot tell those apart — which would become
  a false statement, because one of the rows could never come back. Constitution VII's
  purpose is that the display cannot claim a component exists when it does not.
- **Taken: an open socket on the platform node.** The topic is real, its publish rules are
  real and declared, and the panel says in words that one publisher has ever been heard
  and names it. Nothing is drawn for the absent component.

### 4. The three kinds of figure

The current table has one kind: whatever the component said. The flow chart needs three,
because it puts broker throughput (which only the shell can count) beside a residual
(which only the monitor can compute) beside a threshold (which is configuration). Mixing
them is how a display starts asserting things nothing published. The treatment:

| Kind | Source | Treatment |
|---|---|---|
| declared | configuration document | hairline outline, no fill, label in the utility face |
| reported | a message from the component | solid fill, the component's own words where it has them |
| observed | the shell's own count of traffic it received | dotted underline, and the word *counted here* in the drawer |

The panel test asserts the kind of each figure, so a figure cannot quietly change class.

### 5. Sensors' position, and the ordering it introduces

Today `Sensors.positionAt(seconds)` is a closed form: position is a pure function of
simulation time, and no message ordering enters. After FR-028 the sensors sample at the
last ownship position heard, which makes the sensors' output depend on delivery order.

- Replay is unaffected in AT-04's stated form — components run in lockstep and the
  delivery order is deterministic — but the dependency is new and must be stated in the
  replay claim's boundary rather than discovered later.
- The cold-start case is a genuine behaviour, not an edge case to paper over: at tick 0
  the sensors have heard no position and publish nothing, saying so. This is what makes
  SC-001's consequence chain real.
- The platform is scheduled before the sensors in the composition root's order so the
  cold start lasts one tick rather than indefinitely; the ordering is recorded in
  ADR-0030's terms rather than left to module import order.

### 6. What `beat` means now

`config.shell.schema.json` bounds `beat` at 101–109 — the arc. The platform lands at 112
and 111's explainers land outside the arc entirely. The bound widens to the highest
landed feature rather than being dropped: a component declared at a beat that does not
exist is a typo worth catching.

## Constitution check

| Principle | Engaged how |
|---|---|
| I — no wall clock | The motion integrator advances on ticks. The sparkline windows are indexed by simulation time. Traffic animation is decoration under ADR-0007's render-path bound and carries no truth; `prefers-reduced-motion` removes it entirely |
| II — seeded randomness | The platform's instrument noise draws from its own named stream; the integrator itself is deterministic |
| III — generated types | Three new masters, five amended, `pnpm generate` re-run, drift gate holds |
| IV — no literal paths | The demand topic, the ownship topic prefix, the sparkline bound, the ranks and lanes all reach the panel through configuration |
| V — no tracked entities | Ownship only. "Track" is the simulated platform's own path, which Principle V names explicitly |
| VI — honest ports | No new abstraction. The motion simulator is a function, not an interface; it gets one when a second implementation exists |
| VII — liveness, not configuration | The load-bearing one. Structure declared, illumination from heartbeats, three kinds of figure kept apart, no node for what does not exist, an empty series states its emptiness |
| VIII — recommendations, not decisions | Decision 2 above. The planner's edge terminates at its topic and the picture says why |
| IX — ground truth is scored | SC-001 and SC-002 are watched turns, captured |
| X — default deny | No new released collection. The ownship observations reach the world through the existing SensorThings prefix, already cleared |
| XI — one seam | The panel reads the topology master through `app/src/generated/`, the components through the seam's HTTP, and traffic through the broker transport. No backend import |

## Complexity tracking

| Added | Why it is not avoidable |
|---|---|
| A new component | The platform's state has to live somewhere that can be stopped, and a stoppable thing with its own heartbeat and seed stream is a component. Folding it into the sensors is what the tree does today, and it is why the platform cannot be commanded |
| Three new masters | Two message shapes and one configuration document, each crossing the seam. Principle III admits no shortcut |
| A fourth gate on the panel | FR-005. A diagram derived from a master that nothing checks is a diagram that goes stale silently; the gate is what makes "derived" a fact rather than an intention |

## Sequencing

The platform lands first and completely — component, masters, motion, observations,
sensors, the exclusions — because the flow chart's most valuable single node is a
component that does not exist yet. The map's track follows it. The flow chart lands last
and draws what is by then already true.
