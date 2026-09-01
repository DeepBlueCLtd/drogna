# drogna

A learning harness for a maritime environmental data architecture, exercising OGC
API-EDR and OGC SensorThings.

**This is not a production system and is not a prototype of one.** Its numerics are
deliberately fake, its data synthetic, its lifespan short. It holds no tracked
entities of any kind and never will. It exists so that its author can learn how these
components behave together — particularly where they misbehave together — in a way no
diagram conveys.

**Version 2.** The harness is a pure client-side TypeScript single-page application:
the backend components — clock, generator, broker, sensors, stores, forecast loop,
planner, query — are genuine programs running in the browser, separated from the
front-end by a wire-protocol seam, so that Version 3 can replace them with a real
backend by swapping a base URL (ADR-0027). Version 1 — twelve containerised services —
is retired; its code lives in git history and its written record is archived in place.

## Run it

The demo is a URL. No server to provision, no account, nothing to install.

- **The site:** <https://deepbluecltd.github.io/drogna/>
- **The current build of the default branch:**
  <https://deepbluecltd.github.io/drogna/instances/main/>

Every visit provisions a fresh seeded run and nothing persists between visits: a harness
accumulating state between demonstrations would stop being reproducible, and
reproducibility is the only reason to trust anything it shows. Exporting and importing a
run manifest is how a particular run is replayed.

A visit opens on a **welcome page** offering four start conditions — *leaving quay-side*,
*arriving in the work area* (the default), *loitering* and *returning*. Each is made true
by the run having actually reached it: an ordered pre-roll is driven through the operator
plane's own endpoints with the clock pinned to rate zero. Nothing is written into a store
to arrange a situation.

Views are addressable, so a link opens the page at the thing being discussed rather than
at its front door — append `#/view/<id>` to any instance URL:

| View | What it shows |
|---|---|
| `intro` | The shape of the system drawn abstractly, built up under the reader's control |
| `background` | Eleven explainers of the standards, reading nothing from the run |
| `data` | What the three stores hold: measurements, the five coverage eras, what shore has sent |
| `operator` | The machinery interrogated from the operator's side, drawn as the loop it is |
| `map` | The field, the doubt over it, and the route chosen through it |
| `messages` | Broker traffic as it crosses, drawn as well as listed |
| `sampling`, `courses`, `feasibility` | Three notional downstream consumers — deliberately *not* part of drogna |

## Objectives

Three purposes, in strict priority order, carried from Version 1:

1. **Understanding** — how the components behave together, particularly where they
   misbehave together. A diagram cannot show a loop that becalms itself, a boundary
   whose refusals were the only thing ever tested, or a display that keeps animating
   while the broker is silent. A running thing can.
2. **Demonstration** — the architecture shown as a running thing; in Version 2, a
   running thing that is a URL, openable at the exact view under discussion.
3. **Evidence** — prior art for modest, specific claims, including evidence of
   LLM-assisted development under genuine engineering constraint.

Version 2 adds a constraint rather than a fourth purpose: **the whole system shall be
reviewable as one TypeScript codebase and observable in one browser.** No step of
building, testing, gating or demonstrating it may require a container, a daemon, or a
second language runtime.

**What it is not.** The data model admits environmental measurements, forecast fields,
uncertainty fields, sampling recommendations, advisories and system telemetry — nothing
else. What is forbidden is the third party: an entity the harness did not place, whose
position it infers rather than knows. The Intro tab states this plainly, and a
forbidden-vocabulary gate holds the repository to it. The name means nothing; it was
coined so that it would carry no association with any domain or piece of work.

## Architecture

One browser application, two halves, and a seam between them. The **front-end** is the
dockable multi-panel shell, its panels, and everything that renders. The **in-browser
backend** is a set of components that generate, sense, store, assimilate, plan and
serve — each with its own configuration document, seed stream, heartbeat and lifecycle.
They are "mocks" only in the sense that Version 3 replaces them with server-side
implementations; they are never fixtures, and no canned data ever stands in for one.

### The seam

