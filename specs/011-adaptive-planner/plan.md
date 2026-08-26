# Implementation Plan: Adaptive Sampling Planner

**Branch**: `011-adaptive-planner` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-adaptive-planner/spec.md`

## Summary

Build the planner (C-15): a component that maintains an uncertainty state over
planning cells — H3 in the horizontal, a separate index in depth — evaluates candidate
routes by simulating the collapse of uncertainty as each candidate is traversed,
selects one committed route as a prize-collecting problem under a budget, replans on a
receding horizon as fields and measurements arrive, and projects forward to say when
each region will fall below usable confidence. Uncertainty regrows at the local
decorrelation timescale tau, which SRD FR-05 defines as a field over the whole domain,
so every planning cell has a defined tau and none is special-cased. Everything it emits is a
recommendation published on `ctl/plan`. It commands nothing, addresses nobody, and
renders nothing. The derivation of the value function, the sensing model and the
selection heuristic is written up in
`docs/algorithms/informative-path-planning.md`, which this feature also owns.

## Technical Context

**Language/Version**: Python 3.11, in the repository's `uv` workspace.

**Primary Dependencies**: `harness_core` (clock port, RNG port, config loader, event
publication wrapper) from feature 001; `harness_types` generated Python types from
feature 006; `h3` for horizontal indexing; `numpy` for field arithmetic and the
collapse and regrowth updates; an MQTT client library for broker access.

**Storage**: None of its own. The planner reads published uncertainty fields through
the coverage read port at publication boundaries and holds its working uncertainty
state in process memory, keyed by planning cell. It does not query the observation
store; measurement arrivals reach it on `obs/#` and it retains only the last-informed
simulation time per cell.

**Testing**: `pytest`. The value function, the collapse and regrowth model, the
selection heuristic and the projection are all pure functions over hand-built fields
and are unit tested exhaustively in `services/planner/tests/`. Cross-component tests
in `tests/integration/` exercise replanning against published fields and observation
traffic.

**Target Platform**: Linux container under the single Docker Compose configuration
(feature 005), identical locally and on the droplet.

**Project Type**: One long-lived event-driven service plus one message contract and
one algorithm derivation document. No HTTP surface.

**Performance Goals**: A plan produced within the configured planning budget in
simulation time for the scenario's cell count and depth band count. The receding
horizon is only useful if a replan finishes well inside the replan cadence.

**Constraints**: Deterministic under a seed, including every tie-break; bounded memory
over planning cells; no wall-clock reads; no literal paths, hosts or ports; and the
hard constraint that nothing emitted may be an instruction.

**Scale/Scope**: One service, one message contract, one component config schema, one
algorithm document. Domain of the scenario's H3 cells at a configured resolution
crossed with a small number of depth bands.

## Constitution Check

*GATE: passed at planning time; re-check before implementation of each user story.*

