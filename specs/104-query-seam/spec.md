# Feature 104 — the query seam

**Beat:** *it is served* (plan §5).
**Source of scope:** SRD-v2 §5.4 (FR-26 to FR-29), FR-38's boundary behaviour for
the released prefixes, AT-01.

## What this feature delivers, visibly

The holdings and the observations are answered through standard interfaces, through
the release gate, from the browser's own address bar: OGC API-EDR (landing,
conformance, collections, position and trajectory queries returning CoverageJSON)
over the coverage store, and read-only OGC SensorThings (Things, Datastreams,
Observations with `$top`/`$skip`) over the observation store. The boundary's allow
list gains exactly two data prefixes; everything else stays default-deny.

## The honest-subset discipline (FR-27, E9)

- The served subset statement (`GET /api/ctl/query-subsets`, its own master) is
  held equal to the fenced JSON in `docs/architecture/query-subsets.md` by a test:
  the statement is amended in the same commit as the code or the build fails.
- Every refusal names the thing refused: an unimplemented query type names itself
  and the implemented list; a bad WKT names the accepted shape; an unserved
  parameter names the served ones; an out-of-extent position names the extent.
- Values come from the **stored bytes**, nearest-neighbour, with the snapped grid
  point reported in the domain — the seam serves what publication digest-checked,
  never a fresh evaluation.
- Collections are enumerated from the store by convention (FR-29): archive,
  now-cast, and each future instance holding, with extents read from the store and
  verified against it by test.

## Acceptance evidence

- **AT-01 passes**: a 4D trajectory (per-vertex depth and POSIX time, FR-28)
  through the gate returns values that match the analytic form re-evaluated from
  the manifest's own recorded parameters at the snapped points, within the
  manifest's recorded tolerance — nothing typed into the test.
- Discovery, position, trajectory, service root, Things and Observations responses
  all validate against their masters ($defs-addressed validation added to the seam
  validator for the purpose).
- The contract is declared: `contracts/openapi/query.openapi.yaml`, `$ref`-ing the
  JSON Schema masters, so V3 generates from the same sources (NFR-02).

## Deliberately not in this feature

- The EDR composer UI (feature 109 owns it, FR-41).
- Serving the feature store's geometries: lands with the advisories collection at
  108, which establishes the features-collection pattern; recorded here so the gap
  is a decision, not an oversight.
- SensorThings `$filter`/spatial predicates: V1's `st_within` lesson (E9) says one
  predicate at a time; none is needed until a consumer asks. Refused by name
  meanwhile.
- CoverageJSON domain types beyond Point and Trajectory.
