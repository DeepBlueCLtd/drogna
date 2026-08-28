---

description: "Task list for 023-edr-query-composer"
---

# Tasks: The EDR Query Composer

**Input**: Design documents from `/specs/023-edr-query-composer/`

**Prerequisites**: `plan.md`, `spec.md`

**Tests**: Requested (FR-016). Every budget and refusal is watched failing on the fault it
describes before it is trusted, and the commit message says so.

## The split, stated once

SRD §10: the composer's **client half waits on the operator plane standing and on feature
017's selection model; its query-layer half waits on neither.** Phases 1–6 below are the
query-layer half and are this session's work. Phases 7–8 are the client half: recorded
here so the gate is a note in the record rather than a memory, and **every task in them is
deliberately unticked with the gate named**. An unticked task with an explanation is a
decision, not an oversight.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: The user story served (US1..US6 from spec.md)
- Paths are exact and relative to the repository root

## Path Conventions

The query-layer half owns the new modules under `query/plugins/` and extends feature 008's
additively. Shared files are append-only under the usual rules:
`tests/unit/test_generated_models.py`, `scripts/gates.registry`, root `pyproject.toml`.
The vendored `contracts/openapi/query-layer.openapi.json` is refreshed through the chain,
never hand-edited.

---

## Phase 1: Setup — budgets and configuration

- [x] T001 Grow `query/plugins/schemas/config.query.schema.json`: four new required
  limits (`radius_maximum_cells`, `area_maximum_cells`, `corridor_maximum_samples`,
  `locations_maximum_locations`) and a required `locations` section under `query`
  carrying the fixed-position seeded features (id, name, longitude, latitude), with the
  deliberate absences (thermocline, drifter) argued in the descriptions.
- [x] T002 [P] Add the new limits and the `locations` section to
  `config/local/query.json` and `config/droplet/query.json`.
- [x] T003 [P] Extend `query/render_config.py` so `coverage_options` carries the
  `observations` and `locations` sections to the EDR provider.
- [x] T004 Add `tests/unit/test_locations_config_coherence.py`: for each destination, the
  features named under `query.locations` agree with `env_generator.json`'s seeded
  parameters — id and position — so the duplicated values cannot drift.

**Checkpoint**: both destinations declare every new budget; the provider can be handed
everything it needs.

---

## Phase 2: Foundational — geometry and response assemblies

- [x] T005 Implement `query/plugins/edr_geometry.py`: haversine distance with the Earth
  radius stated, ray-casting point-in-ring, per-vertex perpendicular offset for corridor
  routes, and distance-unit parsing (`km`, `m`; anything else refused with the unit
  named). Pure functions, no framework, no I/O.
- [x] T006 [P] Grow `query/plugins/coveragejson.py` additively: a composite-axis
  `MultiPointSeries` assembly for radius/area answers and a `CoverageCollection` assembly
  for corridor answers, both reusing the existing parameter and referencing blocks.
- [x] T007 [P] Unit tests `tests/unit/test_edr_geometry.py`: haversine against known
  figures, ring membership including boundary cases, offsets against closed-form
  expectations.

**Checkpoint**: everything the four types compute with exists and is tested without
pygeoapi in the room.

---

## Phase 3: Radius and area (US1, US2)

- [x] T008 [US1] Implement `query/plugins/edr_region.py`: node selection inside a polygon
  ring (area) or within a great-circle distance (radius); depths and times resolved as
  cube resolves them; cells counted **before** interpolation and refused over
  `area_maximum_cells` / `radius_maximum_cells` with the measured count and the limit
  named; empty selection refused naming the geometry and the run's domain; answers as the
  composite-domain coverage.
- [x] T009 [US1] Area accepts a single-ring `POLYGON` and refuses holes and multipolygons
  with the shape named; radius requires `within`/`within-units` and refuses a missing or
  unparseable distance naming the parameter.
- [x] T010 [P] [US1] Unit tests `tests/unit/test_edr_region.py`: selection semantics
  against the analytic field, budget refusals watched failing (plant an over-budget
  query, see the named refusal), empty-selection refusal, response shape.

**Checkpoint**: a drawn polygon or circle is genuinely answered, only inside itself, or
refused by name.

---

## Phase 4: Corridor (US3)

- [x] T011 [US3] Implement `query/plugins/edr_corridor.py`: cross-track offsets derived
  from the run's own grid spacing covering [-width/2, +width/2], centreline always
  included; each offset route sampled exactly as a trajectory (per-vertex times, depth
  rules, declined vertices); samples counted and refused over
  `corridor_maximum_samples` naming both factors and the limit; answers as a
  CoverageCollection of Trajectory coverages labelled with signed offsets.
