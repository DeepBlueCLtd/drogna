# Software Requirements Document
## drogna

**Status:** Draft v0.5 — scope amended: the operator plane
**Author:** Doc
**Date:** 28 August 2026

---

## 1. Purpose

This document specifies a personal learning harness: a small, runnable system
exercising the architectural pattern under consideration for a maritime environmental
data platform.

The harness has three purposes, in strict priority order:

1. **Understanding.** To let the author learn how the components behave together —
   particularly where they misbehave together — in a way no diagram can convey.
2. **Demonstration.** To show the architecture to a senior colleague as a running
   thing rather than a slide.
3. **Evidence.** To provide concrete prior art supporting modest, specific claims
   about what has already been built, including evidence of LLM-assisted development
   under engineering constraint.

### 1.1 What this is not

The harness is **not** the production system and is not a prototype of it. It holds
no tracked entities, contacts, detections or tracks, and never will. Its numerics are
deliberately fake, its data synthetic, its lifespan short. It is disposable
scaffolding whose enduring outputs are the author's understanding, the exercised
data-to-viewer contract, and a public record of how it was built.

- **FR-01** The landing page shall state plainly that this is a learning harness with
  synthetic data and fake numerics, so no viewer mistakes it for a candidate system.

### 1.2 The name

The system is called **drogna**. The word carries no meaning in English and no
connection to the domain, the customer or the bid, and that emptiness is the point:
PR-01 requires a name that leaks nothing, and a coined word leaks nothing while
remaining a unique and unambiguous search term. "Environmental data architecture
harness" is a description of the thing, not a name for it, and is used only as such.

---

## 2. Architectural overview

The system is an event-driven **control loop** with command-query separation:

- Writes travel a direct path into storage through one ingestion seam per store,
  with a single writer behind each.
- Reads are served exclusively through a standards-based query layer.
- A sense → decide → act → publish cycle drives forecast regeneration.

Alongside the data architecture, and deliberately not part of it, sits a control
surface over the harness itself: the operator plane of §5.12. Its reads answer for the
*system* — what each component reports about its own state and pace — never for the
ocean, so the rule that domain reads are served exclusively through the query layer is
unchanged by it. Its writes are commands to components, which each component remains
free to refuse.

The organising diagram is a **flow chart with a loop in it**, not a hexagon. The
architecture's interesting property is temporal — the cycle — and a static structural
diagram obscures it. Ports-and-adapters remains the governing discipline, but appears
as annotation on the flow rather than as the primary picture.

### 2.1 Honest accounting of ports

| Boundary | Genuine port? | Rationale |
|---|---|---|
| Model kernel | Yes | The numerics will certainly be replaced. Interface: initialisation state in, gridded field out. |
| Coverage output | Yes | NetCDF today, Zarr plausibly later |
| Event publication | Marginal | Broker could change; unlikely to |
| Observation store | No | Postgres is not being swapped |
| Observation intake | No | Aspirational rather than real |

The harness does not claim more pluggability than exists, and neither does its
documentation.

### 2.2 Core versus plumbing

Inside the boundary sits only the genuinely bespoke logic: residual and divergence
rules, scheduling policy, sound speed computation, quality flagging, the uncertainty
and planning mathematics, and the data dictionary made executable. Everything else —
broker, query layer, proxy, stores — is well-chosen plumbing, and the visualisation
makes that distinction visible rather than hiding it.

---

## 3. Scenario and simulated world

### 3.1 Synthetic environment

- **FR-02** An environment generator shall produce a four-dimensional field
  (latitude, longitude, depth, time) of temperature, salinity and pressure, from
  which sound speed is derived.
- **FR-03** The field shall contain four seeded features with recorded ground truth:
  a mesoscale eddy of known centre, radius and strength; a front of known position
  and sharpness; a thermocline at known depth; and a moving feature of known drift
  velocity.
- **FR-04** Ground-truth parameters shall be written to a **manifest** alongside each
  generated field, so downstream recovery can be scored for error. The manifest also
  records the RNG seed and generator version.
- **FR-05** Loss of memory of a measurement shall be governed by a decorrelation
  timescale evaluated as a field, tau(latitude, longitude, depth, time). The field is
  *authored* per feature over a domain-wide background value, and *evaluated* per
  location: a location's tau is the background blended with the contribution of any
  feature overlapping it. The timescale of a moving feature advects with that feature.
  Background and per-feature timescales are both ground truth and are recorded in the
  manifest under FR-04.

