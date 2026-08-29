# Feature 108 — tasks

- [x] T701 Masters: advisory (no-free-text property), config.advisory-source,
      config.advisory-store, config.offload, features-response; query-subsets and
      config.query grow the features block/prefix; bundle-manifest,
      offload-telemetry and run-manifest carried from V1's 014/018 as designed
- [x] T702 Advisory source: authors deterministically from its seed stream on the
      configured cadence, guidance from the world's own background profiles,
      region from the feature store — nothing free-text anywhere
- [x] T703 Advisory store: append-only behind its own ingestion seam, master
      validation, size ceiling refused with the limit named, redelivery absorbed
- [x] T704 Offload packager: bundle manifest + run-manifest sibling per published
      run, geometry beside and never inside (E11), derived identifiers,
      announcement-only telemetry on ctl/offload with an honest ledger
- [x] T705 Features face on the query component: advisories + reference
      collections through the release gate, present-and-stating-empty, refusals
      by name; subset statement and documented account amended together
- [x] T706 Runtime wiring: three components constructed and validated, manifest
      participants and streams grown, advisory-store protected, counts 16→19 in
      the panel and runtime tests; Intro grown by 108
- [x] T707 Tests: no-free-text walk over the master itself, cadence and
      determinism, ceiling refusal (watched failing — seam disabled, suite red,
      reverted), advice-travels-light measured, E8/E9/E11 evidence, replay
      byte-identity for advisories and staged bundles
- [x] T708 Leakage mask scoring (issue #57): the comparison itself is built and
      held by test — per-variable change masks, the buffered geometry, the worst-of
      recovery statistic against a bound derived from the mask's own size, and every
      inconclusive case named rather than passed. That a known leak is caught is a
      permanent test, not a plant done once: a release that only updates where it measured is
      scored and must be detected, and a domain-wide rewrite must not be able to
      hide one leaking variable inside a union that scores at chance (V1's FR-015,
      watched failing against a union-only reading).
- [ ] T712 Leakage mask scoring as a **gate** — *not done, and the open question's
      premise turned out to be only a third of it. Measured against this harness's
      own releases: (1) the loiter scenario's measurements in a release interval
      span 3.9 km against a 60 km identification radius, so the buffer is a single
      blob and V1's FR-017 calls that inconclusive whatever the kernel does; (2)
      with the per-cell noise suppressed, two successive releases initialised from
      the same now-cast are identical value for value, so there is no mask at all;
      (3) with the noise on, the mask is the whole domain and scores at chance — a
      pass earned by noise rather than by mitigation, which is what the question
      recorded. All three are held by a test that fails the day any of them stops
      being true. A gate needs a scoring configuration whose sampling spans more
      than the radius it is released under and whose successive releases differ:
      that is a scenario and a release-terms change, not a kernel change.*
