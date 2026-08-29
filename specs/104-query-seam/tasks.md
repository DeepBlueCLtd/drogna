# Feature 104 — tasks

- [x] T301 Masters: coveragejson (subset), edr-collections ($defs library),
      sensorthings-subset ($defs library), query-subsets, config.query;
      config.run + boundary allow list extended
- [x] T302 Router prefix registration; WKT subset parser (POINT, LINESTRINGZM)
      with named refusals; nearest-neighbour field sampler over stored bytes
- [x] T303 EDR: landing, conformance, collections-by-convention with truthful
      extents, position, trajectory with per-vertex time (FR-28)
- [x] T304 SensorThings: service root, Things, Datastreams, Observations (+ nested),
      honest paging, refusals by name
- [x] T305 Subset statement served + documented + held equal by test;
      contracts/openapi/query.openapi.yaml declaring the HTTP contract
- [x] T306 Tests: AT-01 with manifest-derived tolerance; master validation of every
      response; named refusals; extent truthfulness; inventory/EDR agreement
- [ ] T307 CoverageJSON served with application/prs.coverage+json content type —
      *declined for now: the shim answers everything as application/json; the OpenAPI
      records the intended media type, and switching is a one-line change best made
      with 109's composer, which is the first consumer that will care.*