*Per-feature alone leaves the background water with no timescale at all, yet FR-08
requires quiet water to be left alone. A static per-region map gives the background a
timescale but cannot follow the drifting feature of FR-03. And the planner needs tau
at every cell it scores (FR-32, FR-34), not only inside features. The field
formulation is the only one that satisfies all three, and per-feature authoring
remains the interface a scenario is written in. This decision earns an ADR under
PR-03.*

### 3.2 Scenario

- **FR-06** The harness shall run an *arrive cold, then loiter* scenario: a simulated
  vessel entering a region with no local observations, followed by an extended period
  of station-keeping.
- **FR-07** During cold arrival, uncertainty shall be driven by ensemble spread
  alone, since observation age is spatially uniform and therefore carries no
  information.
- **FR-08** During loiter, uncertainty shall additionally reflect observation age,
  producing a revisit pattern whose cadence tracks the local decorrelation timescale
  of FR-05 — fast features resampled often, quiet water left alone.

### 3.3 Time

- **FR-09** All components shall read time from a shared **simulation clock**
  service. No component shall call a wall-clock function for any operational purpose.
- **FR-10** The clock shall support real-time and accelerated modes, with the rate
  controlled from the browser client.
- **FR-11** All stochastic behaviour shall derive from explicitly seeded random
  number generators, recorded in the run manifest.

*FR-09 to FR-11 exist together to make AT-04 (deterministic replay) possible. None of
them is retrofittable at acceptable cost.*

---

## 4. Components

| ID | Component | Responsibility | Owns the failure mode of |
|---|---|---|---|
| C-01 | Simulation clock | Single source of time, rate-controllable | Hidden wall-clock dependencies |
| C-02 | Environment generator | Synthetic 4D fields + ground-truth manifest; the historic archive, authored at provisioning | Unverifiable truth |
| C-03 | Broker (MQTT) | Pub/sub transport, namespaced topics | Cross-contamination of flows |
| C-04 | Simulated sensors | Publish observations in SensorThings vocabulary | — |
| C-05 | Ingest client | Validate, batch-write; the observation store's ingestion seam | Ingest backpressure |
| C-06 | Observation store | Persist point observations (Postgres + PostGIS) | — |
| C-07 | Feature store | Static spatial reference: bathymetry, coastlines | — |
| C-08 | Coverage store | Gridded forecast and uncertainty fields, the retained run instances, the archive and the now-cast (NetCDF) | Unbounded accumulation |
| C-09 | Query layer (pygeoapi) | SensorThings + EDR read access; enumeration of every holding and of the advisories | Declaring an extent it cannot answer |
| C-10 | Reverse proxy (nginx) | TLS, authentication, path policy | Accidental exposure |
| C-11 | Monitor | Detect forecast divergence from observations | Over-sensitivity |
| C-12 | Scheduler | Decide whether a model run is warranted | Thrashing |
| C-13 | Model runner | Analytic advection + noise, ensemble member runs | Being irreplaceable |
| C-14 | Publisher | Make completed runs visible, atomically; retain them as instances; announce | Partial visibility |
| C-15 | Planner | Adaptive sampling recommendations | Crossing into tactical advice |
| C-16 | Telemetry | Health and forecast-skill indicators | Silent degradation |
| C-17 | Offload packager | NetCDF+CF export with integrity guarantee | Premature eviction |
| C-18 | Browser client | Visualisation and control (React/TS/Deck.gl) | — |
| C-19 | Shore advisory source | Deterministic shore-role authoring and publication of advisories; the advisory ingestion seam | Being mistaken for a real external party |
| C-20 | Advisory store | Append-only holding of issued advisories, read by the query layer alone | Silent supersession |
| C-21 | System controller | Aggregate what components report about themselves; serve the operator REST surface; dispatch operator commands; sole holder of the container runtime socket | A stale aggregate presented as current; the reach of the socket it alone holds |

- **FR-12** The observation and feature stores shall run as two schemas in one
  Postgres instance, mirroring the conceptual split (punishing write path versus
  read-mostly reference data) without doubling the operational surface.
- **FR-13** The feature store shall be read-only during a scenario run, provisioned
  by script at scenario start — the harness analogue of pre-sail loading.

---

## 5. Functional requirements

### 5.1 Messaging