All traffic between the halves crosses in wire shape and nowhere else, over three
carriageways: **HTTP**, where the front-end calls `fetch` against relative URLs read
from configuration and an interception layer answers with the requests and responses
EDR and SensorThings describe; **pub/sub**, a broker component with MQTT topic semantics
behind a transport whose wire shape is MQTT-over-WebSocket; and **the release gate**,
which decides what may leave the boundary. Front-end code may not import backend
modules, nor the reverse; the only code visible from both sides is `app/src/seam/` and
`app/src/generated/`. That is not a convention — a gate reads the import graph and fails
the build.

**Why a seam at all.** Because Version 3 replaces the in-browser backend with a
server-side one and the client must not notice. The switch is configuration alone: a
base URL for HTTP, a broker URL for pub/sub. No code path may distinguish the two cases
and no client configuration may carry an absolute URL — every fetch is relative and
same-origin, which is also what lets the page be served from any host at any base path.
The seam pays for itself twice before that: because data crosses in wire shape, a small
HTML page can be an ordinary consumer of a component, which makes it possible to
*demonstrate* a headless component rather than describe it; and because the two halves
cannot import each other, the reviewable unit stays small.

### The control loop

Writes travel one ingestion seam per store, with a single writer behind each; reads are
served exclusively through the standards-based query components. A **sense → decide →
act → publish** cycle regenerates the forecast when observations start disagreeing with
it: the monitor scores sound-speed residuals and raises divergence events only on
sustained persistence; the scheduler decides whether a run is warranted, enforcing a
minimum interval and holding a cadence floor so the loop cannot be permanently becalmed;
the analyst corrects the standing forecast by optimal interpolation and publishes the
analysis, its residual error and its per-cell provenance; the model runner initialises
from that, advects analytically with noise behind the kernel port, and runs a small
ensemble emitting spread as an uncertainty field; the publisher makes each run visible
atomically, digest-checked, and announces it. Consumers subscribe. Nothing polls.

**Honest ports.** The genuine ports — each with more than one conceivable
implementation — are the seam transports, the clock, the RNG, the model kernel and the
store interfaces. The store interfaces are ports *because Version 3 is planned*; if
Version 3 is ever abandoned, that entry is amended rather than left flattering.

### Components

Twenty-one declared components, each with its own configuration, seed stream, heartbeat
and lifecycle:

| Component | Responsibility |
|---|---|
| Simulation clock | Single source of time, real-time or accelerated, rate-controllable |
| Environment generator | 4D fields, seeded ground truth, decorrelation timescale, historic archive |
| Broker | MQTT-semantics pub/sub: topic tree, wildcards, role-based rules |
| Platform | Ownship motion — demanded and current course, speed, depth, under declared limits |
| Sensors | Observations in SensorThings vocabulary, at the platform's last reported position |
| Ingestion seam | Validate, quality-flag, write; sole writer to the observation store |
| Observation store | In-memory point observations behind a store interface |
| Feature store | Read-only spatial reference, provisioned at scenario start |
| Coverage store | Gridded fields across five eras; atomic, digest-checked publication |
| Snapshot source | Republishes committed seed artefacts through the store's own seam |
| Query components | SensorThings and EDR over the stores, through the seam |
| Release gate | Default-deny path policy at the boundary |
| Monitor | Sound-speed residuals; divergence events, never a single spike |
| Scheduler | Whether a run is warranted; minimum interval, cadence floor, no duplicates |
| Analyst | Optimal interpolation; publishes analysis, error and provenance |
| Model runner | Analytic advection plus noise; small ensemble behind the kernel port |
| Planner | Adaptive sampling recommendations, and only recommendations |
| Telemetry | Health, throughput per simulation second, skill against persistence |
| Advisory source and store | Deterministic shore-advisory authoring; append-only storage |
| Operator surface | Aggregated component state; commands with observable refusals |
| Offload packager | Export shape and departure announcements; no real transfer until V3 |

The component reference on the site is **generated** from `contracts/topology.json`,
itself derived from the configuration documents the components are constructed from and
rebuilt by a drift gate. It cannot be wrong about who may say what.

## Capabilities

- **A dockable multi-panel shell** with URL-addressable views, in two presentations of
  one panel registry: docked where there is room, stacked one view at a time where there
  is not — chosen from the measured size of the shell's own body, never from a user
  agent, device class or build flag.
