# Feature Specification: EDR Trajectory Spike

**Feature Branch**: `002-edr-trajectory-spike`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD FR-20, FR-50, FR-51, §5.3 note, §10 delivery priority 2, §11 resolved question 1. AT-01 depends on the result.

## User Scenarios & Testing *(mandatory)*

This feature is a spike. Its deliverable is a dated written finding with a runnable reproduction
behind it, not a component. Since SRD v0.3 the question it answers is narrow. What is already
settled, and is not re-investigated here:

- No supplied pygeoapi provider implements trajectory. The provider matrix lists `xarray-edr` as
  position and cube only, and that provider's source defines no trajectory method. drogna therefore
  builds a bespoke EDR provider plugin, which is a planned component behind the coverage output
  port, not a workaround (FR-50).
- The standard expresses per-vertex timestamps natively: EDR trajectory `coords` is WKT
  `LINESTRINGM` or `LINESTRINGZM` with M carrying the vertex time. pygeoapi parses `coords` with
  `shapely.wkt.loads` and hands the geometry to the provider untouched, so all interpretation of M
  belongs to the provider. The response is CoverageJSON's Trajectory domain, whose composite axis is
  a per-vertex (t, x, y, z) tuple.

What remains unproven, and is the whole point of this spike: **that the per-vertex M ordinate
survives WKT parsing and arrives at the provider intact**. Below Shapely 2.1 built against GEOS
3.12 it does not: M comes back as NaN, silently, before any provider code runs, so FR-20 fails
without raising an error (FR-51). Everything after that proof is a build, and the build belongs to
the query-layer feature.

### User Story 1 - M survives parsing, and is seen to (Priority: P1)

Someone runs one script. It parses a `LINESTRINGZM` with a distinct time on every vertex, at the
versions drogna intends to pin, and prints the M ordinates it recovered. Then it does the same at a
version below the pin and prints NaNs, so the failure mode the pin exists to prevent is on the page
rather than in an assertion someone has to trust.

**Why this priority**: It is the one thing §10 still calls unproven, and its failure mode is
silence. A trajectory query that returns HTTP 200 with values evaluated at a meaningless time is
the outcome most likely to be believed by mistake.

**Independent Test**: Run the probe script at both version sets. The recovered M values match the
values put in at the pinned versions, and are NaN below the pin.

**Acceptance Scenarios**:

1. **Given** Shapely 2.1 or later built against GEOS 3.12 or later, **When** a `LINESTRINGZM` whose
   vertices carry distinct M values is parsed with `shapely.wkt.loads`, **Then** every M value is
   recovered exactly and in order.
2. **Given** a Shapely or GEOS version below the pin, **When** the same string is parsed, **Then**
   the M ordinates come back as NaN and no exception is raised, and the probe records both facts.
3. **Given** either run, **When** the probe finishes, **Then** it prints the Shapely version, the
   GEOS version it was built against, and the recovered ordinates, into a captured result file.
4. **Given** the recovered geometry, **When** the Z ordinate is examined, **Then** the probe records
   the sign and unit convention it carries, because WKT Z is conventionally elevation while the
   coverage's vertical axis is depth positive downwards, and the provider must reconcile the two.
5. **Given** the probe exists, **When** it is read, **Then** it is written so that the deployment can
   adopt it directly as the test FR-51 requires, rather than needing it rewritten.

---

### User Story 2 - The geometry reaches a provider untouched (Priority: P2)

A throwaway provider plugin is registered with a pygeoapi instance and asked for a trajectory. It
records exactly what pygeoapi handed it: the geometry type, the coordinate tuples, the M values, the
query parameters, and anything the framework did to them on the way. The finding quotes that record.

**Why this priority**: The claim that pygeoapi passes the geometry to the provider untouched is the
load-bearing assumption behind FR-50. It is cheap to verify here and expensive to discover wrong
during the build.

**Independent Test**: Bring up the instance with one command, issue one trajectory request, and read
the recorded hand-off.

**Acceptance Scenarios**:

1. **Given** a pygeoapi instance with the throwaway provider registered, **When** a trajectory query
   is issued, **Then** the provider's trajectory method is called and records the geometry it was
   given.