- **FR-14** Observation traffic and internal control events shall use separate topic
  namespaces on a single broker, with access control lists confining sensors to the
  observation branch.
- **FR-15** Physical separation onto a second broker shall remain a documented
  fallback requiring configuration change only, not redesign.

### 5.2 Observation path

- **FR-16** Simulated sensors shall publish observations using the SensorThings
  vocabulary. SensorThings is the shape and vocabulary of the messages, not the
  write engine.
- **FR-17** The ingest client shall validate each observation against the message
  schema and batch-write to the observation store.
- **FR-18** The ingest client shall be the sole writer to the observation store.

### 5.3 Query layer

- **FR-19** The query layer shall expose collections conforming to OGC SensorThings
  (Part 1, Sensing) over the observation store, and OGC API-EDR over the coverage
  store, returning CoverageJSON.
- **FR-20** EDR trajectory queries shall be supported, with **per-vertex
  timestamps**: the response reports conditions forecast for the moment of arrival
  at each point, not conditions at query time.
- **FR-21** The coverage store shall follow a naming and cataloguing convention such
  that a new model run becomes servable without editing collection configuration.
- **FR-50** Trajectory queries over the coverage store shall be served by a bespoke
  pygeoapi EDR provider plugin. No supplied provider implements trajectory: pygeoapi's
  provider matrix lists `xarray-edr` as position and cube only, and that provider's
  source defines no trajectory method. The plugin is therefore a planned component
  sitting behind the coverage output port of §2.1, not a workaround.
- **FR-51** The deployment shall pin Shapely >= 2.1 built against GEOS >= 3.12. Below
  those versions the M ordinate of a `LINESTRINGM` or `LINESTRINGZM` is returned as
  NaN, so per-vertex timestamps are lost silently, before any provider code runs, and
  FR-20 fails without raising an error. The pin shall carry a comment saying so, and a
  test shall assert that M survives parsing.

*The standard expresses per-vertex timestamps natively — EDR trajectory `coords` is
WKT `LINESTRINGM`/`LINESTRINGZM` with M as the vertex time — and the query layer needs
no change to carry them: pygeoapi parses `coords` with `shapely.wkt.loads` and passes
the geometry to the provider untouched, leaving all M interpretation to the provider.
The response shape is CoverageJSON's Trajectory domain, whose composite axis is a
per-vertex (t, x, y, z) tuple. The §10 spike accordingly narrows from "does this
work?" to "prove M survives parsing and sample one four-dimensional route"; everything
after that is a build. This decision earns an ADR under PR-03.*

### 5.4 Control loop

- **FR-22** The monitor shall subscribe directly to observation topics and maintain a
  rolling window in memory. It shall not query the observation store during normal
  operation.
- **FR-23** On restart, the monitor shall perform a single catch-up query or observe
  a declared warm-up period before raising divergence events.
- **FR-24** The monitor shall compute the residual between measured and forecast
  **sound speed** — not temperature — and raise a divergence event when the residual
  exceeds threshold with sustained spatial or temporal persistence. A single spike
  shall never trigger a run.
- **FR-25** The default threshold shall correspond to roughly half a degree Celsius
  equivalent (order 1.5–2 m/s of sound speed), tunable per scenario.
- **FR-26** The monitor raises requests only; it shall not invoke the model.
- **FR-27** The scheduler shall enforce a minimum interval between runs and reject
  duplicate outstanding requests.
- **FR-28** The model runner shall advect the seeded features forward analytically
  and add noise. It shall not implement real numerics, and shall sit behind the model
  kernel port: initialisation state in, gridded field out.
- **FR-29** The model runner shall execute a small ensemble with perturbed initial
  conditions, emitting the ensemble spread as an uncertainty field alongside the
  forecast field.
- **FR-30** The publisher shall make a completed run visible atomically — no reader
  ever observes a partially written field — and shall mark it current.
- **FR-31** The publisher shall announce each new run as an event on the control
  namespace. Consumers subscribe; nothing polls the query layer for freshness,
  because the query layer has no notification mechanism.

### 5.5 Uncertainty and planning

- **FR-32** The planner shall evaluate candidate routes against the uncertainty
  field, **simulating the collapse** of uncertainty along each candidate as it is
  traversed, so a distant objective's value decays as nearer sampling resolves it.
