# drogna Constitution — 2.0.0 DRAFT

**Status:** Draft for review. Adopted only when this text replaces
`.specify/memory/constitution.md` and ADR-0027 moves to Accepted. Until then, 1.6.0
governs.

**Purpose of this document.** These are the non-negotiables of the harness. Every
spec-kit phase — `specify`, `plan`, `tasks`, `analyze`, `implement` — is checked
against them. A plan that violates a principle is rejected or must carry an explicit,
argued entry in its Complexity Tracking table and a corresponding ADR.

Source of truth for scope is `srd.md` (SRD-v2). This constitution does not restate the
requirements; it states the rules that constrain how any of them may be met.

**What changed at 2.0.0, in one paragraph.** Version 2 is a pure client-side system:
the backend components are genuine programs running in the browser, separated from the
front-end by a wire-protocol seam, to be replaced by a real backend in Version 3
(ADR-0027). The ten principles survive — none is retired — but III, VI, VII and X are
re-scoped to the seam, the technology constraints are rewritten for a single-language
toolchain, and a new Principle XI makes the seam itself constitutional. Principle I
returns to two exemptions.

---

## Core Principles

### I. No Wall-Clock Time (NON-NEGOTIABLE)

No component reads time from the host for any operational purpose. All time comes from
the simulation clock component via the clock port.

- Prohibited in operational code paths: `Date.now`, `new Date()`, `performance.now`,
  `requestAnimationFrame` timestamps used as truth, timer callbacks used as a measure
  of elapsed simulated time, and any equivalent.
- Permitted only in: log line decoration, test harness setup, the clock component's own
  real-time driver, **heartbeat emission and liveness evaluation** (ADR-0006), and
  **interpolation between received clock samples in the render path** (ADR-0007). Both
  exemptions carry their 1.x bounds verbatim: liveness answers "is this process
  alive?", a fact about the machinery with no simulation-time answer even in
  principle; interpolation never extrapolates past the latest sample, every arriving
  sample snaps the display, and nothing derived from it leaves the render path.
- The third exemption of 1.6.0 — container resource sampling (ADR-0026) — **retires
  with the containers**. The erosion count returns to two; a third request is again
  the evidence-of-erosion case and must be argued on its own merits, never by analogy.
- Enforced by an automated lint gate that runs in CI and fails the build. Any exemption
  is an inline `// harness:allow-wallclock <reason>` marker, and every marker is
  reviewed.

*Rationale: deterministic replay (AT-04) dies the moment a single component reads the
host clock, and this is the one property that cannot be retrofitted at acceptable
cost. Running in a browser changes the function names, not the principle.*

### II. Seeded Randomness and Deterministic Replay (NON-NEGOTIABLE)

All stochastic behaviour derives from explicitly seeded random number generators.

- No component calls `Math.random`, `crypto.getRandomValues` or `crypto.randomUUID`
  for operational purposes. Every generator is constructed from a seed obtained from
  the run manifest, through the RNG port, as a named per-component stream.
- Every run writes a manifest recording: the root seed, per-component derived seeds,
  the generator version, the clock configuration, and the configuration digest. The
  manifest is exportable and importable through the shell, because V2 persists
  nothing between visits.
- A scenario replayed from its manifest produces byte-identical outputs for the same
  code version. This is a test (AT-04), not an aspiration.
- Identifiers in stored data or messages derive deterministically from seed + logical
  position, never from entropy or wall-clock.

### III. Generated Types Only (NON-NEGOTIABLE)

No shape that crosses the seam is hand-written twice — and V2 has one language, so the
principle's weight moves: the masters exist for Version 3 as much as for today.

- Seam message payloads and configuration documents are defined once, in JSON Schema,
  under `contracts/schemas/`. HTTP interface types derive from OpenAPI under
  `contracts/openapi/`. Where a shape appears in both, the OpenAPI document `$ref`s
  the JSON Schema file: one vocabulary, one generator chain.
- TypeScript is generated from the masters into `app/src/generated/`, committed, and
  CI-verified against its sources (regenerate, diff, fail on drift). Generated
  directories are never edited by hand and carry a "DO NOT EDIT" banner.
- The masters are the contract a Version 3 backend generates its own types from. A
  seam shape that exists only as a TypeScript declaration is a violation even though
  nothing else consumes it yet.

### IV. No Literal Paths or Hosts (NON-NEGOTIABLE)

No component contains a literal filename, path, hostname, port, URL or topic string.

- Every component receives exactly one configuration document at construction,
  validated against its JSON Schema before any other work. Invalid configuration is a
  construction failure with a readable message, never a runtime surprise.
