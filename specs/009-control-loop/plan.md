# Implementation Plan: Control Loop — Sense, Decide, Act, Publish

**Branch**: `009-control-loop` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-control-loop/spec.md`

## Summary

Build the four services that close the harness's control loop: a monitor that scores
observation traffic against the current forecast on sound speed and raises divergence
with persistence evidence; a scheduler that turns divergence into at most one
outstanding run request under a minimum interval; a model runner that advects the
seeded features analytically behind the model kernel port and emits an ensemble mean
and spread; and a publisher that makes a completed run visible in one indivisible
step and announces it. All four communicate only through the `ctl/` topic namespace,
take their time from the simulation clock, and derive every random draw and every
identifier from seeded generators. AT-02 scores against this feature.

## Technical Context

**Language/Version**: Python 3.11, in the repository's `uv` workspace.

**Primary Dependencies**: `harness_core` (clock port, RNG port, config loader,
manifest, event publication wrapper) from feature 001; `harness_types` generated
Python types from feature 006; an MQTT client library for broker access; `numpy` for
grid arithmetic and ensemble statistics; the NetCDF writer behind the coverage output
port for field emission; and the shared sound-speed derivation in `harness_core`,
which this feature calls and does not reimplement (ADR-0005). That derivation wraps
`gsw` or an equivalent published formulation; the choice and its validity range are
documented in `docs/algorithms/`, and the environment generator and telemetry call the
same function, so the three cannot disagree about what a sound speed is.

**Storage**: Coverage store (C-08), NetCDF files under the layout and catalogue
convention in `stores/coverage/`, written to staging and moved into the catalogued
location by the publisher. The observation store (C-06) is touched exactly once per
monitor process lifetime, for restart catch-up, and not otherwise.

**Testing**: `pytest`, with unit tests beside each service in `services/<name>/tests/`,
cross-component tests in `tests/integration/`, and the acceptance test in
`tests/acceptance/`. Recorded observation and divergence fixtures drive the monitor
and scheduler tests without a live broker; integration tests use the Compose broker.

**Target Platform**: Linux containers under the single Docker Compose configuration
(feature 005), identical locally and on the droplet.

**Project Type**: Four long-lived event-driven services plus four broker message
contracts. No HTTP surface of their own; the read path is the query layer's.

**Performance Goals**: The monitor keeps pace with the observation publication rate at
the scenario's maximum clock acceleration without unbounded queue growth; a full
eight-member ensemble run completes fast enough that the AT-02 sequence is watchable
in the client within the configured simulation-time budget; publication visibility is
a single operation whose duration does not scale with field size.

**Constraints**: The monitor's window is bounded in both samples and simulation-time
span and must not grow with scenario length. No wall-clock reads anywhere. No literal
paths, hostnames or ports in source. No polling of the query layer for freshness.

**Scale/Scope**: Four services, four message schemas, four component config schemas,
one model kernel port with two implementations (the analytic kernel and a test
double), one ensemble of order eight members, a grid of the size the environment
generator produces.

## Constitution Check

*GATE: passed at planning time; re-check before implementation of each user story.*

| Principle | How this feature complies |
|---|---|
| **I. No Wall-Clock Time** | Every window bound, persistence span, minimum interval, outstanding timeout, message timestamp and field valid-time comes from `harness_core.clock.Clock`. The lint gate covers all four service packages. Host time appears in exactly two permitted places: log-line decoration, and heartbeat emission under ADR-0006, which is marked `# harness:allow-wallclock` with that ADR as its reason. The exemption stays narrow — it covers emitting a heartbeat, and not timestamping an observation, scheduling a run or ageing anything. |
| **II. Seeded Randomness and Deterministic Replay** | Ensemble perturbations and kernel noise draw from `harness_core.rng.rng_for(stream)` with one derived stream per ensemble member. Run identifiers derive from root seed plus logical run ordinal, never from entropy. SC-010 asserts byte-identical replay. |
| **III. Generated Types Only** | `divergence`, `run-request`, `run-started` and `run-published` are defined once as JSON Schema under `contracts/schemas/`, with `$id` of the documented form. Python types come from `libs/harness_types/`, TypeScript from `client/src/generated/`. Neither is hand-written; the drift check covers them. |
| **IV. No Literal Paths or Hosts** | Each service reads one config file named by `HARNESS_CONFIG` and validates it against `contracts/schemas/config.<component>.schema.json` before any I/O. Staging and catalogue locations, broker URL, topic prefixes, thresholds and intervals are all config. |
| **V. No Tracked Entities** | The data model here is observations, residuals, divergence, run requests, forecast fields and uncertainty fields. No contact, detection or track appears; the sampling platform is a coordinate on an observation. The forbidden-vocabulary gate covers the four packages and the four schemas. |
| **VI. Honest Ports** | The model kernel is a genuine port and is expressed as one: initialisation state in, gridded field out, with a second implementation (the test double) proving it. The coverage output is a genuine port and the publisher writes through it. Event publication is wrapped thinly and documented as marginal. The restart catch-up query uses the observation store client directly and is **not** dressed as a port, per §2.1. |
| **VII. Liveness, Not Configuration** | All four services publish heartbeats on `ctl/heartbeat` carrying component id, simulation time and status. The cadence is real time and the simulation time carried is payload, not schedule (ADR-0006), so pinning the clock rate to zero for a screenshot capture leaves a running component lit rather than greying out a system that is plainly alive. Nothing in this feature tells the client what exists. |
| **VIII. Recommendations, Not Decisions** | Not touched directly: the scheduler decides whether to spend compute, which is an internal resource decision, not advice to a human. No output of this feature is addressed to an operator. |
| **IX. Ground Truth Is Scored, Not Assumed** | The kernel advects features whose parameters come from the generator's ground-truth manifest, so the run's error against truth is computable. This feature emits the residuals; feature 010 turns them into reported skill against persistence. Nothing here asserts accuracy without a figure. |
| **X. Default Deny at the Boundary** | Not owned here. The publisher writes into the coverage store under the catalogue convention; whether a collection is exposed is decided at the proxy by feature 013. The publisher does not open any path. |

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/009-control-loop/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/schemas/
├── divergence.schema.json                 NEW — ctl/divergence payload
├── run-request.schema.json                NEW — ctl/run-request payload
├── run-started.schema.json                NEW — ctl/run-started payload
├── run-published.schema.json              NEW — ctl/run-published payload
├── config.monitor.schema.json             NEW
├── config.scheduler.schema.json           NEW
├── config.model_runner.schema.json        NEW
└── config.publisher.schema.json           NEW

