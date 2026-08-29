# Software Requirements Document
## drogna, Version 2

**Status:** Draft v0.1 — written from the V2 planning interview of 29 August 2026;
adopted only when it replaces `harness-srd.md` at the repository root as `srd.md`
**Author:** Doc
**Date:** 29 August 2026

Requirements carry fresh numbers. Where a requirement descends from Version 1, the
provenance is cited as *(v1 FR-nn)*; the archived `harness-srd.md` carries the fuller
argument and remains the record of how the requirement was learned. A V1 requirement not
carried and not cited here is retired, and §11 lists the deliberate retirements — nothing
is dropped silently.

---

## 1. Purpose

drogna is a personal learning harness: a small, runnable system exercising the
architectural pattern under consideration for a maritime environmental data platform.
Version 2 is a clean rewrite as a **pure client-side system**: the backend components
are genuine programs running in the browser, separated from the front-end by a
wire-protocol seam, so that Version 3 can replace them with a real backend without
rewriting the client.

The three purposes carry, in strict priority order *(v1 §1)*:

1. **Understanding** — how the components behave together, particularly where they
   misbehave together.
2. **Demonstration** — the architecture shown as a running thing; in V2, a running thing
   that is a URL.
3. **Evidence** — concrete prior art for modest, specific claims, including evidence of
   LLM-assisted development under engineering constraint.

Version 2 adds a constraint learned from Version 1 rather than a new purpose:

- **NFR-01 (Reviewability.)** The whole system shall be reviewable as one TypeScript
  codebase and observable in one browser. No step of building, testing, gating or
  demonstrating it shall require a container, a daemon, or a second language runtime.

### 1.1 What this is not

Unchanged from V1, and non-negotiable *(v1 §1.1, FR-01; Constitution V)*:

- **FR-01** The harness holds no third-party entities of any kind and never will. Its
  numerics are deliberately fake, its data synthetic. The Intro tab shall state this
  plainly, so no viewer mistakes it for a candidate system.

The name **drogna** carries, for the reasons v1 §1.2 records.

---

## 2. Architecture

Version 2 is one browser application with two halves and a seam between them:

- The **front-end**: the GoldenLayout shell, its panels, and everything that renders.
- The **in-browser backend**: components that generate, sense, store, assimilate, plan
  and serve — each a genuine program with its own configuration, seed stream, heartbeat
  and lifecycle. They are "mocks" only in the sense that Version 3 replaces them with
  server-side implementations; they are never fixtures, and no canned data ever stands
  in for one (Constitution VII as re-scoped in 2.0).

The event-driven control loop with command-query separation carries *(v1 §2)*: writes
travel one ingestion seam per store with a single writer behind each; reads are served
exclusively through the standards-based query components; a sense → decide → act →
publish cycle drives forecast regeneration.

### 2.1 The seam

- **FR-02** All traffic between the halves shall cross the seam in wire shape and
  nowhere else. Three carriageways: HTTP (fetch against relative URLs from
  configuration, answered by an interception layer), pub/sub (a broker component with
  MQTT topic semantics behind a transport interface whose wire shape is
  MQTT-over-WebSocket), and the release gate of §5.7. Front-end code shall not import
  backend modules or vice versa; only the seam's client interfaces and the generated
  types are shared. Enforced by gate (Constitution XI).
- **FR-03** Every shape crossing the seam shall be governed by a committed master under
  `contracts/` (JSON Schema for messages and configuration, OpenAPI for HTTP), and
  seam traffic shall be validated against the masters in tests, and in the browser
  behind a debug flag. *(v1 NFR-01 to NFR-03, re-aimed at the seam.)*
- **FR-04** The seam shall be swappable to a remote backend by configuration alone: a
  base URL for HTTP and a broker URL for pub/sub. No code path may distinguish the two
  cases. This is Version 3's contract, and AT-05 tests it.

### 2.2 Honest ports *(v1 §2.1)*

