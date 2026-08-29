> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: The Query Layer and the Coverage Store Convention

**Feature Branch**: `008-query-layer`

**Created**: 2026-08-26

**Status**: Draft

**Input**: The read path: standards-based access to everything the harness holds. SensorThings Part 1 Sensing over the observation store and OGC API-EDR over the coverage store returning CoverageJSON, both served by bespoke pygeoapi provider plugins written for this harness (ADR-0003, ADR-0004); EDR trajectory queries carrying per-vertex timestamps; and a coverage store naming and cataloguing convention such that a new model run becomes servable without editing collection configuration. (SRD C-08, C-09, FR-19 to FR-21, FR-50, FR-51.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A published run is readable over EDR as CoverageJSON (Priority: P1)

A model run exists in the coverage store. Someone asks the query layer for conditions at a
position, and for a cube covering a region and depth range, and receives CoverageJSON
describing temperature, salinity, pressure and the uncertainty field. Nothing about the
request required knowing where the files are or what they are called.

**Why this priority**: It is the smallest read path that serves anything, and every later
story extends it. Without it the coverage store is a directory of files with no interface,
and the client has nothing to draw.

**Independent Test**: Place a run in the coverage store by the documented convention, start
the query layer, issue a position query and a cube query, and validate the responses against
the CoverageJSON specification and against the field the generator produced.

**Acceptance Scenarios**:

1. **Given** a published run in the coverage store, **When** a position query is issued for a point inside the domain, **Then** the response is valid CoverageJSON carrying the forecast parameters and the uncertainty parameter at that point.
2. **Given** the same run, **When** a cube query is issued for a bounding box, a depth range and a time range, **Then** the response is valid CoverageJSON covering exactly the requested extent.
3. **Given** a query for a point outside the domain, **When** the request is made, **Then** the response is an error naming the domain's extent, not an empty coverage that could be mistaken for a measurement of nothing.
4. **Given** a response, **When** its values are compared against the generator's field at the same coordinates, **Then** they agree to within the declared interpolation tolerance, reported as a figure.

---

### User Story 2 - A bespoke EDR provider plugin serves trajectory queries (Priority: P2)

Someone submits a four-dimensional route — a sequence of positions, each with the time the
platform is expected to be there — and receives the conditions forecast for each vertex at
that vertex's own time, not the conditions at the moment the query was made.

**Why this priority**: SRD acceptance test AT-01 is this query, and the client's centrepiece
is the route drawn through the forecast volume with a time control. The SRD now scopes it as a
build rather than a gamble: no supplied pygeoapi provider implements trajectory at all, so
FR-50 makes a bespoke provider plugin a planned component. One unknown survives, and feature
002 owns it — whether the per-vertex M ordinate survives WKT parsing at the pinned library
versions.

The capability is delivered by a provider plugin written for this harness, because no supplied
pygeoapi provider implements trajectory at all. pygeoapi parses the `coords` parameter with
Shapely and hands the geometry to the provider untouched, so every question about what the M
ordinate means is answered inside the plugin: it reads the per-vertex times, samples the
coverage at each vertex's own position and time, and assembles a CoverageJSON Trajectory domain
whose composite axis is a per-vertex tuple of time and position.

**Independent Test**: Submit a route crossing the seeded eddy at known times and compare each
returned vertex against the ground-truth manifest, confirming that shifting a vertex's time
changes its value; and separately assert that the M ordinate survives WKT parsing at the pinned
library versions.

**Acceptance Scenarios**:

1. **Given** a route whose vertices carry distinct times, **When** a trajectory query is issued, **Then** the response reports, for each vertex, the conditions forecast for that vertex's own time.
2. **Given** the same route with one vertex's time changed, **When** the query is reissued, **Then** only that vertex's values change, and they change in the direction the moving seeded feature implies.
3. **Given** a route with vertices in non-monotonic time order, **When** the query is issued, **Then** the request is rejected with a message naming the offending vertex rather than being silently reordered.
4. **Given** a route extending beyond the forecast's time extent, **When** the query is issued, **Then** the response either declines the out-of-range vertices explicitly or is refused, and in no case are values extrapolated silently.
5. **Given** a route submitted as WKT `LINESTRINGZM` with M carrying each vertex's time, **When** the query layer parses it and hands the geometry to the provider, **Then** the M ordinate arrives at the provider intact rather than as NaN, and a test asserts it.
6. **Given** a trajectory response, **When** its structure is inspected, **Then** it is a CoverageJSON Trajectory domain whose composite axis carries a per-vertex tuple of time, longitude, latitude and depth.

---

### User Story 3 - A new model run is servable without touching configuration (Priority: P3)

A new run is written into the coverage store. Without anyone editing a collection definition,
restarting nothing that a human has to remember, and adding no file by hand, the run is
readable through the query layer, and the collection representing the current forecast now
resolves to it.

**Why this priority**: SRD FR-21, and the requirement that makes the control loop's
publication step meaningful. If serving a new run required a configuration edit, the sense →
decide → act → publish cycle would have a human in the middle of it, and the harness would be
demonstrating something other than what it claims.

**Independent Test**: Write a second run into the store by the documented convention while the
query layer runs, then request the current collection and confirm it resolves to the new run,
with the previous run still addressable by its own identifier.

**Acceptance Scenarios**:

1. **Given** a running query layer, **When** a new run appears in the coverage store and is marked current, **Then** the current-forecast collection serves it without any configuration file being edited.
2. **Given** several runs present, **When** the collections are listed, **Then** each run is addressable by its own deterministic identifier and the current one is identified as such.
3. **Given** a run that is being written, **When** it is requested, **Then** it is either absent from the catalogue or complete; a partially written run is never served.
4. **Given** a run identifier, **When** the same scenario is replayed from its seed, **Then** the identifier is the same, because it derives from the seed and the run sequence rather than from a clock or a random value.
5. **Given** a run that has been superseded, **When** it is requested by identifier, **Then** it is still served, so a comparison between runs is possible.

---

### User Story 4 - A bespoke provider serves observations over SensorThings (Priority: P4)

Someone reads the stored observations through a SensorThings Part 1 Sensing interface —
Things, Sensors, ObservedProperties, Datastreams, Observations and FeaturesOfInterest — rather
than through the database. The interface is served by a provider plugin written for this
harness, projecting the `observations` schema onto the entity set, and it states plainly which
part of the standard it implements and which parts it does not.

**Why this priority**: SRD FR-19 requires it and the constitution names it, but the acceptance
tests that matter earliest run through EDR. What was once uncertain here is now settled:
ADR-0004 establishes that pygeoapi's supplied `sensorthings` provider is an HTTP client which
consumes an external SensorThings service and republishes it as OGC API - Features, so it
cannot serve the entity set from the observation store, and there is no external service to
point it at. This story is therefore a build of comparable weight to User Story 2 rather than
an investigation. It is last for the ordering reason alone, not because it is small.

**Independent Test**: Run a scenario to populate the observation store, then walk the entity
set from the service root through navigation links alone, confirm the entities and the
observation count against the store, and issue one query option the documented subset excludes
to confirm the refusal names the option and points at the conformance statement.

**Acceptance Scenarios**:

1. **Given** a populated observation store, **When** the Datastreams collection is requested, **Then** it lists the datastreams present with their observed properties and units — temperature, salinity and pressure, and no sound-speed datastream, because sound speed is derived at the point of use and never stored (ADR-0005).
2. **Given** a datastream, **When** its Observations are requested, **Then** they are returned with their phenomenon times, and the count matches the store for that datastream.
3. **Given** an Observations request with a time filter, **When** it is issued, **Then** filtering is on phenomenon time, which is simulation time, and never on any arrival or insertion time.
4. **Given** the interface, **When** it is exercised against the read-only role, **Then** no write operation succeeds, because the query layer holds select permission only.
5. **Given** any served entity, **When** its navigation links are followed in both directions, **Then** each resolves to the related entity or entity set and the identifiers agree, so the entity set can be walked without prior knowledge of the path grammar.
6. **Given** the collection's own metadata, **When** it is requested, **Then** it names the implemented subset of SensorThings Part 1 and the parts of the standard that are absent, and makes no claim of conformance.
7. **Given** a request carrying a query option outside the implemented subset, **When** it is issued, **Then** it is refused with a message naming the option and pointing at the conformance statement, rather than being ignored silently or answered as though the option had been applied.
8. **Given** a pygeoapi version other than the pinned one, **When** the query layer starts, **Then** both bespoke providers refuse to start, naming the version found and the version expected, rather than serving against an untested base class.

---

### Edge Cases

- The coverage store is empty at start. The query layer serves an empty collection list with a readable explanation rather than failing to start, so the client greys the component rather than showing an error the operator cannot act on.
- Two runs claim to be current. The catalogue refuses to resolve rather than picking one, and reports the conflict, because serving an arbitrary choice would be worse than serving nothing.
- A run directory contains a forecast field but no uncertainty field. The run is treated as incomplete and is not catalogued.
- The deployed Shapely or GEOS version is older than the pin. The M ordinate of a `LINESTRINGM` or `LINESTRINGZM` comes back as NaN, per-vertex timestamps are lost silently before any provider code runs, and FR-20 fails without raising an error. A test asserts that M survives parsing, so the failure is loud and immediate rather than a quietly wrong answer.
- A trajectory query names more vertices than the response size permits. The request is refused with the limit stated, rather than being truncated into a response that looks complete.
- A trajectory vertex falls exactly on a grid node, or exactly between two time steps. Interpolation behaviour at boundaries is documented and tested, because a plausible-looking wrong answer here is the hardest kind to notice.
- A cube query asks for the entire domain at full resolution. A size limit applies, is documented, and the refusal names it.
- The observation store contains an observation whose simulation time is later than every forecast time. It is still served over SensorThings; the two collections have no requirement to agree on extent.
- A consumer asks for a Thing's Locations or HistoricalLocations. Neither is served. The store holds the location of each observation, not a platform's location history, and a Thing's location history is a track by another name. The conformance statement gives that reason rather than leaving the absence to look like an oversight.
- A consumer expects the SensorThings MQTT subscription extension, reasonably, since the harness runs a broker and publishes observations in SensorThings vocabulary on it. The broker is not a SensorThings endpoint and the extension is not implemented. The conformance statement says so, because this is the confusion most likely to arise here.
- A consumer issues `$select`, a nested `$expand`, or a `$filter` over a result value. Each is refused with the option named, because a silently ignored query option returns an answer to a question nobody asked and looks like a correct one.
- A datastream holds more observations than one response may carry. Paging applies, the next link is followed, and the total is available through `$count` without retrieving every page.
- The query layer's own emitted specification changes when its version changes. The generated-types drift check fails, which is the intended alarm, not a nuisance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The query layer MUST expose OGC API-EDR collections over the coverage store, returning CoverageJSON. (SRD FR-19, C-09)
- **FR-002**: EDR position and cube queries MUST be supported over the forecast field and the uncertainty field, with both available as parameters of the same collection rather than as separate collections. (SRD FR-19, FR-29)
- **FR-003**: EDR trajectory queries MUST be supported with per-vertex timestamps: the response reports conditions forecast for the moment of arrival at each vertex, not conditions at query time. Vertex times arrive as the M ordinate of a WKT `LINESTRINGM` or `LINESTRINGZM` in the `coords` parameter, which is how the standard expresses them. (SRD FR-20)
- **FR-004**: Trajectory queries MUST be served by a bespoke pygeoapi EDR provider plugin, since no supplied provider implements trajectory: the provider matrix lists `xarray-edr` as position and cube only. The plugin sits behind the coverage output port and is a planned component, not a workaround. (SRD FR-50)
- **FR-005**: The deployment MUST pin Shapely 2.1 or later built against GEOS 3.12 or later, with a comment giving the reason, and a test MUST assert that the M ordinate survives WKT parsing. Below those versions M is returned as NaN and per-vertex timestamps are lost silently before any provider code runs. (SRD FR-51)
- **FR-006**: Trajectory responses MUST use the CoverageJSON Trajectory domain, whose composite axis is a per-vertex tuple of time and position. (SRD FR-20)
- **FR-007**: A trajectory whose vertices are not in increasing time order MUST be refused with the offending vertex named. (SRD FR-20)
- **FR-008**: Values MUST NOT be extrapolated beyond the forecast's spatial or temporal extent. Out-of-range vertices are declined explicitly. (SRD FR-20)
- **FR-009**: The query layer MUST expose OGC SensorThings Part 1 Sensing over the observation store, served by a bespoke pygeoapi provider plugin under `query/plugins/`. pygeoapi's supplied `sensorthings` provider is an HTTP client which consumes an external SensorThings service and republishes it as OGC API - Features; it cannot serve the entity set from the observation store, and drogna has no external service to point it at. (SRD FR-19; ADR-0004)
- **FR-010**: SensorThings time filtering MUST operate on phenomenon time, which is simulation time. No arrival or insertion time may be exposed or filterable. (Constitution I; SRD FR-09)
- **FR-011**: The query layer MUST hold select permission only on both database schemas. (SRD FR-18)
- **FR-012**: The coverage store MUST follow a naming and cataloguing convention such that a new model run becomes servable without editing collection configuration. (SRD FR-21, C-08)
- **FR-013**: Run identifiers MUST be derived deterministically from the root seed and the run sequence, so a replayed scenario produces the same identifiers. (Constitution II; SRD FR-11)
- **FR-014**: A run MUST be catalogued only when complete — forecast field, uncertainty field and run manifest all present. A partially written run is never served. (SRD FR-30)
- **FR-015**: A superseded run MUST remain addressable by its own identifier, so runs can be compared. (SRD FR-21)
- **FR-016**: The catalogue MUST refuse to resolve rather than choose arbitrarily when more than one run claims to be current, and MUST report the conflict. (SRD FR-30)
- **FR-017**: No collection may be defined by enumerating runs in a configuration file. Collections representing runs are resolved from the store's layout at request time. (SRD FR-21)
- **FR-018**: The query layer's configuration MUST contain no literal hostname, port or path; every such value comes from the destination configuration. (Constitution IV; SRD NFR-04, NFR-05)
- **FR-019**: The query layer MUST emit its own OpenAPI specification, and that specification MUST be the source of the client's HTTP types. (SRD NFR-01)
- **FR-020**: Response size MUST be bounded, with documented limits for cube extent, trajectory vertex count and SensorThings page size, and refusals that name the limit. (SRD C-09)
- **FR-021**: The query layer MUST publish a heartbeat on `ctl/heartbeat` so the client lights it from liveness rather than from configuration. The cadence is real time and the simulation time the heartbeat carries is payload, not schedule, so a rate of zero leaves the query layer lit. (Constitution VII; SRD FR-45; ADR-0006)
- **FR-022**: The query layer MUST NOT be polled for freshness. Consumers learn of a new run from `ctl/run-published`, because the query layer has no notification mechanism. This feature therefore provides no freshness endpoint and documents why. (SRD FR-31)
- **FR-023**: Collections MUST sit under a stable, predictable path prefix, since the reverse proxy's access control operates on path prefix and default-deny. (SRD FR-40, FR-41)
- **FR-024**: The coverage store layout MUST support atomic publication by the publisher: making a run visible is a single operation and no reader observes a partially written field. This feature defines the layout that makes it possible; the publisher performs it. (SRD FR-30)
- **FR-025**: Coverage files MUST be NetCDF with CF conventions, so the same files serve the query layer and the offload export without translation. (SRD C-08, FR-43)
- **FR-026**: The served SensorThings entity set MUST be Things, Sensors, ObservedProperties, Datastreams, Observations and FeaturesOfInterest, projected read-only from the `observations` schema, each entity addressable by its own identifier and each entity set addressable as a resource. Locations and HistoricalLocations MUST NOT be served: the store holds the location of each observation, not a platform's location history, and a Thing's location history is a track by another name. (ADR-0004; Constitution V; SRD FR-16)
- **FR-027**: The resource path grammar MUST support an entity set, an entity by its identifier, and navigation from an entity to a related entity or entity set, to a documented depth. Every entity served MUST carry its own self link and a navigation link for each relationship it has, so the entity set can be walked from the service root without prior knowledge of the grammar. (ADR-0004; SRD FR-19)
- **FR-028**: The implemented query options MUST be exactly: `$top` and `$skip` with a next link for paging; `$count`; `$orderby` restricted to phenomenon time; `$filter` restricted to comparisons on phenomenon time; and `$expand` to a single level, from a Datastream to its Sensor, ObservedProperty and Thing, and from an Observation to its Datastream and FeatureOfInterest. These are what the client and the acceptance tests exercise, and nothing wider is implemented on speculation. (ADR-0004; SRD FR-19)
- **FR-029**: `$select`, `$search`, `$apply`, `$value`, `$ref`, nested `$expand`, query options nested within an `$expand`, `$filter` on any property other than phenomenon time — including spatial predicates and result values — the filter language's geospatial and temporal functions, every write operation and deep insert, the Tasking entities of Part 2, and the Part 1 MQTT subscription extension MUST be out of scope by decision rather than unimplemented by omission. A request using one MUST be refused with a message naming the option and pointing at the conformance statement, and MUST NOT be ignored silently or answered as though it had been applied. (ADR-0004)
- **FR-030**: The implemented subset and the absent parts of the standard MUST be documented on the collection itself, in the metadata the interface serves, and in the standards primer under `docs/standards/`, so a reader learns the limits from the documentation rather than by issuing a query that fails. No artefact of this feature may describe the SensorThings interface as conformant. A harness that overstates its conformance is worth less as evidence than one that states a small conformance accurately. (ADR-0004; Constitution VI)
- **FR-031**: Both bespoke provider plugins — EDR trajectory and SensorThings — MUST be pinned to the same pygeoapi version and MUST fail loudly at startup on a version they have not been tested against, naming the version found and the version expected, rather than serving against an untested provider base class. (ADR-0003, ADR-0004)
- **FR-032**: The served Datastreams MUST be temperature, salinity and pressure. There MUST be no sound-speed datastream, because sound speed is derived at the point of use and is never published or stored. (ADR-0005; SRD FR-02, FR-24)

### Key Entities

- **Coverage run**: One completed model run — a forecast field, an uncertainty field and a manifest — under a directory named for its deterministic run identifier. The unit of publication and of cataloguing.
- **Run manifest**: The record accompanying a run: run identifier, root seed, generator and model versions, simulation time of the run, the forecast's valid time extent, and the ensemble configuration. What lets a served value be traced back to what produced it.
- **Current pointer**: The single indication of which run is current. Resolved at request time, and never more than one.
- **EDR collection**: A collection exposing a coverage run over position, cube and trajectory queries, with the forecast and uncertainty parameters together.
- **SensorThings entity set**: Things, Sensors, ObservedProperties, Datastreams, Observations and FeaturesOfInterest, projected from the observation store as read-only, each addressable by identifier and each carrying a self link and a navigation link per relationship. Locations and HistoricalLocations are not part of it.
- **Conformance statement**: the plain account of which part of SensorThings Part 1 this harness implements and which parts are absent, with the reason for each absence. Served as part of the collection's metadata and repeated in the standards primer, and the thing that keeps the claim honest.
- **Trajectory request**: A sequence of positions each carrying its own time, together with the parameters requested. The four-dimensional query the client's centrepiece rests on.
- **Query layer configuration**: The generated configuration for the query layer, produced from the destination configuration, containing no literal host or path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every EDR response validates against the CoverageJSON specification; the count of responses failing validation is zero.
- **SC-002**: Position and cube query values agree with the generator's field at the same coordinates within the declared interpolation tolerance, reported as a figure rather than asserted.
- **SC-003**: A trajectory query over a route crossing the seeded eddy returns per-vertex values matching the ground-truth manifest within the declared tolerance, which is acceptance test AT-01.
- **SC-004**: Changing one vertex's time changes that vertex's values and no other's.
- **SC-005**: The M ordinate survives WKT parsing at the pinned library versions, asserted by a test that fails rather than returning NaN if the pin is violated.
- **SC-006**: Publishing a new run into the coverage store requires zero edits to any collection configuration, and the current collection resolves to it within one request.
- **SC-007**: Replaying a scenario from its seed produces identical run identifiers; the count of identifiers differing between two replays is zero.
- **SC-008**: A partially written run is never served; over a run of the full control loop, the count of responses derived from an incomplete run is zero.
- **SC-009**: The SensorThings observation count per datastream equals the store's count for that datastream.
- **SC-010**: Every write attempt through the query layer's database role fails; the success count is zero.
- **SC-011**: The literal-path gate reports zero literal hostnames, ports or paths in `query/`.
- **SC-012**: The client contains no hand-written HTTP type for any query layer endpoint; all derive from the emitted specification.
- **SC-013**: Every entity in the served entity set is reachable by walking navigation links from the service root; the count of relationships served without a navigation link is zero.
- **SC-014**: The collection metadata and the standards primer name the same implemented subset and the same absent parts, asserted by a test that reads both, and the count of artefacts in this feature describing the SensorThings interface as conformant is zero.
- **SC-015**: Every query option outside the documented subset is refused with the option named; the count of such requests silently ignored, or answered as though the option had been applied, is zero.
- **SC-016**: Starting the query layer against any pygeoapi version other than the pinned one fails at startup for both bespoke providers, naming both versions.

## Assumptions

- pygeoapi is the query layer, as the constitution fixes. Its OGC API-EDR support over NetCDF
  coverage data is the basis of User Stories 1 to 3.
- SensorThings Part 1 Sensing is served by a bespoke pygeoapi provider plugin under
  `query/plugins/`, per ADR-0004. That decision is recorded there and is not restated as an
  assumption here: pygeoapi's supplied `sensorthings` provider consumes an external
  SensorThings service over HTTP and republishes it as OGC API - Features, so it cannot serve
  the entity set from the observation store, and the alternatives — running a reference STA
  server over its own schema, or narrowing FR-19 to vocabulary only — were considered and
  rejected in that record.
- The query options in scope are chosen from what the client and the acceptance tests actually
  exercise, not from what the standard offers. Paging and `$count` are needed to bound
  responses on the droplet and to reconcile observation counts; `$orderby` and `$filter` on
  phenomenon time are needed because every read of this store is a read over simulation time;
  a single level of `$expand` is needed so the client can show a datastream with its sensor and
  observed property in one request. `$select` is excluded because nothing needs it and a
  partial projection is a second shape of the same entity for the generated types to carry.
  What is excluded is listed in FR-029 and stated in the conformance statement, so the limit is
  a decision a reader can see rather than a gap they discover.
- The conformance statement is served with the collection metadata and repeated in
  `docs/standards/`. Where the two could drift, a test reads both and compares them, because a
  conformance claim that is only true in one of the two places it appears is worse than none.
- Trajectory support is a build, not a gamble. pygeoapi parses the `coords` parameter with
  Shapely and hands the geometry to the provider untouched, leaving all interpretation of the M
  ordinate to the provider; no supplied provider implements trajectory, so this feature writes
  one. The surviving risk is the library version pin of FR-51, and feature 002's spike exists to
  prove M survives parsing and to sample one four-dimensional route before this feature builds
  on the assumption. The decision itself is recorded as ADR-0003.
- The coverage store layout is a directory per run under a root given by configuration,
  containing the forecast field, the uncertainty field and the run manifest, with the current
  run indicated by a pointer that can be replaced atomically. The SRD requires the property,
  not the mechanism; this is the simplest mechanism with that property on a single host.
- Coverage files are NetCDF with CF conventions today. The coverage output is a genuine port
  per the constitution, with Zarr as the plausible later implementation, so the catalogue
  resolves runs by layout rather than by file extension where that costs nothing.
- Interpolation for position and trajectory queries is linear in space and time, and the
  tolerance quoted in the success criteria is derived from the grid spacing rather than chosen.
  The SRD does not specify an interpolation scheme.
- Cube extent and trajectory vertex limits are configuration values with documented defaults;
  the SRD does not fix them, and the droplet's resource envelope is what makes them necessary.
- Authentication, TLS and path policy belong to the reverse proxy feature. This feature
  guarantees only that the paths are stable and predictable enough for prefix-based
  default-deny to work.
