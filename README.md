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

Before pushing, run what the build runs:

```sh
uv sync                  # the workspace, once
uv run ruff check .
uv run ruff format --check .
uv run pytest
./scripts/gates.sh       # every constitution gate, and the exemption inventory
```

and, for the client:

```sh
cd client && pnpm install && pnpm exec tsc --noEmit && pnpm lint && pnpm test
```

`scripts/gates.sh` takes its gates from `scripts/gates.registry`, one per line. A feature
that adds a gate appends a line there; the runner names no gate and does not need editing.

## Licence

See `LICENSE`.