The port inventory is rewritten around the seam. Genuine ports, each with more than one
conceivable implementation: the **seam transports** (in-browser today, network in V3),
the **clock**, the **RNG**, the **model kernel** (initialisation state in, gridded field
out), and the **store interfaces** (in-memory today, engines in V3 — this is a port now
precisely because V3 is planned, where in V1 "Postgres is not being swapped" was the
honest statement). Nothing else is dressed as a port, and the documentation claims
exactly the pluggability that exists.

---

## 3. Simulated world, time and randomness

Carried whole from V1 at coarser grain; the archived SRD holds the detail.

- **FR-05** An environment generator shall produce 4D fields (latitude, longitude,
  depth, time) of temperature, salinity and pressure, with sound speed derived, never
  stored *(v1 FR-02; ADR-0005)*.
- **FR-06** The field shall contain four seeded features with recorded ground truth —
  eddy, front, thermocline, drifting feature — and every generated field shall carry a
  **manifest** recording ground-truth parameters, seeds and generator version, so
  recovery can be scored *(v1 FR-03, FR-04)*.
- **FR-07** Decorrelation shall be governed by a timescale field tau, authored per
  feature over a background and evaluated per location, advecting with a moving
  feature *(v1 FR-05; ADR-0002)*.
- **FR-08** The scenario is *arrive cold, then loiter*: spread-driven uncertainty on
  arrival, age-aware revisit behaviour on station *(v1 FR-06 to FR-08)*.
- **FR-09** All components shall read time from the simulation clock component; no
  wall-clock for any operational purpose. The clock supports real-time and accelerated
  modes, rate-controlled from the shell, with bounded arbitrary rates and a step
  operation *(v1 FR-09, FR-10, FR-71; Constitution I)*.
- **FR-10** All stochastic behaviour derives from seeded RNG streams recorded in the
  run manifest; a scenario replays byte-identically from its manifest (AT-04). The
  manifest shall be exportable and importable through the shell, since V2 persists
  nothing between visits *(v1 FR-11; Constitution II)*.

---

## 4. Components

The C-numbers restart for V2. Each in-browser component owns its V1 ancestor's failure
mode; the ancestry column is the map back into the archived record.

| ID | Component | Responsibility | V1 ancestry |
|---|---|---|---|
| V2-C01 | Simulation clock | Single source of time, rate-controllable | C-01 |
| V2-C02 | Environment generator | 4D fields, ground truth, tau, the historic archive | C-02 |
| V2-C03 | Broker | MQTT-semantics pub/sub: topic tree, wildcards, ACL-shaped rules | C-03 |
| V2-C04 | Sensors | Observations in SensorThings vocabulary | C-04 |
| V2-C05 | Ingestion seam | Validate, write; sole writer to the observation store | C-05 |
| V2-C06 | Observation store | In-memory point observations behind a store interface | C-06 |
| V2-C07 | Feature store | Read-only spatial reference, provisioned at scenario start | C-07 |
| V2-C08 | Coverage store | Gridded fields; instances, archive and now-cast; atomic publication | C-08, C-14 |
| V2-C09 | Query components | SensorThings + EDR over the stores, through the seam | C-09 |
| V2-C10 | Release gate | Default-deny path policy at the seam | C-10 |
| V2-C11 | Monitor | Sound-speed residuals; divergence events; never a single spike | C-11 |
| V2-C12 | Scheduler | Whether a run is warranted; minimum interval; no duplicates | C-12 |
| V2-C13 | Model runner | Analytic advection + noise; small ensemble; behind the kernel port | C-13 |
| V2-C14 | Planner | Adaptive sampling recommendations, and only recommendations | C-15 |
| V2-C15 | Telemetry | Health, throughput per simulation second, skill vs persistence | C-16, part C-21 |
| V2-C16 | Shore advisory source | Deterministic advisory authoring; the advisory ingestion seam | C-19 |
| V2-C17 | Advisory store | Append-only advisories, read by the query components alone | C-20 |
| V2-C18 | Operator surface | Aggregated component state; commands with observable refusals | C-21 (sans container runtime) |
| V2-C19 | Shell | GoldenLayout front-end: Intro, System, Map, Messages | C-18 |