2. **Given** the recorded hand-off, **When** it is compared with the request, **Then** every vertex's
   latitude, longitude, Z and M matches what was sent, or the difference is recorded exactly.
3. **Given** the collection metadata, **When** it is fetched, **Then** the finding records whether
   the collection advertises `trajectory` among its query types once the plugin declares it, since
   FR-21 depends on collections being servable without hand-editing.
4. **Given** a trajectory of enough vertices to make the request URL long, **When** it is issued,
   **Then** the finding records the point at which the request becomes impractical and whether a
   POST form of the query exists.

---

### User Story 3 - One four-dimensional route, sampled and scored (Priority: P3)

The throwaway provider evaluates a small synthetic four-dimensional coverage at each vertex's own
time and returns CoverageJSON. The route's values are compared against the analytic expectation
computed two ways: each vertex at its own time, and every vertex at the first vertex's time. The
fixture is built so those two answers cannot be confused.

**Why this priority**: It converts the parsing proof into an end-to-end demonstration of FR-20's
actual claim — conditions forecast for the moment of arrival — and it rehearses in miniature the
scoring AT-01 will do against the generator's ground-truth manifest.

**Independent Test**: Run the query script; it prints the returned values beside both expectations
and the resulting errors.

**Acceptance Scenarios**:

1. **Given** the fixture coverage and a route of the order of twenty vertices crossing latitude,
   longitude, depth and time, **When** the trajectory query is issued, **Then** the returned values
   match the per-vertex expectation within the fixture's stated tolerance.
2. **Given** the same returned values, **When** they are compared against the single-time
   expectation, **Then** they differ from it by at least ten times that tolerance, so the result
   cannot be explained by a query evaluated at one moment.
3. **Given** vertex times that fall between the coverage's time steps, **When** the response is
   examined, **Then** the finding records whether the provider stub interpolated or snapped, and
   states which behaviour the real provider should implement and why AT-01's reported error depends
   on the choice.
4. **Given** the response, **When** it is validated, **Then** it is well-formed CoverageJSON of the
   Trajectory domain type, with a composite axis carrying one (t, x, y, z) tuple per vertex.
5. **Given** vertices outside the domain in space, in depth, or beyond the last time step, **When**
   they are queried, **Then** the behaviour — error, null, nearest value or extrapolation — is
   recorded, because the real provider must choose deliberately.

---

### User Story 4 - The finding, and the groundwork handed to the build (Priority: P4)

The dated finding states the result, quotes the evidence, and hands the query-layer feature what it
needs to start building: the provider base class and the methods to implement, how a collection
selects the plugin, the version pin with the comment FR-51 requires, and the adoptable parsing test.
The decision is transcribed into an ADR.

**Why this priority**: The spike is disposable and the build is not. Everything the build would
otherwise have to rediscover is written down once, here.

**Independent Test**: A reader drafting the query-layer plan can start the provider without opening
the spike's code.

**Acceptance Scenarios**:

1. **Given** the spike has run, **When** the finding is written, **Then** it states in one sentence
   whether M survives parsing at the pinned versions, with the versions named and the run dated.
2. **Given** the finding, **When** the build section is read, **Then** it names the provider base
   class, the methods the plugin must implement, where the plugin will live, and what FR-21 requires
   of the collection configuration.
3. **Given** the finding, **When** the deployment section is read, **Then** it gives the exact
   version pin, the comment that must accompany it, and the test that asserts M survives.
4. **Given** the finding, **When** the ADR is written, **Then** it carries Status, Context, Decision
   and Consequences, records that no supplied provider implements trajectory, and names the
   alternatives rejected.
5. **Given** the spike directory is later deleted, **When** a reader asks why drogna carries a
   bespoke EDR provider and a Shapely version pin, **Then** the ADR answers without it.

---

### Edge Cases

- **The failure the pin exists to prevent**: M returns as NaN with no exception. The probe must
  demonstrate this deliberately at a version below the pin, or the pin is folklore.
