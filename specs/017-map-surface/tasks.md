---

description: "Task list for 017-map-surface"
---

# Tasks: The Map Surface

**Input**: Design documents from `/specs/017-map-surface/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested for this project. Test tasks are included. Three of them carry the
feature and each is watched failing before it is committed: the fetch count across an
announcement, the fetch count across a mode toggle, and the achromatic-encoding check.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US3)
- Paths are exact and relative to the repository root

## Path Conventions

This feature owns `client/src/map/` and `client/tests/map/`. Everything else it touches
it appends to: `client/src/App.tsx` (the shell's shared integration point),
`contracts/schemas/config.client.schema.json`, both destinations' `client.json`, and the
tracked placeholder at `client/public/config.json`. It writes nothing under `services/`,
`query/`, `deploy/` or `site/`, and it edits none of feature 012's modules.

---

## Phase 1: Setup

- [x] T001 Create `client/src/map/` and `client/tests/map/`.
- [x] T002 Append to `contracts/schemas/config.client.schema.json`: an optional `map`
  section carrying the destination's declared scenario extent and vertical range, and two
  optional keys under `query` — `cube_path` and `field_parameter`. Optional, so a document
  without them renders a statement rather than failing to start.
- [x] T003 [P] Regenerate the type trees with `./scripts/generate_types.sh` and confirm
  `scripts/check_types_drift.sh` is clean.
- [x] T004 [P] Append the same keys to `config/local/client.json`,
  `config/droplet/client.json` and `client/public/config.json`, taking the extent from the
  numbers each destination's `query.json` already declares as its domain, and confirm
  `scripts/check_destination_parity.sh` is clean.
- [x] T005 [P] Extend `client/src/config/runtime.ts` to adopt the three new keys into the
  client's own vocabulary, and `client/tests/runtimeConfig.ts` to build them.

**Checkpoint**: the client can be told where the scenario is and where to ask for a field.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the parts every story draws through. Nothing here fetches, and nothing here
imports deck.gl.

- [x] T006 Implement `client/src/map/absence.ts`: the three statements — no field, no
  plan, no rendering surface — written once and shared, so the flat map and the volume
  cannot drift apart in what they say.
- [x] T007 Implement `client/src/map/extent.ts`: the extent with its provenance
  (announced grid bounds, served declaration, or nothing), re-derived on every
  announcement, plus the graticule derived from the extent's own span.
- [x] T008 [P] Implement `client/src/map/shading.ts`: the achromatic encoding, monotone
  in the normalised value, carrying magnitude as lightness and radius together.
- [x] T009 [P] Implement `client/src/map/renderingCapability.ts`: whether a drawing
  surface exists, and the reason where it does not — which is also the path every test
  under node takes.
- [x] T010 [P] Implement `client/src/map/mapReadiness.ts`: the record a capture waits on,
  published under one stable name beside `drognaRate`, reporting and never setting.

**Checkpoint**: extent, encoding, statements and readiness exist and are testable with no
browser.

---

## Phase 3: User Story 1 — The uncertainty field becomes visible (Priority: P1) 🎯 MVP

**Goal**: the forecast uncertainty field drawn over the scenario's geography, from data
the client genuinely fetched, ageing and refreshing as 012 dictates, and stating its
absence plainly when there is none.

**Independent Test**: with the stack running and a run published, the field is drawn
within the extent at the stated resolution; with no run, the extent and graticule render
with a plain statement that no field has been received.

### Tests for User Story 1

- [x] T011 [P] [US1] `client/tests/map/extent.test.ts`: the extent comes from the
  announcement's `grid_bounds` where one has been announced, from the served declaration
  where it has not, and from nothing otherwise; a second announcement with different
  bounds re-derives rather than remembers; the graticule lies inside the extent.
- [x] T012 [P] [US1] `client/tests/map/greyscale.test.ts`: every colour the encoding
  produces has equal red, green and blue channels, and both lightness and radius increase
  monotonically with the value — the machine-checkable form of SC-005 and FR-005.
- [x] T013 [P] [US1] `client/tests/map/fieldFetch.test.ts`: one announcement causes
  exactly one cube request; ten frames with no announcement cause none; the request names
  the announced collection, the announced extent and the configured parameter. **Watched
  failing** against a version that fetched on a frame.
- [x] T014 [P] [US1] `client/tests/map/fieldCube.test.ts`: a CoverageJSON grid is read
  into slices in `t, z, y, x` order with the axes the response declared; a response
  missing an axis or a range is refused with a reason rather than read as empty.
- [x] T015 [P] [US1] `client/tests/map/emptyStack.test.tsx`: with no run received the map
  region renders the extent, the graticule and the no-field statement, and draws no cell.
- [x] T016 [P] [US1] `client/tests/map/noRenderingSurface.test.tsx`: with no drawing
  surface the region states what is missing and why, and every other panel is unaffected.

### Implementation for User Story 1

- [x] T017 [US1] Implement `client/src/map/fieldRequest.ts`: where to ask for a cube and
  what to ask, assembled from the served document and the announcement alone.
- [x] T018 [US1] Implement `client/src/map/fieldCube.ts`: read a CoverageJSON Grid into a
  cube of depth slices in the client's own vocabulary, refusing a response it cannot read.
- [x] T019 [US1] Implement `client/src/map/layers.ts`: construct the deck.gl layer objects
  — the extent frame, the graticule and the field — from 012's `layerInputs` and this
  feature's encoding. This is the object 012 T032 recorded as missing.
- [x] T020 [US1] Implement `client/src/map/MapSurface.tsx`: the region, its statements,
  and the canvas where a drawing surface exists.
- [x] T021 [US1] Append the map to `client/src/App.tsx`: the mount, the one fetch caused
  by one announcement, and the cube folded into the existing frame record.
- [x] T022 [US1] Publish the readiness record from the surface as it draws, and as data
  attributes on the region (FR-010).

**Checkpoint**: the field is on the map, and an empty stack renders an honest map rather
than an empty one.

---

## Phase 4: User Story 2 — The route rides the same surface (Priority: P2)

**Goal**: the published plan drawn on the same map, per-vertex arrival conditions
readable, labelled a recommendation and nothing more.

**Independent Test**: publish a plan; the route is drawn with its vertices; selecting one
shows the conditions the trajectory response reported for that vertex's arrival, and a
declined vertex is shown as declined.

### Tests for User Story 2

- [x] T023 [P] [US2] `client/tests/map/routeOnMap.test.ts`: the drawn path has one vertex
  per published waypoint in sequence, and an empty recommendation draws no path.
- [x] T024 [P] [US2] `client/tests/map/declinedVertex.test.tsx`: a vertex the response
  declined is drawn and marked declined with its reason — never omitted, never invented —
  and its marking survives greyscale.
- [x] T025 [P] [US2] `client/tests/map/noPlan.test.tsx`: with no plan published no route
  is drawn and the absence is stated.

### Implementation for User Story 2

- [x] T026 [US2] Extend `client/src/map/layers.ts` with the route path and vertex layers
  built from 012's `routeLayerInputs`, and the declined marking. This is the object 012
  T038 recorded as missing.
- [x] T027 [US2] Mount the route on the surface and connect vertex selection to 012's
  existing `ArrivalTimeControl`, so one selection serves both.

**Checkpoint**: both layers that motivated the map are on it.

---

## Phase 5: User Story 3 — The volume mode (Priority: P3)

**Goal**: the same fetched cube as a three-dimensional volume with a labelled depth axis,
entered and left in one interaction and without a fetch.

**Independent Test**: toggle into volume mode and back; the same run's data is shown in
both, no state is lost, and the depth axis is labelled depth, positive down.

### Tests for User Story 3

- [x] T028 [P] [US3] `client/tests/map/volumeMode.test.ts`: the volume is built from the
  same cube the flat map drew, its depth axis is labelled positive down, and the cell
  count across all slices matches the cube.
- [x] T029 [P] [US3] `client/tests/map/noFetchOnToggle.test.tsx`: toggling into volume
  mode and back issues no request at all. **Watched failing** against a version that
  refetched on entering the mode.
- [x] T030 [P] [US3] `client/tests/map/volumeEmpty.test.tsx`: with no field received the
  volume states the empty case with the identical sentence the flat map uses.

### Implementation for User Story 3

- [x] T031 [US3] Implement the volume view in `client/src/map/layers.ts` and the depth
  axis labelling, drawn in the cube's own coordinates under an OrbitView.
- [x] T032 [US3] Implement `client/src/map/VolumeToggle.tsx` and hold the mode in the
  surface, so entering and leaving is one interaction and touches no fetch.

**Checkpoint**: the teaching view exists, and looking at it fetches nothing.

---

## Phase 6: Polish & Cross-Cutting

- [x] T033 Implement `client/src/map/selection.ts` and the picked-cell panel: value,
  position, depth and the simulation time the cell belongs to, taken from the fetched cube
  (FR-009, SC-002), with `client/tests/map/selection.test.ts`.
- [x] T034 [P] Style the map region in `client/src/styles.css`, achromatic throughout,
  yielding space on a narrow viewport rather than pushing the honesty statement or the
  liveness panels out of view.
- [x] T035 [P] Run `./scripts/gates.sh` and `uv run pytest`, and confirm the client still
  carries exactly two `harness:allow-wallclock` markers and no third (012 T042's rule,
  which this feature must not break).
- [x] T036 [P] Run `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:capture`, `pnpm test`
  and `pnpm build`.
- [x] T037 Bring the local stack up and take a glance capture against it, and record what
  the empty-stack map actually looks like rather than what it was expected to look like.
  **Done, and it was worth doing four times.** The map is the first panel on the page: the
  extent, its graticule at the spacing the destination declares, and the sentence saying no
  field has been received. With the loop not yet live that is the whole picture, and it
  reads as an empty ocean with a scale on it rather than as a panel that failed. Four
  defects were visible there and in none of the tests:

  - The rendering probe obtained a real WebGL context on every render, so Chromium
    discarded the oldest — deck.gl's own — and the map went blank while every probe
    reported success. The console said so and nothing else did.
  - The served graticule spacing was configuration that did nothing: the surface chose its
    own and never read the declared one.
  - Volume mode with nothing published drew a blank rectangle, because the box was only
    built when there was something to put in it. It is geometry, like the graticule, and is
    now drawn either way with its depth range stated.
  - The box was written as three paths and its four uprights were not drawn at all — a path
    layer extrudes a ribbon along each segment's direction and a vertical edge has none — so
    it appeared as two floating rectangles with nothing joining them. Drawn as twelve lines
    now, with a test that was watched failing on the eight-edge version.

  Three of the four were invisible to a test that did not open a browser, which is the
  argument for this task existing at all.
- [x] T038 Tick feature 012's `tasks.md` T032 and T038 with a note pointing here, as this
  feature's spec instructs, and record in `docs/architecture/delivery-plan.md` that 017 is
  no longer "specified; no plan or tasks".

---

## Dependencies

Phase 1 → Phase 2 → US1 → US2 → US3 → Phase 6. US2 and US3 both depend on US1's surface
and on nothing else; within a phase the `[P]` tasks touch different files.

## What is deliberately not in this list

- **A basemap, or any tile.** FR-002 forbids it. The graticule and the extent frame are
  what orient a reader, and a synthetic ocean has no coastline to be honest about.
- **EDR query-shape overlays on the volume.** Out of scope by the spec's last assumption;
  they arrive with the client round that depends on this feature and 018.
- **Any edit to feature 012's modules.** They are consumed as they stand. Needing to
  change them would have meant their recorded partials were wrong about which half was
  finished, and they were not.
- **Anything that makes a run happen.** The control loop's live wiring is lane A's. This
  feature draws what is fetched and states what is not, which is demonstrable either way.