- **A synthetic ocean**: 4D fields of temperature, salinity and pressure with sound
  speed derived rather than stored; four seeded features (eddy, front, thermocline,
  drifting feature) whose ground truth is written into a manifest so recovery can be
  scored; a decorrelation timescale authored per feature and advecting with it.
- **Coverage holdings across five eras** — a multi-decade monthly archive, the departure
  brief authored as persistence, a now-cast replaced on cadence, the analyses an
  assimilation cycle publishes, and the accumulating forecast instances.
- **Sensing and ingestion**: sensors publish in SensorThings vocabulary, confined to
  their namespace by broker rules; the ingestion seam validates against the message
  master and is the store's sole writer.
- **A forecast loop** with deterministic replay, cadence control and explicit
  publication, whose quiet is legible: quiet because the scheduler declined a breach
  inside its minimum interval, quiet because nothing has breached, and quiet because
  something has stalled are three different facts, never one appearance.
- **Uncertainty and planning**: uncertainty is the error the analysis published, decayed
  against tau; the planner simulates its collapse along candidate routes, commits one
  route with diminishing returns incorporated, and replans on a receding horizon.
- **An operator's view** drawn as a flow chart with the assimilation cycle drawn as a
  cycle — nodes from configuration, edges derived from the topology artefact, so the
  picture cannot disagree with the wiring. Each node carries an instrument built for what
  that component does, and a keyboard-navigable list view carries every fact and control
  the chart carries. Settings are tunable mid-run within declared bounds, events and
  platform demands can be issued, and a component can be asked to publish one
  deliberately faulty message — genuinely bad, and refused by the ordinary seam.
- **A map surface** (Deck.gl) offering a plan view, a rotatable globe and a rotatable
  depth volume, drawing the fields, the uncertainty, advisories valid at the displayed
  time, the planned route as a four-dimensional curve, and the platform's track and
  demanded course in every projection. An **EDR query composer** rides on it, the literal
  request URL always visible and copyable, offering only what the query components serve.
- **A data navigator**: what the three stores hold as one tree beside a detail region —
  measurements as chart and table over full history, the coverage eras as timelines and
  volumes, and shore advisories drawn as their advised regions, spent rather than removed
  when their validity lapses.
- **A message surface**: traffic drawn as marks on lanes, the topic tree lit by genuinely
  received messages, an inspector rendering a payload against the master its topic
  declares, and a running count of what its schema refused.
- **Background explainers**: eleven keyboard-traversable explainers of the standards and
  of what it takes to use them honestly, addressable by anchor, rendering identically
  with every component stopped.
- **Three downstream consumers** — Sampling, Courses and Feasibility — notional systems
  consuming drogna's forecast to reach a decision, reaching it only through the seam,
  rendered in bright yellow under a non-dismissible strip so a screenshot lifted out of
  context still says what it is.
- **A published static site** carrying the generated component reference, standards
  primers, algorithm derivations, a glossary, the decision records and seventeen blog
  entries.

## Standards and interfaces

- **OGC API-EDR** serves coverage queries over the coverage store, including trajectory
  queries carrying per-vertex timestamps — conditions forecast for the moment of arrival.
- **OGC SensorThings** (Part 1, Sensing) provides the observation vocabulary, sensor to
  query.
- **CoverageJSON** is the served shape for gridded responses; **CF conventions** govern
  coverage storage and the offload export; **MQTT semantics** underpin the topic tree.
- **JSON Schema and OpenAPI** are the authoritative contract formats for seam shapes —
  fifty-nine masters under `contracts/`.

The standards are implemented as **honest subsets**. Subsets grow one capability at a
time and every refusal names the thing refused: an unimplemented option by its option, an
unsupported geometry by its shape, an unsupported property by its property. EDR's `cube`
query type is outside the served subset and the composer says so by name; SensorThings'
`HistoricalLocations` is refused by name so the platform's track has one representation
rather than two that can disagree. The conformance statement is amended in the same
commit as the code, and a test holds the served and documented accounts in agreement. An
offered-but-stubbed capability is the exact dishonesty this harness exists to avoid.

## Technologies and runtime shape

- **Language:** TypeScript 5 throughout — application, in-browser backend, tests, the
  site generator and the constitution gates themselves.
- **UI/runtime:** React 18, dockview 8 for the shell, Deck.gl 9 for the map and volume
  surfaces, h3-js for the consumers' hex grids, driver.js for the panel tours.