- **FR-11** Store semantics carry although the engines do not: one writer per store
  through its ingestion seam; the feature store read-only during a run; the advisory
  store append-only and written only through its seam; published runs visible
  atomically, no reader ever observing a partial field *(v1 FR-12, FR-13, FR-18,
  FR-30, FR-63)*.

---

## 5. Functional requirements, by narrative beat

The arc — build order, demo order and this section's order are the same thing: *a world
exists → it is sampled → it is served → it is assimilated → doubt is measured and
directed → the machinery is interrogated → advice travels light → it is seen.*

### 5.1 Foundations and shell (feature 101)

- **FR-12** The shell shall use GoldenLayout with top-level tabs **Intro, System, Map,
  Messages** at first run, user-rearrangeable by drag and drop. Panel arrangement is
  presentation only: no arrangement shall change what any component does, and a saved
  arrangement is a per-viewer convenience, never state the system depends on.
- **FR-13** The full component layout renders from day one, greyed out; illumination is
  driven solely by heartbeats received over the broker within each component's declared
  liveness window. No configuration flag, no fixture, no override *(v1 FR-45, FR-52;
  Constitution VII)*. The clock's heartbeat is the first liveness signal and the
  pattern every component follows.
- **FR-14** Each component receives exactly one configuration document at construction,
  validated against its schema before any other work; no literal path, URL or topic
  string appears in component source *(v1 NFR-04; Constitution IV)*.
- **FR-15** The constitution gates run as TypeScript scripts from a gates registry, one
  gate per line, `gates.sh`-style: wall-clock, seeded-RNG, literal-path, vocabulary,
  generated-types drift, seam import boundary. Each is watched failing before it is
  trusted *(v1 quality gates; Constitution, Development Workflow)*.

### 5.2 The synthetic ocean (feature 102)

- **FR-16** §3's world: generator, seeded features, tau, manifests.
- **FR-17** The coverage holdings span three eras from the start of a scenario: a
  multi-decade monthly **historic archive** authored deterministically at provisioning;
  a **now-cast** replaced on a configured cadence, its manifest recording its
  derivation; and the accumulating forecast **instances** once the loop turns. Each
  holding's discovery document states its extent truthfully, verified against the
  store by test *(v1 FR-54 to FR-58)*.

### 5.3 Sensing (feature 103)

- **FR-18** Sensors publish observations in SensorThings vocabulary on the observation
  namespace; the broker's ACL-shaped rules confine sensors to that namespace; the
  ingestion seam validates against the message schema and is the store's sole writer
  *(v1 FR-14, FR-16 to FR-18)*.
- **FR-19** The Messages tab renders live broker traffic with topic-tree navigation and
  inspection of the message that just passed *(v1 FR-46, feature 022)*.

### 5.4 The query seam (feature 104)

- **FR-20** The query components expose OGC SensorThings (Part 1, Sensing) over the
  observation store and OGC API-EDR (returning CoverageJSON) over the coverage store,
  each as a stated, honest subset: every unimplemented option refused with the option
  named, and the conformance statement kept true as the subset grows *(v1 FR-19,
  FR-50, FR-80)*.
- **FR-21** EDR trajectory queries carry per-vertex timestamps: conditions forecast for
  the moment of arrival at each point *(v1 FR-20)*.
- **FR-22** A new holding becomes servable by convention, without editing query
  configuration *(v1 FR-21)*.

### 5.5 The forecast loop (feature 105)

