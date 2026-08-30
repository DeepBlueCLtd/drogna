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
| V2-C21 | Platform | Ownship motion simulator: demanded and current course, speed and depth; state published as measurements | new in feature 113 |

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
  **Intro, Background, Holdings, Operator, Map, Messages** at first run,
  user-rearrangeable by drag and drop. **Amended by feature 115:** the list read
  *Intro, Background, System, Holdings, Operator, Map, Messages* until FR-68 withdrew
  the System tab, its obligation discharged by the Operator flow chart. Six tabs, and
  nothing replaces the seventh. Background is specified by §5.10 and built by
  feature 111; it is named here because a tab that arrives without a requirement behind
  it is exactly the divergence V2 exists to end. **Holdings** was named here with the debt
  admitted — it shipped with feature 102 and this list did not follow it — and §5.2
  now carries FR-46, written from the tab as built. **Operator** is named here by feature
  112 for the third instance of the same fault: it shipped with feature 107, `§5.7`
  specifies it in FR-36 to FR-38, and this list still said six tabs while the
  configuration served seven. The tree is the authority; this line is the claim, and it
  is now checked — a test enumerates `config.shell.views` and both presentations render
  what it names (feature 112, SC-004).
  **Amended by feature 120:** Holdings is renamed **Data** and keeps its slot, so drogna's
  own tabs read *Intro, Background, Data, Operator, Map, Messages* — still six. The rename
  follows the content: the tab now carries measurements and shore advisories beside the
  coverage inventory (§5.18), and a tab called Holdings would have been a true name for a
  third of what it holds. The label is one word because the narrow tab strip of §5.11 has
  to render it; "Data Navigator", the name the work was commissioned under, would be the
  longest label in the shell by half again.
  And the same amendment records **the fourth instance of the fault this paragraph already
  records three times**: the configuration serves *nine* views, not six. Feature 118 added
  **sampling, courses and feasibility** — the consumer tabs of §5.16 — and this list did
  not follow them. They are named here now. They are deliberately not drogna's tabs and
  §5.16 is emphatic about it, which is a reason for the list to distinguish the two
  families and no reason at all for it to omit one: the enumeration test of feature 112
  reads `config.shell.views` and passes either way, because it checks that every declared
  view renders and not that this sentence has heard of them.
  The layout library is **dockview 8.x**, chosen by feature 101's spike
  (`spikes/layout-manager/FINDING.md`) and recorded with its React-hosting pattern in
  ADR-0028. Panel arrangement is presentation only: no arrangement changes what any
  component does, and a saved arrangement is a per-viewer convenience, never state the
  system depends on.
  *Amended by feature 112.* dockview hosts the layout **at and above a width threshold**;
  below it the same views are presented one at a time behind the same tabs (§5.11,
  ADR-0033). Both presentations render from one panel registry and share one address
  vocabulary, and drag rearrangement is offered only where docking means something —
  which this paragraph already permits, arrangement being presentation only.
