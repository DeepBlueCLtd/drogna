# ADR-0004: SensorThings is served by a bespoke pygeoapi provider

**Status:** Accepted
**Date:** 26 August 2026
**Requirement:** SRD FR-19; constrains FR-16, C-06, C-09
**Related:** ADR-0003, which took the same decision for EDR trajectory

## Context

FR-19 requires the query layer to expose collections conforming to OGC SensorThings
Part 1 (Sensing) over the observation store. The constitution names pygeoapi as the
query layer. Feature 008's specification work established that these two statements
cannot both be satisfied as written.

pygeoapi ships a provider named `sensorthings`, and the name is misleading for our
purposes. It is an HTTP **client**: it queries an external SensorThings service with
the `requests` library, transforms the entities it receives into GeoJSON, and
republishes them as OGC API - Features collections. It requires a `data` URL pointing
at a SensorThings collection endpoint that someone else is already serving. It does
not serve the SensorThings entity set — Things, Sensors, ObservedProperties,
Datastreams, Observations, with their navigation links — from a database of one's own.

So pygeoapi consumes SensorThings; it does not provide it. drogna has a Postgres
observation store and no external STA service to point at.

Four options were considered.

**FROST-Server as a second query component.** The FraunhoferIOSB reference
implementation, Docker-packaged and Postgres-backed, serving STA behind the same
reverse-proxy path prefix while pygeoapi keeps EDR. Lowest risk to the standards
claim. But FROST owns its database schema, so the observation store becomes FROST's
model and the ingest client (C-05) writes into it — a large change to feature 007 and
to the single-ingestion-seam story, in exchange for a component drogna would not be
learning anything from, since the point is to understand the seams, not to operate a
reference server.

**FROST serving STA with pygeoapi consuming it.** Uses pygeoapi's provider as designed
and exercises both standards genuinely. But it puts two services and an extra hop in
the read path, and it doubles the liveness and failure-mode story for no gain in
understanding.

**Amending FR-19 to vocabulary only**, as FR-16 is already narrowed. Cheapest, no new
component. Rejected: the repository exists to trial OGC API-EDR *and* SensorThings, and
this drops half of that.

**A bespoke provider.**

## Decision

drogna implements a **bespoke pygeoapi provider plugin** serving the SensorThings Part 1
(Sensing) entity set from the `observations` schema, under `query/plugins/`.

This is the same decision as ADR-0003 and for the same reason: where the standard is
ahead of its implementations, drogna writes the adapter rather than bending the
architecture around a gap. It keeps one query layer, one observation store schema under
our control, and leaves feature 007 untouched.

## Consequences

- Feature 008 gains a second substantial build alongside the EDR trajectory provider.
  Its task list grows accordingly and its User Story 4 changes from establishing
  whether the entity set can be served to building the thing that serves it.
- Feature 007 is unaffected. The observation store schema stays drogna's own, and the
  ingest client remains the sole writer (FR-18) without an intermediary.
- **The conformance scope must be stated plainly, and it is not "conformant".**
  SensorThings Part 1 is a large surface: the entity model, navigation links, `$expand`,
  `$filter`, `$select`, `$orderby`, paging, and the resource path grammar. drogna
  implements the subset its own client and acceptance tests exercise. Which subset, and
  which parts of the standard are absent, is documented on the collection itself and in
  the standards primer — not discovered by a reader issuing a query that fails. A
  harness that overstates its conformance is worth less as evidence than one that
  states a small conformance accurately.
- The plugin is a compatibility surface against pygeoapi's provider base class, as the
  trajectory provider already is. Two such surfaces share the maintenance question, and
  it is worth them sharing an answer: both are pinned to the same pygeoapi version and
  both fail loudly on a version they have not been tested against.
- Sound speed is not among the served datastreams. It is derived, not measured, and
  ADR-0005 records where.
