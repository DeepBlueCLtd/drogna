# Implementation Plan: The Query Layer and the Coverage Store Convention

**Branch**: `008-query-layer` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-query-layer/spec.md`

## Summary

Reads are served exclusively through a standards-based query layer. pygeoapi exposes OGC
API-EDR over the coverage store, returning CoverageJSON for position, cube and trajectory
queries, and SensorThings Part 1 Sensing over the observation store. Trajectory queries carry
per-vertex timestamps, so the answer is what the forecast says conditions will be when the
platform arrives, not what they are now.

The half of this feature that is not the query layer is the coverage store's layout. SRD FR-21
asks that a new model run become servable without editing collection configuration, which is a
statement about how runs are named and catalogued, not about pygeoapi. A run is a directory
named for its deterministic identifier, containing the forecast field, the uncertainty field
and a run manifest, with a replaceable pointer naming the current run. Collections representing
runs are resolved from that layout at request time by a harness-authored provider, so the
control loop's publication step needs no human in the middle of it.

Trajectory support is a build. No supplied pygeoapi provider implements trajectory at all —
the provider matrix lists `xarray-edr` as position and cube only — so SRD FR-50 makes a
bespoke EDR provider plugin a planned component sitting behind the coverage output port.
pygeoapi parses the `coords` parameter with Shapely and passes the geometry to the provider
untouched, leaving M interpretation to the provider, which is what makes the plugin sufficient.
The one thing still unproven is that the per-vertex M ordinate survives WKT parsing at the
deployed library versions; SRD FR-51 pins Shapely 2.1 or later against GEOS 3.12 or later,
below which M is returned as NaN and per-vertex timestamps are lost silently, and feature 002's
spike proves it before this feature builds on it.

SensorThings is a build as well, and for the same kind of reason. pygeoapi ships a provider
named `sensorthings`, but it is an HTTP client: it queries an external SensorThings service,
transforms the entities it receives and republishes them as OGC API - Features. It consumes
SensorThings rather than providing it, and drogna has a Postgres observation store and no
external service to point it at. ADR-0004 therefore decides a bespoke provider plugin serving
the Part 1 (Sensing) entity set from the `observations` schema, and obliges this feature to
state plainly which subset of the standard it implements. It is not conformant, and the
specification says which parts are absent and why, on the collection itself and in the
standards primer.

This feature therefore carries **two** bespoke provider plugins written against pygeoapi's
provider base class. That is two compatibility surfaces against the same third-party interface,
and they share one answer: both are pinned to the same pygeoapi version, and both fail loudly
at startup on a version they have not been tested against rather than serving from an untested
base class. The pin is one value, not two, so the two plugins cannot drift apart.

## Technical Context

**Language/Version**: Python 3.11 for pygeoapi plugins and the catalogue resolver;
configuration in YAML generated from the destination configuration.

**Primary Dependencies**: pygeoapi as the query layer, pinned by one exact version shared by
both bespoke provider plugins and checked at startup; Shapely 2.1 or
later built against GEOS 3.12 or later, pinned with the reason in a comment, because below those
versions the M ordinate is lost in parsing; `xarray` and `netCDF4` for reading coverage files;
`covjson-pydantic` or the equivalent shape check for validating CoverageJSON responses in tests;
`psycopg` for the observation-store provider.

**Storage**: The coverage store is a filesystem tree of NetCDF files with CF conventions,
under a root given by configuration, one directory per run. The observation store is the
`observations` schema in Postgres with PostGIS, read with a select-only role.

**Testing**: `pytest` for the catalogue resolver, the providers and the response validation;
`tests/integration/` for query-layer behaviour against a seeded store;
`tests/acceptance/test_at01_trajectory.py` for acceptance test AT-01, scored against the
generator's ground-truth manifest.

**Target Platform**: A container under the single Compose configuration, on both destinations.

**Project Type**: A configured third-party service plus two harness-authored provider plugins,
and a filesystem layout convention.

**Performance Goals**: A position query answered in under two hundred milliseconds and a
hundred-vertex trajectory query in under two seconds on the droplet's resource envelope, with
a warm coverage file. These are demonstration figures, not production ones.

**Constraints**: No literal hostname, port or path in `query/`. No wall-clock time exposed or
filterable — phenomenon time is simulation time. Select-only database permission. No
enumeration of runs in configuration. No freshness endpoint, because freshness travels on
`ctl/run-published`. Response sizes bounded, since the droplet is small.

**Scale/Scope**: Order of tens of runs in the coverage store at once, a grid of order
100 × 100 × 20 × 24 per run, and an observation store of order a million rows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — Two exposures. First, SensorThings filtering must be on
  phenomenon time, which is simulation time; no arrival or insertion time may be exposed or
  filterable, and the provider does not select one. Second, an EDR query with no time
  parameter must not be answered as "now": the default is the current run's valid time as
  recorded in its manifest, resolved from data rather than from a clock. Any use of host time
  by pygeoapi itself for cache headers or logging is decoration and is permitted, as is the
  query layer's own heartbeat emission, which is on a real-time cadence with the simulation
  time carried as payload (ADR-0006).
- **II. Seeded Randomness and Deterministic Replay** — Run identifiers derive from the root
  seed and the run sequence. Two replays of the same scenario therefore produce the same
  catalogue, which is what allows a replayed run's responses to be compared byte for byte.
- **III. Generated Types Only** — The query layer emits its own OpenAPI specification, and per
  SRD NFR-01 that specification is the source of the client's HTTP types. This feature is the
  supplier of that document; it must be emitted reproducibly, and the generated-types feature
  vendors and canonicalises it. Nothing in the client hand-writes a request or response shape.
- **IV. No Literal Paths or Hosts** — The pygeoapi configuration is generated from the
  destination configuration, so `query/` holds templates and plugins rather than values. The
  coverage store root, the database connection, the public base URL and the response limits all
  arrive that way. This matters more here than elsewhere because a pygeoapi configuration is
  conventionally written full of absolute paths.
- **V. No Tracked Entities** — SensorThings has vocabulary that could be bent towards entities;
  it is used strictly for environmental sampling. Things are sampling platforms, Datastreams
  are measurement series. The forbidden-vocabulary gate covers `query/` and the collection
  metadata, which is public-facing text and therefore the most exposed prose in the repository.
- **VI. Honest Ports** — The coverage output is a genuine port: NetCDF today, Zarr plausibly
  later. The catalogue resolves runs by layout rather than by file extension wherever that costs
  nothing, which is what keeps the port honest. The observation store is not a port and no
  repository abstraction is introduced over it.
- **VII. Liveness, Not Configuration** — The query layer publishes a heartbeat on
  `ctl/heartbeat`, and the client lights it from that alone. The absence of a freshness endpoint
  is deliberate and documented: consumers hear about new runs on `ctl/run-published`, because
  the query layer has no notification mechanism and polling it would invent one.
- **X. Default Deny at the Boundary** — Collections sit under a stable, predictable path prefix
  so that prefix-based default-deny at the reverse proxy is viable. This feature does not
  implement access control; it guarantees the property that makes the proxy feature's approach
  workable, and adding a collection must not change the shape of the path space.

Both provider plugins deserve a word under Principle VI, since a plugin can look like an
abstraction added for its own sake. Neither is: no supplied provider implements EDR trajectory
and no supplied provider serves the SensorThings entity set from a store of one's own, so in
each case the plugin is the implementation rather than a layer over one. The trajectory
provider sits behind the coverage output port the constitution already recognises as genuine
(ADR-0003); the SensorThings provider is recorded in Principle VI by name (ADR-0004). Where a
standard is ahead of its implementations, drogna writes the adapter rather than bending the
architecture around the gap.

Principle VI's second half binds this feature harder than the first. The harness claims exactly
the pluggability and exactly the conformance it has. The SensorThings interface implements a
subset of Part 1 and is not conformant; FR-028 and FR-029 say which query options are in scope
and which are out by decision, FR-030 requires both to be documented on the collection and in
the standards primer, and SC-014 checks the two accounts agree. A harness that overstates its
conformance is worth less as evidence than one that states a small conformance accurately.

No violations. Complexity Tracking is therefore empty and omitted. The possibility this plan
previously reserved — a companion SensorThings implementation behind the same path prefix,
departing from the constitution's technology section — is closed by ADR-0004: one query layer,
one observation store schema under our control, two plugins.

## Project Structure

### Documentation (this feature)

```text
specs/008-query-layer/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
query/                              C-09
├── pygeoapi-config.yaml.template   generated from the destination configuration
├── plugins/
│   ├── __init__.py
│   ├── coverage_catalogue.py       resolves runs from the store layout at request time
│   ├── edr_coverage.py             EDR provider over a run's NetCDF files
│   ├── edr_trajectory.py           the bespoke trajectory provider, per-vertex M ordinate
│   ├── sensorthings_provider.py    SensorThings Part 1 subset over the observations schema
│   ├── sensorthings_entities.py    the entity model, path grammar and navigation links
│   ├── sensorthings_options.py     the implemented query options; refusals for the rest
│   └── pygeoapi_version.py         the shared version pin, checked at startup by both plugins
├── render_config.py                template plus destination configuration to config file
├── conformance.md                  the implemented subset, the absent parts, and why
└── README.md                       collections, path space, and why there is no freshness endpoint