services/monitor/                          C-11
├── src/harness_monitor/
│   ├── __init__.py
│   ├── config.py                          load + validate against schema
│   ├── window.py                          bounded rolling window, eviction
│   ├── residual.py                        measured vs forecast sampling, calling
│   │                                      harness_core's shared sound speed (ADR-0005)
│   ├── persistence.py                     spatial and temporal persistence rules
│   ├── catchup.py                         restart catch-up / warm-up
│   ├── publish.py                         ctl/divergence, ctl/telemetry, heartbeat
│   └── service.py                         subscribe loop, wiring
└── tests/

services/scheduler/                        C-12
├── src/harness_scheduler/
│   ├── config.py
│   ├── policy.py                          minimum interval, duplicate rejection
│   ├── outstanding.py                     outstanding-request register + timeout
│   ├── run_id.py                          deterministic run identifiers
│   └── service.py
└── tests/

services/model_runner/                     C-13
├── src/harness_model_runner/
│   ├── config.py
│   ├── kernel.py                          the model kernel PORT definition
│   ├── analytic_kernel.py                 advection + seeded noise implementation
│   ├── ensemble.py                        member perturbation, mean and spread
│   ├── staging.py                         write fields to staging only
│   └── service.py
└── tests/

services/publisher/                        C-14
├── src/harness_publisher/
│   ├── config.py
│   ├── validate.py                        completeness check on a staged run
│   ├── atomic.py                          single indivisible visibility step
│   ├── catalogue.py                       naming convention, mark current
│   └── service.py
└── tests/

config/local/     monitor.json, scheduler.json, model_runner.json, publisher.json
config/droplet/   the same four, same shape, different values

tests/integration/
├── test_monitor_scheduler_handoff.py
├── test_runner_publisher_handoff.py
└── test_publication_atomicity.py

tests/acceptance/
└── test_at_02_threshold_breach_triggers_run.py
```

**Structure Decision**: This feature owns `services/monitor/`,
`services/scheduler/`, `services/model_runner/` and `services/publisher/` outright,
and owns the four control-namespace message schemas
(`divergence`, `run-request`, `run-started`, `run-published`) and the four
`config.<component>.schema.json` files for its own services, all under
`contracts/schemas/`. It adds its four component config files to the existing
`config/local/` and `config/droplet/` directories, which feature 005 owns; those
additions are additive and follow the shape already fixed by
`config.common.schema.json`. It adds named files to `tests/integration/` and one
named file to `tests/acceptance/`, both shared directories where ownership is per
file. It creates no new top-level directory.

It consumes, and does not modify: `libs/harness_core/` (clock, RNG, config loader,
manifest, event publication) from feature 001; `libs/harness_types/` and
`client/src/generated/` from feature 006, which regenerate from the schemas added
here; the observation message shape and observation store from feature 007; the
ground-truth manifest from feature 004; the coverage store layout and catalogue
rules in `stores/coverage/` from feature 008; and `contracts/schemas/telemetry.schema.json`
from feature 010, against which the monitor and scheduler are producers.

It adds nothing to `client/src/`. Rendering the loop is feature 012.
