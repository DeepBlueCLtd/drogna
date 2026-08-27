---
title: Subsystem reference
---

# Subsystem reference

drogna is specified as eighteen components. This section carries one page per
component: what it does, why it exists as a separate thing, and which failure
mode it owns.

The failure-mode column is the interesting one. It comes from the requirements
document, which assigns each component a failure mode it is responsible for
preventing. That is a more useful description of a component than a list of its
methods, because it says what would be lost if the component were merged into
its neighbour. The three columns after it say where to go and look.

!!! success "Sixteen are built, two are partly built"

    These pages were first written before the code, because writing them is how
    the boundaries were argued about — a component whose page cannot be written
    without describing another component is not a component. Every one of them
    then carried a notice saying that no code existed, and that notice stayed
    long after it stopped being true.

    It has been replaced. Each page now names where its code is, which feature
    delivered it, what covers it, and — where something the page describes is
    absent — what is missing and why. The states below were established by
    reading the tree on 27 August 2026, not by reading the task lists, which had
    stopped being maintained.

    Two things are worth reading as they are written rather than as a summary.
    **Partly built** means a behaviour the page describes is not there, and the
    page says which. **Built** with an absence noted means the component does
    what it is for and something adjacent is outstanding — a step nobody has
    wired into the seeding path, a schema master nobody has written. Neither is
    an apology; both are the record being kept honest.

## The eighteen

| ID | Component | Responsibility | Owns the failure mode of | State | Code | Feature |
|---|---|---|---|---|---|---|
| [C-01](c01-simulation-clock.md) | Simulation clock | Single source of time, rate-controllable | Hidden wall-clock dependencies | Built | `services/clock/` | 001 |
| [C-02](c02-environment-generator.md) | Environment generator | Synthetic 4D fields plus ground-truth manifest | Unverifiable truth | Built | `services/env_generator/` | 004 |
| [C-03](c03-broker.md) | Broker (MQTT) | Pub/sub transport, namespaced topics | Cross-contamination of flows | Partly built | `deploy/broker/` | 007 |
| [C-04](c04-simulated-sensors.md) | Simulated sensors | Publish observations in SensorThings vocabulary | — | Built | `services/sensors/` | 007 |
| [C-05](c05-ingest-client.md) | Ingest client | Validate and batch-write; the single ingestion seam | Ingest backpressure | Built | `services/ingest/` | 007 |
| [C-06](c06-observation-store.md) | Observation store | Persist point observations | — | Built | `stores/observations/` | 007 |
| [C-07](c07-feature-store.md) | Feature store | Static spatial reference | — | Built | `stores/features/` | 007 |
| [C-08](c08-coverage-store.md) | Coverage store | Gridded forecast and uncertainty fields | — | Built | `stores/coverage/` | 008 |
| [C-09](c09-query-layer.md) | Query layer | SensorThings and EDR read access | — | Built | `query/` | 008 |
| [C-10](c10-reverse-proxy.md) | Reverse proxy | TLS, authentication, path policy | Accidental exposure | Built | `proxy/` | 013 |
| [C-11](c11-monitor.md) | Monitor | Detect forecast divergence from observations | Over-sensitivity | Built | `services/monitor/` | 009 |
| [C-12](c12-scheduler.md) | Scheduler | Decide whether a model run is warranted | Thrashing | Built | `services/scheduler/` | 009 |
| [C-13](c13-model-runner.md) | Model runner | Analytic [advection](../glossary.md#advection) and noise, ensemble members | Being irreplaceable | Built | `services/model_runner/` | 009 |
| [C-14](c14-publisher.md) | Publisher | Make completed runs visible atomically; announce | Partial visibility | Built | `services/publisher/` | 009 |
| [C-15](c15-planner.md) | Planner | Adaptive sampling recommendations | Crossing into tactical advice | Built | `services/planner/` | 011 |
| [C-16](c16-telemetry.md) | Telemetry | Health and forecast-skill indicators | Silent degradation | Built | `services/telemetry/` | 010 |
| [C-17](c17-offload-packager.md) | Offload packager | Export with an integrity guarantee | Premature eviction | Built | `services/offload/` | 014 |
| [C-18](c18-browser-client.md) | Browser client | Visualisation and control | — | Partly built | `client/src/` | 003, 012 |

## Core and plumbing

The components are not equal in interest. Inside the boundary sits the genuinely
bespoke logic: residual and divergence rules, scheduling policy,
[sound speed](../glossary.md#sound-speed) computation, quality flagging, the
uncertainty and planning mathematics. Outside
it sits well-chosen plumbing: the broker, the query layer, the proxy, the stores.

That list is the requirements document's, and one item on it takes a different
form here from the one the phrase suggests. Nothing flags the quality of a
reading, and no message or column carries a flag; the judgement is made at the
ingestion seam instead, where a reading that fails its contract is refused and
counted rather than stored with a mark against it. That is a decision and not a
gap — the [simulated sensors](c04-simulated-sensors.md) page says what it means
in practice, and **ADR-0014** says why, and what would bring the field back.

The distinction matters because the plumbing is where a project can spend
unlimited effort on nothing. The design intent is that the visualisation makes
the split visible rather than hiding it, so that it stays obvious which parts
were bought and which were built.
