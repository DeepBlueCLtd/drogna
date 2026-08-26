# Implementation Plan: Control Loop, Route and Uncertainty Visualisation

**Branch**: `012-visualisation` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-visualisation/spec.md`

## Summary

Add to drogna's browser client the four things SRD §5.9 asks of it beyond the shell:
the control loop cycling in real time with messages drawn crossing component
boundaries and the last message on any boundary inspectable against its schema; the
simulation speed control, including a rate of zero as a legitimate pinned rate; the
uncertainty field decaying between runs and refreshing when one is published; and the
planned route as a four-dimensional curve with a time control showing conditions
forecast for the moment of arrival. Across all of it, the display distinguishes the
bespoke core from the well-chosen plumbing rather than hiding the difference, and
nothing but a genuine heartbeat ever lights a component.

## Technical Context

**Language/Version**: TypeScript 5, React, Deck.gl, built with `pnpm`.

**Primary Dependencies**: the existing client from feature 003 — its component layout,
its broker connection and its liveness handling; `client/src/generated/` types from
feature 006; Deck.gl layers for the map, the uncertainty overlay and the route;
an MQTT-over-WebSocket client for the control namespace; a JSON Schema validator for
the inspector's validation state.

**Storage**: None. Bounded in-memory message buffers per topic, discarded on reload.

**Testing**: `vitest` for unit and component tests, colocated with the modules they
cover under `client/src/`. End-to-end behaviour that needs a real broker and a real
clock is exercised through the existing end-to-end setup; screenshot capture itself
belongs to feature 016 and is not built here.

**Target Platform**: Modern browsers, served by the client container in the single
Docker Compose configuration, reached through the reverse proxy on both destinations.

**Project Type**: Browser client additions. No new service, no new message contract:
this feature is a consumer of contracts owned by features 009, 010 and 011.

**Performance Goals**: Sustained interactive frame rate while the loop is running at
the maximum supported simulation rate; message buffers bounded so an hour-long
demonstration does not degrade; uncertainty overlay refresh within one animation cycle
of a `ctl/run-published` message.

**Constraints**: No host time as a source of truth anywhere (one narrow, marked and
argued exemption, below). No mocked or synthesised traffic, no demo mode, no fixture
mode. No hand-written message or API types. No broker URL, query layer path or topic
prefix as a literal in source. No control that accepts, tasks or executes a route.

**Scale/Scope**: Four user-visible additions plus one cross-cutting visual treatment,
over a layout of eighteen components and the boundaries between them.

## Constitution Check

*GATE: passed at planning time; re-check before implementation of each user story.*

| Principle | How this feature complies |
|---|---|
| **I. No Wall-Clock Time (non-negotiable)** | Every displayed time, every state transition and every animation that represents the passage of simulation time is driven by the clock service. When the clock is unreachable, displayed time stops and is marked stale rather than falling back to the browser. Two exemptions apply, both of them the constitution's own and neither of them a violation: liveness evaluation in real time (ADR-0006) and interpolation between two received clock samples in the render path (ADR-0007). Each is marked `// harness:allow-wallclock` with its ADR named, each is confined to one module, and the gate flags every other use. The render-path exemption is bounded by three rules in FR-013: never extrapolate past the latest sample, every arriving sample snaps the display and discards the interpolation, and no value derived from it leaves the render path. |
| **II. Seeded Randomness and Deterministic Replay** | The client draws no random numbers for anything an observer can see: no jitter, no randomised layout, no `Math.random` in a shipped path. Layout positions are derived from the static architectural description, so the same scenario renders identically on replay, which is also what makes capture comparable. |
| **III. Generated Types Only (non-negotiable)** | Every control message shape and every query layer response type comes from `client/src/generated/`. The inspector displays the schema name from the same generated source, so the contract shown and the type used are the same artefact. No hand-written mirror of a payload exists in this feature. |
| **IV. No Literal Paths or Hosts (non-negotiable)** | Broker URL, query layer base path, topic prefixes, buffer depths and liveness windows arrive as runtime configuration served to the client, following the rule that binds the client as well as the services. |
| **V. No Tracked Entities (non-negotiable)** | The client renders measurements, forecast and uncertainty fields, sampling recommendations and telemetry. The platform is a position marker; the route is a recommendation over cells and is labelled as one. The forbidden-vocabulary gate covers the client additions. |
| **VI. Honest Ports** | The client introduces no port and dresses nothing as one. It is a consumer: broker in, query layer in, pixels out. The core-versus-plumbing treatment is where port honesty becomes visible — the display names what is genuinely bespoke rather than implying the whole system is. |
| **VII. Liveness, Not Configuration (non-negotiable)** | Illumination comes from `ctl/heartbeat` alone, beginning with the simulation clock's heartbeat, which is drogna's first liveness signal (SRD FR-52). Liveness windows are evaluated in real time and the simulation time a heartbeat carries is payload (ADR-0006), so pinning the rate to zero for a capture leaves a running system lit instead of greying it out. Classification changes appearance, never illumination. There is no demo mode, no fixture mode and no populate-for-the-screenshot path; a transit is drawn only for a message genuinely received, and a message addressed to a silent component does not light it. |
| **VIII. Recommendations, Not Decisions** | The route is rendered and labelled a recommendation. There is no control to accept, task, execute or order it, and an automated interaction and vocabulary test asserts as much. Rendering is explicitly permitted by the principle; commanding is not, and the interface offers no way to. |
| **IX. Ground Truth Is Scored, Not Assumed** | Where telemetry reports that the forecast is not beating its persistence reference, the client says so in plain words with the sample count and both errors beside it, which is the display half of FR-38. Stale statistics are rendered stale. The client never presents a figure more confidently than telemetry stated it. |
| **X. Default Deny at the Boundary** | The client is served behind the reverse proxy under whatever path policy feature 013 sets. It adds no new exposed path and no direct route to a store. Planned routes and measurement locations are visible here because this is the internal display, not a downstream release; nothing in this feature exports anything. |

