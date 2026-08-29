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

## Where things are

| Path | What |
|---|---|
| `srd.md` | The Software Requirements Document (SRD-v2). Source of scope. |
| `.specify/memory/constitution.md` | The non-negotiables (2.0.0) every feature is checked against. |
| `docs/v2/plan.md` | The endorsed V2 plan: the interview record and the narrative arc. |
| `docs/adr/` | Architecture Decision Records; numbering continues from V1. |
| `specs/1NN-*/` | The V2 spec series, one feature per narrative beat. |
| `contracts/` | The masters (JSON Schema, OpenAPI) every seam shape is generated from. |
| `app/` | The one deliverable: the shell, the panels, the in-browser backend, the seam. |
| `scripts/` | The constitution gates (TypeScript) and their registry. |
| `specs/0NN-*/`, `docs/adr/0001–0026`, `spikes/`, `harness-srd.md` | The V1 record, archived in place. |

## Development

Feature development follows [spec-kit](https://github.com/github/spec-kit):
constitution → specify → plan → tasks → analyze → implement. See `CLAUDE.md` for
commands and the working practices that have earned their place.
