# Software Requirements Document
## drogna, Version 2

**Status:** Adopted 29 August 2026 — written against the endorsed plan
(`docs/v2/plan.md`), folding in its emergent requirements (E1–E15), the resolved
questions (§9) and the third-round process decisions (D15–D17). Supersedes
`harness-srd.md`, which is archived in place as the V1 record.
**Author:** Doc
**Date:** 29 August 2026

Requirements carry fresh numbers. Where a requirement descends from Version 1, the
provenance is cited as *(v1 FR-nn)*; where it was learned from an open pull request's
record, as *(Enn)*. The archived `harness-srd.md` carries the fuller argument and
remains the record of how each requirement was learned. A V1 requirement not carried
and not cited here is retired, and §11 lists the deliberate retirements — nothing is
dropped silently.

---

## 1. Purpose

drogna is a personal learning harness: a small, runnable system exercising the
architectural pattern under consideration for a maritime environmental data platform.
Version 2 is a clean rewrite as a **pure client-side TypeScript single-page
application**: the backend components are genuine programs running in the browser,
separated from the front-end by a wire-protocol seam, so that Version 3 can replace
them with a real backend without rewriting the client.

The three purposes carry, in strict priority order *(v1 §1)*:

1. **Understanding** — how the components behave together, particularly where they
   misbehave together.
2. **Demonstration** — the architecture shown as a running thing; in V2, a running
   thing that is a URL.
3. **Evidence** — concrete prior art for modest, specific claims, including evidence
   of LLM-assisted development under engineering constraint.

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

- The **front-end**: the dockable multi-panel shell, its panels, and everything that
  renders.
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
  MQTT-over-WebSocket), and the release gate of §5.8. Front-end code shall not import
  backend modules or vice versa; only the seam's client interfaces and the generated
  types are shared. Enforced by gate (Constitution XI).
- **FR-03** Every shape crossing the seam shall be governed by a committed master under
  `contracts/` (JSON Schema for messages and configuration, OpenAPI for HTTP), and
  seam traffic shall be validated against the masters in tests, and in the browser
  behind a debug flag. *(v1 NFR-01 to NFR-03, re-aimed at the seam.)*