- **FR-33** The planner shall produce a single committed route with
  diminishing-returns behaviour already incorporated, and shall replan on a receding
  horizon as measurements arrive.
- **FR-34** The planner shall project uncertainty growth forward and report when a
  region will fall below usable confidence, making the output schedulable rather
  than merely reactive.
- **FR-35** Spatial indexing shall use H3 for the horizontal, layered with a
  separate depth index. The route selection problem is treated as orienteering /
  prize-collecting, not travelling-salesman: cells are chosen under a budget, not
  all visited.
- **FR-36** The planner shall emit recommendations only. The harness is headless
  with respect to decisions; rendering and advice to a human occur downstream.
  Computing where sampling would most reduce uncertainty is itself decision logic
  even when never drawn — the boundary defended is who recommends, not who renders.

### 5.6 Telemetry and quality

- **FR-37** The telemetry component shall maintain running statistics of the
  forecast–measurement residuals already computed by the monitor. Same data, two
  purposes: triggering runs and reporting confidence.
- **FR-38** Forecast skill shall be reported against a persistence reference. A model
  not beating "conditions stay the same" is not earning its compute, and the display
  shall say so.

### 5.7 Security

- **FR-39** Access shall be binary: a user is cleared for all data or none. No
  per-field redaction shall be implemented. This assumption shall be recorded as an
  ADR, because if it ever softens to tiered access the architecture changes
  materially.
- **FR-40** Access control shall operate on URL path prefix at the reverse proxy,
  which is viable precisely because the query layer's paths are stable and
  predictable.
- **FR-41** Released collections shall sit under a dedicated path prefix with
  default-deny applied to everything else, so adding a collection never exposes it
  by accident.
- **FR-42** Where derived products are released downstream, point observations,
  measurement locations and planned routes shall be withheld. Two leakage paths
  require explicit tests: provenance metadata embedded in exported files, and the
  shape of the freshly updated region, which traces the track.

### 5.8 Offload

- **FR-43** Export shall be NetCDF with CF conventions, using the trajectoryProfile
  discrete sampling geometry.
- **FR-44** Local data shall be evicted only after verified receipt at the
  destination.

### 5.9 Visualisation

- **FR-45** The client shall render the **full component layout from day one**, with
  components greyed out until they exist. Illumination shall be driven by component
  liveness, not configuration, so the display cannot claim a component exists when
  it does not.
- **FR-46** The client shall show the control loop cycling in real time, and
  messages crossing component boundaries, with the ability to inspect the message
  that just passed.
- **FR-47** The client shall render the planned route as a four-dimensional curve
  through the forecast volume, with a time control showing conditions at arrival.
- **FR-48** The client shall render the uncertainty field decaying and refreshing
  over time.
- **FR-49** The client shall expose the simulation speed control.
- **FR-52** The simulation clock shall publish a heartbeat on the control namespace,
  and the client shall derive that component's illumination from it. This is the
  harness's first liveness signal and the pattern every later component follows. No
  mocked or synthesised traffic shall ever drive illumination, since a mock asserts
  the existence of something that does not exist and so defeats FR-45.
- **FR-53** Screenshot capture shall pin the clock rate to zero for the duration of a
  capture, so a before/after pair differs only where the change under evidence
  differs. Without this every pair differs everywhere and the comparison carries no
  information.

*FR-52 and FR-53 together settle whether the greyed-out shell needs mocked traffic to
exercise the Playwright loop: it does not. An all-grey shell yields a screenshot that
never changes, so the capture pipeline is shown to run but never shown to
discriminate. One genuinely live component supplies the change, and the clock is
already first in the delivery order for unrelated reasons.*

### 5.10 Coverage holdings

- **FR-54** Every published forecast run shall be retained and discoverable as an
  instance of the forecast collection, carrying its issue time and its valid-time
  extent, for the duration of a scenario. A query naming no instance shall continue to
  be answered by the current run: accumulation changes what is kept, never what
  "current" means.
- **FR-55** The harness shall carry a **historic archive**: one collection whose time
  axis spans a configured multi-decade past at monthly intervals, authored
  deterministically from the root seed when a scenario is provisioned, with ground
  truth recorded in a manifest as FR-04 requires.
- **FR-56** The harness shall serve a **now-cast**: one collection whose single instance
  is replaced on a configured cadence, taking its validity from the simulation clock of
  FR-09 and recording in its own manifest what it was derived from, so that no consumer
  can mistake it for an independent measurement of truth.
