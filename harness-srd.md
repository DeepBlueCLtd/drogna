# Software Requirements Document
## Environmental Data Architecture Harness (working title)

**Status:** Draft v0.2 — full rewrite
**Author:** Doc
**Date:** 26 August 2026

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

---

## 2. Architectural overview

The system is an event-driven **control loop** with command-query separation:

- Writes travel a direct path into storage via a single ingestion seam.
- Reads are served exclusively through a standards-based query layer.
- A sense → decide → act → publish cycle drives forecast regeneration.

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
- **FR-05** Each seeded feature shall carry a decorrelation timescale governing how
  fast the region loses memory of a measurement. (Whether this is a property of the
  feature or of the region is an open question; the harness starts with per-feature.)

### 3.2 Scenario

- **FR-06** The harness shall run an *arrive cold, then loiter* scenario: a simulated
  vessel entering a region with no local observations, followed by an extended period
  of station-keeping.
- **FR-07** During cold arrival, uncertainty shall be driven by ensemble spread
  alone, since observation age is spatially uniform and therefore carries no
  information.
- **FR-08** During loiter, uncertainty shall additionally reflect observation age,
  producing a revisit pattern whose cadence tracks each feature's decorrelation
  timescale — fast features resampled often, quiet water left alone.

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
| C-02 | Environment generator | Synthetic 4D fields + ground-truth manifest | Unverifiable truth |
| C-03 | Broker (MQTT) | Pub/sub transport, namespaced topics | Cross-contamination of flows |
| C-04 | Simulated sensors | Publish observations in SensorThings vocabulary | — |
| C-05 | Ingest client | Validate, batch-write; the single ingestion seam | Ingest backpressure |
| C-06 | Observation store | Persist point observations (Postgres + PostGIS) | — |
| C-07 | Feature store | Static spatial reference: bathymetry, coastlines | — |
| C-08 | Coverage store | Gridded forecast + uncertainty fields (NetCDF) | — |
| C-09 | Query layer (pygeoapi) | SensorThings + EDR read access | — |
| C-10 | Reverse proxy (nginx) | TLS, authentication, path policy | Accidental exposure |
| C-11 | Monitor | Detect forecast divergence from observations | Over-sensitivity |
| C-12 | Scheduler | Decide whether a model run is warranted | Thrashing |
| C-13 | Model runner | Analytic advection + noise, ensemble member runs | Being irreplaceable |
| C-14 | Publisher | Make completed runs visible, atomically; announce | Partial visibility |
| C-15 | Planner | Adaptive sampling recommendations | Crossing into tactical advice |
| C-16 | Telemetry | Health and forecast-skill indicators | Silent degradation |
| C-17 | Offload packager | NetCDF+CF export with integrity guarantee | Premature eviction |
| C-18 | Browser client | Visualisation and control (React/TS/Deck.gl) | — |

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

*EDR trajectory support is less battle-tested than position and cube queries. FR-20
shall be verified by spike before anything else depends on it — see §10.*

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
  feedback; before/after pairs evidencing a change within a feature; and curated
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

All eighteen components are in scope, which is a large surface for spare-time work;
the discipline is ordering, treated as a commitment, with each stage demonstrable
before the next begins. Ranked by cost-of-getting-it-wrong-late:

1. **Deterministic replay foundations** — clock, seeded RNG, no wall-clock (FR-09 to
   FR-11). The only thing on this list that cannot be retrofitted.
2. **EDR trajectory spike** — the load-bearing unknown (FR-20). If per-vertex
   timestamps fail, the read path and the client's centrepiece both change shape.
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

---

## 11. Open questions

- Does the query layer's EDR trajectory implementation handle per-vertex timestamps
  as FR-20 requires? Spike before committing.
- Is the decorrelation timescale a property of the seeded feature or of the region?
- Does the greyed-out shell need any mocked traffic for early Playwright work, or is
  liveness-driven illumination alone enough to exercise the capture pipeline?
- What is this thing called?