No violations. Complexity Tracking is therefore empty and omitted.

This feature's Complexity Tracking table previously carried one entry: reading the
browser's animation frame timestamp to interpolate between two clock samples. That was
the right way to hold it while it was undecided, and it is now decided. ADR-0007 grants
the exemption, the constitution carries it, and FR-013 states the three rules that bind
it. Recording it as a standing violation would misdescribe it: what remains is not a
debt but a boundary, and the discipline that keeps it a boundary is the third rule —
that nothing derived from the frame timestamp leaves the render path — which is the one
that would be broken silently and is therefore asserted by a test (SC-014) rather than
by review.

## Project Structure

### Documentation (this feature)

```text
specs/012-visualisation/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/
├── loop/                                  NEW — the cycle and its transits
│   ├── CycleView.tsx                      sense/decide/act/publish, active phase
│   ├── Transit.tsx                        one message crossing one boundary
│   ├── transitRouting.ts                  topic -> boundary, from the static
│   │                                      architectural description
│   ├── coalesce.ts                        burst handling, coalesced counts
│   └── __tests__/
├── inspector/                             NEW — the message that just passed
│   ├── MessageInspector.tsx               payload, topic, simulation time
│   ├── SchemaPanel.tsx                    the governing schema beside the instance
│   ├── validation.ts                      validation state, invalid shown as invalid
│   └── __tests__/
├── controls/                              NEW — simulation speed
│   ├── SpeedControl.tsx                   request a rate; show the rate in force
│   ├── rateState.ts                       requested vs acknowledged, zero as pinned
│   ├── captureReadiness.ts                acknowledged rate readable from outside
│   └── __tests__/
├── legibility/                            NEW — core versus plumbing
│   ├── classification.ts                  static architectural fact, per component
│   │                                      and per boundary; never lights anything
│   ├── BespokeDetail.tsx                  names the bespoke logic a component holds
│   └── __tests__/
├── uncertainty/                           NEW — the field over time
│   ├── UncertaintyLayer.ts                Deck.gl layer, downsampling with the
│   │                                      displayed resolution stated
│   ├── decayFromProjection.ts             decay driven by the planner's projection
│   ├── QualityStatement.tsx               skill in plain words; stale as stale
│   └── __tests__/
├── route/                                 NEW — the 4D curve
│   ├── RouteLayer.ts                      horizontal path with depth
│   ├── ArrivalTimeControl.tsx             conditions at the moment of arrival
│   ├── trajectoryQuery.ts                 EDR trajectory with per-vertex timestamps
│   ├── RecommendationLabel.tsx            labelled a recommendation; no accept control
│   └── __tests__/
└── data/                                  EXTENDED — control-namespace subscription,
    ├── controlSubscription.ts             bounded per-topic buffers
    └── buffers.ts
```

**Structure Decision**: This feature adds to `client/src/` and to nothing else. It
creates and owns the directories `client/src/loop/`, `client/src/inspector/`,
`client/src/controls/`, `client/src/legibility/`, `client/src/uncertainty/` and
`client/src/route/`, together with their colocated `__tests__/` directories, and it
extends `client/src/data/` with the control-namespace subscription and its bounded
buffers. It touches no service, no schema, no store, no query layer configuration and
no deployment file. It creates no new top-level directory.

The client shell — the full component layout, liveness-driven illumination from
`ctl/heartbeat`, the landing page statement required by FR-01, the broker connection
and the map base — is feature 003's and is consumed here unchanged. This plan does not
restate 003's scope and does not modify its files beyond the additive extension of
`client/src/data/` named above.

It consumes, and does not modify: `client/src/generated/` from feature 006;
`contracts/schemas/{divergence,run-request,run-started,run-published}.schema.json`
from feature 009; `contracts/schemas/telemetry.schema.json` from feature 010;
`contracts/schemas/plan.schema.json` from feature 011; the EDR trajectory endpoint
served by feature 008's bespoke provider plugin (SRD FR-50); and the simulation clock
service and its heartbeat from feature 001.

Screenshot capture is feature 016's. What this feature owes it is a rate of zero that
pins the clock and an acknowledged rate readable from outside (SRD FR-53); it builds no
capture plumbing of its own.