- The seam's endpoints — the HTTP base and the broker transport — come from
  configuration alone, which is precisely what makes Version 3 a configuration change
  (Principle XI).

### V. No Tracked Entities (NON-NEGOTIABLE)

Carried verbatim from 1.6.0, including the 1.4.0 amendment narrowing the prohibition
to the entity rather than the vocabulary. The harness holds no tracked entities,
contacts or detections, and never will; the data model admits environmental
measurements, forecast fields, uncertainty fields, sampling recommendations, advisories
and system telemetry, nothing else; no customer, project or bid material appears
anywhere in the repository; the word "track" remains ordinary navigational English for
the simulated platform's own path. What is forbidden is the third party: an entity the
harness did not place, whose position it infers rather than knows.

### VI. Honest Ports

The harness claims exactly the pluggability it has, and no more.

- Genuine ports, each with more than one conceivable implementation: the **seam
  transports** (HTTP interception and the broker transport — in-browser today, network
  in V3), the **clock**, the **RNG**, the **model kernel** (initialisation state in,
  gridded field out), and the **store interfaces** (in-memory today, engines in V3).
- The store interfaces are ports *because Version 3 is planned*. In 1.x, "Postgres is
  not being swapped" was the honest statement; in 2.x the swap is the roadmap. If
  Version 3 is ever abandoned, this entry is amended rather than left flattering.
- The query components state plainly which subset of each standard they implement, and
  every unimplemented option is refused with the option named. An
  offered-but-stubbed capability is the exact dishonesty this harness exists to avoid.
- Introducing any other abstraction "for flexibility" requires an ADR arguing why.
  Interface-for-its-own-sake is a constitution violation.

### VII. Liveness, Not Configuration (NON-NEGOTIABLE)

Any display of what exists is driven by observed liveness, never by configuration
listing what ought to exist, and never by fixture data.

- The shell renders the full component layout from day one, greyed out until each
  component is genuinely alive and heard from: a component is lit only because a
  heartbeat from it arrived over the broker within its declared liveness window. No
  manual override, no `enabled: true` flag, no hardcoded list.
- **Re-scoped for V2, deliberately (ADR-0027).** The in-browser components are real
  components: each genuinely runs, holds its own configuration and seed stream, emits
  its own heartbeats, and can genuinely stop — and when it stops, it goes dark because
  its heartbeats cease. What this principle forbids is unchanged and is now stated by
  effect rather than by the word "mock": **no data path may assert the existence of
  something that is not running.** Fixture data, canned traffic, a
  "populate for the screenshot" mode, or illumination derived from anything but
  received heartbeats — each remains forbidden exactly as in 1.x.
- A component stopped by operator command is shown stopped by the silence of its
  heartbeats, never by the command's success response.

*Rationale: the whole evidential value of drogna rests on the display being unable to
claim a component exists when it does not. That the components live in the browser
changes where they run, not what evidence is.*

### VIII. Recommendations, Not Decisions

Carried verbatim. The planner emits recommendations; it does not command, task, or
advise a human directly. Computing where sampling would most reduce uncertainty is
decision logic even when never drawn; the boundary defended is *who recommends*, not
*who renders*.

### IX. Ground Truth Is Scored, Not Assumed

Carried verbatim. The generator writes a manifest of seeded parameters alongside each
field; recovery error is computed and reported, never asserted (AT-03, with its bound
derived from the authoring jitter on disk, never typed into the test); forecast skill
is always reported against a persistence reference, and the display says when the
model is not earning its compute.

### X. Default Deny at the Boundary

Exposure is opt-in, one path prefix at a time — and in V2 the boundary is a component
at the seam rather than a reverse proxy, enforcing the same policy observably.

- Access is binary: cleared for all data or none. No per-field redaction (ADR-0001
  stands).
- Released collections sit under a dedicated path prefix; everything else is
  default-deny at the release gate, through which all seam HTTP traffic passes.
  Adding a collection never exposes it by accident. A denial is observable in the
  shell.
- The two leakage paths carry explicit tests, not review by eye: provenance metadata
  embedded in exports, and the shape of the freshly updated region, which traces the
  sampling track.
- In Version 3 the release gate's policy moves verbatim to a real proxy; the policy
  format is therefore configuration, not code.

### XI. One Seam, Wire-Shaped (NON-NEGOTIABLE, new in 2.0.0)

Everything the front-end knows about the backend crosses the seam in wire shape.

