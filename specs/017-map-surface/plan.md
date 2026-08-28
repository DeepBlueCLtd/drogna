# Implementation Plan: The Map Surface

**Branch**: `017-map-surface` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-map-surface/spec.md`

## Summary

Build the drawable surface feature 012 assumed and feature 003 never delivered: a
tile-free deck.gl map over the scenario's own extent, with a graticule and an extent
frame, onto which 012's already-tested uncertainty and route layer inputs are mounted as
actual layer objects. Add the one thing 012 left out because it had nowhere to put the
result — the fetch of the published field itself — and an OrbitView volume mode that
draws the same fetched cube with its depth axis made spatial.

The surface is demonstrable against an empty stack, and that is a design constraint
rather than a convenience: extent, graticule and a plain statement that no field has been
received is the honest rendering of a harness whose loop has not yet turned. Nothing here
waits on feature 009's live wiring, and nothing here draws a cell that was not fetched.

**Artefacts**: this feature follows the repository's own convention of `spec.md`,
`plan.md`, `tasks.md` and nothing else — sixteen delivered features carry exactly those
three. What the spec-kit template would put in `research.md` is recorded below under
"What had to be established first", where it is read rather than filed.

## Technical Context

**Language/Version**: TypeScript 5 with React 18, built by Vite, as the constitution's
technology section fixes for the browser client.

**Primary Dependencies**: `@deck.gl/core`, `@deck.gl/layers` and `@deck.gl/react`, all
three already declared in `client/package.json` and — until this feature — imported by
nothing under `client/src`. No new runtime dependency is introduced, which is what the
spec's second assumption requires.

**Storage**: None. The client holds one fetched cube in memory and forgets it when the
next run is announced.

**Testing**: `vitest` in the existing node environment, with React components rendered
through `renderToStaticMarkup` as the client's other component tests already do. deck.gl
imports cleanly under node — measured, not assumed — so layer construction is testable
without a WebGL context; what is not testable there is rasterisation, and nothing in this
feature asserts anything about pixels.

**Target Platform**: The same browser the rest of C-18 targets, plus the headless
Chromium feature 016's capture mechanisms drive.

**Performance Goals**: SC-001's ten seconds from announcement to a drawn field. The
drawing budget is 012's existing `maximum_drawn_cells`, honoured through 012's own
`drawnField`, so the map inherits the stated-resolution behaviour rather than reimplementing
it.

**Constraints**: no request to any origin but the harness's own; no basemap tiles and no
web fonts; nothing drawn that was not fetched; every encoding legible in greyscale;
absence stated in words; readiness queryable without a fixed sleep.

**Scale/Scope**: one map-owned directory under `client/src/`, one appended block in the
client shell, two appended keys in the client configuration contract, and the two 012
modules mounted.

## What had to be established first

Four questions were answered against the tree before any of the design below was fixed.
Each changes what the feature can honestly do, and the last is left open on purpose.

1. **The client cannot list collections.** `proxy/templates/harness.conf.template`
   releases `= /released/<collection>` and `^~ /released/<collection>/` per released
   collection and default-denies everything else, so `GET /released` — the collections
   listing an OGC client would read an extent from — is refused. Collection metadata is
   therefore not a source of extent before a run exists.
2. **The announcement carries the grid's extent.** `run-published.schema.json` requires
   `grid_bounds`: minimum and maximum latitude, longitude and depth. Once a run is
   announced the map has a data-derived extent with no fetch at all, and it re-derives it
   from each announcement, which is the spec's edge case about a run whose grid differs
   from the previous one.
3. **Before any announcement there is no served extent at all.** The client configuration
   contract carries broker, clock, query, liveness and display, and none of them says
   where the scenario is. The spec's third assumption anticipated exactly this and put the
   remedy in scope: "surfacing it is in this feature's scope on the serving side as a
   minimal addition rather than a client-side literal". So `config.client.schema.json`
   grows an optional `map` section carrying the destination's declared extent, and both
   destinations' `client.json` declare it from the same numbers `query.json` already
   declares as the domain. Optional, not required, because the absence must render as a
   statement rather than as a startup failure — and because an optional section is the one
   whose absent path can be tested.
4. **The announced collection identifiers are not the ones the destination serves.**
   Open, and recorded rather than dissolved. The publisher announces
   `forecast-<run_id>` and `uncertainty-<run_id>` (`services/publisher/.../catalogue.py`);
   the query layer serves one collection named `forecast`
   (`query/pygeoapi-config.yaml.template`); the proxy releases `drogna-forecast` and
   `drogna-uncertainty` (`config/local/proxy.json`). Three names for two things. Feature
   012's trajectory query already addresses the announced identifier and has never been
   exercised against a live publication, so this is a pre-existing disagreement that this
   feature inherits rather than introduces — the field fetch is built the same way, on the
   announced identifier, because that is what SRD FR-31 says the identifier is for. The
   consequence is stated on the display: a fetch that 404s renders as "the field could not
   be read", with the identifier that was asked for, which is the shape in which this
   disagreement will be visible the first time the loop publishes. It belongs to the query
   and control-loop lanes, not to this one, and this plan does not reach into either.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — the map reads no clock. The simulation instant a drawn cell
  belongs to comes from the fetched cube's own time axis; the instant a route vertex is
  reached comes from the planner. The client carries exactly two `harness:allow-wallclock`
  markers (012 T042) and this feature adds no third: deck.gl's own animation is not used,
  and the surface redraws when its inputs change rather than on a timer. Compliant.
- **II. Seeded Randomness and Deterministic Replay** — nothing here is stochastic. The
  drawing order is the field's own row-major order and the layer identifiers are derived
  from the run identifier, so two replays of the same scenario produce the same draw calls
  in the same order, which is what SC-004 rests on. Compliant.
- **III. Generated Types Only** — the announcement is read through
  `client/src/generated/messages/run_published.ts`; the configuration through the
  generated client-configuration types; the plan through the generated plan types. The
  new `map` section is added to the master under `contracts/schemas/` and regenerated into
  both languages, never hand-written on either side. The CoverageJSON cube response has no
  master and is read defensively in the client's own vocabulary, exactly as 012's
  `readTrajectory` reads the trajectory response — the same boundary, the same treatment,
  and `check_handwritten_types.py` is the arbiter of whether that remains acceptable.
  Compliant.
- **IV. No Literal Paths or Hosts** — the cube path, the field parameter and the extent
  all arrive in the served document. No URL, path or collection identifier is written into
  `client/src/map/`. Compliant.
- **V. No Tracked Entities** — the map draws a field, a graticule and a recommended route.
  The route is the simulated platform's own, which principle V's amendment names
  explicitly as permitted. Nothing on the surface is an entity the harness did not place.
  Compliant.
- **VII. Liveness, Not Configuration (non-negotiable)** — the sharpest gate on this
  feature, because a map is the single most tempting place in the harness to draw
  something plausible while nothing is running. There is no path in this design that draws
  a cell from anything but a fetched response: the field comes from one fetch caused by
  one announcement, the route from a published plan, and the graticule from the extent,
  which is drawn as geometry and never as data. The empty stack renders the frame and a
  sentence. `tests/no-mock.test.ts` already reads every file under `client/src` for the
  vocabulary of synthesis and will read these too. Compliant.
- **VIII. Recommendations, Not Decisions** — the route is drawn and labelled by 012's
  existing `RecommendationLabel`; the map adds a curve and vertices and no control that
  accepts, tasks or executes anything. 012's `noInstruction` test reads the rendered
  output and will read the map's. Compliant.
- **X. Default Deny at the Boundary** — the client asks only for collections it was told
  about, at paths the served document names, through the one released prefix. It cannot
  enumerate and does not try. Compliant.

Two additional rules bind and are not principles. Feature 016's FR-019 forbids a fixed
sleep in a capture path, which this feature meets by publishing a readiness record the
capture can wait on. PR-08's greyscale legibility is met by removing hue from the
question entirely: every encoding on the surface is achromatic, so magnitude is carried
by lightness and size together and a greyscale print loses nothing at all.

No violation requires justification. Complexity Tracking is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/017-map-surface/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/map/                     owned by this feature
├── extent.ts                       the extent, its provenance, and the graticule
├── shading.ts                      the achromatic encoding; monotone, hue-free
├── fieldRequest.ts                 where to ask for a cube and what to ask
├── fieldCube.ts                    a CoverageJSON grid read into slices and a volume
├── selection.ts                    what a drawn cell reports when it is picked
├── absence.ts                      the statements, written once and shared
├── mapReadiness.ts                 the record a capture waits on
├── renderingCapability.ts          whether a drawing surface exists, and why not
├── layers.ts                       deck.gl layer objects, from 012's layer inputs
├── MapSurface.tsx                  the region: statements always, canvas when able
└── VolumeToggle.tsx                one interaction between flat and volume

client/src/App.tsx                  appended to, never restructured
client/tests/map/                   this feature's unit tests

contracts/schemas/
└── config.client.schema.json       appended: an optional `map` section, a cube path,
                                    and the field parameter's name

config/local/client.json            appended, both destinations, same keys
config/droplet/client.json
client/public/config.json           the tracked placeholder the dev server serves
```

