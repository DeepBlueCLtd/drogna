# drogna Constitution

**Purpose of this document.** These are the non-negotiables of the harness. Every
spec-kit phase — `specify`, `plan`, `tasks`, `analyze`, `implement` — is checked
against them. A plan that violates a principle is rejected or must carry an explicit,
argued entry in its Complexity Tracking table and a corresponding ADR.

Source of truth for scope is `harness-srd.md`. This constitution does not restate the
requirements; it states the rules that constrain how any of them may be met.

---

## Core Principles

### I. No Wall-Clock Time (NON-NEGOTIABLE)

No component reads time from the operating system for any operational purpose. All
time comes from the shared simulation clock service (C-01) via the clock port.

- Prohibited in operational code paths: `time.time`, `time.monotonic`,
  `datetime.now`, `datetime.utcnow`, `datetime.today`, `Date.now`, `new Date()`,
  `performance.now`, SQL `now()`, `current_timestamp`, broker-assigned timestamps
  used as truth.
- Permitted only in: log line decoration, process-level metrics, test harness setup,
  the clock service's own real-time driver, **heartbeat emission and liveness
  evaluation** (ADR-0006), and **interpolation between received clock samples in the
  client's render path** (ADR-0007). The last of these is narrow and stays narrow: it covers
  emitting a heartbeat on a real-time interval and evaluating a liveness window. It
  does not cover timestamping an observation, scheduling a model run, ageing an
  uncertainty field, or anything else. Liveness answers "is this process alive?",
  which is a fact about the host and not about the simulated world, and deterministic
  replay is untouched because no operational output depends on heartbeat timing. The
  render-path exemption is bounded the same way: it may interpolate between two
  received samples but never extrapolate past the latest one, every arriving sample
  snaps the display and discards the interpolation, and no value derived from it
  leaves the render path.
- Both exemptions concern the boundary between the simulated world and the machine
  displaying it. That is the shape of the boundary, not a slide. A third request is
  evidence the principle is being eroded and must be argued on its own merits, never
  by analogy to these two.
- Enforced by an automated lint gate (`scripts/check_no_wallclock.py`) that runs in
  CI and fails the build. Any exemption is an inline `# harness:allow-wallclock
  <reason>` marker, and every marker is reviewed.

*Rationale (SRD FR-09, §10.1): this is the one property that cannot be retrofitted at
acceptable cost. Deterministic replay (AT-04) dies the moment a single component
reads the host clock.*

### II. Seeded Randomness and Deterministic Replay (NON-NEGOTIABLE)

All stochastic behaviour derives from explicitly seeded random number generators.

- No component calls a module-level or global RNG (`random.random`,
  `numpy.random.*` free functions, `Math.random`, `uuid4` for operational
  identifiers). Every generator is constructed from a seed obtained from the run
  manifest, through the RNG port.
- Every run writes a manifest recording: the root seed, per-component derived seeds,
  the generator version, the clock configuration, and the config file digest.
- A scenario replayed from its manifest produces byte-identical outputs for the
  same code version. This is a test (AT-04), not an aspiration.
- Identifiers that appear in stored data or messages are derived deterministically
  from seed + logical position, never from entropy or wall-clock.

*Rationale (SRD FR-11, AT-04).*

### III. Generated Types Only (NON-NEGOTIABLE)

No type that crosses a language boundary is hand-written twice.

- Broker message payloads are defined once, in JSON Schema, under `contracts/schemas/`.
- HTTP interface types derive from OpenAPI under `contracts/openapi/`, taking the
  query layer's own emitted specification as source wherever it emits one.
- Where the same shape appears in both, the OpenAPI document `$ref`s the JSON Schema
  file. One vocabulary, one generator chain.
- Python and TypeScript types are generated into `libs/harness_types/` and
  `client/src/generated/` respectively, and both are committed and CI-verified to be
  in sync with their sources (regenerate, diff, fail on drift).
- Generated directories are never edited by hand. Every generated file carries a
  "DO NOT EDIT" banner.

*Rationale (SRD NFR-01 to NFR-03).*

### IV. No Literal Paths or Hosts (NON-NEGOTIABLE)

No component contains a literal filename, directory path, hostname, port, or URL.

- All external input arrives via a named configuration file whose location is given
  by a single environment variable per component (`HARNESS_CONFIG`).
- The config is validated against its JSON Schema as the first operation the
  component performs, before any I/O. Invalid config is a startup failure with a
  readable message, never a runtime surprise.
- The same rule binds the Compose configuration, the query layer configuration, the
  proxy configuration, and the client: environment-agnostic from the first commit.

*Rationale (SRD NFR-04, NFR-05). Drift between local and droplet quietly doubles
maintenance.*

### V. No Tracked Entities (NON-NEGOTIABLE)

The harness holds no tracked entities, contacts or detections, and never will.