- The front-end reaches the backend only through the seam's client interfaces: HTTP
  requests against configured relative URLs, and the broker transport. Backend
  components reach each other only over the broker and the stores behind their
  interfaces. No front-end module imports a backend module, and vice versa; the only
  code visible from both sides is `app/src/seam/` and `app/src/generated/`. Enforced
  by an import-boundary lint gate that runs in CI.
- Every crossing is governed by a committed master (Principle III) and validated
  against it in tests — and the recorded seam-traffic corpus is the conformance suite
  a Version 3 backend must pass (AT-05).
- No code path may know whether the seam is answered locally or remotely. A feature
  that works only in-browser, or only against a server, is a violation.

*Rationale: the seam is the entire reason Version 2 can exist without foreclosing
Version 3. A single leaked import quietly turns the client into a monolith and turns
Version 3 into the rewrite this principle exists to prevent.*

---

## Additional Constraints

### Technology

- **TypeScript 5** throughout — application, in-browser backend components, tests,
  and the constitution gates themselves. **pnpm**; **vitest**; **Playwright** for
  capture and end-to-end. No Python, no containers, no second toolchain (SRD-v2
  NFR-01).
- **React** for panel content; **GoldenLayout 2.x** for the shell layout;
  **Deck.gl** for the map surface.
- **Stores are in-memory** behind store interfaces, with V1's semantics: one writer
  per store through its ingestion seam; the feature store read-only during a run; the
  advisory store append-only; atomic publication of runs.
- **The broker** is an in-browser component with MQTT topic semantics — topic tree,
  wildcard subscription, ACL-shaped rules — behind a transport whose wire shape is
  MQTT-over-WebSocket.
- **Delivery is static assets.** Any static host serves the harness; each visit is a
  fresh seeded run; nothing persists between visits; the manifest export/import is
  the replay mechanism.

### Repository Layout

Feature work stays inside its own directories. The canonical layout is recorded in
`docs/architecture/repo-layout.md` (rewritten for V2 by feature 101) and is binding: a
plan proposing a new top-level directory must say why.

### Data

- Seed data is produced by code at provisioning, never accumulated. A fresh visit is
  equivalent to a long-running one — in V2, literally.
- The feature store is read-only during a scenario run, provisioned at scenario start.

---

## Development Workflow

### Spec-driven development

Unchanged: constitution → specify → plan → tasks → analyze → implement. Every feature
has a `specs/NNN-name/` directory with at minimum `spec.md`, `plan.md` and `tasks.md`.
V2 features are numbered from 101. Tick tasks as you go, and write the reason at the
moment a task is declined — the reason is the part that cannot be reconstructed later.

### Architecture Decision Records

Unchanged, continuing the existing numbering: an ADR for any decision that is hard to
reverse, was genuinely contested, or where a plausible alternative was rejected.
Routine choices do not earn one. The V1 records 0001–0026 remain the record of how
2.0.0's positions were learned.

### Quality gates

Every change must pass, in CI:

1. `eslint` and `tsc --noEmit`; `vitest`.
2. The wall-clock lint gate (Principle I).
3. The seeded-RNG lint gate (Principle II).
4. The generated-types drift check (Principle III).
5. The literal-path lint gate (Principle IV).
6. The forbidden-vocabulary gate (Principle V).
7. The seam import-boundary gate (Principle XI).

Gates 2–7 are TypeScript scripts registered in a gates registry, one per line, run by
a runner that names no gate — a feature adds a gate by appending a line, never by
editing the runner. **A check that has never been seen to fail is worth nothing**:
every gate is watched failing on a planted violation before it is trusted, and the
commit message says so.

### Demonstrability

Each delivery stage is demonstrable before the next begins. "Demonstrable" means
runnable from a clean checkout with one command, visible in the shell, and — from
feature 101 on — deployed as the static site.

---

## Governance

This constitution supersedes other practices. Where a spec, plan or task conflicts
with it, the constitution wins and the artefact is amended. Amendments require an ADR
and a version bump here. Every plan carries a Constitution Check section. Violations
that are genuinely necessary are recorded in the plan's Complexity Tracking table with
the simpler alternative and why it was rejected; an unrecorded violation is a defect.

**Version**: 2.0.0 (draft) | **Ratified**: pending review | **Last Amended**: —

*2.0.0 — the Version 2 reversal (ADR-0027): pure client-side system, in-browser
backend components behind a wire-protocol seam, single-language toolchain, static
delivery. All ten principles survive; III, VI, VII and X re-scoped to the seam;
Principle I returns to two exemptions as ADR-0026's retires with the containers;
Principle XI added. The 1.x version log is preserved in the archived constitution.*