- [x] T012 [US3] Corridor reads `corridor-width`/`width-units` at the established request
  seam (the framework does not pass them); missing width refused naming the parameter;
  `corridor-height`, `height-units`, `resolution-x`, `resolution-z` refused with the
  option named.
- [x] T013 [P] [US3] Unit tests `tests/unit/test_edr_corridor.py`: offset count from
  width and grid spacing, per-offset declined vertices, budget refusal watched failing,
  option refusals by name, values against the analytic field.

**Checkpoint**: the same line with a width answers differently from the line, and says
how.

---

## Phase 5: Locations (US5) and the widened provider

- [x] T014 [US5] Declare `contracts/schemas/edr-locations.schema.json` (the
  named-locations list: GeoJSON-compatible FeatureCollection, `kind` distinguishing
  `feature` from `sensor`, sensor entries carrying the simulation time they are current
  as of); run `./scripts/generate_types.sh`; register the master in
  `tests/unit/test_generated_models.py` (append-only).
- [x] T015 [US5] Implement `query/plugins/edr_locations.py`: the list assembled from the
  configured seeded features and one `DISTINCT ON` select of each thing's latest
  observation position through the select-only role (current position only, never a
  history); `bbox` filter honoured; `datetime` on the list refused with Constitution V
  as the stated reason; list counted against `locations_maximum_locations` and refused
  over it; `.../locations/<id>` answers the water column at the advertised point with
  cells counted against `cube_maximum_cells`; unknown identifier refused naming the
  known ones.
- [x] T016 [US5] Implement `query/plugins/edr_composer.py`:
  `DrognaComposerEDRProvider(DrognaTrajectoryEDRProvider)` re-declaring all eight query
  types through both advertisement mechanisms; point
  `query/pygeoapi-config.yaml.template` at it.
- [x] T017 [P] [US5] Unit tests `tests/unit/test_edr_locations.py`: two kinds
  distinguished, current-only sensor position (a superseded position is absent, not
  listed), list budget refusal watched failing, datetime-on-list refusal, unknown-id
  refusal, per-location column against the analytic field; the sensor-position SQL
  statement built and inspected without a database.
- [x] T018 [P] [US5] Extend `tests/unit/test_pygeoapi_version_pin.py`'s advertisement
  assertions to the widened provider: all eight types in `query_types` on the class
  itself and each a method in the class's own `__dict__`.

**Checkpoint**: everything the composer will offer is served or refused by name; nothing
is stubbed.

---

## Phase 6: SensorThings spatial predicate (US6), the contract, and the record

- [x] T019 [US6] Grow `query/plugins/sensorthings_entities.py` (Observations gains its
  geometry column) and `query/plugins/sensorthings_options.py`:
  `st_within(location, geography'POLYGON (…)')` parsed and composed by `and` with
  phenomenon-time comparisons; every other spatial function, property or geometry
  refused with its name; the in-memory row source filters through the same ring test
  the EDR area query uses; `query/plugins/sensorthings_provider.py`'s Postgres source
  gains the `ST_Within` clause with bound parameters.
- [x] T020 [US6] Amend the conformance statement in the same commit: the served
  statement's constants and `query/conformance.md` state the predicate exactly and keep
  every refusal listed.
- [x] T021 [US6] Write `docs/adr/0025-…`: the SensorThings widening under PR-03 —
  context, decision, the two rejected alternatives from the interview (client-side
  selection after a temporal query; an EDR items type over observations), consequences.
- [x] T022 [P] [US6] Unit tests `tests/unit/test_sensorthings_spatial.py`: parse,
  compose, refusals by name, malformed WKT refused, in-memory correctness, the SQL
  statement's shape; the refusal watched failing.
- [x] T023 [US6] Verify FR-81's serving half against the running stack: are a retained
  run's own bounds genuinely discoverable through what exists (the instances document,
  the manifest-quoting refusals, the responses' own domains)? Record the finding below,
  build nothing ahead of the client.
- [x] T024 Refresh the vendored contract through the chain against the running stack —
  `scripts/refresh_query_layer_spec.sh`, then `./scripts/generate_types.sh` — so the
  advertised query types, the emitted OpenAPI document and the served account widen
  together; update `query/README.md`'s path space and limits table in the same commit.
- [x] T025 Integration tests over a built store for each new type
  (`tests/integration/test_edr_region.py`, `test_edr_corridor.py`,
  `test_edr_locations.py`, spatial filtering added to `test_sensorthings.py` coverage),
  plus a stack-level answer per new query type through the running boundary; every check
  watched failing on the fault it describes.

**Checkpoint**: what is claimed, what is advertised and what is served agree; the record
says who watched each refusal fail.

---

## Phase 7: The composer surface (US1–US4) — GATED, client half

**Gate**: begins once the operator plane (021) is standing and 017's selection model
exists to build on (SRD §10). Unticked below by decision, not by neglect.