- **FR-23** The loop carries whole: the monitor subscribes to observation topics,
  computes sound-speed residuals against the current forecast, and raises divergence
  events only on sustained persistence; the scheduler enforces a minimum interval and
  deduplicates; the model runner advects analytically with noise behind the kernel
  port and runs a small ensemble, emitting spread as an uncertainty field; the
  publisher makes runs visible atomically, retains them as instances, and announces
  each on the control namespace — consumers subscribe, nothing polls *(v1 FR-22 to
  FR-31)*.

### 5.6 Uncertainty and planning (feature 106)

- **FR-24** Uncertainty combines ensemble spread with observation age against tau;
  the planner simulates the collapse of uncertainty along candidate routes, commits a
  single route with diminishing returns incorporated, replans on a receding horizon,
  and projects when regions fall below usable confidence *(v1 FR-32 to FR-35)*.
- **FR-25** The planner emits recommendations only; the harness is headless with
  respect to decisions *(v1 FR-36; Constitution VIII)*.

### 5.7 The operator's view (feature 107)

- **FR-26** Telemetry: running residual statistics; forecast skill always reported
  against a persistence reference, and the display says when the model is not earning
  its compute; throughput as counts per simulation second; keeping-up and end-to-end
  latency in simulation time *(v1 FR-37, FR-38, FR-68, FR-69)*.
- **FR-27** The operator surface aggregates what components report about themselves —
  a component never heard from is reported unheard, not absent — and dispatches
  commands: clock rate within bounds, step, and stop/start/restart of in-browser
  components. A refused command names the bound or rule; refusals are surfaced, and a
  stopped component goes dark because its heartbeats cease, never because the surface
  says so *(v1 FR-67, FR-71, FR-72, FR-76)*. Commands are ephemeral and outside
  AT-04's replay claim, stated wherever replay is claimed *(v1 FR-73)*.
- **FR-28** Container-resource sampling *(v1 FR-70)* retires with the containers; the
  third wall-clock exemption retires with it.

### 5.8 Shore advisories and the boundary (feature 108)

- **FR-29** Shore advisories carry whole at their v1 grain: deterministic authoring
  from seeds and simulation time on a configured cadence; a schema admitting no field
  capable of naming an entity the harness did not place; travel on a declared control
  topic; refusal of malformed advisories at the ingestion seam, observably; the
  append-only store; the read-only collection, present-and-stating-empty before any
  advisory exists; the size ceiling enforced by a refusal that names the limit, and
  sizes measured against the smallest comparable gridded update *(v1 FR-59 to
  FR-65)*.
- **FR-30** The release gate applies binary access and default deny at the seam:
  released collections sit under a dedicated path prefix, everything else is denied,
  adding a collection never exposes it by accident, and a denial is observable in the
  shell. The two leakage paths keep their explicit tests: provenance metadata in
  exports, and the shape of the freshly updated region *(v1 FR-39 to FR-42;
  Constitution X; ADR-0001)*.

### 5.9 The map (feature 109)

- **FR-31** The Map panel (Deck.gl) renders: the fields; the uncertainty field decaying
  and refreshing; the planned route as a four-dimensional curve with a time control
  showing conditions at arrival; advisories valid at the displayed time, visibly
  distinct and legible in greyscale, undrawn outside validity yet still queryable
  *(v1 FR-47, FR-48, FR-66)*.
- **FR-32** The EDR composer carries as a mode of the map: a guided sequence with the
  literal request URL always visible, assembling live and copyable; offering only what
  the query components genuinely serve, enumerated from server metadata, never
  stubbed; results rendered where they were asked for, with null, declined and absent
  as three different facts *(v1 FR-77 to FR-83)*. The copied URL is a genuine GET —
  which the wire-protocol seam is what makes true even in V2.
- **FR-33** The Intro tab narrates the arc, growing one section per landed beat, and by
  feature 109 constitutes the demo walkthrough script.

### 5.10 Capture

- **FR-34** Screenshot capture pins the clock rate to zero for the duration of a
  capture, and reports the rate in force beside the image, so a picture of a stopped
  system is never handed over as a live one *(v1 FR-53; the V1 capture lesson)*.