- **FR-57** Each holding's discovery document shall state its temporal and spatial
  extent truthfully, and a test shall compare what a collection declares against what
  its store holds. A reader of the collections can then tell which era is able to answer
  for a named instant without issuing a single query.
- **FR-58** All holdings shall answer through the same query machinery under the same
  rules — linear interpolation inside the domain, declined outside it, never snapped and
  never extrapolated — and retention, with any storage ceiling, shall be configuration
  validated against schema, a breach being a refusal that names the limit rather than a
  silent eviction.

*Three eras — past, present, future — are what make discovery worth exercising at all.
A collection list carrying one forecast run teaches nothing about choosing between
holdings, and which of several overlapping forecasts should answer for the moment of
arrival is the question a voyage actually asks. Two things deliberately need no new
rule: AT-04 already binds the whole scenario, so the archive, the instance set and the
now-cast replay with it; and FR-41's default-deny means a holding joins the released
path only by explicit opt-in, which is the property that makes adding three of them
safe. The stories, the edge cases and the argument are in
`specs/019-coverage-holdings/spec.md`.*

### 5.11 Shore advisories

- **FR-59** The harness shall issue **shore advisories**: concise vector descriptions of
  a dominant environmental feature — a front's line, an eddy's centre and extent — each
  carrying its feature kind, geometry, issue time, validity period and provenance.
  *Shore* is a role the harness plays deterministically for itself. No external party
  and no external link is modelled, and every surface that names shore shall say that it
  is synthetic, in the spirit FR-01 requires of the harness as a whole.
- **FR-60** An advisory shall describe only features the generator seeded (FR-03), at a
  stated fidelity, and its schema shall admit no field capable of naming an entity the
  harness did not place — §1.1's prohibition applied at a new schema boundary.
- **FR-61** Advisories shall be authored deterministically from the seeded generators of
  FR-11 and from simulation time, on a configured cadence, so that a replay reproduces
  the advisory set exactly and re-delivery of an advisory message changes nothing.
- **FR-62** Advisories shall travel the message fabric on a declared topic within the
  control namespace of FR-14, with the sensors' confinement to the observation branch
  unchanged. A malformed advisory shall be refused at its ingestion seam with the
  violation named, shall not be persisted, and the refusal shall be observable.
- **FR-63** Advisories shall be held in a store of their own: writable during a run only
  through the advisory ingestion seam, append-only, and read by the query layer alone.
  The feature store of FR-13 is untouched — read-only during a run, in rule, content and
  provisioning. Whether the advisory store is a third schema in the single instance of
  FR-12 or a deliberately lighter holding is a decision for the feature's plan and earns
  an ADR under PR-03.
- **FR-64** The query layer shall serve advisories read-only as a feature-data
  collection, enumerated alongside the coverage holdings, with a temporal extent
  verified against the store. Before any advisory has been issued the collection shall
  be present and shall state that it is empty — the absence of advisories, not the
  absence of the collection.
- **FR-65** An advisory size ceiling shall be stated in validated configuration and
  enforced at authoring by a refusal that names the limit, and each scenario's recorded
  outputs shall carry the advisory sizes measured against the smallest gridded update
  carrying comparable information. Conciseness is the product's whole reason to exist,
  so the harness measures it rather than asserting it.
- **FR-66** Where the map surface is present, advisories valid at the displayed
  simulation time shall be drawn on it, visibly distinct from measured and forecast data
  and legible in greyscale, with kind, issue time, validity and provenance readable on
  selection. An advisory outside its validity shall not be drawn and shall remain
  queryable: display honours validity, the record honours history. This extends FR-47
  and FR-48 and shall be separable from the rest of §5.11, so that its absence blocks
  nothing.

*The advisory is a second kind of forecast update — small where a field is large, and
sent rather than carried — which is what makes it worth building at all: it exercises
the same fabric with a payload of a different order. It takes a new mutable path rather
than relaxing FR-13, so that what was aboard at departure and what was sent en route
stay structurally distinct and no consumer has to remember the difference; that is also
why FR-63 asks for a store rather than a table added to one that already has a rule, and
why §2 now speaks of one ingestion seam per store rather than one seam. A second write
path is a real change and is better said than glossed. The vessel on a constrained link
is a device for asking what the architecture must carry, and names nobody: PR-01 holds
here as everywhere, and the shore is this harness talking to itself. The argument is in
`specs/020-shore-advisories/spec.md`.*

