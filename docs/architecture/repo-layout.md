# Repository layout and cross-cutting conventions

Binding on all feature work. A plan proposing a new top-level directory must argue
for it. The purpose of this document is that eighteen components and sixteen features
can be worked on without colliding.

## Tree

```text
.
├── harness-srd.md                  Software Requirements Document (source of scope)
├── .specify/                       spec-kit tooling and constitution
│   └── memory/constitution.md      the non-negotiables
├── specs/NNN-slug/                 per-feature spec.md / plan.md / tasks.md
├── docs/
│   ├── adr/                        Architecture Decision Records
│   ├── architecture/               this file, component reference, diagrams
│   ├── algorithms/                 derivations: spread, advection, planning
│   ├── standards/                  primers: SensorThings, EDR, CF, CoverageJSON
│   └── glossary.md
├── contracts/                      the neutral masters — hand-written, authoritative
│   ├── schemas/                    JSON Schema: broker messages + config files
│   └── openapi/                    OpenAPI documents
├── config/                         named config files, one per component + shared
│   ├── schema/                     -> symlink-free copies live in contracts/schemas
│   └── local/ droplet/             per-destination values, same shape
├── libs/
│   ├── harness_core/               clock, RNG, config loader, manifest, ports
│   └── harness_types/              GENERATED Python types (do not edit)
├── services/
│   ├── clock/                      C-01
│   ├── env_generator/              C-02
│   ├── sensors/                    C-04
│   ├── ingest/                     C-05
│   ├── monitor/                    C-11
│   ├── scheduler/                  C-12
│   ├── model_runner/               C-13
│   ├── publisher/                  C-14
│   ├── planner/                    C-15
│   ├── telemetry/                  C-16
│   └── offload/                    C-17
├── stores/
│   ├── observations/               C-06 schema + migrations
│   ├── features/                   C-07 schema + provisioning scripts
│   └── coverage/                   C-08 layout convention + catalogue rules
├── query/                          C-09 pygeoapi configuration + plugins
├── proxy/                          C-10 nginx configuration
├── client/                         C-18 React / TS / Deck.gl
│   └── src/generated/              GENERATED TS types (do not edit)
├── deploy/                         Compose, env templates, provisioning
├── scripts/                        lint gates, seeding, codegen, one-command runs
└── spikes/                         throwaway investigations, dated and reported
```

## Ownership rule for parallel work

A feature owns the directories named in its plan's Structure Decision and touches no
others. Where two features need the same file, the earlier-numbered feature owns it
and the later one consumes it. Shared additions to `contracts/` are made by the
feature that first needs the shape, and are additive.

## Naming and identifiers

- Python packages: `snake_case`, importable as `harness_core`, `harness_<service>`.
- Message topic namespaces: `obs/#` for observation traffic, `ctl/#` for control
  events. Sensors may publish only under `obs/`. ACLs enforce this.
- Control topics in use: `ctl/clock`, `ctl/divergence`, `ctl/run-request`,
  `ctl/run-started`, `ctl/run-published`, `ctl/plan`, `ctl/heartbeat`, `ctl/telemetry`.
  The list is extended by the feature that first needs a topic, not treated as closed.
- Observation topics: `obs/<thing-id>/<datastream-id>`.
- JSON Schema files are named for the message: `contracts/schemas/<topic-noun>.schema.json`,
  with `$id` of the form `https://schemas.harness.invalid/<name>.schema.json`.
- Config schemas: `contracts/schemas/config.<component>.schema.json`.

## Configuration contract

Every component reads exactly one environment variable, `HARNESS_CONFIG`, giving the
path of its config file. It validates that file against its schema before any other
I/O. No other environment variable carries operational meaning; secrets arrive via
config produced from a template at deploy time. No literal paths, hostnames, ports or
URLs appear in component source.

Every config file carries, at minimum:

```json
{
  "component": "<id>",
  "clock": { "endpoint": "...", "mode": "..." },
  "seed": { "root": 0, "stream": "<component-id>" },
  "broker": { "url": "...", "client_id": "..." },
  "logging": { "level": "INFO" }
}
```

with component-specific sections beneath. `clock`, `seed`, `broker` and `logging`
shapes are defined once in `contracts/schemas/config.common.schema.json` and `$ref`d.

## Time and randomness

Obtain time from `harness_core.clock.Clock` and randomness from
`harness_core.rng.rng_for(stream)`. Both are ports; both are constructed from config.
Nothing else is permitted (Constitution I and II).

The clock port is a *client* of the clock service (C-01), which publishes time samples
on `ctl/clock` and exposes a small HTTP interface for rate control and startup catch-up
only. The port must not interpolate between samples: doing so would smuggle host time
back into every component. See ADR-0009.

Sound speed is derived, never measured and never stored. There is one implementation, in
`libs/harness_core`, called by the environment generator, the monitor and telemetry. See
ADR-0005.

## Liveness

Every long-lived component publishes a heartbeat on `ctl/heartbeat` at its declared
interval, carrying its component id, the simulation time, and a status. The client
lights a component from heartbeats alone (Constitution VII).

## Testing

- Unit tests beside the code they test, in `tests/` within each package.
- Cross-component tests in `tests/integration/` at the repository root.
- Acceptance tests AT-01 to AT-04 live in `tests/acceptance/` and are named for their
  identifiers.
