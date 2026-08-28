# What drogna implements of OGC SensorThings API Part 1 (Sensing)

**This interface is not conformant, and does not claim to be.** It implements a stated
subset of Part 1 (Sensing). Everything absent is listed below with the reason it is absent,
so that a reader learns the limits here rather than by issuing a query that fails.

A harness that overstates its conformance is worth less as evidence than one that states a
small conformance accurately. That is the whole argument for this document existing.

Every value served is synthetic. The numerics are deliberately fake, and nothing served here
describes a real place or a real measurement.

This document and the statement the interface serves in its own metadata are checked against
one another by a test, and both are generated from the same constants the code enforces
(`query/plugins/sensorthings_entities.py` and `query/plugins/sensorthings_options.py`). A
conformance claim that is true in only one of the places it appears is worse than none.

## Why this is a bespoke provider at all

pygeoapi ships a provider named `sensorthings`. It is an HTTP *client*: it queries an
external SensorThings service, transforms the entities it receives, and republishes them as
OGC API - Features. It consumes the standard rather than providing it, and drogna has a
Postgres observation store and no external service to point it at. ADR-0004 records the
decision and the alternatives that were rejected.

## Entity sets served

- `Things`
- `Sensors`
- `ObservedProperties`
- `Datastreams`
- `Observations`
- `FeaturesOfInterest`

Each is addressable as a resource, each entity is addressable by its own identifier, and
every entity carries a self link and one navigation link per relationship it has — so the
entity set can be walked from the service root without prior knowledge of the path grammar.

The served `Datastreams` are temperature, salinity and pressure. There is no sound-speed
datastream: sound speed is derived at the point of use by one shared implementation and is
never published or stored (ADR-0005).

## Entity sets absent, and why

- `Locations` — The store holds the location each observation pertains to, which is served as
  that observation's `FeatureOfInterest`. It does not hold a platform's location history.
  <!-- harness:allow-forbidden-vocabulary FR-026 asks that the reason be visible, and the reason is the word -->
  A Thing's location history is a track by another name, and Constitution V forbids the
  harness to hold one. This is a decision, not an oversight.
- `HistoricalLocations` — The same reason, under the standard's own name for it.

## The resource path grammar

```text
/<EntitySet>
/<EntitySet>(<id>)
/<EntitySet>(<id>)/<NavigationProperty>
```

One navigation step. A deeper path is refused with the grammar named, rather than
half-answered.

Those paths hang off the collection's item path, because the entity set is served by a
pygeoapi provider plugin and a provider plugin cannot add routes of its own:

```text
<base>/collections/observations/items/Datastreams('ds-temperature')/Observations
```

`.../items` with no entity set after it is an OGC API - Features resource, and this
collection has no features. It answers with an empty feature collection carrying this
statement and the list of entity sets beside it, so a consumer starting there is pointed at
the entity sets rather than at an error.

## Query options implemented

- `$top` — page size, bounded by the configured maximum.
- `$skip` — page offset. A full page carries an `@iot.nextLink`; a short page does not,
  because a next link on a short page invites a round trip that returns nothing.
- `$count` — the total, as `@iot.count`, without retrieving every page.
- `$orderby` — on `phenomenonTime` only, ascending or descending.
- `$filter` — comparisons on `phenomenonTime` (`eq`, `ne`, `gt`, `ge`, `lt`, `le`), and
  exactly one spatial predicate: `st_within(location, geography'POLYGON (…)')`, the
  observation's own sampled position inside a single drawn ring — joined by `and`, so a
  drawn geometry and a time window select together, server-side (ADR-0025).
- `$expand` — one level: from a `Datastream` to its `Sensor`, `ObservedProperty` and `Thing`,
  and from an `Observation` to its `Datastream` and `FeatureOfInterest`.

`phenomenonTime` is **simulation time**. No arrival time and no insertion time is exposed,
filterable or orderable. A consumer able to filter on when a row was written could
reconstruct the order the harness happened to write it in, which is not a fact about the
simulated world (Constitution I).

## Query options absent, and why

Each of these is out of scope **by decision**. A request using one is refused with the option
named and this statement pointed at. None is ignored, and none is answered as though it had
been applied: a silently dropped query option returns an answer to a question nobody asked,
and it looks exactly like a correct one.

- `$select` — Nothing needs a partial projection, and a projection is a second shape of the
  same entity for the generated types to carry.
- `$search` — No free-text search exists over this store, and none is simulated.
- `$apply` — Aggregation is out of scope; the harness aggregates nowhere else either.
- `$value` — A raw property value has no consumer here.
- `$ref` — A link-only representation has no consumer here.
- Nested `$expand` — Expansion is to a single level. A nested expansion multiplies the
  response size on a destination chosen to be small, for a shape nothing asks for.
- Query options inside an `$expand` — Not implemented; the expanded set is returned whole,
  bounded by the configured page size.
- `$filter` on any property other than `phenomenonTime` and, for the one spatial
  predicate, `location` — result values included. A filter on any other property is a
  query the harness has no use for and would have to be tested to claim.
- The filter language's geospatial and temporal functions, save one — of them, exactly
  `st_within(location, geography'POLYGON (…)')` is implemented (ADR-0025): a single-ring
  polygon over the observation geometry, nothing else. `st_intersects`, `geo.distance`,
  every other function, `st_within` on any other property, and any other geometry —
  holes and multipolygons included — are refused with the offending part named.
- Every write operation, and deep insert — The query layer holds select permission on the
  observation store and nothing more.
- The Part 2 Tasking entities — Out of scope; the harness tasks nothing.
- The Part 1 MQTT subscription extension — Not implemented. This is the confusion most likely
  to arise here, because the harness does run a broker and does publish observations in
  SensorThings vocabulary on it. That broker is not a SensorThings endpoint, and subscribing
  to it is not this standard.

## Response limits

Page size defaults and maxima are configuration values, stated in
`config/<destination>/query.json` and reported in a refusal that names the limit. The
droplet is small, and a response that cannot be produced is worse than one that is refused.