| Principle | How this feature complies |
|---|---|
| **I. No Wall-Clock Time** | Arrival times along a route, regrowth intervals, replan cadence, horizon bounds, commitment windows and projected crossing times are all simulation time from `harness_core.clock.Clock`. A planner that measured elapsed time from the host clock would produce different routes on a fast machine, which is exactly the failure Principle I exists to prevent. |
| **II. Seeded Randomness and Deterministic Replay** | The selection heuristic's restarts, candidate sampling and tie-breaks all draw from `harness_core.rng.rng_for(stream)`. Plan identifiers derive from the seed and the plan ordinal. SC-012 asserts an identical plan sequence on replay. Dictionary iteration order is never used as a tie-break. |
| **III. Generated Types Only** | `contracts/schemas/plan.schema.json` is the single definition of the `ctl/plan` payload; Python types come from `libs/harness_types/`, TypeScript from `client/src/generated/`, and feature 012 renders from the generated types rather than a hand-written mirror. |
| **IV. No Literal Paths or Hosts** | One config file named by `HARNESS_CONFIG`, validated against `contracts/schemas/config.planner.schema.json` before any I/O. H3 resolution, depth bands, sensing decay lengths, budget, nominal speed, cadence, horizon, commitment window and margin, and the usable-confidence threshold all arrive from it. |
| **V. No Tracked Entities** | The data model is planning cells, uncertainty values, prizes, routes and projected crossing times. The sampling platform is a position, a depth and a budget. A recommended route over cells is not a track, and the forbidden-vocabulary gate covers the package, the schema and the algorithm document. |
| **VI. Honest Ports** | The planner introduces no new port. It consumes the clock port, the RNG port and the existing coverage read port. The selection heuristic is a function, not an interface: there is no second implementation in prospect, and wrapping it in a strategy abstraction would be interface-for-its-own-sake. |
| **VII. Liveness, Not Configuration** | The planner publishes a heartbeat on `ctl/heartbeat` carrying `planning`, `no-field` or `nothing-worth-sampling`. It publishes no claim about any other component. |
| **VIII. Recommendations, Not Decisions** | The principle this feature exists under, and the failure mode it owns. The schema carries no addressee, no tasking and no directive; an automated forbidden-vocabulary test runs over both the schema and every emitted payload; no consumer of `ctl/plan` actuates; and the planner emits no display text. Computing where sampling would most reduce uncertainty is decision logic, and it lives here precisely so that the boundary — who recommends, not who renders — is drawn in one visible place. |
| **IX. Ground Truth Is Scored, Not Assumed** | The selection heuristic's optimality gap is measured against exhaustive search on small hand-built instances and reported, rather than the heuristic being assumed good. The projected crossing times are checked against analytically derived values, and the tau values the planner evaluates are scored against the decorrelation timescale field recorded in the generator's ground-truth manifest (SRD FR-05, FR-04). No claim is made without its figure. |
| **X. Default Deny at the Boundary** | Planned routes are among the things explicitly withheld from downstream release (SRD FR-42). This feature publishes only on the internal control namespace and adds no exposed path; enforcement at the boundary is feature 013's, and this plan records the constraint so that no later convenience endpoint is added here. |

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/011-adaptive-planner/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/schemas/
├── plan.schema.json                       NEW — ctl/plan payload: committed route
│                                          with per-vertex H3 index, depth band and
│                                          arrival time; collapse-aware value; budget
│                                          consumption; projection report; plan and
│                                          superseded-plan identifiers; empty-route
│                                          reason. No addressee, no directive.
└── config.planner.schema.json             NEW

services/planner/                          C-15
├── src/harness_planner/
│   ├── __init__.py
│   ├── config.py                          load + validate before any I/O
│   ├── cells.py                           H3 horizontal index + depth index pairing
│   ├── uncertainty_state.py               spread + observation age, last-informed
│   │                                      time, regrowth at tau evaluated per cell
│   ├── sensing.py                         sensing footprint model
│   ├── collapse.py                        simulated collapse along a traversal
│   ├── value.py                           collapse-aware route value
│   ├── select.py                          prize-collecting selection under budget
│   ├── commitment.py                      receding horizon, commitment window, margin
│   ├── projection.py                      forward growth, crossing times per region
│   ├── publish.py                         ctl/plan, heartbeat
│   └── service.py                         subscription loop, wiring
└── tests/

docs/algorithms/
└── informative-path-planning.md           NEW — value function derivation, collapse
                                           and regrowth model, sensing footprint,
                                           orienteering formulation, heuristic and its
                                           measured optimality gap

config/local/planner.json
config/droplet/planner.json

tests/integration/
├── test_planner_replans_on_new_field.py
└── test_plan_carries_no_instruction.py
```

**Structure Decision**: This feature owns `services/planner/` outright, owns
`contracts/schemas/plan.schema.json` and `contracts/schemas/config.planner.schema.json`,
and owns `docs/algorithms/informative-path-planning.md`. It adds `planner.json` to the
existing `config/local/` and `config/droplet/` directories, which feature 005 owns;
those additions are additive and follow the shape fixed by
`config.common.schema.json`. It adds two named files to `tests/integration/`, a shared
directory where ownership is per file. It creates no new top-level directory.

It consumes, and does not modify: `libs/harness_core/` from feature 001;
`libs/harness_types/` and `client/src/generated/` from feature 006, which regenerate
from the schema added here; the uncertainty field published by feature 009's model
runner and announced by its publisher; the observation message shape from feature 007;
and the decorrelation timescale field tau — background and per-feature, both ground
truth — recorded in feature 004's manifest and evaluated by the environment generator
that authors it.

It adds nothing to `client/src/`. Rendering the route as a four-dimensional curve
through the forecast volume is feature 012.