- M survives parsing but the pinned versions are unavailable in the container image drogna intends
  to deploy. The finding records the image and how the pin is satisfied there.
- M does not survive even at the pinned versions. This is the one outcome that reopens the shape of
  the read path and the client's centrepiece (SRD §10 priority 2). FR-013 below requires the finding
  to record the narrow contingency — parsing `coords` from the raw query string inside the plugin,
  bypassing the framework's geometry parsing — with its cost, so the position is not discovered
  under pressure later.
- `LINESTRINGM` and `LINESTRINGZM` behave differently: a three-dimensional route without depth is a
  legitimate query and must be recorded separately from the four-dimensional case.
- Z is elevation by WKT convention and depth positive downwards in the coverage. Whichever way the
  provider resolves it, a route that ascends and one that descends must be distinguishable in the
  result, or the sign error will be invisible.
- Vertex times that are not monotonic, or a repeated vertex. The finding records what the framework
  does before the provider sees it.
- A trajectory long enough to exceed a URL length limit at the server or a proxy.
- The pygeoapi version tested differs from the version later pinned in the Compose configuration.
  The finding records the version and the condition for re-running.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The spike MUST demonstrate that the M ordinate of a `LINESTRINGZM` survives
  `shapely.wkt.loads` with Shapely 2.1 or later built against GEOS 3.12 or later, recovering every
  vertex time exactly and in order. (SRD FR-51, FR-20)
- **FR-002**: The spike MUST demonstrate the failure mode below those versions — M returned as NaN
  with no exception raised — so the pin rests on evidence rather than on report. (SRD FR-51)
- **FR-003**: The spike MUST record the Shapely version, the GEOS version it was built against, the
  pygeoapi version and the container image digest for every run it reports. (SRD FR-51)
- **FR-004**: The spike MUST record what pygeoapi hands to a provider for a trajectory query —
  geometry type, per-vertex coordinates, M values and query parameters — and compare it with what was
  requested. (SRD FR-50, §5.3)
- **FR-005**: The spike MUST register a throwaway EDR provider plugin with a pygeoapi instance,
  implementing only enough to record the hand-off and answer a trajectory query. (SRD FR-50)
- **FR-006**: The throwaway provider MUST evaluate the fixture coverage at each vertex's own time,
  so the demonstration exercises FR-20's actual claim rather than a single-time query in trajectory
  clothing. (SRD FR-20)
- **FR-007**: The fixture MUST make the result falsifiable: the values expected under per-vertex
  evaluation and under single-time evaluation MUST differ, at every vertex, by at least ten times the
  fixture's stated numerical tolerance. (SRD FR-20, AT-01)
- **FR-008**: The spike MUST establish that the response is well-formed CoverageJSON of the
  Trajectory domain type, with a composite axis carrying one (t, x, y, z) tuple per vertex.
  (SRD FR-19, FR-20)
- **FR-009**: The spike MUST record the vertical convention: WKT Z as elevation against the
  coverage's depth axis positive downwards, and which reconciliation the real provider must apply.
  (SRD FR-02, FR-20)
- **FR-010**: The spike MUST record the behaviour of vertices outside the domain in space, in depth
  and beyond the last time step, and whether values between coverage time steps are interpolated or
  snapped, since AT-01's reported error depends on both. (SRD AT-01)
- **FR-011**: The spike MUST deliver the parsing assertion in a form the deployment can adopt
  directly as the test FR-51 requires, together with the exact version pin and the comment that must
  accompany it. (SRD FR-51, NFR-05)
- **FR-012**: The finding MUST hand the build what it needs: the provider base class, the methods to
  implement, where the plugin lives, how a collection selects it, and what FR-21 requires of the
  collection configuration. (SRD FR-50, FR-21)
- **FR-013**: The finding MUST record, in one section and with its cost, the contingency that applies
  if M does not survive even at the pinned versions: parsing `coords` from the raw query string inside
  the plugin, and what that would mean for the read path and for the client's four-dimensional route
  rendering. (SRD §10 priority 2, FR-47)
- **FR-014**: The finding MUST be a dated markdown document under `spikes/edr-trajectory/`, stating
  the question, the method, the evidence, the result and the handover. (SRD §8.1, repo layout)
