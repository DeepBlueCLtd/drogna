# drogna

A learning harness for a maritime environmental data architecture, exercising OGC
API-EDR and OGC SensorThings.

**This is not a production system and is not a prototype of one.** Its numerics are
deliberately fake, its data synthetic, its lifespan short. It holds no tracked
entities of any kind and never will. It exists so that its author can learn how these
components behave together — particularly where they misbehave together — in a way no
diagram conveys.

## Where things are

| Path | What |
|---|---|
| `harness-srd.md` | The Software Requirements Document. Source of scope. |
| `.specify/memory/constitution.md` | The non-negotiables every feature is checked against. |
| `docs/architecture/repo-layout.md` | Binding repository layout and cross-cutting conventions. |
| `docs/architecture/delivery-plan.md` | Dependency graph, delivery waves, and what runs in parallel. |
| `docs/adr/` | Architecture Decision Records. |
| `specs/` | Per-feature spec-kit artefacts: spec, plan, tasks. |

## Development

Feature development follows [spec-kit](https://github.com/github/spec-kit):
constitution → specify → plan → tasks → analyze → implement.

## Licence

See `LICENSE`.