### 5.12 The operator plane

- **FR-67** A system controller shall observe the control namespace — heartbeats,
  telemetry, run announcements — and serve over a REST interface a deeper account of
  each component's state than the shell displays: the last heartbeat and reported
  status, the component's own published counters, and a rolling recent window of the
  same, held in memory and claiming no persistence. The controller aggregates what
  components said about themselves and invents nothing: a component never heard from
  is reported as unheard, not absent and not assumed.
- **FR-68** Every long-running component shall publish throughput telemetry as a new
  kind within the existing telemetry union, on the established cadence discipline:
  counts of work received, done and refused, expressed per simulation second as the
  ingest client already reports its write rate, with freshness stated. The channel
  exists; only the kind is new.
- **FR-69** Keeping-up and end-to-end latency shall be expressed in simulation time:
  a component reports how far its processing trails the clock, and the harness
  measures the simulated interval from an observation's sampling to its availability
  through the query layer. No wall-clock exemption is needed or taken for either.
- **FR-70** The controller shall sample each container's processor and memory use
  through the container runtime and publish it as telemetry, so the display can show
  where the harness saturates as the rate rises. This is inherently a per-host-second
  measure and therefore the third wall-clock exemption; the constitution calls a
  third request evidence of erosion, so it shall be argued on its own merits in an
  ADR under PR-03 before it is built, on the ground that it measures the machinery
  and not the simulation — kin to the heartbeat cadence, not to the clock.
- **FR-71** The clock shall accept any rate within its configured bounds, not only an
  offered set, and shall gain a step operation advancing a paused clock by a stated
  simulated interval. A refused command shall name the bound or rule that refused it,
  and the client shall surface the refusal and the bounds rather than discarding the
  response body as it does today.
- **FR-72** The controller shall dispatch operator commands: the clock's control
  operations; trigger actions issued as ordinary control-namespace messages, such as
  requesting a model run; and process-level lifecycle — stopping, starting and
  restarting a named component's container through the container runtime. The
  runtime socket is a deliberate trust surface, held by the controller alone and
  argued in the same ADR as FR-70. A command names its target; a component asked to
  act remains free to refuse, and the refusal travels back with its reason.
- **FR-73** Operator commands are ephemeral: they are not part of the run record, and
  a run that has been commanded through lifecycle or trigger sits outside AT-04's
  replay claim — stated plainly wherever replay is claimed, rather than left to be
  discovered. Rate and pause changes perturb nothing, since a tick's value is the
  same at every rate, so a run whose only commands were speed changes replays as it
  always did.
- **FR-74** The operator plane shall be reachable through the reverse proxy under a
  dedicated path prefix with clearance delegated, as the control-namespace WebSocket
  path already is, and the clock's control surface shall be reachable the same way —
  ending its present direct exposure beside the boundary rather than behind it.
  Within the demonstration the plane carries no authentication of its own; the
  boundary's default-deny is unchanged for every other path.
- **FR-75** Data-product creation and transmission shall each be observable by
  subscription alone: creation is already announced (FR-31), and the offload
  packager shall additionally announce each verified transmission on the control
  namespace, so a subscriber can watch products leave as well as arrive.
- **FR-76** The client shall present the throughput display beside the simulation
  speed control, so cause and effect share a screen. Illumination remains driven by
  liveness alone: a component stopped by command goes dark because its heartbeats
  cease, never because the plane says it is stopped.

*The operator plane exists so the harness can be interrogated and provoked while it
runs — the rate turned up, the pace watched, a component stopped mid-cycle — which is
the first purpose of §1 exercised deliberately rather than incidentally. Most of it is
a console over surfaces that already exist: `spikes/operator-plane/FINDING.md` proved
the display half needs nothing new and that throughput is a missing kind rather than a
missing channel, and the clock's two-route interface is the shape every command
surface copies, request over HTTP and effect observed on the broker. Three decisions
are deliberate and said here: the recent window persists nothing, because history
worth keeping would be a store and earn the scrutiny of one; commands are ephemeral,
because the run record exists to reproduce the scenario and an operator's hand is not
part of the scenario; and the graphical composition of EDR requests from the client
belongs to a later amendment (§10). Two ADRs are owed under PR-03: the exposure of the
plane and the clock through the boundary, which resolves the clock's currently
proposed direct exposure; and the resource-sampling exemption with the runtime
socket's confinement to C-21. The stories, the edge cases and the argument are in
`specs/021-operator-plane/spec.md`.*