- **FR-015**: The decision MUST be transcribed into an ADR, which survives deletion of the spike
  directory. (SRD §5.3 note, PR-03)
- **FR-016**: The reproduction MUST run from a clean checkout with one documented command and MUST
  NOT depend on any other part of drogna, none of which exists at this point in the delivery order.
  (SRD §10 priority 2)
- **FR-017**: The fixture coverage MUST be generated from a fixed seed, be CF-conventions NetCDF
  varying in latitude, longitude, depth and time, be under 5 MB, and carry a metadata attribute
  stating that the data are synthetic. (SRD FR-01, FR-02 in miniature, NFR-07)
- **FR-018**: Nothing under `spikes/` may be imported by drogna's code. The real provider plugin is
  built by the query-layer feature; the throwaway one is deleted with the spike. (SRD §1.1, repo
  layout)
- **FR-019**: The spike MUST be timeboxed. On expiry the finding records what was established and
  what was not. (SRD §10)

### Key Entities

- **Trajectory query**: A request for values along a path through the forecast volume, expressed as
  WKT `LINESTRINGM` or `LINESTRINGZM` where M carries the time of arrival at each vertex.
- **M ordinate**: The per-vertex time. The single thing this spike exists to prove survives parsing.
- **Version pin**: Shapely 2.1 or later built against GEOS 3.12 or later, with the comment saying
  what silently breaks below it.
- **Throwaway provider**: A minimal pygeoapi EDR provider plugin that records the hand-off and
  answers one trajectory query. Deleted with the spike.
- **Fixture coverage**: A small synthetic four-dimensional NetCDF field whose analytic form is known,
  so expectations are computed rather than eyeballed.
- **Discriminating expectation**: The pair of value sets — per-vertex and single-time — whose
  separation makes the result falsifiable.
- **Finding**: The dated document: question, method, evidence, result, handover to the build.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The probe recovers every M value exactly at the pinned versions, and reports NaN for
  every M value below the pin, in the same run report.
- **SC-002**: A reader who has not seen the repository reproduces both results in under ten minutes,
  using one command and the spike's README.
- **SC-003**: The recorded provider hand-off matches the issued request vertex for vertex, or every
  difference is quoted.
- **SC-004**: At every route vertex, the values returned match the per-vertex expectation within
  tolerance and differ from the single-time expectation by at least ten times that tolerance.
- **SC-005**: The response validates as CoverageJSON with a Trajectory domain and one (t, x, y, z)
  tuple per vertex.
- **SC-006**: The finding names the Shapely, GEOS and pygeoapi versions, the image digest, the
  fixture seed and the run date, and quotes requests and responses verbatim.
- **SC-007**: A reviewer drafting the query-layer plan raises no question about the provider seam,
  the version pin or the vertical convention that the finding does not answer.
- **SC-008**: The parsing test is adopted by the deployment unchanged, and the version pin carries
  the comment FR-51 requires.
- **SC-009**: No file outside `spikes/` imports anything inside it.
- **SC-010**: The spike closes within its timebox with a recorded result.

## Assumptions

- The spike is timeboxed to two working sessions. The SRD sets no timebox; this one is chosen so a
  narrow proof cannot expand into a build, which now belongs elsewhere.
- The pygeoapi version tested is the one the Compose configuration intends to pin. If they diverge,
  the finding's re-run condition applies.
- The throwaway provider is the crudest thing that can record a hand-off and answer a query. It is
  not a draft of the real plugin, and the finding says so, because a spike promoted into production
  is how a bespoke component acquires an unexamined design.
- The fixture is a stand-in for the environment generator (feature 004), which does not exist yet.
  One analytic parameter varying in all four dimensions, enough to discriminate and no more.
- `spikes/` is excluded from the wall-clock, seeded-RNG and literal-path gates by the shared
  exclusion list owned by feature 001. The spike still uses a fixed seed, because a reproduction that
  cannot be reproduced is not one.
- The real provider plugin lives under `query/` and is built by the query-layer feature. This spike
  writes down its seam and nothing more.
