# Implementation Plan: Greyed-Out Component Shell

**Branch**: `003-component-shell-client` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-component-shell-client/spec.md`

## Summary

Build the browser client's first surface: the whole component layout drawn from day one, every
component dark until a heartbeat says otherwise, and a plain statement that this is a learning
harness with synthetic data and fake numerics. Illumination comes from heartbeats received on
`ctl/heartbeat` and from nothing else, and the liveness window is evaluated in simulation time
taken from the clock service, not in browser time — which is what stops Constitution I and
Constitution VII from being quietly broken by a display that ages on the viewer's clock.

The design centre is a pure liveness reducer: heartbeats and simulation time in, per-component state
out. Everything else — the transport, the fixture feed for capture, the rendering — is arranged
around keeping that function's inputs honest. The fixture feed answers SRD §11 open question 3 by
injecting recorded heartbeats at the transport boundary, so what the capture pipeline exercises is
the real illumination path.

## Technical Context

**Language/Version**: TypeScript 5, React, built with Vite. `pnpm` as the package manager.

**Primary Dependencies**: React; `deck.gl` as a package dependency for the map surfaces later
features need, unused by this feature's diagram; an MQTT-over-WebSocket client for the
`ctl/heartbeat` subscription; a JSON Schema validator for the runtime configuration document and
for inbound heartbeats.

**Storage**: None. The client holds liveness state in memory for the life of the page.

**Testing**: `vitest` for unit tests, with the liveness reducer tested as a pure function.
Playwright drives the fixture scenarios; the capture plumbing itself belongs to feature 016.

**Target Platform**: Modern browsers, desktop and phone widths. Served as static assets behind the
reverse proxy.

**Project Type**: Browser client (C-18).

**Performance Goals**: Complete dark layout and honesty statement painted within two seconds over
the droplet link on a cold cache. Rendering throttled to the frame budget at high clock rates while
every received heartbeat is still folded into liveness state.

**Constraints**: No browser clock in any operational path. No configuration may light a component.
One permitted literal: the relative bootstrap URL of the runtime configuration document. The client
publishes nothing on the broker.

**Scale/Scope**: Eighteen component nodes, the control loop cycle, one status region, one legend,
six fixture scenarios.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design.*

- **I. No Wall-Clock Time**: The client reads simulation time from the clock service's tick stream.
  The liveness window is evaluated in simulation time. No `Date.now`, `new Date` or
  `performance.now` appears in operational code; the wall-clock gate delivered by feature 001 covers
  TypeScript and proves it. Compliant.
- **II. Seeded Randomness**: The client makes no stochastic choices. Fixture scenarios are recorded
  sequences, not generated ones. Compliant.
- **III. Generated Types Only**: `contracts/schemas/heartbeat.schema.json` and
  `contracts/schemas/config.client.schema.json` are authored here as neutral masters. The
  TypeScript types for both are generated into `client/src/generated/` by feature 006's chain. Until
  that chain lands, this feature validates against the schema at runtime and imports no hand-written
  duplicate of either shape; the interim arrangement is recorded in the spec's Assumptions rather
  than left implicit. Compliant.
- **IV. No Literal Paths or Hosts**: Runtime configuration arrives as a served document, validated
  before any transport opens. The single bootstrap relative URL carries an inline exemption marker
  with its reason. Compliant, with one recorded exemption.
- **V. No Tracked Entities**: The client displays component liveness and nothing else at this stage.
  The honesty statement of FR-01 is delivered here. Compliant.
- **VI. Honest Ports**: No abstraction is introduced over the broker connection beyond the thin
  transport boundary the fixture feed also uses, which exists to keep the tested path and the real
  path identical rather than to promise pluggability. Compliant.
- **VII. Liveness, Not Configuration**: The principle this feature exists to satisfy. The liveness
  reducer takes heartbeats and simulation time and nothing else; a unit test asserts that
  configuration cannot change its output; unmapped live components are shown rather than dropped;
  the fixture feed is traffic, not configuration. Compliant.
- **VIII. Recommendations, Not Decisions**: Not touched.
- **IX. Ground Truth Is Scored, Not Assumed**: Not touched. Lit means heard from, and the page says
  so rather than implying more.
- **X. Default Deny at the Boundary**: The client is read-only on the broker and publishes nothing.
  The fixture feed is absent from deployed builds. Compliant.

No violations beyond the recorded bootstrap-URL exemption, which the constitution's own wording
permits as a marked exemption. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/003-component-shell-client/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
client/
├── package.json                     pnpm, vitest, vite, react, deck.gl
├── tsconfig.json
├── index.html                       carries the FR-001 statement in the initial payload
├── src/
│   ├── main.tsx                     bootstrap: fetch config, validate, then start transport
│   ├── config/
│   │   └── runtime.ts               the single permitted literal, marked
│   ├── layout/
│   │   ├── components.ts            the layout map: nodes, edges, bespoke-or-plumbing
│   │   └── ComponentDiagram.tsx     the SVG diagram, the loop, the legend
│   ├── liveness/
│   │   ├── reducer.ts               pure: heartbeats + simulation time -> per-component state
│   │   └── window.ts                simulation-time window evaluation
│   ├── transport/
│   │   ├── boundary.ts              the seam both the broker client and the fixture feed use
│   │   ├── mqtt.ts                  read-only subscription to ctl/heartbeat
│   │   └── clock.ts                 tick stream client, staleness detection
│   ├── fixtures/
│   │   ├── scenarios/               six recorded scenarios
│   │   └── feed.ts                  capture builds only
│   ├── generated/                   GENERATED TS types (feature 006) — not edited here
│   └── ui/
│       ├── HonestyBanner.tsx
│       ├── ClockState.tsx
│       └── ConnectionState.tsx
└── tests/
    ├── reducer.test.ts
    ├── window.test.ts
    ├── validation.test.ts
    └── bootstrap.test.ts

contracts/schemas/
├── heartbeat.schema.json
└── config.client.schema.json
```

**Structure Decision**: This feature owns `client/` in its entirety and the two schemas
`contracts/schemas/heartbeat.schema.json` and `contracts/schemas/config.client.schema.json`, both
created here as the first feature to need them and additive under the repository ownership rule.
`client/src/generated/` is reserved and left empty: it is written by feature 006's generator chain
and never edited by hand.

The feature creates nothing under `services/`, `deploy/` or `proxy/`. Serving the built assets,
exposing the broker's WebSocket listener and putting the shell on the droplet belong to the
deployment and proxy features, which consume this feature's build output and its runtime
configuration schema.