---

## 6. Interfaces and shared types

- **NFR-02** Masters under `contracts/` are the single authority for every seam shape:
  JSON Schema for messages and configuration, OpenAPI for HTTP, `$ref`s joining them
  where a shape appears in both. TypeScript is generated from the masters into
  `app/src/generated/`, committed, drift-checked, never hand-edited. No boundary shape
  is hand-written *(v1 NFR-01 to NFR-03; Constitution III)*. The masters are the
  contract V3's second language generates from.

## 7. Delivery

- **NFR-03** V2 builds to static assets servable from any static host; the demo is a
  URL. Each visit provisions a fresh seeded run; nothing persists between visits;
  manifest export/import (FR-10) provides replay. *(v1 NFR-07's "a fresh instance is
  equivalent to a long-running one," now literal.)*
- **NFR-04** Toolchain: TypeScript 5, React, Deck.gl, GoldenLayout 2.x, pnpm, vitest,
  Playwright. Nothing else; no Python, no containers (NFR-01).

## 8. Development process

- **PR-01** The repository remains public but unadvertised; no customer, project or
  bid material anywhere in it *(v1 PR-01)*.
- **PR-02** Spec-kit carries: constitution → specify → plan → tasks → analyze →
  implement; V2 features are numbered from 101, one per narrative beat *(v1 PR-04,
  PR-05)*. Tick tasks as you go; write the reason at the moment a task is declined —
  the V1 reconciliation lesson.
- **PR-03** ADRs carry, continuing the existing numbering (0027 is V2's first)
  *(v1 PR-03)*.
- **PR-04** The fate of the published site and blog for the V2 series is an open
  question (§10); PR-06 to PR-10 of V1 are neither carried nor retired until it is
  answered.

## 9. Acceptance criteria

| ID | Test | Descends from |
|---|---|---|
| AT-01 | A trajectory query through the seam returns correct values along a four-dimensional route, verified against the generator's ground-truth manifest | v1 AT-01 |
| AT-02 | A threshold breach triggers a model run, visibly, end to end, within the shell | v1 AT-02 |
| AT-03 | The seeded eddy is recoverable from the stored data with a known and reported error, the bound derived from the authoring jitter on disk, never typed into the test | v1 AT-03 |
| AT-04 | The whole scenario replays byte-identically from its exported manifest | v1 AT-04 |
| AT-05 | A recorded corpus of seam traffic — requests, responses, published messages — validates against the committed masters, and the suite that replays it is runnable against a remote base URL unchanged | new: the V3 contract |

## 10. Open questions

Raised here as open, per the V1 lesson that a question quietly dissolved stops the
document describing the system:

1. The published site and blog (§8 PR-04).
2. The droplet: retire, or keep for the published site until V3.
3. Offload: V2 keeps announcement semantics *(v1 FR-75)*; verified-receipt eviction
   *(v1 FR-43, FR-44)* is deferred to V3 — confirm this is acceptable.
4. Whether in-browser components run as Web Workers (true lifecycle and genuine
   stop/restart for FR-27) or as scheduled modules on the main thread — feature 101's
   seam spike decides, with an ADR.

## 11. Deliberate retirements

Retired with V1, reason stated, lessons kept in the archived record: the Compose
deployment and both destinations as a *requirement* (v1 NFR-05, NFR-06); the reverse
proxy, pygeoapi, Postgres/PostGIS, MQTT broker and NetCDF as *engines* (their roles and
semantics carry per §2.2, §4, FR-11; the engines return in V3); container lifecycle
commands and resource sampling (v1 FR-70, the container half of FR-72); the offload
export pipeline (deferred, §10.3); the second-broker fallback (v1 FR-15 — moot with one
in-browser broker; V3 revisits); Shapely/GEOS pins and every other
implementation-specific requirement of a retired engine (v1 FR-51 among them — the
*property* it protected, per-vertex time surviving the parse, lives on in FR-21 and
AT-01).