---

## 6. Interfaces and shared types

- **NFR-01** HTTP interface types derive from OpenAPI, taking the query layer's own
  emitted specification as source where possible.
- **NFR-02** Broker message payloads are defined in JSON Schema and referenced from
  the OpenAPI document where the same shapes appear in both. Rationale: OpenAPI has
  nothing to say about asynchronous messages; JSON Schema is already OpenAPI's
  embedded vocabulary, giving one vocabulary and one generator chain rather than a
  second specification language.
- **NFR-03** Python and TypeScript types are generated from these sources. No type
  shared across the language boundary is hand-written twice.
- **NFR-04** No Python component contains a literal filename or path. All external
  input arrives via a named config file, validated against schema as the first step.

---

## 7. Deployment

- **NFR-05** The system is defined as a single Docker Compose configuration, kept
  environment-agnostic from the first commit: hostnames, ports and paths come from
  config, never hardcoded.
- **NFR-06** Two destinations, one configuration: local (including ephemeral
  agent-session use) for development, and a small DigitalOcean droplet for
  demonstrations needing a persistent URL. The author provisions both the repository
  and the droplet.
- **NFR-07** Seed data is produced by scripts, never accumulated; a fresh instance
  is equivalent to a long-running one.

---

## 8. Development process

### 8.1 Repository

- **PR-01** The repository is public but unadvertised. No customer name, project
  name, or bid-specific material appears anywhere in it — code, docs, blog, commit
  history or issue tracker.
- **PR-02** Branches: `main`, `develop`, `gh-pages`, plus per-feature branches
  created by the spec-driven tooling.
- **PR-03** Architecture Decision Records are markdown in `develop`. An ADR is
  required for any decision that is hard to reverse, was genuinely contested, or
  where a plausible alternative was rejected. Routine choices do not earn one.

### 8.2 Spec-driven development

- **PR-04** Feature development uses GitHub spec-kit: constitution → specify → plan
  → tasks → analyze → implement.
- **PR-05** The project constitution carries the non-negotiables so every phase is
  checked against them automatically: no wall-clock time, no literal paths,
  generated types only, deterministic replay, and the prohibition on tracked
  entities.

### 8.3 Published site

- **PR-06** `gh-pages` carries the blog and the system documentation.
- **PR-07** The blog is written for general technical readers — a proper public
  blog, at a standard suitable for an audience the author would be content to
  acquire.
- **PR-08** One blog entry per feature, written after the feature works, including
  screenshots.

### 8.4 System documentation

- **PR-09** The documentation area covers: subsystem reference (what each component
  does and why); algorithm derivations (ensemble spread, advection, informative path
  planning); standards primers (SensorThings, API-EDR, CF conventions,
  CoverageJSON); and a glossary, since half the vocabulary is oceanographic.

### 8.5 Visual capture

- **PR-10** Playwright captures screenshots at three distinct moments which do not
  share plumbing: in-session, on demand, when the agent wants the author's visual
  feedback; before/after pairs evidencing a change within a feature (see FR-53); and curated
  feature-completion shots for the blog. Only the third is a durable artefact.

---

## 9. Acceptance criteria

| ID | Test |
|---|---|
| AT-01 | A trajectory query returns correct values along a four-dimensional route, verified against the generator's ground-truth manifest |
| AT-02 | A threshold breach triggers a model run, visibly, end to end, within the client |
| AT-03 | The seeded eddy is recoverable from the stored data with a known and reported error |
| AT-04 | The whole scenario replays deterministically from its seed |

---

## 10. Delivery priorities

All twenty-one components are in scope, which is a large surface for spare-time work;
the discipline is ordering, treated as a commitment, with each stage demonstrable
before the next begins. Ranked by cost-of-getting-it-wrong-late:

1. **Deterministic replay foundations** — clock, seeded RNG, no wall-clock (FR-09 to
   FR-11). The only thing on this list that cannot be retrofitted.
2. **EDR trajectory provider** — the load-bearing unknown, now scoped (FR-20, FR-50,
   FR-51). Since no supplied provider implements trajectory, this is a build rather
   than a gamble; the one thing still unproven is that the per-vertex M ordinate
   survives WKT parsing. If it does not, the read path and the client's centrepiece
   both change shape.