- **Validation and testing:** Ajv for runtime schema validation, vitest, Playwright for
  capture and end-to-end, ESLint with typescript-eslint.
- **Build and delivery:** Vite 6 builds static assets; pnpm 10 drives one workspace at
  the repository root. No Python, no containers, no daemon, no second toolchain.
- **Data:** stores are in-memory behind store interfaces, keeping V1's semantics — one
  writer per store, the feature store read-only during a run, the advisory store
  append-only, published runs visible atomically. The committed seed artefacts under
  `app/public/snapshots/` are produced by constructing the backend and driving a start
  condition's pre-roll, diffed by a drift gate, and re-entered through the coverage
  store's own publication seam. Never written by hand.

```sh
pnpm install
pnpm check         # typecheck, lint, unit tests, gates — what CI runs
pnpm gates         # the constitution gates alone (scripts/gates.registry)
pnpm generate      # regenerate app/src/generated/ from contracts/ masters
pnpm snapshots     # regenerate app/public/snapshots/ by running the components
pnpm replay-proof  # the byte-identical replay proof (AT-04)
pnpm -C app dev    # the shell, live, at a local URL
pnpm site:build    # the published site, into site/build/
```

## Constraints

Eleven constitutional principles, at version 2.1.0. They do not restate the
requirements; they constrain how any of them may be met, and every spec-kit phase is
checked against them.

| Principle | What it forbids |
|---|---|
| **I. No wall-clock time** | Host time for any operational purpose. Two bounded, marked exemptions: heartbeat liveness, and interpolation between clock samples in the render path. |
| **II. Seeded randomness** | Entropy anywhere operational. Every generator is a named stream from the manifest's root seed; identifiers derive from seed and logical position. |
| **III. Generated types only** | Hand-writing a shape that crosses the seam. Masters live under `contracts/`; TypeScript is generated, committed, drift-checked. |
| **IV. No literal paths or hosts** | A filename, host, port, URL or topic string in component source. One validated configuration document per component at construction. |
| **V. No tracked entities** | Any entity the harness did not place; any customer, project or bid material in the repository. |
| **VI. Honest ports** | Abstraction for its own sake, and any capability offered but stubbed. |
| **VII. Liveness, not configuration** | A data path asserting the existence of something not running — and equally, a display showing silence where there is traffic. |
| **VIII. Recommendations, not decisions** | The planner commanding, tasking or advising a human. The boundary defended is *who recommends*, not who renders. |
| **IX. Ground truth is scored, not assumed** | Asserting recovery or skill. Skill is reported against a persistence reference, and the display says when the model is not earning its compute. |
| **X. Default deny at the boundary** | Accidental exposure. Access is binary, releases sit under a dedicated prefix, denials are observable, and the tests exercise at least one allowed request — a boundary never entered is untested from the inside. |
| **XI. One seam, wire-shaped** | Any import across the seam, and any code path that knows whether the seam is answered locally or remotely. |

Two further constraints bind delivery. **Data**: seed data is produced through the
components' own code paths, never written into a store directly, and may be produced
ahead of time only under a drift gate and through the store's own publication seam.
**Repository layout**: feature work stays inside its own directories, and a plan
proposing a new top-level directory must say why.

## Quality gates

Twenty-one gates run in `pnpm check` and in CI. They are TypeScript scripts listed one
per line in `scripts/gates.registry`, run by a runner that names no gate — which is what
lets a feature add a gate by appending a line rather than editing the runner. They cover
the constitutional principles (wall-clock, seeded RNG, types drift, literal paths,
vocabulary, import boundary), the derived artefacts (topology drift, snapshot drift,
schema masters), the shell's own claims (view ids, flow-chart completeness, Background's
inertness and greyscale marks, the single breakpoint constant, truth-derived holdings),
and the published estate (site links, resources, tenancy, disclosure, concurrency, blog
length).

**A check that has never been seen to fail is worth nothing.** Every gate is watched
failing against a planted violation before it is trusted, and the commit message says so.
Two of Version 1's original four gates reported a file of deliberate violations as clean;
the discipline exists because of that. Gates run in `pnpm check` as well as in the
publishing workflows, because gates living only in a workflow stop running when the
workflow is deleted.