- The data model admits environmental measurements, forecast fields, uncertainty
  fields, sampling recommendations and system telemetry. Nothing else.
- No customer name, project name, or bid-specific material appears anywhere in the
  repository: code, docs, blog, commit messages, branch names, or issue tracker.
- Numerics are deliberately fake and data synthetic. The landing page says so in
  plain words (FR-01), and no artefact of the harness may imply otherwise.
- What is forbidden is the *third party*: an entity the harness did not place, whose
  position it infers rather than knows. A contact, a detection, a tracklet, anything
  that is or implies one.
- **The word "track" is not forbidden.** The route a vehicle has travelled is a track,
  in ordinary navigational English, and the simulated platform's own path may be called
  one. What the harness has no analogue of is somebody else's.

*Rationale (SRD §1.1, PR-01).*

*Amended 2026-08-27.* The original wording forbade the word "track" outright, and the
gate enforcing it accumulated four narrow escapes in as many weeks — "sampling track",
"tracks the local decorrelation timescale", "not a track" — which is what a rule drawn
around the wrong noun looks like from the inside. The prohibition is on the entity, not
the vocabulary. A sentence that uses "track" in the sense this principle guards against
will name a contact or a detection, and those remain forbidden.

### VI. Honest Ports

The harness claims exactly the pluggability it has, and no more.

- Genuine ports, expressed as interfaces with more than one conceivable
  implementation: the **model kernel** (initialisation state in, gridded field out),
  the **coverage output** (NetCDF today, Zarr plausibly later), the **clock**, and
  the **RNG**. The bespoke EDR trajectory provider sits behind the coverage output
  port as a planned component, not a workaround (FR-50, ADR-0003), as does the bespoke
  SensorThings provider (ADR-0004). Where a standard is ahead of its implementations,
  drogna writes the adapter rather than bending the architecture around the gap — and
  states plainly which subset of the standard it actually implements.
- Marginal, wrapped thinly and documented as marginal: **event publication**.
- Not ports, and not to be dressed as ports: the **observation store** (Postgres is
  not being swapped) and **observation intake** (aspirational, not real).
- Introducing an abstraction over anything in the third group requires an ADR
  arguing why. Interface-for-its-own-sake is a constitution violation.

*Rationale (SRD §2.1). The documentation does not claim more than the code delivers.*

### VII. Liveness, Not Configuration (NON-NEGOTIABLE)

Any display of what exists is driven by observed liveness, never by a configuration
file listing what ought to exist, and never by mocked traffic.

- The client renders the full component layout from day one with components greyed
  out until they are genuinely alive and heard from.
- A component is "lit" only because a message from it arrived within its declared
  liveness window. There is no manual override, no `enabled: true` flag, and no
  hardcoded list of live components.
- **No mocked or synthesised traffic shall ever drive illumination.** A mock asserts
  the existence of something that does not exist, which is precisely the failure this
  principle exists to prevent. There is no demo mode, no fixture mode, and no
  "populate for the screenshot" path. The simulation clock's heartbeat is the first
  real liveness signal and the pattern every later component follows.

*Rationale (SRD FR-45, FR-52). The display cannot be permitted to claim a component
exists when it does not — the whole evidential value of drogna rests on it.*

### VIII. Recommendations, Not Decisions

The harness is headless with respect to decisions.

- The planner emits recommendations. It does not command, does not task, and does not
  advise a human directly. Rendering and advice occur downstream.
- Computing where sampling would most reduce uncertainty is decision logic even when
  never drawn; the boundary defended is *who recommends*, not *who renders*.

*Rationale (SRD FR-36).*

### IX. Ground Truth Is Scored, Not Assumed

Every claim the harness makes about recovering the environment is measured against
the generator's recorded ground truth.

- The environment generator writes a manifest of seeded feature parameters alongside
  each field.
- Recovery error is computed and reported, never asserted. "The eddy is recoverable"
  is meaningless without the error figure beside it (AT-03).
- Forecast skill is always reported against a persistence reference. A model not
  beating "conditions stay the same" is not earning its compute, and the display
  says so (FR-38).

*Rationale (SRD FR-04, FR-38, AT-01, AT-03).*

### X. Default Deny at the Boundary

Exposure is opt-in, one path prefix at a time.

- Access is binary: cleared for all data or none. No per-field redaction. (Recorded
  as ADR-0001, because if this ever softens to tiered access the architecture changes
  materially.)
- Released collections sit under a dedicated path prefix; everything else is
  default-deny at the reverse proxy. Adding a collection never exposes it by accident.
- Two leakage paths carry explicit tests, not review by eye: provenance metadata
  embedded in exported files, and the shape of the freshly updated region, which
  traces the sampling track.

*Rationale (SRD FR-39 to FR-42).*

---

## Additional Constraints

### Technology

- **Python 3.11** for services and libraries; `uv` workspace; `ruff` for lint and
  format; `pytest` for tests.