stores/coverage/                    C-08
├── layout.md                       the naming and cataloguing convention, normative
├── run-manifest.example.json       an example run manifest, validated in tests
└── validate_layout.py              checks a store against the convention

tests/
├── unit/
│   ├── test_coverage_catalogue.py
│   ├── test_trajectory_validation.py
│   ├── test_wkt_m_ordinate.py      M survives parsing at the pinned versions
│   ├── test_sensorthings_options.py    in-scope options answered, out-of-scope refused
│   ├── test_pygeoapi_version_pin.py    both plugins refuse an untested version
│   └── test_config_rendering.py
├── integration/
│   ├── test_edr_position_cube.py
│   ├── test_edr_trajectory.py
│   ├── test_new_run_servable.py
│   ├── test_sensorthings.py
│   └── test_sensorthings_conformance.py  collection metadata and primer agree
└── acceptance/
    └── test_at01_trajectory.py     AT-01, scored against the ground-truth manifest
```

**Structure Decision**: This feature owns `query/` and `stores/coverage/`. It adds one service
entry to `deploy/compose.yaml` and one configuration file to each of `config/local/` and
`config/droplet/`, following the conventions the Compose deployment feature owns.

`stores/coverage/` is owned here rather than by the control loop feature because SRD FR-21 is a
statement about the store's layout, and the layout is what makes a run servable without a
configuration edit. The division of labour is stated so it is not disputed later: this feature
defines the layout, the run manifest's shape, the catalogue rules and the validator; the
publisher in the control loop feature writes runs into that layout and performs the atomic
swap of the current pointer. Neither writes the other's code.

The run manifest schema is contributed to `contracts/schemas/` by whichever of the two features
lands first, per the repository layout's ownership rule; if that is this one, it is authored
here and the publisher consumes it.
