# Implementation Plan: Visual Capture — Three Mechanisms, One Browser

**Branch**: `016-visual-capture` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-visual-capture/spec.md`

## Summary

Build three separate screenshot mechanisms over one Playwright installation: a glance
that shows the client as it stands and touches nothing, a before/after pair that pins the
simulation clock to rate zero so the difference between two images means something, and a
curated capture that produces the durable images the blog publishes. Each has its own
entry point, its own configuration, its own output area, its own lifetime and its own
gate. They share the library that knows how to find things in the client, and nothing
else.

The separation is enforced by a test rather than by intention, and the argument for it is
recorded beside the code, because the natural instinct on seeing three similar scripts is
to merge them and the reasons not to are not obvious from the scripts themselves.

## Technical Context

**Language/Version**: TypeScript 5 with Playwright, run through the client's `pnpm`
workspace, as the constitution's technology section fixes for the browser client and for
capture.

**Primary Dependencies**: `@playwright/test`; a pixel comparison library for the pair's
difference; the client's own readiness signal; the clock's rate control as the client
exposes it. No new runtime dependency in the client itself.

**Storage**: Three areas, all located from the capture configuration file: a session area
and a branch-scoped area, both git-ignored, and the published-screenshot location owned by
feature 015, which is the only committed one.

**Testing**: `vitest` for the separation test and the fingerprint logic; Playwright's own
runner for the capture specs; a deliberately broken fixture tree to prove the separation
test fails when it should.

**Target Platform**: A pinned Playwright browser in a pinned container image, run locally
and in GitHub Actions. Both halves of a pair are always captured in one of the two, never
one each.

**Project Type**: Browser tooling. No service, no heartbeat, no participation in the
control loop.

**Performance Goals**: A glance reaches an image on disk in under ten seconds against an
already-running client. The pair and the curated capture have no time target; correctness
of the comparison is the whole point.

**Constraints**: The glance must not alter the running system; the pair must pin and
restore the clock rate, including on failure; no fixed sleeps anywhere; no mocked traffic
of any kind; only curated output is committed.

**Scale/Scope**: Three entry points, one shared application-knowledge library, one
workflow, sixteen features' worth of curated shots over the project's life.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — Capture is test-harness tooling, where the constitution
  permits host time. The plan does not use it anyway: every wait is on the client's
  readiness signal, and every simulation time recorded in a fingerprint or a provenance
  record comes from the clock. A fixed sleep is banned outright (FR-019), because a sleep
  is a host-clock dependency wearing a different hat and it is exactly what makes a pair
  irreproducible. Compliant.
- **II. Seeded Randomness and Deterministic Replay** — The pair's comparability rests on
  both halves running the same scenario from the same seed, which is recorded in the
  fingerprint and checked before a diff is produced. The curated provenance record carries
  the seed so a shot can be taken again. Compliant.
- **IV. No Literal Paths or Hosts** — The client address, the three output areas, the
  viewport and the device scale factor come from a capture configuration file validated
  against `config.capture.schema.json`. The workflow supplies the file's location.
  Compliant.
- **V. No Tracked Entities** — Screenshots are the one artefact that can carry forbidden
  material past a text scan, in the pixels. The curated mechanism captures the viewport
  only, masks any in-page hostname, and its provenance record carries no path, hostname or
  user name. Feature 015's publication gate reads text out of published images as a second
  line. Compliant.
- **VII. Liveness, Not Configuration (non-negotiable, and extended)** — The principle now
  forbids mocked traffic outright, and it lands squarely on this feature: the temptation to
  populate a screenshot is exactly what it rules out. There is no fixture mode and no demo
  mode, so the earliest capture work has one live component, the simulation clock, and its
  illumination transition is the first genuine before/after pair. FR-008 goes further and
  asserts that pinning the clock has not put components out of their liveness window. Under
  ADR-0006 it should not: cadence and liveness are real time, so a rate of zero stops
  simulated time and stops nothing else. The assertion stays as a regression test on that
  decision, so a component that reverts to a simulation-time cadence fails a capture loudly
  instead of publishing an all-grey pair. Compliant.
- **VI. Honest Ports** — No abstraction is placed over Playwright, and the three
  mechanisms are three scripts rather than one framework with three strategies. Compliant.

No violation requires justification. The three-way duplication is the requirement (PR-10),
not a violation of it, and the argument is recorded in the spec and beside the code.
Complexity Tracking is therefore omitted.

## Project Structure

### Documentation (this feature)

```text
specs/016-visual-capture/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
client/e2e/                             owned by this feature
├── shared/
│   ├── pages/                          page objects and selectors
│   ├── readiness.ts                    the settled signal every mechanism waits on
│   └── config.ts                        capture configuration load and validate
├── glance.config.ts                    own projects, own outputDir, own retries
├── pair.config.ts
├── curate.config.ts
├── specs/
│   ├── glance.spec.ts
│   ├── pair.spec.ts
│   └── curate.spec.ts
└── tests/
    ├── separation.test.ts              no cross-import, disjoint areas, one committed area
    ├── fingerprint.test.ts
    └── fixtures/merged-tree/           a deliberately broken tree the test must reject

scripts/capture/                        owned by this feature
├── glance/run.mjs                      touches nothing, session area, no gate
├── pair/
│   ├── run.mjs                         pin, capture, restore, fingerprint
│   ├── fingerprint.mjs
│   └── diff.mjs
├── curate/
│   ├── run.mjs                         candidates into a review area, commits nothing
│   └── sidecar.mjs                     the provenance record
└── README.md                           why these are three directories and not one

.github/workflows/
└── capture.yml                         pair on pull requests; curate on manual trigger only

contracts/schemas/
└── config.capture.schema.json          additive contribution
```

**Structure Decision**: This feature owns `client/e2e/`, `scripts/capture/` and
`.github/workflows/capture.yml`. It adds one schema file to `contracts/` additively. It
does not touch `client/src/`, which belongs to the client features; the only thing it asks
of the client is a readiness signal and the rate control the client already exposes under
SRD FR-49.

The three mechanisms are three directories under `scripts/capture/` and three Playwright
configuration files under `client/e2e/`, rather than one configuration with three projects
or one script with a mode flag. That is deliberate and is the point of PR-10: a flag on a
shared entry point is shared plumbing wearing a disguise, and the moment the mechanisms
share an entry point they begin sharing the gate, the retention rule and the clock
behaviour, which is precisely what must differ. The physical separation is what makes the
separation test in `client/e2e/tests/separation.test.ts` able to say anything.

`client/e2e/shared/` is the single permitted sharing point and is deliberately narrow:
selectors, page objects, the readiness signal and the configuration loader. Nothing in it
knows what a glance, a pair or a curated shot is, and the separation test asserts that no
capture policy leaks into it.

The published-screenshot location under `site/` is owned by feature 015. This feature's
curated mechanism writes candidates into a review area and a person moves them, so no
build step of this feature writes into another feature's directory.