- **TypeScript 5 / React / Deck.gl** for the browser client; `pnpm`; `vitest`;
  Playwright for capture and end-to-end.
- **Postgres + PostGIS** as one instance carrying three schemas — `observations`,
  `features` and `advisories` — mirroring the conceptual split without multiplying
  operational surface. The three do not share a rule: `features` is read-only for the
  duration of a run, `observations` is written by the ingestion seam alone, and
  `advisories` is written during a run through its own ingestion seam and by nothing
  else. What separates them is a grant the database enforces rather than a process
  boundary (ADR-0024, SRD FR-12).
- **MQTT** as the single broker, with separate topic namespaces for observations and
  control, and ACLs confining sensors to the observation branch. Physical separation
  onto a second broker remains a documented fallback requiring configuration change
  only.
- **pygeoapi** as the query layer, exposing SensorThings (Part 1, Sensing) over the
  observation store and OGC API-EDR over the coverage store.
- **NetCDF with CF conventions** for coverage storage and offload export.
- **Docker Compose**, one configuration, two destinations.

### Repository Layout

Feature work stays inside its own directories. The canonical layout is recorded in
`docs/architecture/repo-layout.md` and is binding: a plan that proposes new
top-level directories must say why.

### Data

- Seed data is produced by scripts, never accumulated. A fresh instance is equivalent
  to a long-running one.
- The feature store is read-only during a scenario run, provisioned by script at
  scenario start.

---

## Development Workflow

### Spec-driven development

Feature development follows spec-kit: constitution → specify → plan → tasks →
analyze → implement. Every feature has a `specs/NNN-name/` directory containing at
minimum `spec.md`, `plan.md` and `tasks.md`.

### Architecture Decision Records

An ADR in `docs/adr/` is required for any decision that is hard to reverse, was
genuinely contested, or where a plausible alternative was rejected. Routine choices
do not earn one. ADRs are numbered, dated, and carry Status / Context / Decision /
Consequences.

### Quality gates

Every change must pass, in CI:

1. `ruff check` and `ruff format --check`; `eslint` and `tsc --noEmit`.
2. `pytest` and `vitest`.
3. The wall-clock lint gate (Principle I).
4. The seeded-RNG lint gate (Principle II).
5. The generated-types drift check (Principle III).
6. The literal-path lint gate (Principle IV).
7. The forbidden-vocabulary gate (Principle V) — scans for tracked-entity and
   customer vocabulary across all tracked files.

Gates 3 to 7 live in `scripts/` and are runnable locally with a single command.

### Demonstrability

Each delivery stage is demonstrable before the next begins. "Demonstrable" means
runnable from a clean checkout with one command, and visible in the client.

---

## Governance

This constitution supersedes other practices. Where a spec, plan or task conflicts
with it, the constitution wins and the artefact is amended.

- Amendments require an ADR recording what changed and why, and a version bump here.
- Every plan carries a Constitution Check section that names each principle it
  touches and how it complies.
- Violations that are genuinely necessary are recorded in the plan's Complexity
  Tracking table with the simpler alternative and why it was rejected. An unrecorded
  violation is a defect.

**Version**: 1.5.0 | **Ratified**: 2026-08-26 | **Last Amended**: 2026-08-28

*1.1.0 — amended against SRD v0.3. Principle VII promoted to non-negotiable and
extended to forbid mocked traffic outright (FR-52). Principle VI records the bespoke
EDR trajectory provider as sitting behind an existing port (FR-50). Project named.*

*1.2.0 — Principle I gains a narrow exemption for heartbeat emission and liveness
evaluation (ADR-0006), without which FR-53's rate-zero capture greys out a running
system. Principle VI records the bespoke SensorThings provider (ADR-0004) and the
obligation to state which subset of a standard is actually implemented.*

*1.3.0 — Principle I gains a second bounded exemption for interpolating between
received clock samples in the client's render path (ADR-0007), with the rule that a
third such request is evidence of erosion rather than precedent.*

*1.4.0 — Principle V narrows to the entity rather than the vocabulary: the harness holds
no tracked entities, contacts or detections, and "track" returns to being ordinary
navigational English for the path the simulated platform has travelled. The
forbidden-vocabulary gate follows, dropping `track` and `tracking` from its word list
along with the four permitted phrases that existed only to let ordinary English past.
Entered in `f423913` on 27 August 2026; this line was written on 28 August 2026, when the
next amendment found that the version had moved and the log had not. The reasoning is
that commit's message. No ADR was written at the time, and governance asks for one — the
debt is recorded here rather than an ADR invented after the fact by someone who did not
take the decision.*

*1.5.0 — the technology constraint names three schemas rather than two: `advisories`
joins `observations` and `features` in the one Postgres instance, because the separation
feature 020 needs is a grant the database enforces and not a second engine (ADR-0024).
SRD FR-12 is amended in step.*
