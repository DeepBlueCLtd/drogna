# Implementation Plan: The EDR Query Composer — the query layer's half

**Branch**: `claude/023-query-layer` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-edr-query-composer/spec.md`

## Scope of this plan

Feature 023 straddles the waves by the SRD's own split. §10 says it in one sentence: the
composer "begins, at the earliest, once the operator plane is standing and the map surface
of feature 017 has a selection model to build on, and its client half waits on both while
its query-layer half (the four new query types of FR-78) waits on neither."

This plan therefore covers the **query layer's half only** — FR-78 (radius, area, corridor
and locations in the bespoke EDR provider), FR-79 (the server-advertised named-locations
list), FR-80 (spatial predicates in the SensorThings filter subset) and the serving side of
FR-81 (instances need no new work; what is owed is a verification, recorded as a finding).
The client half — the composer surface, the URL panel, the cost prediction, the rendering —
is planned to the level of its gate and no further: its tasks are recorded unticked in
`tasks.md` with the gate named, so that starting them later is a decision made against a
record rather than archaeology.

One consequence of the split is stated up front so nobody hunts for it later: **two ADRs
are owed under PR-03, and this session writes exactly one of them.** The SensorThings
widening ADR is written here, because this session does the widening and the argument
should land with the change. The fetch-discipline exception ADR (FR-014) belongs to the
client half: the exception it argues is a property of the client's request behaviour, none
of which exists yet, and an ADR written ahead of the code it constrains would be the
speculative kind this repository avoids. It is **flagged as owed** in tasks.md, gated with
the rest of the client half.

## Summary

The bespoke EDR provider grows four query types beside its existing position, cube,
trajectory and instances, so that every type the composer will offer is genuinely served
over the coverage store before any composer exists to offer it. Each new type carries a
declared budget with a named refusal, in the discipline the cube cell budget and the
trajectory vertex budget establish: refused with the measured quantity and the limit,
never truncated. The advertised query types, the emitted OpenAPI document and the served
account of what is implemented are widened together, through the established vendoring
chain — regenerated, never hand-edited. The interface remains GET-only.

The named-locations list gives the locations query type something honest to serve: two
kinds of entry, distinguished — the seeded synthetic features, and sensor positions derived
from reported observations, each sensor's **current position only**. The harness holds no
location history and this list must never become one; that is Constitution V's spirit
applied to the harness's own placed entities.

The SensorThings filter subset grows exactly one spatial predicate over the observation
geometry, composing with the existing temporal filtering, so a drawn geometry will filter
observations server-side rather than pretending to. The subset's honesty has been its
narrowness: every unimplemented option keeps its refusal with the option named, and the
conformance statement is amended in the same commit as the code (ADR-0025).

## Technical Context

**Language/Version**: Python 3.11, extending the provider plugins under `query/plugins/`.
The workspace does not carry pygeoapi (its Pydantic pin conflicts with the type chain), so
everything computable is plain Python testable without a framework, exactly as the
existing providers are arranged; the pygeoapi binding is exercised in the built image.

**Primary Dependencies**: pygeoapi 0.20.0, pinned and checked at startup
(`plugins/pygeoapi_version.py`); Shapely per FR-51's pin for geometry parsing, which
pygeoapi performs before provider code runs; `psycopg` for the sensor-position read,
through the existing select-only role. No new dependency is added.

**How pygeoapi 0.20.0 hands over each new type** (measured against the wheel, not
assumed): routes exist for `radius`, `area`, `corridor`, `locations` and their
`instances/<id>/` variants. `p.query(**kwargs)` receives `query_type`, `instance`, `wkt`
(Shapely geometry from `coords`), `datetime_`, `select_properties`, `z`, `bbox` (cube and
locations only), `within`/`within_units` (radius only), `limit`, `location_id`. **No
corridor-width parameter is passed by the framework**, so the corridor provider reads
`corridor-width` and `width-units` off the web request at the one established seam — the
same confined fallback `sensorthings_provider.request_query_options()` already uses, for
the same measured reason.

**Storage**: unchanged — the coverage store read through the catalogue; the observation
store read through the select-only role, now also for one further SELECT (each thing's
latest reported position).

**Testing**: `pytest` unit tests over the pure computation (selection, budgets, refusals,
locations, spatial filter) with bounds read from declared configuration rather than typed
into tests; integration tests over a store built by `tests/query_layer_support.py`; the
running stack driven for a stack-level answer per new type. Every budget and refusal is
watched failing on the fault it describes before it is trusted, and the commit message
says so.

**Constraints**: GET-only; no literal path or host in `query/`; no wall-clock time (a
sensor's "current" position is the latest *reported* observation, ordered by phenomenon
time, which is simulation time — no host clock decides currency); response sizes bounded
by declared limits, every refusal naming its limit.

## Constitution Check

*This feature implements the amendment the SRD promised in §10 and carries as §5.13
(FR-77 to FR-83, SRD v0.4 line); the Constitution Check is made against that amendment.*

- **I. No Wall-Clock Time** — Three exposures. A radius/area/corridor query with no
  `datetime` defaults to the current run's valid-time extent from its manifest, as
  position and cube already do — never "now". A sensor's advertised location is the
  position of its **latest observation by phenomenon time**, which is simulation time;
  no arrival or insertion time exists in the schema to leak into "latest". Corridor
  vertex times arrive in the M ordinate exactly as trajectory's do.
- **II. Seeded Randomness** — Nothing stochastic is added. Location identifiers are the
  seeded feature identifiers and the thing identifiers, both already deterministic.
- **III. Generated Types Only** — The one new boundary shape, the named-locations list,
  is declared as a master under `contracts/schemas/` and generated into both languages,
  registered in `tests/unit/test_generated_models.py` (append-only). The widened query
  surface reaches the client through the vendored `query-layer.openapi.json`, refreshed by
  `scripts/refresh_query_layer_spec.sh` and regenerated by `scripts/generate_types.sh` —
  never hand-edited.
- **IV. No Literal Paths or Hosts** — Every new budget is a configuration value in
  `config/<destination>/query.json`; the seeded-feature locations are configuration
  values; nothing in `query/` gains a path, host or coordinate constant.
- **V. No Tracked Entities** — The named-locations list is the closest this feature comes
  to the line, and it stays on the right side by construction: every entry is an entity
  **the harness itself placed** — a seeded feature, or a sensor platform of its own — and
  a sensor's entry is one current position, not a path. The list never accumulates, never
  orders by history, and refuses a `datetime` filter on itself with Constitution V as the
  stated reason. No contact, no detection, no third party.
- **VI. Honest Ports** — The four types are grown in the bespoke provider behind the
  coverage output port (ADR-0003's home), not stubbed for a composer to point at: FR-78's
  whole argument is that an offered-but-stubbed query type is the exact dishonesty the
  harness exists to avoid. The SensorThings subset stays a stated subset; its one new
  predicate is stated with the same precision as its refusals (ADR-0025).
- **VII. Liveness, Not Configuration** — Untouched. The query layer's heartbeat is
  unchanged; nothing here drives illumination.
- **IX. Ground Truth Is Scored** — The new types are verified against the analytic
  fixture field with closed-form expectations, as position/cube/trajectory are, so
  "the values agree" carries a figure.
- **X. Default Deny at the Boundary** — Every new path sits under the existing collection
  prefix (`/collections/forecast/...`, `/collections/observations/items/...`): pygeoapi's
  own routing guarantees it, and the path space keeps its shape, which is what keeps
  prefix-based default-deny viable. No new port is published.

No violations; Complexity Tracking is empty and omitted.

## Design decisions (the plan's to make, per the spec's assumptions)

The spec fixes the semantics — each new type answers only with data inside its geometry,
refuses over budget by name, and returns the response format the served types already
return — and leaves the computation and each budget's unit to this plan.

### Radius and area: grid nodes inside the geometry, as a composite-domain coverage

Both are the same computation with a different membership test: select the run's own grid
nodes whose (longitude, latitude) fall inside the geometry — a great-circle distance test
for radius (haversine, mean Earth radius stated in code), a ray-casting point-in-ring test
for area — then answer those nodes at the requested depths and times, interpolated exactly
as cube answers its nodes.

The response is CoverageJSON with a **composite spatial axis**: domain type
`MultiPointSeries`, `t` as its own axis, and one `(x, y, z)` tuple per selected
node-and-depth. A `Grid` domain cannot say "inside the polygon" without either lying about
the shape or nulling the nodes outside it — and a null here must keep meaning exactly one
thing, the refusal to extrapolate. With a composite axis the response contains the
geometry's nodes and nothing else, which is what "answer only with data inside their
geometry" means.

- Empty selection (geometry over water the grid does not cover) is refused naming the
  geometry and the run's domain, exactly as cube's empty bbox is — an empty coverage would
  read as a measurement of nothing.
- **Budgets**: cells, the unit cube already uses — `times × depths × nodes` — against
  `radius_maximum_cells` and `area_maximum_cells`. Refused with the measured count and
  the limit named.
- Radius takes `within`/`within-units` from the framework; a missing distance is refused
  naming the parameter, units are `km` or `m`, and any other unit is refused with the
  unit named.
- Area takes a `POLYGON` (exterior ring; a polygon with holes or a multipolygon is
  refused with the shape named — narrow and stated, like every other subset here).

### Corridor: parallel trajectories at grid-derived cross-track offsets

A corridor is the drawn route with a width, and its answer must genuinely depend on the
width. It is discretised as **parallel routes at cross-track offsets covering
[-width/2, +width/2]**, spaced by the run's own horizontal grid resolution (derived from
the grid at the domain's mid-latitude — a bound from data on disk, not a number typed into
code), always including the centreline. Each offset route displaces every vertex
perpendicular to the local route bearing and is then sampled exactly as a trajectory: the
same per-vertex arrival times, the same depth rules, the same declined-vertex honesty.

The response is a CoverageJSON **CoverageCollection of Trajectory coverages**, one per
offset, each labelled with its signed cross-track offset in km (`drogna:cross_track_km`)
and carrying its own `drogna:declined` list. Nothing is aggregated — the harness
aggregates nowhere — and nothing is returned that was not computed from the store.

- `corridor-width` and `width-units` are read at the established request seam (the
  framework does not pass them); missing width refused naming the parameter; units `km`
  or `m`; any other refused by name.
- `corridor-height`, `height-units`, `resolution-x` and `resolution-z` are **not
  implemented and refused with the option named** — the SensorThings refusal discipline
  applied to EDR options, rather than the silent drop that answers a question nobody
  asked.
- **Budget**: samples — `offset routes × vertices` — against `corridor_maximum_samples`,
  refused with both factors and the limit named. The trajectory vertex budget and the
  increasing-time rule apply per route, unchanged, because a corridor is those routes.

### Locations: a served list of the harness's own placed entities, and a column per entry

`GET .../locations` answers the named-locations list; `GET .../locations/<id>` answers
that location's water column — a grid coverage over the single advertised point, all of
the run's depths (bounded by `z` if given), at the requested or default times, with cells
counted against `cube_maximum_cells` and refused naming it (the same measure and the same
limit as any other gridded answer).

The list has two kinds of entry, distinguished by a `kind` the response states:

- **`feature`** — the seeded synthetic features with a fixed horizontal position: the
  eddy (`eddy_a`, its seeded centre) and the front (`front_a`, its seeded anchor), as
  configuration values under `query.locations.features`. The thermocline is deliberately
  absent (it has no horizontal position — it is everywhere in the horizontal), and the
  drifting feature is deliberately absent (its position is a function of time, and a
  static entry would advertise a place it is not; when a need for it arises, evaluating
  its drift at announced simulation time is a decision for then, argued then). A unit
  test asserts the configured entries agree with `config/<destination>/env_generator.json`
  — the values are duplicated across two files of the same destination, so the agreement
  is enforced rather than hoped for.
- **`sensor`** — one entry per reporting platform, at the position of its **latest
  observation by phenomenon time**, read through the select-only role with one
  `DISTINCT ON` statement. Current position only: one row per thing, no ordering the
  caller can reach into history by, and the entry states the simulation time it is
  current *as of*. The harness holds no location history and this list never becomes one.

- The list applies a `bbox` filter when one is given (the framework passes it), and
  **refuses `datetime` on the list itself**, with Constitution V as the stated reason: a
  location list filterable by time is a location history by another name. `datetime` on
  `.../locations/<id>` remains meaningful (it selects the column's times) and is served.
- **Budget**: entries — the assembled list is counted against
  `locations_maximum_locations` and refused with the count and the limit named rather
  than truncated, the discipline apply to the one answer here that could grow with the
  store (one entry per platform).
- The list is a new boundary shape: `contracts/schemas/edr-locations.schema.json`
  (GeoJSON-compatible FeatureCollection with `kind` distinguished), generated into both
  languages, registered append-only in `tests/unit/test_generated_models.py`.

### The SensorThings spatial predicate: `st_within`, and nothing else (ADR-0025)

The filter subset grows exactly one spatial predicate:
`st_within(location, geography'POLYGON (…)')`, composable by `and` with the existing
phenomenon-time comparisons. `location` is the observation's own sampled position — the
column the ingest client derives the FeatureOfInterest from, so the two cannot disagree.
Against Postgres it becomes `ST_Within` over the geography column read as geometry; in the
in-memory row source it is the same ray-casting test the EDR area query uses, from one
shared implementation, so the two row sources cannot disagree about what "within" means.

Everything else keeps its refusal with its name: every other spatial function
(`st_intersects`, `geo.distance`, …), `st_within` on any property but `location`, any
geometry but a single-ring `POLYGON`, disjunction. The conformance statement — the served
document and `query/conformance.md`, generated from and checked against the same constants
— is amended in the same commit. The decision, the alternatives the interview weighed
(client-side selection after a temporal query; an EDR items type over observations) and
the conformance obligation are recorded as **ADR-0025**, written in this session because
this session does the widening (PR-03).

### Discoverable limits: the carrier is decided here, wired with the client half

FR-83 requires the client to predict costs against server-declared limits it holds no copy
of. The carrier decided by this plan: **the client configuration document**, rendered per
destination from the same `config/<destination>/query.json` values the query layer itself
reads — one source, two renderings, nothing hand-copied, so neither side can drift. The
wiring (schema addition, deploy rendering, client consumption) is client-half work and is
gated with it; the decision is recorded here so the gated tasks inherit a decision rather
than an open question.

### Instances (FR-81's serving half): verify, and record the finding

The instances mechanism already exists. What FR-81 needs from the server is that a
retained run's **own bounds** be genuinely discoverable — the catalogue holds each
manifest's `valid_time`, and every response and refusal quotes the run's extent — but
whether the *instances listing itself* advertises per-run bounds is a property of
pygeoapi's instances document, to be verified against the running stack rather than
assumed from reading. The verification and its finding are a task, and the finding is
recorded in tasks.md whichever way it lands; nothing is built ahead of the client.

## Project Structure

### Documentation (this feature)

```text
specs/023-edr-query-composer/
├── plan.md          this file
├── spec.md
└── tasks.md         server half ticked as built; client half unticked, gate named
```

### Source Code (repository root)

```text
query/
├── pygeoapi-config.yaml.template   provider name moves to the widened provider class
├── render_config.py                coverage options gain observations + locations sections
├── conformance.md                  the SensorThings statement, amended with st_within
├── README.md                       path space, limits table and served types, widened together
└── plugins/
    ├── edr_geometry.py             NEW: pure geometry — haversine, point-in-ring, offsets, units
    ├── edr_region.py               NEW: radius and area over an open run, with their budgets
    ├── edr_corridor.py             NEW: corridor as offset trajectories, with its budget
    ├── edr_locations.py            NEW: the named-locations list and the per-location column
    ├── edr_composer.py             NEW: the provider class advertising all eight query types
    ├── coveragejson.py             grows the composite-axis and collection assemblies
    ├── sensorthings_entities.py    Observations gains its geometry column
    ├── sensorthings_options.py     $filter grows st_within; refusals keep their names
    └── schemas/config.query.schema.json   limits + locations sections

contracts/
├── schemas/edr-locations.schema.json     NEW master; generated both sides
└── openapi/query-layer.openapi.json      refreshed through the chain, never hand-edited

config/local/query.json, config/droplet/query.json   new limits and locations values

docs/adr/0025-…md                   the SensorThings widening (PR-03), written here

tests/
├── unit/  test_edr_geometry.py, test_edr_region.py, test_edr_corridor.py,
│          test_edr_locations.py, test_sensorthings_spatial.py,
│          test_locations_config_coherence.py; the advertisement test widened
└── integration/  the new types against a built store; conformance agreement re-checked
```

**Structure Decision**: feature 008 owns the existing provider modules; this feature
extends them **additively** — new sibling modules, a subclass provider, appends to the
shared files under the usual rules — and rewrites none of them. The provider named in the
collection's configuration becomes the widened subclass, which re-declares every query
type through both advertisement mechanisms (`query_types` on the class and a method in the
class's own `__dict__`), for the measured reason `plugins/pygeoapi_version.py` records.