- [ ] T026 [US1] Composer mode on the map surface: guided sequence, step names, area
  drawing, live URL panel, execute-once fetch. *Gated as above.*
- [ ] T027 [US1] Area result rendered inside the drawn polygon only, labelled with the
  query that produced it. *Gated as above.*
- [ ] T028 [US2] Position and radius modes with the depth-profile companion view.
  *Gated as above.*
- [ ] T029 [US3] Trajectory and corridor modes: per-vertex times from announced
  simulation time, the section view, declined vertices named. *Gated as above.*
- [ ] T030 [US4] Cube mode: bbox/z/datetime controls, closed intervals only, the volume
  view and time stepping reading the held response. *Gated as above.*
- [ ] T031 Cost prediction against server-declared limits (carrier per plan.md: the
  client configuration document rendered from the same destination values), predicted
  refusals stated, request-line ceiling stopped client-side. *Gated as above.*
- [ ] T032 **The fetch-discipline exception ADR (FR-014) — owed, not yet written.** The
  client's announcement-caused fetch invariant gains a bounded operator-caused
  exception; the ADR records it with the interview's two rejected alternatives. It is
  argued beside the code it constrains, so it lands with this phase. *Gated as above.*

## Phase 8: The record targets (US5–US6 client side) — GATED, client half

- [ ] T033 [US5] Locations mode: the advertised list marked on the map by kind, query by
  identifier. *Gated as above.*
- [ ] T034 [US6] Instance and observations targets: catalogue picking, per-run labels,
  observation points rendered at reported position and depth. *Gated as above.*

---

## Findings

*(recorded as the work lands, 28 August 2026, against the running local stack — the loop
live, two runs catalogued, `run-initial` current)*

- **T023 — a retained run's own bounds are genuinely discoverable, but not from the
  instances listing.** The instances document (pygeoapi 0.20.0's own shape) carries per
  instance an `id`, `links` and `data_queries` — no extents. The run's own bounds
  surface through what exists in three ways, each verified live: a query with no
  `datetime` is answered over the instance's own valid time from its manifest (the
  response's `t` axis is the run's); every refusal quotes `run.extent()` verbatim (an
  empty-selection area refusal quoted the live run's January valid time); and the
  run-published announcement carries `valid_time` and `grid_bounds`. So the client half
  can learn a run's bounds by asking the instance or from the announcement, and nothing
  new needs serving — which is the answer FR-81 wanted. Noted rather than built ahead:
  if the composer's catalogue picker wants bounds *in the listing*, that is a later
  decision against pygeoapi's instances shape, not a gap in the store.
- **T023/T025 — the configured scenario envelope disagrees with the live scenario, and
  every `datetime`-carrying query pays for it.** `config/local/query.json` advertises a
  temporal domain of 2026-09-01T00:00–12:00; the seeded live scenario runs from
  2026-01-01. pygeoapi validates `datetime` against the *configured* collection extent
  before any provider code runs, so `cube`, `position`, `locations/<id>` — any query
  naming an instant of the live run — is refused "datetime parameter out of range"
  while the same query without `datetime` answers correctly over the run's own valid
  time. Pre-existing (it binds cube and position exactly as it binds the new types),
  owned by the destination configuration rather than by `query/`, and load-bearing for
  the composer's time controls: recorded here and raised as its own task rather than
  patched past in this branch.
- **T025 — every new type answered through the running stack, and the refusals were
  seen live.** Against the query service (the proxy's released names are lane I's
  concurrent work, and the uncleared boundary answers 401 as it should):
  `radius` (65 node-depth positions in a 40 km circle), `area` (15 nodes in a drawn
  polygon), `corridor` (5 member trajectories at ±10 km edges and the grid's 7.3 km
  step, declined vertices named per member), `locations` (three entries, two kinds,
  the sensor at its latest reported position with `as_of`), `locations/eddy_a` (the
  column, run's own times), instance-addressed `radius` and `locations` on
  `run-000000-7f80b47c7b91`, and SensorThings `st_within` against real PostGIS
  (27 of 36 observations in a drawn ring; composed with `phenomenonTime ge` it
  narrows to the true intersection both at 0 and at 18). Refused live, each naming
  its cause: missing `within`, unit `mi`, polygon with a hole, empty selection,
  missing `corridor-width`, `corridor-height` by name, a 700 km × 12-vertex corridor
  at HTTP 413 naming 1164 samples against corridor_maximum_samples 1001, `datetime`
  on the locations list (Constitution V), an unknown location naming the known ones,
  and `st_intersects` by name. The radius/area cell budgets cannot be exceeded on the
  local destination — the whole live grid is 177,723 cells against a 250,000 budget,
  deliberately — so those two refusals were watched failing in the unit tests, with
  the bound checks planted out, rather than live.
