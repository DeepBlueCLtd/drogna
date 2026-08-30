# Feature 103 — tasks

- [x] T201 Masters: config.sensors, config.ingest, config.observation-store,
      config.feature-store; config.run extended; topology master amended for V2
      (cov/adv namespaces, hyphenated roles, scanner paths)
- [x] T202 Sensors: loiter as pure function of sim time, world-sampler port,
      deterministic noise draws, full SensorThings context on every message
- [x] T203 Ingestion seam: master validation, named observable refusals, redelivery
      absorption, sole writer
- [x] T204 Observation store (phenomenon-time order, entity sets as functions of
      traffic) and feature store (structurally read-only reference geometry)
- [x] T205 Topology scanner + committed artefact + drift gate (watched failing on a
      stale fixture) + generated embedding
- [x] T206 Topic tree in Messages: declared structure, traffic-only light,
      pulse/ripple/sustained, roles column, wide-branch collapse, undeclared-topic
      finding
- [x] T207 Tests: cadence counts, confinement, refusal, redelivery, determinism,
      read-only feature store, tree illumination
- [x] T209 Sampling cadence 30 ticks to 5, and the platform's ownship reporting with it.
      The pair moves together or not at all: the sensors treat a position older than
      their own cadence as no position, so shortening theirs alone starves them — seen
      on the running page, where the sensors went quiet and skipped 49 sampling ticks.
      The reason is the flow chart: at real time the instruments were the only thing
      putting traffic on a drawn wire, so the picture was dark twenty-seven seconds in
      every thirty and a reader could not tell it from a display that had stopped. The
      cost is stated rather than hidden — five tests across features 103, 104, 107 and
      113 were written against the old cadence and are now derived from it, which is
      what should have been true of them anyway.
- [ ] T208 Message-rate ripple tuning against real accelerated-rate traffic —
      *declined for now: the smoothing constants are display-only and best judged
      against 107's rate controls; revisit at the operator's-view beat.*