**Structure Decision**: this feature owns `client/src/map/` and `client/tests/map/`
outright. Everything else it touches is appended to.

`client/src/App.tsx` is the client shell's integration point, which the delivery plan
names as a shared append-only coordination point for this feature and 018 alike. The map
arrives there as one imported component, one fetch caused by one announcement, and one
piece of state — the fetched cube — folded into the existing `LoopView` record the way
the route and the overlay already are. No existing block moves.

The regenerated type trees under `client/src/generated/config/` and
`libs/harness_types/config/` are written by feature 006's generator chain, never by hand.

Three things are deliberately **not** built here:

- **No basemap.** Not a missing feature and not deferred: FR-002 forbids fetching a tile,
  and a tile-free surface over a synthetic ocean is the honest picture. The graticule and
  the extent frame are what tell a reader where they are.
- **No query-shape overlays on the volume.** The EDR anatomy is explicitly out of scope
  in the spec's last assumption and arrives with the client round that depends on this
  feature and 018.
- **No change to 012's modules.** `UncertaintyLayer.ts`, `RouteLayer.ts`, `overlay.ts`
  and `trajectoryQuery.ts` are consumed exactly as they stand. If mounting them required
  editing them, the claim that their data sides were finished would have been wrong, and
  it is not.

## Design

