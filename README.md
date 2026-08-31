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

## Technologies and runtime shape

- **Language:** TypeScript throughout the application, in-browser backend components,
  tests, and gates.
- **UI/runtime:** React 18, dockview-react for the shell, and Deck.gl for the map.
- **Validation/testing:** vitest, Playwright, ESLint, TypeScript 5.
- **Data/contracts:** JSON Schema and OpenAPI masters under `contracts/`, with Ajv for
  runtime validation and generated TypeScript types committed under `app/src/generated/`.
- **Delivery:** Vite builds static assets for a gh-pages site; each visit is a fresh
  seeded run with no persistence between visits.
- **Site tooling:** the published site is generated from the `site/` tree and published
  additively to the `gh-pages` estate.

The runtime is split across a seam: the front-end shell and panels talk only to the
in-browser backend components via generated interfaces and relative HTTP/broker URLs.
HTTP requests are intercepted in-browser, pub/sub is brokered with MQTT semantics, and
all crossing shapes are validated against the committed masters.

## Standards and interfaces

- **OGC API-EDR** provides coverage queries over the coverage store.
- **OGC SensorThings** provides observation and sensing vocabulary over the observation
  store.
- **MQTT semantics** underpin the broker topic tree and subscription model.
- **CoverageJSON** is the served shape for gridded coverage responses.
- **JSON Schema / OpenAPI** are the authoritative contract formats for seam shapes.

The standards are implemented as honest subsets: each query component states exactly what
it implements, refusals name the unsupported option or shape, and the served conformance
statement is kept in step with the code.

## Capabilities delivered

- A dockable multi-panel shell with URL-addressable views.
- A synthetic ocean world generator with seeded features and a run manifest.
- Sensor publishing and ingestion through an internal seam and validated message flow.
- Query surfaces for SensorThings and EDR over in-memory stores.
- A forecast loop with deterministic replay, cadence control, and explicit publication.
- Operator and telemetry views for commanding, observing, and reviewing the system.
- A map surface rendered with Deck.gl, including route, fields, advisories, and track.
- A static gh-pages site with documentation, standards primers, demos, and blog entries.

## Constitution non-negotiables

- **No wall-clock time** in operational code; simulation time comes from the clock.
- **Seeded randomness only** with deterministic replay from the run manifest.
- **Generated types only** for seam shapes; masters live under `contracts/`.
- **No literal paths or hosts** in component code; configuration supplies endpoints.
- **No tracked entities**: the harness never models real-world third parties.
- **Honest ports**: the code claims only the pluggability it truly has.
- **Liveness, not configuration**: displays reflect observed heartbeats and traffic.
- **Recommendations, not decisions**: planning components never issue commands.
- **Ground truth is scored, not assumed**: recovery, skill, and replay are measured.
- **Default deny at the boundary**: release is explicit and observable.
- **One seam, wire-shaped**: front-end and backend never import across the boundary.

## Where things are

| Path | What |
|---|---|
| `srd.md` | The Software Requirements Document (SRD-v2). Source of scope. |
| `.specify/memory/constitution.md` | The non-negotiables (2.0.0/2.1.0) every feature is checked against. |
| `docs/v2/plan.md` | The endorsed V2 plan: the interview record and the narrative arc. |
| `docs/adr/` | Architecture Decision Records; numbering continues from V1. |
| `specs/1NN-*/` | The V2 spec series, one feature per narrative beat. |
| `contracts/` | The masters (JSON Schema, OpenAPI) every seam shape is generated from. |
| `app/` | The one deliverable: the shell, the panels, the in-browser backend, the seam. |
| `scripts/` | The constitution gates (TypeScript) and their registry. |
| `site/` | The published gh-pages site source: docs, standards primers, demos, blog, archive. |
| `specs/0NN-*/`, `docs/adr/0001–0026`, `spikes/`, `harness-srd.md` | The V1 record, archived in place. |

## Development

Feature development follows [spec-kit](https://github.com/github/spec-kit):
constitution → specify → plan → tasks → analyze → implement. See `CLAUDE.md` for
commands and the working practices that have earned their place.