3. **The greyed-out shell, live on the droplet** (FR-45) — the feedback surface, the
   always-showable artefact, and the anchor for the Playwright loop.
4. **Ground-truth manifest** (FR-04) — what turns the harness from toy into
   evidence; AT-01 and AT-03 both score against it.
5. **One environment-agnostic Compose configuration** (NFR-05) — drift between local
   and droplet quietly doubles maintenance.
6. **Generated types from the neutral masters** (NFR-01 to NFR-03) — must exist
   before any message has a second consumer.

Deliberately below the line: the blog machinery, the planner, nginx and offload. All
in scope; none punishes lateness.

Below it too, and with a condition attached rather than merely a rank: the coverage
holdings (§5.10) and the shore advisories (§5.11). Neither begins until the control
loop's turn is demonstrable in the running system — a threshold breach becoming a
published run, watched from the client, which is AT-02 as it is written above. The
criterion is unchanged and is not novelty: getting either of these wrong late costs a
store's layout and a collection's configuration, both recoverable, while getting the
loop wrong late costs the harness its first purpose. Retaining runs that never happen
would be an accumulation of nothing, and an advisory is an *update* to a forecast that
has to be turning before there is anything to update.

The operator plane (§5.12) sits below the line under the same condition, and for the
same kind of reason: the throughput of a loop that is not yet turning measures
nothing, and `spikes/operator-plane/FINDING.md` recommends it as a later stage in as
many words. One strand of it is exempt from the wait, because it repairs an existing
requirement rather than extending scope: FR-10 already promises rate control from the
browser, and FR-74's routing of the clock's control surface through the boundary is
what makes that promise hold wherever only the boundary is published.

Named here so the intent is on the record, and deliberately not specified: a
graphical composer of EDR requests in the client — building a query against a chosen
collection from the map rather than from text. It begins, at the earliest, once the
operator plane is standing and the map surface of feature 017 has a selection model
to build on, and it will be its own amendment when it does.

---

## 11. Resolved questions

| Question | Resolution | Recorded in |
|---|---|---|
| Does the query layer's EDR trajectory implementation handle per-vertex timestamps as FR-20 requires? | No supplied provider implements trajectory at all, so a bespoke provider plugin will. The surviving unknown is narrower: whether the M ordinate survives WKT parsing, which a version pin and a test address. | FR-50, FR-51; ADR required |
| Is the decorrelation timescale a property of the seeded feature or of the region? | Neither exclusively. It is a field, authored per feature over a background and evaluated per location, advecting with a moving feature. | FR-05; ADR required |
| Does the greyed-out shell need mocked traffic for early Playwright work? | No. The simulation clock's heartbeat is the first real liveness signal, and capture pins the clock rate to zero so comparison stays meaningful. | FR-52, FR-53 |
| What is this thing called? | drogna. | §1.2 |
| Does the harness hold more than the current forecast, and does it hold any era but the future? | Yes to both. Published runs are retained as instances for the length of a scenario, and the holdings span three eras: a monthly historic archive, a now-cast, and the accumulating forecasts. Accumulation changes what is kept and not what "current" means. | §5.10, FR-54 to FR-58; `specs/019-coverage-holdings/spec.md` |
| Can a forecast update reach the vessel as something smaller than a gridded field, and where would it live? | Yes: a shore-issued vector advisory describing a seeded feature, travelling the message fabric and held in a store of its own, so that what was aboard at departure stays structurally distinct from what was sent en route. Shore is a role the harness plays itself. | §5.11, FR-59 to FR-66; `specs/020-shore-advisories/spec.md`; the store's engine earns an ADR under PR-03 |
| How is the running system itself interrogated and commanded, beyond the speed control — and does its throughput stay visible as the rate rises? | Through an operator plane: a system controller aggregating what components report about themselves, served over REST behind the boundary, with commands — clock operations, triggers, process-level lifecycle — that a component may refuse. Throughput becomes a kind in the existing telemetry union, per simulation second; commands are ephemeral and outside AT-04's claim. | §5.12, FR-67 to FR-76; `specs/021-operator-plane/spec.md`; the exposure and the resource-sampling exemption each earn an ADR under PR-03 |

Nothing in this document is currently open. Questions are raised in this section as
they arise and struck from it when they are answered, with the answer landing in a
requirement rather than staying here.