## Acceptance criteria

**AT-01** — a trajectory query through the seam returns correct values along a
four-dimensional route, verified against the generator's ground-truth manifest.
**AT-02** — a threshold breach triggers a model run, visibly, end to end, within the
shell. **AT-03** — the seeded eddy is recoverable from stored data with a known and
reported error, the bound derived from the authoring jitter on disk rather than typed
into the test. **AT-04** — the whole scenario replays byte-identically from its exported
manifest, components in lockstep, run by a one-command proof. **AT-05** — a recorded
corpus of seam traffic validates against the committed masters, and the suite replaying
it runs against a remote base URL unchanged; this is Version 3's contract.

Each beat's acceptance is **watched happening in the shell** across the full path through
the seam — generator to pixel, never a panel in isolation — and captured, never inferred
from green tests alone.

## Where things are

| Path | What |
|---|---|
| `srd.md` | The Software Requirements Document (SRD-v2). Source of scope. |
| `.specify/memory/constitution.md` | The non-negotiables (2.1.0) every feature is checked against. |
| `docs/v2/plan.md` | The endorsed V2 plan: the interview record and the narrative arc. |
| `docs/adr/` | Architecture Decision Records, 0001 to 0041; numbering continues from V1. |
| `specs/1NN-*/` | The V2 spec series, twenty-one features, one per narrative beat. |
| `contracts/` | The masters every seam shape is generated from. |
| `app/` | The one deliverable: the shell, the panels, the in-browser backend, the seam. |
| `scripts/` | The gates and their registry, the generators, the capture scripts. |
| `site/` | The published site source: docs, primers, demos, blog, archive. |
| `specs/0NN-*/`, `spikes/`, `harness-srd.md` | The V1 record, archived in place. |

## The gh-pages estate

The `gh-pages` branch has two tenants; the boundary is the design. **The site** owns the
root, published by `site.yml` from `site/`; its build exits nonzero if any internal link,
anchor or asset reference fails to resolve. **`instances/`** is owned by `instances.yml`,
one subtree per branch, retained after the pull request closes and reachable at
`https://deepbluecltd.github.io/drogna/instances/<branch-with-slashes-as-hyphens>/`.
Neither tenant may write into the other's ground; `scripts/publish-site.ts` refuses even
if a manifest asks it to. The estate is grown **additively**, because a review instance
cannot wait for a merge to the default branch.

## Development

Feature development follows [spec-kit](https://github.com/github/spec-kit):
constitution → specify → plan → tasks → analyze → implement. Every feature has a
`specs/NNN-name/` directory with at minimum `spec.md`, `plan.md` and `tasks.md`; V2
features are numbered from 101.

Two disciplines head the working practices, because Version 1 paid for both. **The tree
is the authority and the record is a claim about it** — where the two disagree, check the
tree, then fix the record; and the reason for declining a task is written at the moment
it is declined, because the reason is the part that cannot be reconstructed later. **A
check that has never been seen to fail is worth nothing** — plant the violation, see it
caught, revert it, and say so in the commit message.

An ADR is written for any decision that is hard to reverse, was genuinely contested, or
where a plausible alternative was rejected; routine choices do not earn one. Spikes write
a dated `FINDING.md`. A pull request with anything visible in it links its own hosted
instance, opened at the view the change is in, and a significant new component arrives
with its blog entry in the same pull request. See `CLAUDE.md` for the working practices
that have earned their place.

## What Version 1 was, and what it cost

Twelve services across Python, SQL, nginx configuration and Compose, deployed to a
server. It delivered what it set out to prove, and reviewing a change to it meant
reasoning across containers. ADR-0027 records the reversal and what it cost to decide.

What was retired is recorded rather than dropped silently: the Compose deployment as a
requirement; the reverse proxy, pygeoapi, Postgres/PostGIS, the MQTT broker and NetCDF as
*engines*, whose roles and semantics carry and whose engines return in Version 3;
container lifecycle commands and resource sampling, taking the third wall-clock exemption
with them; offload's real transfer, deferred to Version 3 with the export shape retained;
and the second-broker fallback, moot with one in-browser broker. The Version 1 written
record is kept in place and accurately labelled. The reasoning is the part worth keeping.

## Licence

MIT. See [`LICENSE`](LICENSE).