- **FR-15** Views shall be URL-addressable from feature 101: an anchor URL opens the
  shell in a named view (a tab, a panel arrangement, a beat's demonstration), so a PR
  comment or a blog post can link a reader straight into the running instance at the
  thing being shown *(D16)*. No addressable view may carry state that belongs to the
  manifest — a deep link selects what is shown, never what happened.
- **FR-16** The full component layout renders from day one, greyed out; illumination is
  driven solely by heartbeats received over the broker within each component's declared
  liveness window. No configuration flag, no fixture, no override *(v1 FR-45, FR-52;
  Constitution VII)*. The clock's heartbeat is the first liveness signal and the
  pattern every component follows. **Amended by feature 115:** this obligation is
  discharged by the **Operator flow chart** (FR-57), which draws every declared
  component greyed until a heartbeat from it arrives — it is not deleted with the System
  tab that used to carry it. The two facts System carried alone, each component's
  declared beat and the liveness window it is judged against, are carried by the Operator
  list view as declared figures (FR-68).
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
- **FR-21** The coverage holdings span four eras from the start of a scenario: a
  multi-decade monthly **historic archive** authored deterministically at provisioning
  (through the publisher's path, FR-11); a **now-cast** replaced on a configured
  cadence, its manifest recording its derivation; the **analysis** an assimilation
  cycle publishes, being the forecast corrected by what the platform measured, with the
  error that correction left and the provenance of every cell beside it (feature 116);
  and the accumulating forecast **instances** once the loop turns. The now-cast is
  evaluated from the true field and is therefore the reference the monitor scores
  against — nothing forecasts from it, and a gate holds that.
  **Amended by feature 120** with a fifth era, the **departure** forecast: the brief the
  vessel was issued at the quay-side, authored once at provisioning, valid forward from
  the scenario origin, and never refreshed. It is authored as **persistence** — the true
  field evaluated at the origin and held constant across its whole validity window — and
  the reason is the trap the generator sits over: this component evaluates the true ocean,
  so a brief whose every step was evaluated at that step's own instant would be right
  about the future, which no forecast is. Persistence is wrong in the way a real brief is
  wrong, correct at the moment of issue and losing to the world on its own, and it is
  already the reference FR-70's comparison uses. It is truth-derived, so the rule the
  now-cast carries applies to it: nothing may forecast from it, and the gate that holds
  that names its accessor too. Each holding's discovery document states its
  extent truthfully, verified against the store by test *(v1 FR-54 to FR-58)*.
- **FR-46** The **Holdings** tab shall show the coverage store's inventory as the store
  itself reports it: fetched through the seam and the release gate as a GET against the
  configured relative path (FR-17 — no path literal in the shell), validated against the
  `holdings-inventory` master before anything is displayed, and listing for each holding
  its era, identifier, publication instant in simulation time, grid shape and field
  digest. Selecting a holding shall open its embedded manifest whole — the ground truth
  AT-01 and AT-03 score against, sufficient with the generator version it names to
  reconstruct the field without the stored bytes. The tab shall refresh only when the
  store announces a publication on its declared topic; it shall not poll. Where the
  inventory is refused or fails its master, the tab shall state the refusal rather than
  render an empty store, an empty table being a claim the shell is not entitled to make
  *(Constitution VII)*. **Amended by feature 115:** the inventory is presented as a
  timeline in simulation time rather than a list in arrival order (FR-69), and a derived
  comparison of a forecast instance against the truth published for the same instant
  joins the manifest view (FR-70). The refusal rule and the no-polling rule above are
  carried verbatim, and selecting a holding still opens its manifest whole. Numbered after FR-45 rather than inserted in sequence: these
  numbers are cited across `specs/` and the ADRs, so renumbering would break the
  citations to buy tidiness. **Amended by feature 120:** every obligation in this
  requirement carries, and the tab it is discharged in is the **Data** tab, where the
  coverage inventory is one branch of seven (§5.18). Nothing here is weakened by the
  move: the inventory is still fetched through the seam against the configured relative
  path, still validated against `holdings-inventory` before anything is displayed, still
  refreshed only on the store's announcement, and a refusal is still stated rather than
  drawn as an empty store. (The `v1 FR-46` cited at FR-23 is V1's numbering, which
  §1 declares a separate space; this is V2's FR-46.)

### 5.3 Sensing (feature 103)

- **FR-22** Sensors publish observations in SensorThings vocabulary on the observation
  namespace; the broker's role-based rules confine sensors to that namespace; the
  ingestion seam validates against the message schema and is the store's sole writer
  *(v1 FR-14, FR-16 to FR-18)*. **Amended by feature 113:** the sensors sample at the
  position they last heard from the platform component (FR-60) and publish nothing
  before they have heard one; the closed-form loiter they originally evaluated
  themselves retires with that amendment.
- **FR-23** The Messages tab renders live broker traffic with inspection of the
  message that just passed, and the client validates every received message against
  its schema, showing a running refusal count — "0 refused by their schema" is itself
  a claim the display makes and the tests check *(v1 FR-46; E4)*. **Amended by feature
  115:** traffic is *drawn* as well as listed (FR-71) and the inspector renders a payload
  against the master its topic declares (FR-68). The counting claim is unchanged and
  keeps its full coverage, the message kinds suppressed from view included; the list is
  kept beside the traffic display rather than replaced.
- **FR-24** The topic tree draws the declared topology lit by live traffic: structure
  from the derived topology artefact and nothing else, illumination from genuinely
  received messages and nothing else, the two never mixing; **amended by feature 115**,
  which promotes it out of its disclosure to a primary region of the panel and makes
  selecting a node filter the traffic display and the list (FR-72), changing where it is
  and nothing about what it draws; consumer roles as a
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
  deduplicates; **the analyst corrects the standing forecast by the observations taken
  since its last cycle, by optimal interpolation with the background error from the
  run's own published spread and the observation error from each instrument's declared
  noise, and publishes the analysis, its error and its provenance before announcing**
  (feature 116); the model runner initialises from what that announcement names,
  perturbs its members by the error the analysis left, advects analytically with noise
  behind the kernel port and runs a small ensemble, emitting spread as an uncertainty
  field; the
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

- **FR-33** Uncertainty is the error the analysis published, decayed against tau; the
  planner simulates the collapse of uncertainty along candidate routes — using the
  analysis's own correlation and its own closed form for what a visit would leave,
  never a separately declared footprint — commits a single route with diminishing
  returns incorporated, replans on a receding horizon, and projects when regions fall
  below usable confidence *(v1 FR-32 to FR-35; amended by feature 116, which retired
  the observation-age term: until an analysis existed the ensemble spread carried no
  spatial structure at all, every member starting from the same state, and the age
  field was the proxy that supplied it)*.
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
  AT-04's replay claim, stated wherever replay is claimed *(v1 FR-73)*. **Amended by feature
  113:** the surface's behaviour is unchanged, and its *presentation* moves to §5.12 —
  the tab becomes the flow chart of FR-57 to FR-59, of which the table specified here is
  one of two equal views. A **platform demand** (FR-53) is a command of this kind and
  carries the same boundary: the manifest replays the run, not the demands issued into
  it. What is new in 113 is that the platform's own motion *is* inside the claim, and
  that the sensors' output now depends on delivery order rather than on a closed form —
  deterministic in lockstep, and asserted there (`platform/replay.test.ts`).

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
  queryable *(v1 FR-47, FR-48, FR-66)*. The panel offers a plan view, a rotatable
  globe, and a rotatable depth volume; the volume shall draw every level of the
  holding's own depth axis, each from a genuine area query, and shall say how many
  levels answered — EDR's `cube` query type remains outside the served subset, and
  the composer says so by name *(v1 FR-49's cube, restored client-side)*.
  **Amended by feature 115:** the platform's historic track and demanded course are
  required in *every* projection the panel offers, the depth volume included, where the
  track is drawn at the depths the platform reported (FR-74). That is parity, not a new
  layer. The time
  control shall carry the field as well as the route: the field is asked for the step
  of its holding's own time axis that the displayed instant falls on, refetched when
  the displayed instant crosses into another step and no faster, and never cached —
  a client-side copy of a holding would be a second store. Where the displayed
  instant lies outside a holding's time axis, the panel shall say so rather than
  imply the field extends there. Doubt shall be drawn as one thing at a time: the
  plan's projection cells or the run's published spread as a gridded field, chosen
  by the reader, never both — two doubt layers at once read as one wrong one.
  **Amended by feature 113:** the panel also draws the platform's historic track and
  its demanded course (FR-60).
- **FR-41** The EDR composer carries as a mode of the map: a guided sequence with the
  literal request URL always visible, assembling live and copyable; offering only what
  the query components genuinely serve, enumerated from server metadata, never
  stubbed; results rendered where they were asked for, with null, declined and absent
  as three different facts *(v1 FR-77 to FR-83)*. The copied URL is a genuine GET —
  which the wire-protocol seam is what makes true even in V2. The query's position
  may be placed by clicking the canvas in any projection the map offers, as well as
  typed; what the canvas draws for the composed query — the position, and an area
  query's ring — is built by the same function that writes the URL, so the drawn
  query and the fetched query cannot differ.
- **FR-42** The Intro tab is the demo walkthrough script, and deep-links into each
  view it names (FR-15).

  *Amended by feature 116. Until then this paragraph read "narrates the arc, growing one
  section per landed beat", and the tab was nine numbered sections. That answered the
  question "what has been built" for a reader who already knew the answer, and it had to
  be extended by hand for every beat — a record kept separately from the tree, which is
  the shape of every stale document this repository has paid for. §5.16 replaces the arc
  with the architecture drawn. The walkthrough obligation is unchanged and now discharged
  per step rather than per beat.*

### 5.10 Background (feature 111)

- **FR-43** The Background tab shall carry a linear course of ten self-contained
  explainers — why a standard at all; points and fields; NetCDF; what a holding is;
  SensorThings; OGC API-EDR; pygeoapi; MQTT; reads and writes are separate; the control
  loop — each a slide sequence or an interactive infographic
  completable in 60 to 90 seconds, each addressable by anchor URL to the step (FR-15),
  and each closing on the same three value axes: through-life cost, interoperability,
  and what one does not have to build. An axis may record a **cost** rather than a
  benefit, and an axis carrying little weight for a topic is omitted with its reason
  stated rather than padded.

  *Amended by feature 111 during implementation. This paragraph was written when the
  frame was "the standards themselves" and named eight. Three of the eleven — holdings,
  the read/write separation, and the boundary — are drogna's own arrangement rather than
  a standard, and the specification widened the frame to "the standards, and what it
  takes to use them honestly" to admit them openly rather than let the tab quietly serve
  eleven while this list claimed eight. The count is checked against the built course by
  a test that enumerates the registry.*
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

### 5.11 The shell at a phone's width (feature 112)

- **FR-47** The shell shall have two presentations of the same views: the dockable layout
  of FR-14 where there is room to dock, and a **stack** where there is not, showing one
  view at a time. The presentation shall be chosen from the measured width of the shell's
  own body, never from a user agent, a device class or a build flag, so that a panel
  docked narrow on a large display is treated the same as a phone. Either axis is enough
  on its own: docking divides space in both, so a viewport below the declared width *or*
  below the declared height is presented as a stack — a phone turned sideways passes the
  width test and has no room to dock at all. Each threshold is declared once in one module
  and every partnering CSS breakpoint carries the same number, held by a gate.
- **FR-48** The tabs are kept. The stack shall render every configured view as a tab, in
  configured order and with its configured label, in a strip that scrolls horizontally
  when the labels do not fit; no view is hidden behind an overflow control and no label
  is abbreviated or replaced by an icon. Both presentations render from one panel
  registry and share FR-15's address vocabulary, so crossing the threshold preserves the
  shown view and writes nothing to the address.
- **FR-49** At a narrow width each panel shall show one primary surface and keep every
  other surface it offers reachable behind a labelled disclosure, closed at rest, opening
  in place, operable by keyboard, and named for its content rather than for the existence
  of more content. Nothing is removed; it moves one gesture away. Whether a disclosure is
  open is a per-viewer convenience: it enters neither the address nor the manifest, and
  changes nothing about what any component does. The one element that shall never be
  disclosed away is the statement that the data is synthetic.
- **FR-50** The narrow presentation shall change where a panel is and never whether it is
  running: every view is mounted in both presentations, exactly as the layout manager
  mounts an inactive panel, so a panel that accumulates does so whether or not it is
  shown. Where a figure cannot be drawn legibly in the width available and the panel is
  already as wide as the viewport, it shall be drawn at its own minimum inside a
  scrollable frame rather than replaced by an instruction to widen a window that cannot
  be widened — amending FR-45's presentation rule for the case that advice cannot be
  taken, and leaving its guarantees (never scaled past legibility, never silently
  dropping labels) intact.
- **FR-51** The static build shall publish a **preview page** beside the app that frames
  the built shell at a standard mobile size, so the narrow presentation can be reviewed
  from a desktop browser and linked from a pull request (NFR-03, NFR-04). It carries
  FR-15's address vocabulary in both directions, offers a small set of common sizes and
  an orientation control, holds no copy of the shell or its configuration, and states
  plainly that it mocks a viewport size and is not a device: it reproduces neither touch
  input, nor browser chrome, nor safe areas, nor device pixel ratio.

---

---

### 5.12 The platform, and the operator's flow (feature 113)

This beat sits outside the 101-to-109 arc. It gives the harness the component its
sampling platform never had, and redraws the operator's view as the picture §2 has
always said the architecture is: *a flow chart with a loop in it*. The specification is
`specs/113-operator-flowchart/`; the visual design is its `mockup.html`.

- **FR-52** A **platform** component (V2-C21) shall hold ownship state — position,
  course over ground, speed over ground and depth — and integrate it once per tick under
  declared limits: maximum speed, maximum depth, turn rate, longitudinal acceleration
  and dive rate. **Demanded** and **current** are held, published and displayed
  separately and are never conflated; where current lags demanded, the limit that is
  binding is named. Motion is a pure function of the clock, the demands heard and the
  component's own seed stream.
- **FR-53** Demands shall arrive as messages on a demand topic, the platform applying
  the last demand heard. A demand beyond a declared limit is applied as far as the limit
  allows and the shortfall is stated in the platform's own report, never silently
  clipped. The topic's publish rules admit the operator surface today and are written to
  admit a future adaptive-sampling component as a second publisher; no component is
  declared or drawn for that publisher until it exists. **The planner shall not publish
  demands** — its recommendations reach a demand only through a component that decides,
  and Constitution VIII governs whether such a component may exist.
- **FR-54** The platform shall publish its own state as SensorThings observations on its
  own Thing, through the same broker topics, ingestion seam and observation store as
  every other measurement — no second write path. The observation master's
  observed-property enumeration grows by exactly the ownship quantities and states in the
  same amendment why that does not reopen ADR-0005's closure. Position is not a scalar
  result: it is the location every observation already carries, and the ownship
  datastream is what makes a series of them a track. `HistoricalLocations` stays outside
  the served SensorThings subset, refused by name, so the track has one representation
  and not two that can disagree.
- **FR-55** No component shall compute the platform's position a second time. Consumers
  of position take it from the ownship observations; see FR-22 as amended.
- **FR-56** An ownship observation is not a sample of the ocean. Components that reason
  about where the ocean has been measured — the monitor's pairing, the planner's
  observation-age field — shall exclude the ownship datastreams by name, and the
  exclusion carries a test that fails when it is removed. The ingestion seam's quality
  flagging covers the ownship properties with ranges taken from the platform's declared
  limits.
- **FR-57** The Operator tab shall present the declared components as a **directed flow
  chart** with the assimilation cycle drawn as a cycle. Node structure comes from the
  configuration document; **topic edges are derived from the broker topology artefact**,
  so the picture cannot disagree with the wiring, and the couplings that carry no broker
  traffic — the world-sampler port and the store interfaces — are declared beside the
  components and drawn dashed, because a picture in which the environment generator sits
  isolated would be a false one. A gate fails the build when a declared component is
  undrawn or a topology edge is neither drawn nor named as suppressed. Exactly two namespaces are suppressed — `ctl/clock` and `ctl/heartbeat` —
  drawn instead as the plane the flow runs on. Illumination remains heartbeats and
  nothing else. Three kinds of figure are visually distinct and never mix: **declared**
  (configuration), **reported** (carried in a message from the component) and
  **observed** (counted by the shell from traffic it received itself); a figure may not
  change kind between states.
- **FR-58** Each component's node shall carry an instrument designed for what that
  component does — among them the monitor's residual against the threshold that will
  raise a divergence and the persistence streak beneath it, the stores' record volume and
  growth, the scheduler's minimum-interval and cadence-floor bars, the model runner's
  ensemble and its inbound run trigger, the sensors' per-instrument value sparklines, and
  the platform's demanded and current course, speed and depth. Every face states the
  simulation time its figures were last updated at. A series with no samples says so and
  is never drawn as a flat line at zero; a gap is drawn as a gap.
- **FR-59** A **list view** shall carry every fact and every control the flow chart
  carries, reachable by keyboard and readable by assistive technology, with identical
  refusals in both views; neither view is the other's fallback. The graph shall be
  legible in greyscale and shall respect `prefers-reduced-motion`, traffic animation
  becoming a count and a timestamp.
- **FR-60** The Map panel shall draw the platform's historic track from a genuine query
  over the ownship datastreams through the seam, ordered by phenomenon time and visually
  distinct from the planner's route, together with the demanded course as a ray from the
  current position. Where no ownship observations have been served the panel says so
  rather than drawing a stub or the configured loiter.

### 5.13 The walkthrough (feature 110)

`docs/v2/plan.md` §5 reserved feature 110 for interactive walkthrough machinery and
left the slot named but unclaimed. It is spent. The specification is
`specs/110-walkthrough/`.

- **FR-61** The shell shall carry a **help control**, visually distinct from the
  controls that operate the harness, which walks a reader through the components one at
  a time: what each does, and what its panel shows. The steps shall be keyed to the
  declared component list and presented in the order the Operator flow chart draws
  them, so a component with no step — or a step for something that is not a component —
  is reported by name rather than passing unnoticed. A walkthrough that quietly stopped
  covering a component would read as a complete tour. **Amended by feature 115
  (FR-75, ADR-0037):** the control is carried by the panel it explains rather than by the
  shell header, and so no longer opens a view before running; and the completeness rule
  generalises from the declared component list to a per-surface list on disk, one for
  each tour.
- **FR-62** The walkthrough **teaches and does not report**: it shall not claim any
  particular component's live state, and a test shall hold it to that. It stands in for
  no component, which is why Constitution VII is not engaged by it (feature 111's
  precedent) — and the reason that stays true is the rule above, not the intention. The
  control shall be parameterised by the tour it starts and shall open that tour's view
  before running, so a tour for another view is a tour and not a second control.
  **Amended by feature 115:** it is parameterised by its tour still, and is carried by
  the panel; the view-opening clause retires with the header placement.

### 5.14 The operator's controls (feature 114)

Feature 113 drew the machinery; this beat makes it drivable. The Operator tab acquires
a demanded platform state a reader can steer, events a reader can prompt, and the two
numbers the assimilation loop turns on. The specification is
`specs/114-operator-controls/`.

The rule the whole beat is built on is the one FR-36 already carried and this extends:
**a control plane dispatches and reports what it dispatched; it applies nothing, it
lights nothing, and it never speaks for a component.** What a command did is the target
component's own answer, and it arrives where everything else that component says about
itself arrives.

- **FR-63** The operator surface shall **state what its plane offers** — how far one
  step command may advance the clock, which settings may be tuned and between which
  bounds, and which events may be prompted — as a document served over the seam and
  derived from its own configuration. The shell shall draw its controls from that
  statement alone: it holds no list of controls and no bound of its own, so a control a
  reader can see is one the surface would accept, and a bound exists once (Constitution
  IV). No value in force appears in the statement; a control plane that also reported a
  setting would be a second source for one fact.
- **FR-64** Declared settings shall be **tunable while a run is going**. The surface
  enforces the declared bound and refuses outside it by naming the bound, the count or
  the setting; the target component applies what it accepts and **reports the value in
  force in its own heartbeat**, which is the only place a display may read it from. A
  tuning is ephemeral on the rule commands already carry: a restarted component is
  rebuilt from its configuration document and returns to the configured value. Every
  figure a component publishes against a tunable setting — the threshold on a residual
  sample, the interval a decline names — shall be the value in force, so a component
  cannot disagree with itself about what it is doing.
- **FR-65** A reader may **prompt a component to act now**. The prompt shall reach the
  component that decides rather than going around it: a prompted forecast run is weighed
  under exactly the policy a divergence is weighed under, may be declined by the minimum
  interval or by a run already outstanding, and the decision — accepted or declined — is
  published like any other. A run accepted from a prompt is labelled as such in its
  request, so a run a reader asked for is never read back as one the world asked for. A
  prompted advisory is the same deterministic next advisory in its sequence: a prompt
  moves when a component acts and never what it does.
- **FR-66** Controls shall live **at the node they act on**, in that component's own
  drawer beside the instrument that shows the consequence, and a node that takes a
  control shall say so on its face — a control nobody can find is a control that does
  not exist. The platform's demand control shall be bounded by the limits the platform
  itself reported, falling back to plain entry and saying why where nothing has been
  reported; its presets shall demand only what they name, since the platform leaves a
  standing demand alone for anything a demand does not carry. The list view of FR-59
  carries every control the flow chart carries, by opening the same drawer.
- **FR-67** A component may be asked to publish **one deliberately faulty message**, and
  the fault shall originate in the component a real one would come from — never
  published into a namespace by a control plane that does not own it. What is published
  is a genuine bad message: it is refused or flagged by the ordinary seam, against the
  ordinary master and the ordinary declared limits, and nothing softens it on the way.
  The component counts what it was asked to produce and reports that count, so a fault a
  reader ordered is never mistaken for a component that has begun lying on its own
  account; and where the component's own state is not what is faulty — an instrument
  misreporting a depth the vehicle is not at — that state is untouched and the display
  says which is which. Fault injection is declared in configuration, component by
  component: a component that declares none cannot be asked.

### 5.15 The tabs beyond Operator (feature 115)

Feature 113 set a bar and the rest of the shell divided sharply in two: Background is
designed, the Map is an instrument, Intro is prose doing its job — and System, Holdings
and Messages were tables, each showing the least interesting projection of the most
interesting thing it had. This beat changes no simulation, adds no component, moves no
data and needs no new master: everything it draws was already crossing the seam. The
specification is `specs/115-engaging-tabs/`.

A tab earns its place against three yardsticks, all three: **something is moving**, **the
reader can poke it**, **the instrument is bespoke to the thing**. A surface that would
pass only one of the three is not finished.

- **FR-68** The **System** tab shall be withdrawn and its obligations discharged by the
  Operator tab. Before withdrawal, the Operator list view shall carry the two facts System
  carried alone — each component's **declared beat** and the **liveness window** it is
  judged against — as declared figures, typographically distinct from reported and
  observed per FR-57's vocabulary. The tab shall not be removed while either fact exists
  in only one place. `#/view/system` becomes an unknown view, handled as the shell already
  handles one: no redirect and no tombstone, an address that resolves being a claim that
  the thing still exists. Every reference in the tree shall be rewritten in the same
  change, and **a gate shall hold the shell to naming no view that `config.run`'s shell
  document does not declare**, so the next withdrawal cannot leave a dangling link
  unnoticed. The System panel's footnote — that a grey row cannot distinguish *never ran*
  from *stopped*, only the silence — is a true statement and moves to the Operator flow
  chart's legend.
- **FR-69** The **Holdings** tab shall present the coverage store's inventory as a
  **timeline in simulation time**, each holding drawn at the interval its own manifest
  says it covers (`grid.time` gives an origin, a start offset, a step and a count) on a
  lane for its era. The archive spans twenty years and an instance spans hours, so the
  axis shall carry both without either becoming invisible and the panel shall state the
  scale it is showing rather than leaving a reader to infer it from tick spacing.
  Selecting a holding opens its embedded manifest whole (FR-46). The timeline **replaces**
  the inventory table — the one place in this feature where a table is replaced — and must
  therefore itself be a keyboard and screen-reader surface: holdings focusable in
  publication order, each announcing what the `coverage-holding` master declares about it.
  **The parity check is written before the display**, bounded by that master rather than
  by the table's five columns, so that a holding gaining a field is named by the check. If
  the check cannot be satisfied the table stays and the reason is recorded in `tasks.md`.
  **Amended by feature 120:** the timeline is drawn **once per era**, as the presentation
  of that era's branch, rather than once with a lane per era. Its lane list is now read
  from the `coverage-holding` master rather than typed beside the display — feature 116's
  `analysis` era had never reached the three literals that stood there, so an analysis
  holding was drawn on no lane at all and nothing said so.
- **FR-70** The tab shall offer, for a forecast **instance** whose validity has elapsed, a
  **derived comparison** against the truth published for the same instant: three genuine
  EDR area queries at the chosen instant and depth — the instance, the now-cast holding
  covering that instant, and the **persistence reference** held constant from the
  instance's own initial step — drawn as two difference fields on one shared scale, with
  which is closer stated plainly and *the model is not earning its compute* said in those
  terms when it is not (Constitution IX). The comparison is **derived by the shell and
  labelled as derived**, a fourth kind of figure beside declared, reported and observed
  (ADR-0036); the three request URLs shall be on screen and copyable, a derived figure a
  reader cannot re-derive being an assertion. Telemetry's own reported skill figure shall
  be shown beside it and shall not be recomputed, with a sentence saying which question
  each answers. Where no now-cast holding covers the chosen instant — the common case for
  an instance still inside its validity — the panel shall say so and offer nothing; it
  shall never compare an instance against itself. **Carried unchanged by feature 120**,
  the three URLs included: §5.18 makes the Data tab a rendered surface that shows no
  request URLs, and this comparison is its one stated exception, because it is the only
  figure in that tab the shell derives rather than fetches.
- **FR-71** The **Messages** tab shall lead with a **traffic display**: received messages
  drawn as marks on lanes, arriving as they arrive, lanes being the declared top-level
  namespaces of the topology artefact and a received topic no entry declares drawn as an
  undeclared lane — a finding, never a silence. A refused message is visibly refused in
  the display and not only in the count. **Motion comes from received traffic and nothing
  else**: no animation may run when no message is arriving, a display that keeps moving
  while the broker is silent being an assertion of traffic that does not exist
  (Constitution VII).
- **FR-72** The **topic tree** shall be a primary region of the panel rather than a
  disclosure, its structure and its light unchanged (FR-24, FR-25). Selecting a node
  filters the traffic display and the list to that subtree.
- **FR-73** The **inspector** shall render a selected payload **against the master its
  topic declares**: fields named, units shown where the master declares them, and a
  refusal marked on the field that caused it. Where no master is declared for a topic the
  inspector says so by name and falls back to the raw document, which shall remain
  reachable for any message — the wire form is the thing the seam actually carried.
- **FR-74** The Map panel shall draw the platform's historic track and its demanded course
  in **every projection it offers** — plan, globe and depth volume. In the volume the track
  shall be drawn at the depths the platform reported, against the levels the volume already
  draws: a track flattened to the surface in a display whose subject is depth would be the
  panel discarding the one dimension that view exists for. Nothing else about the map
  changes.
- **FR-75** The help control shall be carried **by the panel it explains**, at that panel's
  top right, and not by the shell header (ADR-0037). A view with a tour shows one; a view
  without shows nothing, and the absence is information. Tours land for **Operator** (the
  existing component tour, moved), **Map**, **Holdings** and **Messages**. Each tour shall
  be held to something on disk in the way FR-61 holds the component tour to the declared
  component list — the map's to its own layer registry, Holdings' and Messages' to the
  regions their panels declare — so that a surface gaining a feature and not a step is
  reported by name. **Amended by feature 120:** Holdings' tour becomes the **Data** tour
  and grows with the tab, covering the tree, the chart, the volume and the shore canvas
  beside the three regions it already explained. FR-62 is unchanged and now applies four times. The control shall reach
  the same place in both presentations (FR-50, ADR-0033).


### 5.16 The downstream consumers (feature 120)

Every beat so far has shown the harness. This one shows what the harness is *for*: three
tabs that are not part of drogna at all, but separate notional systems consuming its
forecast to reach a decision. The specification is `specs/116-downstream-consumers/`, and
the author's own requirements document is carried there unmodified beside it.

The framing is load-bearing and the screen carries it: the consumer tabs are bright yellow
with black text under a strip reading "Downstream consumer — not part of drogna", so a
screenshot lifted out of context still says what it is. Constitution VIII draws the line
these tabs stand on the far side of — the boundary it defends is *who recommends*, not
*who renders*, and a downstream consumer is exactly what the principle presumes exists.

The numbering starts at FR-76 because feature 115 — the tabs beyond Operator, §5.15 —
landed while this one was being built and took FR-68 to FR-75 with it. This beat was
drafted as 115 against a tree where that feature was specified and unbuilt; the tree is
the authority and the record is a claim about it, so this is 116 and the record was
corrected rather than the collision left to be discovered.

- **FR-76** The shell shall host **downstream consumer views**, declared in configuration
  as a view kind, rendered in bright yellow with black text in both presentations
  (ADR-0033), each under a persistent, non-dismissible strip naming it as not part of
  drogna. The shell holds no list of which views these are; it reads the declared kind.
- **FR-77** A consumer view shall reach drogna **only through the seam** — configured
  relative endpoints and configured broker topics — and shall import no backend module
  (Constitution XI). It is a client of the same interfaces a Version 3 client would use,
  and nothing in it may know whether the seam is answered in this page or over a network.
- **FR-78** A consumer view shall reason from **what is already served** — the now-cast
  the coverage store holds — until a forecast arrives, and shall name which of the two it
  is standing on. It shall be marked **stale by a published run becoming current**, shall
  recompute **only** on an explicit reader action, and shall retain the superseded answer
  as a **ghost** naming what it was computed from. The ghost is the point: where the
  recommendation barely moves, the new forecast was not decision-relevant, and where it
  swings, the value of fresh environmental data has been demonstrated rather than argued.
  A tab that faked its inputs would have nothing to be stale about — and one that drew
  nothing until the first model run would demonstrate that only to whoever waited.
- **FR-79** Every control that is not the update action shall recompute **immediately**;
  the ceremony of FR-78 belongs to newly arrived upstream data and to nothing else. Every
  bound on those recomputations — sample counts, candidate counts, the cell ceiling —
  comes from configuration, and a control whose setting would exceed one refuses and says
  why rather than freezing the page.
- **FR-80** A derived quantity shall be **named for what it is derived from**, and the
  view shall state its ingredients. The coverage proxy of FR-82 is *observation-driven
  uncertainty*, never forecast uncertainty and never ensemble spread — both of which
  drogna genuinely publishes, and neither of which it is.
- **FR-81** A consumer view **may synthesise inputs drogna does not model** — a tidal
  window, a ferry timetable, a watch cycle — provided each is labelled on screen as
  synthesised by that view, is drawn from a seeded stream derived from the run manifest
  (Constitution II), and is never published back over the seam nor shown as a claim about
  a drogna component. Constitution VII is untouched: no data path asserts the existence of
  anything that is not running, because a consumer's own assumption is not a claim about
  the harness (ADR-0036).
- **FR-82** The **Sampling** view shall present the domain under a reader-adjustable hex
  grid coloured by observation-driven uncertainty **per depth zone**, distinguishing the
  zones the vessel can reach from those it cannot. Both the domain and the reach are read
  from what crossed the seam — the collection's extent, and the planner's own published
  depth bands — never from a constant in the view.
- **FR-83** The Sampling view shall plan a route **by value per unit transit**, under a
  reader-chosen time budget, ending where the budget expires rather than returning to its
  start, with **expendable drops constrained to lie on the route**, each justified by the
  depth zone and the uncertainty it addresses. The plan's **shape**, not merely its
  length, shall change with the budget: a planner that always heads for the single worst
  cell fails this requirement with every test green.
- **FR-84** The **Courses** view shall seed hypothetical vessel classes across the domain
  from reader-set likelihoods, shall give each class a **motion model** rather than a
  score multiplier — a scored-only roster would be cosmetic — and shall present three or
  four candidate courses with separately scored components under a reader-adjustable
  weighting whose range can **reorder** them. It holds no track, no position anyone
  inferred and no entity the harness did not place (Constitution V).
- **FR-85** The **Feasibility** view shall present source lanes of two kinds — boolean,
  and continuous with **per-task draggable thresholds** — each carrying a confidence
  setting weighted from configuration, with an **Off** that excludes the source entirely,
  and shall output the **top two or three maximal feasible sets** with what each gives up,
  recomputing around any task the reader locks. Its horizon starts at the published
  forecast's validity and runs past it: the lane the forecast serves stops where the
  forecast stops, and a task depending on that lane cannot be scheduled beyond it, so the
  reach of what drogna actually knows is on the timeline rather than hidden in the axis.
  It is a triage aid and says so: the honest output is what you are giving up, not a
  schedule.

### 5.17 The shape of the system, drawn and moving (feature 119)

The Intro tab was a numbered list of landed features. A reader arriving at it wants to
know what the thing is made of and how the parts fit together, and a changelog ordered by
when the work landed answers that only for somebody who already knows. This beat changes
no simulation, adds no component, moves no data and needs no new master: it is entirely
about what the first tab shows of what already runs. The specification is
`specs/119-intro-architecture/`.

*The design was settled over five reviewed wireframes and reversed once, and the reversal
is the reason FR-87 reads as it does. The first four passes drew the **declared
components** and were held to the declaration by a gate — which earned itself, stopping
the build on the day it was written when a merge landed the analyst and left the picture
silently short of it. The author then asked for something more abstract still, naming no
component at all. That trades a checkable claim for one that cannot be falsified: an
abstract picture cannot fall behind the tree because it never claimed to be the tree. The
gate retires with the storyboard it checked, and `specs/118-intro-architecture/spec.md`
records what it caught before it went.*

- **FR-86** The Intro tab shall carry a **drawing of the shape of the system** that is
  built up **one part at a time under the reader's own control** — arrow keys, and
  controls that do the same thing — with a short passage of prose beside each step naming
  what has just appeared and what it does. The *growth* shall not advance on a timer: the
  drawing opens at its first part and grows only when the reader grows it. Each step shall
  be addressable by its own name rather than its number (FR-15), so that an address
  survives a step being inserted before it, and shall link to the live view where that part
  of the system can be watched working.
- **FR-87** The drawing shall be **abstract: it shall name no component**. Its parts are
  roles — what is measured, what tests it against belief, what re-forecasts, what is
  believed, who is told, who asks — and the standards that carry the traffic between them
  are named on the channels that carry it. A picture that names no component cannot go
  stale when a component lands, which is what this buys in place of the derivation and the
  gate that the earlier passes used; the cost, accepted, is that the drawing is no longer a
  map of the component list and a reader wanting that is sent to the Operator flow chart
  (FR-57), which draws every declared component and is held to the declaration.
- **FR-88** The space between two parts shall be a **channel with room in it**, not a line:
  wide enough that what crosses is drawn at a size a reader can aim at, and **every message
  crossing one shall open** — the observation, the divergence event, the announcement, and
  the query request paired with its response — showing the shape of that document with its
  fields named. A line says only that two things are connected; the point of this drawing
  is what travels.
- **FR-89** The tab shall be **inert** in Background's sense (FR-44): it reads no run
  state, subscribes to nothing and crosses the seam for nothing, and states only the run
  identity the shell already handed it, which FR-01 requires it to state. Nothing in the
  drawing shall be lit, carry a component's state, or otherwise read as a report of the
  run; a reader wanting to know what is alive is sent to Operator, where every component's
  own account of itself lives.
- **FR-90** The motion shall be a **fixed cycle, independent of the running system**, and
  the tab shall **say so where a reader meets it**. This is a deliberate exception to
  FR-71, which holds the Messages traffic display to motion that comes from received
  traffic and nothing else, and the reason is that the two surfaces answer different
  questions: Messages reports this run, and a display that moved while the broker was
  silent would be asserting traffic that does not exist; Intro explains the shape of the
  system, and must read the same on a stopped clock, in a screenshot and on a printed page.
  The exception is paid for in three places rather than assumed: the frame above the
  drawing states that the movement is an illustration on a fixed cycle, every sample the
  inspector opens carries its own statement that it is a shape and not a value this run
  produced, and the Messages tab is linked as the place the real traffic is. The motion
  shall be expressed without reading the host clock — CSS animation, not a timer — so that
  Constitution I is not engaged and no wall-clock exemption is spent on decoration, and
  shall hold still under `prefers-reduced-motion` with the drawing still legible.
### 5.18 The Data tab (feature 120)

Three stores hold everything this harness knows and three standard interfaces serve them,
and until this feature one of the three was browsable, one was queryable by an expert, and
one was invisible. Holdings showed the coverage inventory; the Map's composer asked one
EDR question at a time and answered nothing until a reader had composed something; the
measurements had no face at all, and the advisories — a store, a publisher, a Features
collection, a whole feature's work in 108 — had never been drawn. This section makes all
three browsable from one place.

- **FR-91** A view **`data`, labelled "Data"**, shall present everything the three stores
  hold as **one tree beside a detail region**, organised **by data kind**: measurements,
  the coverage eras in the order the store fills them, then what shore has sent. The tab
  absorbs Holdings and carries its obligations whole (FR-46, FR-69, FR-70 as amended).
  The kind-first spine is a deliberate regrouping and it costs something worth stating:
  measurements are served by SensorThings, five branches by EDR and one by Features, and
  the tree says which store holds a thing rather than which standard answers for it. That
  is the reader's own vocabulary, and it is affordable only because §5.10's Background
  explains all three interfaces and FR-41's composer shows EDR on the wire in full.
- **FR-92** The branch list shall be **derived from the `coverage-holding` master**, not
  written beside the display. The reason is on disk: the timeline's own lane list was
  three literals, feature 116's `analysis` era never reached it, and an analysis holding
  was therefore drawn on no lane with nothing to say so. A second hand-maintained list of
  the same eras in the same tab would be the same fault waiting to happen twice.
- **FR-93** The views shall be **rendered**, showing no request URLs, with FR-70's
  comparison as the one stated exception. This is a deliberate step back from FR-41's
  discipline and the reason is division of labour rather than indifference: the composer
  exists for reading the wire and is one tab away, and this tab exists for reading data.
  If it ever comes to be used as evidence rather than as a browser, this is the decision
  to revisit first.
- **FR-94** Everything drawn shall be fetched **through the seam**, as relative-path GETs
  against configured prefixes, validated against the master the response declares before
  anything is displayed (FR-02, FR-03, FR-17). Where a store refuses, or a response fails
  its master, the branch shall state the refusal **where its content would have been**,
  carrying the query component's own words — which name the thing refused (FR-27). It
  shall never draw an empty table, an empty canvas or a chart with no points as though
  those were the answer (Constitution VII).
- **FR-95** Nothing in the tab shall poll (FR-46), and **not every announcement is acted
  on**. The coverage store and the advisory store announce rarely — a publication, an
  advisory — so those branches refresh on the announcement and at no other time. The
  observation namespace announces continuously, and those arrivals shall be **counted**
  rather than fetched on: the tab shall state how many have arrived since its last read,
  and a **refresh control** shall apply them, the open chart included.

  *This reverses the requirement as first written, and the reason is worth keeping.* It
  said an open chart grows as observations arrive, which was both too much and too little
  at once. Too much, because at any interesting clock rate it redraws a chart several
  times a second — a picture that jitters under the reader, which is worse than one that
  admits it is a moment old. And too little, because the tab as built did the expensive
  half and not the useful one: it refetched the platform and datastream lists on *every*
  observation, while the chart a reader was actually watching was keyed on the datastream
  alone and so never refetched at all. Reported against the running page and reproduced at
  ×600 — sixty-six points, and still sixty-six points twenty-six simulated minutes later.
  The tab was busiest exactly when it looked most static.

  What the control must not become is a substitute for saying what is true: the count of
  what is waiting is part of the requirement, not decoration on it. A control whose effect
  a reader can discover only by pressing it has stopped saying anything, and "three
  waiting" and "nothing waiting" are different facts about how old the picture is.
- **FR-96** The **selected node shall be addressable** (FR-15): `#/view/data/<branch>` and
  `#/view/data/<branch>/<node>`, so a pull request or a blog entry links a reader to a
  chosen datastream or holding rather than to the tab's front door. Selecting writes the
  address; **mounting does not** — a panel that wrote its own default branch on mount
  would rewrite a reader's URL when the shell crossed the width threshold and remounted
  it, which is what feature 112's SC-005 caught. An address naming a node the store does
  not hold shall **say which node was asked for**, and shall never open silently on
  something else: a link to a holding the store has since replaced is a question this tab
  knows the answer to.
- **FR-97** The measurements branch shall walk **Thing → Datastream → chart**, SensorThings'
  own grouping and not a second one invented here. A datastream's account is a chart of
  **value against simulation time over its full history**, paged from the store until it
  is exhausted, with the observation table beside it. The axes shall be taken from the
  observations received and never from a configured expectation — a chart drawn to an
  expectation looks the same whether an instrument behaved or failed high, which is the
  one thing plotting a measurement is for. A datastream with no observations shall say so
  rather than draw empty axes.
- **FR-98** The analysis branch shall present **cycles, not fields**: a cycle publishes the
  corrected field, the error it left and the per-cell provenance together, and they are
  three views of one publication. Naming them by era alone collapses three fields onto one
  node.
- **FR-99** A coverage holding shall offer a **volume**: longitude, latitude and depth as
  FR-73's cube already draws them, from genuine EDR area queries per level, with a fourth
  axis stepping **the time values the holding's own manifest declares** — months for the
  archive, hours for a forecast run. Steps shall be fetched **as they are asked for** and
  kept, and the panel shall name the steps it holds. **Nothing shall be drawn that was not
  fetched**: scrubbing to an unfetched step shows that step arriving and never a
  neighbouring step's field, which would be a picture of an instant the store was never
  asked about and would be indistinguishable from a volume that had loaded.
- **FR-100** Shore advisories shall be drawn as **their advised regions**, coloured by kind,
  with the guidance document opened whole on selection. An advisory whose validity has
  lapsed shall be drawn **spent rather than removed**: what shore has said is a record, and
  a canvas that dropped an advisory when its window closed would answer "has anything been
  advised here?" with "no" when the truth is "yes, and it has expired". Whether an advisory
  is in force is a question about simulation time, answered from the clock component's own
  instant and from no host clock. Before any advisory exists the branch shall say that the
  collection is present and states it holds nothing, which is what the collection itself
  says (FR-39).
- **FR-101** The tab's two WebGL surfaces — the volume and the shore canvas — shall be
  **code-split from the tab**, as the map is code-split from the shell and for the same
  measured reason (`spikes/load-time`): the deck.gl stack is about a third of the bundle,
  and a tab that imported it directly would pull it into the first load through a door the
  map's deferral was built to close. The tree, the timelines, the tables and the chart are
  markup and SVG and cost nothing.

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
FR-56 among them — the *property* it protected, per-vertex time surviving the parse,
lives on in FR-28 and AT-01).
