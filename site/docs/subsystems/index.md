---
title: Subsystem reference
---

# Subsystem reference

drogna is specified as eighteen components. This section carries one page per
component: what it does, why it exists as a separate thing, and which failure
mode it owns.

The last column is the interesting one. It comes from the requirements document,
which assigns each component a failure mode it is responsible for preventing.
That is a more useful description of a component than a list of its methods,
because it says what would be lost if the component were merged into its
neighbour.

!!! warning "Everything here is a stub"

    **No component has been built.** Every page in this section describes
    intent, not code. Each page repeats that at the top, and each will be
    rewritten against the implementation when it exists.

    The pages are written now, before the code, because writing them is how the
    boundaries were argued about. A component whose page cannot be written
    without describing another component is not a component.

## The eighteen

| ID | Component | Responsibility | Owns the failure mode of | Status |
|---|---|---|---|---|
| [C-01](c01-simulation-clock.md) | Simulation clock | Single source of time, rate-controllable | Hidden wall-clock dependencies | Not yet built |
| [C-02](c02-environment-generator.md) | Environment generator | Synthetic 4D fields plus ground-truth manifest | Unverifiable truth | Not yet built |
| [C-03](c03-broker.md) | Broker (MQTT) | Pub/sub transport, namespaced topics | Cross-contamination of flows | Not yet built |
| [C-04](c04-simulated-sensors.md) | Simulated sensors | Publish observations in SensorThings vocabulary | — | Not yet built |
| [C-05](c05-ingest-client.md) | Ingest client | Validate and batch-write; the single ingestion seam | Ingest backpressure | Not yet built |
| [C-06](c06-observation-store.md) | Observation store | Persist point observations | — | Not yet built |
| [C-07](c07-feature-store.md) | Feature store | Static spatial reference | — | Not yet built |
| [C-08](c08-coverage-store.md) | Coverage store | Gridded forecast and uncertainty fields | — | Not yet built |
| [C-09](c09-query-layer.md) | Query layer | SensorThings and EDR read access | — | Not yet built |
| [C-10](c10-reverse-proxy.md) | Reverse proxy | TLS, authentication, path policy | Accidental exposure | Not yet built |
| [C-11](c11-monitor.md) | Monitor | Detect forecast divergence from observations | Over-sensitivity | Not yet built |
| [C-12](c12-scheduler.md) | Scheduler | Decide whether a model run is warranted | Thrashing | Not yet built |
| [C-13](c13-model-runner.md) | Model runner | Analytic advection and noise, ensemble members | Being irreplaceable | Not yet built |
| [C-14](c14-publisher.md) | Publisher | Make completed runs visible atomically; announce | Partial visibility | Not yet built |
| [C-15](c15-planner.md) | Planner | Adaptive sampling recommendations | Crossing into tactical advice | Not yet built |
| [C-16](c16-telemetry.md) | Telemetry | Health and forecast-skill indicators | Silent degradation | Not yet built |
| [C-17](c17-offload-packager.md) | Offload packager | Export with an integrity guarantee | Premature eviction | Not yet built |
| [C-18](c18-browser-client.md) | Browser client | Visualisation and control | — | Not yet built |

## Core and plumbing

The components are not equal in interest. Inside the boundary sits the genuinely
bespoke logic: residual and divergence rules, scheduling policy, sound speed
computation, quality flagging, the uncertainty and planning mathematics. Outside
it sits well-chosen plumbing: the broker, the query layer, the proxy, the stores.

The distinction matters because the plumbing is where a project can spend
unlimited effort on nothing. The design intent is that the visualisation makes
the split visible rather than hiding it, so that it stays obvious which parts
were bought and which were built.