- **FR-04** The seam shall be swappable to a remote backend by configuration alone: a
  base URL for HTTP and a broker URL for pub/sub. No code path may distinguish the two
  cases, and no client configuration may carry an absolute URL — every fetch is
  relative and same-origin, which is what makes the page portable across any host and
  clearance *(E7; v1's one-door lesson)*. This is Version 3's contract, and AT-05
  tests it.

### 2.2 Honest ports *(v1 §2.1)*

The port inventory is rewritten around the seam. Genuine ports, each with more than one
conceivable implementation: the **seam transports** (HTTP interception and the broker
transport — in-browser today, network in V3), the **clock**, the **RNG**, the **model
kernel** (initialisation state in, gridded field out), and the **store interfaces**
(in-memory today, engines in V3 — a port now precisely because V3 is planned, where in
V1 "Postgres is not being swapped" was the honest statement). Nothing else is dressed
as a port, and the documentation claims exactly the pluggability that exists.

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
- **FR-11** Provisioning shall run the components' own code paths: seed data — the
  historic archive, the initial published run, the feature store's contents — is
  authored by the same components and seams that author it during a run, never by
  writing into a store directly. Seed data in the constitution's sense, not a fixture:
  the guards a run enforces (validation, digests, publication atomicity) are the
  guards provisioning passes through *(E3; v1's `030-coverage.sh` lesson)*.

---

## 4. Components

The C-numbers restart for V2. Each in-browser component owns its V1 ancestor's failure
mode; the ancestry column is the map back into the archived record.

| ID | Component | Responsibility | V1 ancestry |
|---|---|---|---|
| V2-C01 | Simulation clock | Single source of time, rate-controllable | C-01 |
| V2-C02 | Environment generator | 4D fields, ground truth, tau, the historic archive | C-02 |
| V2-C03 | Broker | MQTT-semantics pub/sub: topic tree, wildcards, role-based rules | C-03 |
| V2-C04 | Sensors | Observations in SensorThings vocabulary | C-04 |
| V2-C05 | Ingestion seam | Validate, write; sole writer to the observation store | C-05 |
| V2-C06 | Observation store | In-memory point observations behind a store interface | C-06 |
| V2-C07 | Feature store | Read-only spatial reference, provisioned at scenario start | C-07 |
| V2-C08 | Coverage store | Gridded fields; instances, archive and now-cast; atomic, digest-checked publication | C-08, C-14 |
| V2-C09 | Query components | SensorThings + EDR over the stores, through the seam | C-09 |
| V2-C10 | Release gate | Default-deny path policy at the seam | C-10 |
| V2-C11 | Monitor | Sound-speed residuals; divergence events; never a single spike | C-11 |
| V2-C12 | Scheduler | Whether a run is warranted; minimum interval, cadence floor; no duplicates | C-12 |
| V2-C13 | Model runner | Analytic advection + noise; small ensemble; behind the kernel port | C-13 |
| V2-C14 | Planner | Adaptive sampling recommendations, and only recommendations | C-15 |
| V2-C15 | Telemetry | Health, throughput per simulation second, skill vs persistence | C-16, part C-21 |
| V2-C16 | Shore advisory source | Deterministic advisory authoring; the advisory ingestion seam | C-19 |
| V2-C17 | Advisory store | Append-only advisories, read by the query components alone | C-20 |
| V2-C18 | Operator surface | Aggregated component state; commands with observable refusals | C-21 (sans container runtime) |
| V2-C19 | Shell | Dockable multi-panel front-end: Intro, Background, System, Holdings, Map, Messages | C-18 |
| V2-C20 | Offload packager | Export shape and departure announcements; no real transfer until V3 | C-17 |

- **FR-12** Store semantics carry although the engines do not: one writer per store
  through its ingestion seam; the feature store read-only during a run; the advisory
  store append-only and written only through its seam; published runs visible
  atomically, no reader ever observing a partial field *(v1 FR-12, FR-13, FR-18,
  FR-30, FR-63)*.
- **FR-13** Publication shall verify integrity: a run descriptor records digests of
  the fields it names, and a staged run whose bytes do not match its recorded digest
  is refused with the mismatch named, the current pointer untouched. Refusals are
  watched, not trusted *(E5; v1's tamper-refusal record)*.

---

## 5. Functional requirements, by narrative beat

The arc — build order, demo order and this section's order are the same thing: *a world
exists → it is sampled → it is served → it is assimilated → doubt is measured and
directed → the machinery is interrogated → advice travels light → it is seen.*

### 5.1 Foundations and shell (feature 101)

- **FR-14** The shell shall be a dockable multi-panel layout with top-level tabs
  **Intro, Background, System, Holdings, Map, Messages** at first run,
  user-rearrangeable by drag and drop. Background is specified by §5.10 and built by
  feature 111; it is named here because a tab that arrives without a requirement behind
  it is exactly the divergence V2 exists to end. **Holdings** is named for the same
  reason and with the debt admitted: it shipped with feature 102 and this list did not
  follow it, so §5.2 still owes it a requirement of its own.
  The layout library is **dockview 8.x**, chosen by feature 101's spike
  (`spikes/layout-manager/FINDING.md`) and recorded with its React-hosting pattern in
  ADR-0028. Panel arrangement is presentation only: no arrangement changes what any
  component does, and a saved arrangement is a per-viewer convenience, never state the
  system depends on.
- **FR-15** Views shall be URL-addressable from feature 101: an anchor URL opens the
  shell in a named view (a tab, a panel arrangement, a beat's demonstration), so a PR
  comment or a blog post can link a reader straight into the running instance at the
  thing being shown *(D16)*. No addressable view may carry state that belongs to the
  manifest — a deep link selects what is shown, never what happened.
- **FR-16** The full component layout renders from day one, greyed out; illumination is
  driven solely by heartbeats received over the broker within each component's declared
  liveness window. No configuration flag, no fixture, no override *(v1 FR-45, FR-52;
  Constitution VII)*. The clock's heartbeat is the first liveness signal and the
  pattern every component follows.
- **FR-17** Each component receives exactly one configuration document at
  construction, validated against its schema before any other work; no literal path,
  URL or topic string appears in component source *(v1 NFR-04; Constitution IV)*.
- **FR-18** The constitution gates run as TypeScript scripts from a gates registry,
  one gate per line, run by a runner that names no gate: wall-clock, seeded-RNG,
  literal-path, vocabulary, generated-types drift, seam import boundary. Each is
  watched failing before it is trusted *(v1 quality gates)*.
- **FR-19** Capture is rebuilt in TypeScript in this feature, glance first: a
  headless-Chromium screenshot of the running shell that starts no server, changes
  nothing, and prints the simulated rate in force beside the image, so a picture of a
  stopped system is never handed over as a live one. Capture pins the clock rate to
  zero for the duration of a capture *(v1 FR-53, PR-10; plan §9.3)*.

### 5.2 The synthetic ocean (feature 102)

- **FR-20** §3's world: generator, seeded features, tau, manifests — inspectable in
  the shell.
- **FR-21** The coverage holdings span three eras from the start of a scenario: a
  multi-decade monthly **historic archive** authored deterministically at provisioning
  (through the publisher's path, FR-11); a **now-cast** replaced on a configured
  cadence, its manifest recording its derivation; and the accumulating forecast
  **instances** once the loop turns. Each holding's discovery document states its
  extent truthfully, verified against the store by test *(v1 FR-54 to FR-58)*.

### 5.3 Sensing (feature 103)

- **FR-22** Sensors publish observations in SensorThings vocabulary on the observation
  namespace; the broker's role-based rules confine sensors to that namespace; the
  ingestion seam validates against the message schema and is the store's sole writer
  *(v1 FR-14, FR-16 to FR-18)*.
- **FR-23** The Messages tab renders live broker traffic with inspection of the
  message that just passed, and the client validates every received message against
  its schema, showing a running refusal count — "0 refused by their schema" is itself
  a claim the display makes and the tests check *(v1 FR-46; E4)*.
- **FR-24** The topic tree draws the declared topology lit by live traffic: structure
  from the derived topology artefact and nothing else, illumination from genuinely
  received messages and nothing else, the two never mixing; consumer roles as a
  first-class column connected to the subtrees their declared filters cover; arrival
  as a pulse at the leaf and a ripple up the ancestors, crossing to sustained
  intensity as rates rise; wide branches collapsing to a summary node *(E12; v1
  feature 022)*.
- **FR-25** The topology is derived, committed and drift-gated: the topic list is
  scanned from the components' declarations in the tree, never hand-maintained, and a
  gate fails the build when the committed artefact no longer matches a fresh scan
  *(E14)*. The shell's identity may read every namespace and may never publish; a
  display shall never show a branch cold where there is traffic — if it cannot hear a
  namespace, the design is at fault, not the caption *(E13)*.

### 5.4 The query seam (feature 104)

- **FR-26** The query components expose OGC SensorThings (Part 1, Sensing) over the
  observation store and OGC API-EDR (returning CoverageJSON) over the coverage store,
  each as a stated, honest subset *(v1 FR-19, FR-50)*.
- **FR-27** Subsets grow one capability at a time, and every refusal names the thing
  refused: an unimplemented option is refused with the option named, an unsupported
  geometry with the shape named, an unsupported property with the property named. The
  conformance statement is amended in the same commit as the code, and the agreement
  between the served statement and the documented one is held by a test *(E9; v1
  FR-80's discipline)*.
- **FR-28** EDR trajectory queries carry per-vertex timestamps: conditions forecast
  for the moment of arrival at each point *(v1 FR-20)*.
- **FR-29** A new holding becomes servable by convention, without editing query
  configuration *(v1 FR-21)*.

### 5.5 The forecast loop (feature 105)

- **FR-30** The loop carries whole: the monitor subscribes to observation topics,
  computes sound-speed residuals against the current forecast, and raises divergence
  events only on sustained persistence; the scheduler enforces a minimum interval and
  deduplicates; the model runner advects analytically with noise behind the kernel
  port and runs a small ensemble, emitting spread as an uncertainty field; the
  publisher makes runs visible atomically (digest-checked, FR-13), retains them as
  instances, and announces each on the control namespace — consumers subscribe,
  nothing polls *(v1 FR-22 to FR-31)*.
- **FR-31** The loop shall not be permanently becalmable: the scheduler holds a
  **cadence floor** — a maximum interval such that, when no run has been requested
  within it and the current run's validity has lapsed, a run is warranted on schedule
  alone. Runs are labelled by cause, *scheduled* distinct from *divergence-triggered*,
  wherever runs are shown *(E1, resolved plan §9.7; the becalmed loop
  `spikes/watched-turn/FINDING.md` watched)*.
- **FR-32** Quiet shall be legible: the System view distinguishes a loop that is quiet
  because the scheduler declined a breach inside its minimum interval, quiet because
  nothing has breached, and quiet because something has genuinely stalled — three
  different facts, never one appearance *(E2)*.

### 5.6 Uncertainty and planning (feature 106)

- **FR-33** Uncertainty combines ensemble spread with observation age against tau; the
  planner simulates the collapse of uncertainty along candidate routes, commits a
  single route with diminishing returns incorporated, replans on a receding horizon,
  and projects when regions fall below usable confidence *(v1 FR-32 to FR-35)*.
- **FR-34** The planner emits recommendations only; the harness is headless with
  respect to decisions *(v1 FR-36; Constitution VIII)*.

### 5.7 The operator's view (feature 107)

- **FR-35** Telemetry: running residual statistics; forecast skill always reported
  against a persistence reference, and the display says when the model is not earning
  its compute; throughput as counts per simulation second; keeping-up and end-to-end
  latency in simulation time *(v1 FR-37, FR-38, FR-68, FR-69)*.
- **FR-36** The operator surface aggregates what components report about themselves —
  a component never heard from is reported unheard, not absent — and dispatches
  commands: clock rate within bounds, step, and stop/start/restart of in-browser
  components. A refused command names the bound or rule; refusals are surfaced, and a
  stopped component goes dark because its heartbeats cease, never because the surface
  says so *(v1 FR-67, FR-71, FR-72, FR-76)*. Commands are ephemeral and outside
  AT-04's replay claim, stated wherever replay is claimed *(v1 FR-73)*.

### 5.8 Shore advisories and the boundary (feature 108)

- **FR-37** Shore advisories carry whole at their v1 grain: deterministic authoring
  from seeds and simulation time on a configured cadence; a schema admitting no field
  capable of naming an entity the harness did not place; travel on a declared control
  topic; refusal of malformed advisories at the ingestion seam, observably; the
  append-only store; the read-only collection, present-and-stating-empty before any
  advisory exists; the size ceiling enforced by a refusal that names the limit, and
  sizes measured against the smallest comparable gridded update *(v1 FR-59 to
  FR-65)*.
- **FR-38** The release gate applies binary access and default deny at the seam:
  released collections sit under a dedicated path prefix, everything else is denied,
  adding a collection never exposes it by accident, and a denial is observable in the
  shell. The two leakage paths keep their explicit tests — provenance metadata in
  exports, and the shape of the freshly updated region — and the boundary's tests
  exercise **at least one allowed request as well as the refusals**: a boundary that
  has never been entered is untested from the inside *(v1 FR-39 to FR-42; Constitution
  X; ADR-0001; E8)*.
- **FR-39** Offload is announcement-only in V2, keeping the export's shape: the
  packager stages the export in its v1 form — the bundle, its sidecar, and the
  **run-manifest sibling** carrying the identification radius and every sampled
  position and simulation time, beside the bundle and never inside it — and announces
  each staged departure on the control namespace. The sibling is the ground truth the
  leakage tests score the updated-region shape against, with producer/boundary radius
  parity held by a test. No real transfer and no verified-receipt eviction until V3
  *(v1 FR-43, FR-44, FR-75 reshaped; E11; plan §9.4)*.

### 5.9 The map (feature 109)

- **FR-40** The Map panel (Deck.gl) renders: the fields; the uncertainty field
  decaying and refreshing; the planned route as a four-dimensional curve with a time
  control showing conditions at arrival; advisories valid at the displayed time,
  visibly distinct and legible in greyscale, undrawn outside validity yet still
  queryable *(v1 FR-47, FR-48, FR-66)*.
- **FR-41** The EDR composer carries as a mode of the map: a guided sequence with the
  literal request URL always visible, assembling live and copyable; offering only what
  the query components genuinely serve, enumerated from server metadata, never
  stubbed; results rendered where they were asked for, with null, declined and absent
  as three different facts *(v1 FR-77 to FR-83)*. The copied URL is a genuine GET —
  which the wire-protocol seam is what makes true even in V2.
- **FR-42** The Intro tab narrates the arc, growing one section per landed beat, and
  by feature 109 constitutes the demo walkthrough script, deep-linking into each
  beat's view (FR-15).

### 5.10 Background (feature 111)

- **FR-43** The Background tab shall carry a linear course of eight self-contained
  explainers — why a standard at all; points and fields; NetCDF; SensorThings; OGC
  API-EDR; pygeoapi; MQTT; the control loop — each a slide sequence or an interactive
  infographic completable in 60 to 90 seconds, each addressable by anchor URL to the
  step (FR-15), and each closing on the same three value axes: through-life cost,
  interoperability, and what one does not have to build.
- **FR-44** No explainer shall read run state, subscribe to the broker, or issue a
  request across the seam. Background renders identically with every component stopped,
  and is tested under that condition. It teaches the standards rather than standing in
  for a component, which is why Constitution VII is not engaged; where an explainer
  claims something about drogna specifically it links to the live view rather than
  depicting it.
- **FR-45** Explainers shall be schematic and visually distinct from the Map panel, drawn
  over the seeded scenario's own vocabulary (FR-06), legible in greyscale, traversable by
  keyboard alone, and written domain-first for a reader who knows the ocean and not the
  architecture. Through-life-cost claims are stated as qualitative arguments and marked
  as unmeasured. The slide mechanism is built in feature 111; NFR-05's toolchain is
  unchanged.

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
- **NFR-04** CI publishes a **per-PR instance** of the app for review, addressable
  while the PR is open and **retained once it completes**, so that a PR comment or
  blog post can link a specific instance and, via FR-15's anchors, a specific view of
  it — and so an instance can be embedded in a site page. The published estate
  (instances and site together) is **grown additively**: discrete deployments push
  content into it directly — a review instance cannot wait for a merge to the default
  branch — rather than the whole site being rebuilt at each merge *(D16, D18)*.
- **NFR-05** Toolchain: TypeScript 5, React, Deck.gl, a layout manager per FR-14,
  pnpm, vitest, Playwright. Nothing else; no Python, no containers (NFR-01).

## 8. Development process

- **PR-01** The repository remains public but unadvertised; no customer, project or
  bid material anywhere in it *(v1 PR-01)*. The discipline extends to the
  notification channel: the ntfy topic is deployment configuration held as a CI
  secret, never committed *(D17)*.
- **PR-02** Spec-kit carries: constitution → specify → plan → tasks → analyze →
  implement; V2 features are numbered from 101, one per narrative beat *(v1 PR-04,
  PR-05; plan §9.6)*. Tick tasks as you go; write the reason at the moment a task is
  declined — the V1 reconciliation lesson.
- **PR-03** ADRs carry, continuing the existing numbering; the V2 reversal ADR takes
  whatever number is free when it lands, after the open V1 PRs settle theirs *(v1
  PR-03)*.
- **PR-04** The published site is rebuilt for V2, with the V1 posts moved to an
  archive section rather than disappearing, and carries the **glossary** and the
  **component reference** as first-class pages *(v1 PR-09; D18 — valued content, not
  ballast)*. Blog posts capture significant new UI components and backend
  simulations — one per significant component rather than strictly one per feature —
  each announced to the author by ntfy *(plan §9.1; D17)*.
- **PR-04a** Blog articles are terse, to a fixed shape: **the background, the
  requirement, the options considered, the demo** — minimal prose beyond that
  *(D19)*. An article for a significant UI component embeds a **playable instance**;
  where the significant work is headless, the article embeds an HTML/JS
  wrapper/visualisation demonstrating the component working across its range of
  interactions, reading it through the seam — the wire shape is what makes such a
  wrapper an ordinary consumer rather than a special build *(D18)*.
- **PR-05** Implementation is worked with developer autonomy in a single long-lived
  PR *(D15, D16)*: developers decide independently, conducting research spikes when
  necessary whose outcomes need no endorsement — with the record disciplines
  unchanged (ADRs for contested or hard-to-reverse decisions, dated `FINDING.md`s for
  spikes). Progress is narrated in PR comments, each linking a gh-pages-hosted
  instance opened at the relevant view; the author is sent a ntfy message when a
  significant visual component is ready.
- **PR-06** Each beat's acceptance is **watched, not inferred**: the beat's
  demonstration exercises the full path through the seam — generator to pixel, never
  a panel in isolation *(E15; issue #34's delivered-but-never-wired lesson)* — and is
  seen happening in the shell and captured, with the capture as the record *(E6; the
  watched-turn method)*.

## 9. Acceptance criteria

| ID | Test | Descends from |
|---|---|---|
| AT-01 | A trajectory query through the seam returns correct values along a four-dimensional route, verified against the generator's ground-truth manifest | v1 AT-01 |
| AT-02 | A threshold breach triggers a model run, visibly, end to end, within the shell — watched per PR-06, not inferred | v1 AT-02 |
| AT-03 | The seeded eddy is recoverable from the stored data with a known and reported error, the bound derived from the authoring jitter on disk, never typed into the test | v1 AT-03 |
| AT-04 | The whole scenario replays byte-identically from its exported manifest, in the strong form: the components replay in lockstep, the claim is byte-for-byte across every store and every seam crossing, and a one-command replay proof runs it — watched failing against planted violations before it is trusted | v1 AT-04, upgraded per E10 |
| AT-05 | A recorded corpus of seam traffic — requests, responses, published messages — validates against the committed masters, and the suite that replays it is runnable against a remote base URL unchanged | new: the V3 contract |

## 10. Open questions and delegated decisions

No question is currently open to the author: the plan's §9 resolved the seven that
were, and D15 delegates implementation decisions — among them whether in-browser
components run as Web Workers or as scheduled modules (feature 101's seam spike
decides, with an ADR), and the layout-library choice (FR-14) — to the developers.
Questions are raised here as they arise and struck when answered, with the answer
landing in a requirement rather than staying here.

## 11. Deliberate retirements

Retired with V1, reason stated, lessons kept in the archived record: the Compose
deployment and both destinations as a *requirement* (v1 NFR-05, NFR-06), with the
droplet decommissioned at V1 retirement (plan §9.2); the reverse proxy, pygeoapi,
Postgres/PostGIS, MQTT broker and NetCDF as *engines* (their roles and semantics carry
per §2.2, §4, FR-12; the engines return in V3); container lifecycle commands and
resource sampling (v1 FR-70, the container half of FR-72 — the third wall-clock
exemption retires with them); offload's real transfer and verified-receipt eviction
(v1 FR-43, FR-44 — deferred to V3, the export shape and announcements carried by
FR-39); the second-broker fallback (v1 FR-15 — moot with one in-browser broker; V3
revisits); and every implementation-specific requirement of a retired engine (v1
FR-51 among them — the *property* it protected, per-vertex time surviving the parse,
lives on in FR-28 and AT-01).
