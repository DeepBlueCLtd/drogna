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
├── site/                           the published site: blog + system documentation
│   ├── mkdocs.yml                  build configuration (ADR-0010)
│   ├── docs/                       pages and posts
│   ├── tools/                      site-specific gates
│   └── build/                      GENERATED output, never committed
├── deploy/                         Compose, env templates, provisioning
├── scripts/                        lint gates, seeding, codegen, one-command runs
└── spikes/                         throwaway investigations, dated and reported
```

### Why `site/` is a top-level directory

The constitution requires a new top-level directory to be argued for. `site/` earns one
because the published site is built from sources that are not the repository's
documentation: `docs/` is written for people reading the repository, `site/docs/` is
written for people reading a public blog, and PR-01 binds the second far harder than the
first. Keeping them in one tree would make it easy to publish something that was never
meant to be published. The separation is the safeguard, and it is cheap.

`site/build/` is generated output. It is never committed, and the existing `build/`
ignore pattern already covers it.

## Ownership rule for parallel work

A feature owns the directories named in its plan's Structure Decision and touches no
others. Where two features need the same file, the earlier-numbered feature owns it
and the later one consumes it. Shared additions to `contracts/` are made by the
feature that first needs the shape, and are additive.

## Dependency direction

`libs/` is imported by anything. `services/` is imported by nothing. A package under
`services/` is one of the harness's C-numbers, and what makes it a component rather than a
module is that nothing else in the repository is built on top of it: the moment one service
imports another, the imported one has consumers it cannot see and private details that have
quietly become somebody else's contract.

Where two components need the same shape, the shape moves to `libs/` — or to `stores/`,
where it is about a store's layout rather than about code. This has happened twice and both
times the shape sat inside a service for a while first: `encode_netcdf` in the environment
generator until three components wrote NetCDF, and `read_netcdf` in the divergence monitor
until the offload packager and the planner were both reaching across a boundary for it.
Both are in `harness_core.netcdf` now.

`scripts/check_service_dependencies.py` is the gate. It reports a dependency declared in a
service's `pyproject.toml` on another service, and — the worse case — an import across a
service boundary that no `pyproject.toml` records, which resolves at run time only because
the workspace installs every member. A coupling that is genuinely right carries
`# harness:allow-service-dependency <reason>` on the dependency line and appears in the
exemption inventory. The four that exist today all borrow a *decision* rather than a
mechanism: the environment generator's evaluator, taken by the planner (ADR-0002's one
evaluation of the decorrelation timescale) and by the sensors (a sensor samples the field
the generator authored); the generator's account of what a stored field is — its widths, its
CF version, its digest spelling — taken by the model runner; and the monitor's coverage read
port, taken by telemetry. Each is a shape with one author and no library home yet, and the
inventory is the list of work outstanding rather than a list of permissions granted.

## Naming and identifiers

- Python packages: `snake_case`, importable as `harness_core`, `harness_<service>`.
- Message topic namespaces: `obs/#` for observation traffic, `ctl/#` for control
  events. Sensors may publish only under `obs/`. ACLs enforce this.
- Observation topics: `obs/<thing-id>/<datastream-id>`.
- JSON Schema files are named for the message: `contracts/schemas/<topic-noun>.schema.json`,
  with `$id` of the form `https://schemas.harness.invalid/<name>.schema.json`. That
  convention is what lets the topology artefact below resolve a topic to the master that
  governs it, so it is load-bearing rather than tidy.
- Config schemas: `contracts/schemas/config.<component>.schema.json`.

## The topology, and where it is now written down

**The list of topics in use is `contracts/topology.json`, not this document.** This
section used to carry it, extended by whichever feature first needed a topic and checked
by nothing, which is the shape of record this repository has already paid for once. It is
derived now — by `scripts/scan_topology.py`, from `deploy/broker/acl`, from the roles the
destination configurations name, and from the topics the components' own source binds to
module-level constants — and `scripts/check_topology_drift.py` fails the build when the
committed document no longer matches a fresh scan. Adding a topic therefore means adding
it to a component and regenerating, and it means editing nothing here.

What the artefact records, per topic: the namespace, the master that governs its payloads,
the components whose broker role permits them to publish, the components whose role
permits them to subscribe, and every place in the tree that names it, with file, line and
constant.

Two things it deliberately does not record, and a reader should not infer either.
`publishers` and `subscribers` are **permissions**, read from the access control list,
which is complete because mosquitto enforces it and coarse wherever it is coarse:
`drogna_control` carries `readwrite ctl/#`, so nine components may publish a run request
although only the scheduler does (FR-011). What narrows that is `named_by`, and the
narrowing is a fact about the source rather than a rule at the broker. And nothing in the
document is a claim about a **running** system — no component is said to exist, to be
alive, or ever to have sent anything. A display built on it takes its structure from the
artefact and its illumination from received traffic, and the two are never the same source
(Constitution VII).

The master describing the artefact is `contracts/schemas/topology.schema.json`, and both
language forms come from the usual chain.

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
