# The query seam's subsets

The query components (V2-C09) implement genuine subsets of two OGC standards, and
this page is the documented half of the agreement FR-27 requires: the served
statement (`GET /api/ctl/query-subsets`, of `query-subsets.schema.json` shape) and
the JSON below are held equal by a test, so amending one without the other fails
the build. The subset grows one capability at a time, and every refusal names the
thing refused — the option, the shape, the property, the extent (E9).

```json
{
  "schema_version": 1,
  "edr": {
    "standard": "OGC API - Environmental Data Retrieval 1.1",
    "query_types": ["position", "trajectory"],
    "parameters": ["temperature", "salinity"],
    "interpolation": "nearest neighbour on the stored grid, in all four dimensions; the snapped grid point is reported in the domain",
    "refused_by_name": ["radius", "area", "cube", "corridor", "items", "locations", "instances", "crs", "f", "within", "within-units", "resolution-x", "resolution-y"]
  },
  "sensorthings": {
    "standard": "OGC SensorThings API Part 1: Sensing 1.1, read-only",
    "resources": ["Things", "Datastreams", "Observations", "Datastreams('id')/Observations"],
    "query_options": ["$top", "$skip"],
    "refused_by_name": ["$filter", "$orderby", "$select", "$expand", "$count", "Sensors", "ObservedProperties", "FeaturesOfInterest", "Locations", "HistoricalLocations"]
  }
}
```

## What the words above commit to

- **EDR** serves the coverage store's holdings as collections by convention
  (`archive`, `nowcast`, and each forecast instance by holding id from feature
  105) — a new holding is servable without editing query configuration (FR-29).
  Responses are CoverageJSON in the committed subset (`coveragejson.schema.json`).
  Trajectory coordinates are `LINESTRINGZM(lon lat depth posix_seconds, …)`:
  per-vertex depth and time, conditions at the moment of arrival (FR-28). Values
  come from the **stored bytes**, nearest-neighbour; the domain reports the grid
  point the request snapped to. Sound speed is not a parameter and never will be
  (ADR-0005).
- **SensorThings** is read-only over the observation store: the write path is the
  broker, and no server takes part in it (the V1 stance, carried). Entity content
  is a function of the traffic; `resultTime` is null, stated, because the harness
  records phenomenon time only.
- Discovery documents state extents read from the store and verified against it by
  test; the collection landing carries only relative hrefs (FR-04, E7).
