# Implementation Plan: Telemetry and Forecast Quality

**Branch**: `010-telemetry-quality` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-telemetry-quality/spec.md`

## Summary

Build the telemetry component (C-16): a subscriber that turns the residual stream the
monitor already produces into running statistics in bounded memory, maintains a
persistence reference and scores the current forecast against it, and publishes both
with the evidence needed to check them. Every figure carries its sample count, its
last-update simulation time and a freshness state, so a dead input reads as dead
rather than as good news. The feature also owns
`contracts/schemas/telemetry.schema.json`, the single definition of every payload on
the `ctl/telemetry` branch, against which feature 009's monitor and scheduler are the
first producers.

## Technical Context

**Language/Version**: Python 3.11, in the repository's `uv` workspace.

**Primary Dependencies**: `harness_core` (clock port, config loader, event
publication wrapper) from feature 001; `harness_types` generated Python types from
feature 006; an MQTT client library for broker access; `numpy` for the incremental
moment arithmetic and the mean-square error reduction.

**Storage**: None. Telemetry holds running aggregates in process memory and persists
nothing. It reads neither the observation store, the coverage store nor the query
layer; the persistence reference is a field identifier plus the values needed to
score against it, obtained from the coverage read port at publication boundaries.

**Testing**: `pytest`. Unit tests in `services/telemetry/tests/` driven by recorded
residual streams and hand-computed expected aggregates; cross-component tests in
`tests/integration/` against the monitor and scheduler of feature 009.

**Target Platform**: Linux container under the single Docker Compose configuration
(feature 005), identical locally and on the droplet.

**Project Type**: One long-lived event-driven service plus one message contract. No
HTTP surface; the client consumes telemetry over the broker like any other consumer.

**Performance Goals**: Message rate bounded and independent of clock acceleration —
publication interval is in simulation time, so acceleration raises samples per
message, not messages per second. Aggregate update is constant time per residual.

**Constraints**: Bounded memory regardless of scenario length; no wall-clock reads; no
literal paths, hosts or ports; no query of the store or query layer; no suppression of
unflattering figures.

**Scale/Scope**: One service, one message contract with a small discriminated set of
payload kinds, one component config schema, statistics at two scopes — scenario and
region.

## Constitution Check

*GATE: passed at planning time; re-check before implementation of each user story.*

| Principle | How this feature complies |
|---|---|
| **I. No Wall-Clock Time** | The publication interval, the staleness window, every `last_updated` field and every covered-window bound come from `harness_core.clock.Clock`. Freshness is a simulation-time property, which is the only reading that survives clock acceleration. The single exception is heartbeat emission, which is on a real-time cadence with the simulation time carried as payload (ADR-0006), marked `# harness:allow-wallclock` with that ADR as its reason. It covers the heartbeat and nothing else: ageing a statistic towards `stale` stays on the simulation clock. |
| **II. Seeded Randomness and Deterministic Replay** | Telemetry draws no random numbers. Its determinism obligation is that the same input stream yields the same output messages, asserted by SC-008. Any identifier it emits derives from the run and component identifiers it received, never from entropy. |
| **III. Generated Types Only** | `contracts/schemas/telemetry.schema.json` is the single definition of every `ctl/telemetry` payload, discriminated by `kind`. Python types come from `libs/harness_types/`, TypeScript from `client/src/generated/`. The producers in feature 009 validate against the same file. |
| **IV. No Literal Paths or Hosts** | One config file named by `HARNESS_CONFIG`, validated against `contracts/schemas/config.telemetry.schema.json` before any I/O. Intervals, minimum sample counts, staleness window, region definitions and topic prefixes all arrive from it. |
| **V. No Tracked Entities** | The data model is residuals, aggregates, mean-square errors and skill scores. Regions are geographic or grid-indexed. Nothing here names or implies a contact, detection or track. |
| **VI. Honest Ports** | Telemetry introduces no ports. It consumes the clock port and the event publication wrapper that already exist, and reads the persistence reference through the existing coverage read port — the same route feature 009's monitor and feature 011's planner take, because all three are inside the boundary and the query layer is the external read path. It also consumes, rather than reimplements, the shared sound-speed derivation in `harness_core` (ADR-0005). Wrapping the broker a second time, or abstracting "a statistics sink", would be interface-for-its-own-sake and is not done. |
| **VII. Liveness, Not Configuration** | Explicitly guarded: FR-012 forbids telemetry from publishing any list of components that ought to exist. Telemetry emits its own heartbeat and nothing else about what is running. The client lights components from heartbeats alone. |
| **VIII. Recommendations, Not Decisions** | Telemetry reports and does not advise. It emits no recommendation and, by FR-013, nothing the scheduler consumes; it cannot become a second trigger path into the control loop. |
| **IX. Ground Truth Is Scored, Not Assumed** | This is the principle the feature exists to serve. Skill is always against a persistence reference; the score is published with both mean-square errors and the sample count so it is recomputable; below the minimum sample count no score is published at all; and a losing score is published as computed, with the plain-language statement attached. |
| **X. Default Deny at the Boundary** | Nothing here is exposed downstream. Region-level statistics trace where sampling has happened, which is a leakage path under SRD FR-42; this feature records that and publishes only on the internal control namespace. Enforcement at the boundary is feature 013's. |

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/010-telemetry-quality/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/schemas/
├── telemetry.schema.json                  NEW — every ctl/telemetry payload,
│                                          discriminated by `kind`:
│                                          residual-sample, scheduler-decision,
│                                          residual-statistics, forecast-skill
└── config.telemetry.schema.json           NEW

services/telemetry/                        C-16
├── src/harness_telemetry/
│   ├── __init__.py
│   ├── config.py                          load + validate before any I/O
│   ├── accumulator.py                     incremental count/mean/RMS/extremes
│   ├── scopes.py                          scenario and region scoping, run
│   │                                      attribution, close-on-supersede
│   ├── persistence_reference.py           hold the previous field, score against it
│   ├── skill.py                           MSE pair, score, state determination
│   ├── freshness.py                       last-update time, fresh/stale transitions
│   ├── publish.py                         ctl/telemetry/<component-id>, heartbeat
│   └── service.py                         subscription loop, wiring
└── tests/

config/local/telemetry.json
config/droplet/telemetry.json

tests/integration/
├── test_telemetry_from_monitor.py
└── test_skill_against_persistence.py
```

**Structure Decision**: This feature owns `services/telemetry/` outright, and owns
`contracts/schemas/telemetry.schema.json` together with
`contracts/schemas/config.telemetry.schema.json`. It adds `telemetry.json` to the
existing `config/local/` and `config/droplet/` directories, which feature 005 owns;
the additions are additive and follow the shape fixed by
`config.common.schema.json`. It adds two named files to `tests/integration/`, a
shared directory where ownership is per file. It creates no new top-level directory.

It consumes, and does not modify: `libs/harness_core/` from feature 001, including the
shared sound-speed derivation that ADR-0005 places there and that this feature calls for
the persistence comparison;
`libs/harness_types/` and `client/src/generated/` from feature 006, which regenerate
from the schema added here; the residual reports and scheduler decision records
produced by feature 009's monitor and scheduler; and the coverage read port used to
obtain the persistence reference's values.

It adds nothing to `client/src/`. Displaying skill, staleness and the
not-beating-persistence statement is the client's work, in features 003 and 012.