### The extent, and where it came from

One value with its provenance attached, because "where is this map" and "how does it know"
are the same question for a surface that must not invent geography.

| Source | When | What it gives |
|---|---|---|
| the announcement's `grid_bounds` | a run has been announced | the published grid's own extent, three axes |
| the served `map.extent` | no run yet, document declares one | the destination's declared scenario extent |
| nothing | no run, no declaration | the statement, and no frame drawn |

Re-derived on every announcement rather than remembered, and the display names which of
the three it is on. The graticule spacing is chosen from the extent's own span by a pure
rule, so a wider extent does not produce a black rectangle of meridians.

### The field, fetched once per announcement

`ctl/run-published` moves 012's `overlay` state, exactly as it does today. This feature
adds the consequence 012 could not write: one cube query against the announced uncertainty
collection, at the extent the announcement stated, for the parameter the served document
names. No timer, no interval, no retry — the same promise 012's `overlay.ts` makes about
freshness, and it is tested the same way, by counting fetches against announcements.

The response is a CoverageJSON Grid with axes `x`, `y`, `z`, `t` and ranges in `t, z, y, x`
order. It is read into a cube of depth slices. The flat map draws one slice through 012's
`drawnField` and `layerInputs`, so downsampling and its stated resolution are 012's
behaviour unchanged; the volume draws every slice of the same cube. Switching between them
fetches nothing, which is FR-006 and SC-006 and is asserted by a fetch count across a
toggle.

### The encoding, and greyscale

Magnitude is drawn twice: as lightness and as radius, both monotone in the normalised
value, both achromatic. Hue carries nothing anywhere on the surface — not state, not
magnitude, not declination — so PR-08 is met by construction rather than by a palette
chosen carefully. A test asserts the red, green and blue channels are equal for every
value in the range and that both encodings increase with it, which is the machine-checkable
form of SC-005.

### Absence, in three shapes

No field, no plan, and no rendering surface are three different absences and each gets its
own sentence, written once in `absence.ts` and shared between the flat map and the volume.
Story 3's third acceptance scenario asks that volume mode state the empty case "exactly as
the flat map states it", and sharing the constant is the form of that claim which cannot
drift.

The no-rendering-surface case preserves feature 003's shell-first ordering: the region
renders its statement, every other panel renders normally, and nothing throws. It is also
the path every unit test takes, because there is no WebGL context under node — so the
honest-degradation path is the most exercised path in the suite rather than the least.

### Readiness

A record on the page's global scope under one stable name, beside `drognaRate`, and the
same facts as data attributes on the map region: whether an extent is known and from
where, which run's field is drawn, how many cells were drawn and at what stride, which
mode is showing, and whether the surface has drawn its current inputs. A capture waits on
the last of those. Nothing reads back out of it, exactly as `captureReadiness` reports and
cannot set.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` in `client/`.
- `./scripts/gates.sh` for the literal-path, wall-clock, vocabulary and drift gates over
  the additions, and `uv run pytest` for the generated-type registration.
- The glance capture against a running local stack: `dockerd &`,
  `./scripts/run_local.sh`, then `HARNESS_CONFIG=config/local/capture.json node
  scripts/capture/glance/run.mjs`. With the loop not yet live this is the empty-stack
  picture, and that it is a *legible* empty-stack picture is the acceptance criterion for
  story 1's fourth scenario.
- Every new check is watched failing on the thing it describes before it is committed, and
  the commit message says so.

## Complexity Tracking

> Not required: the Constitution Check above records no violation.
