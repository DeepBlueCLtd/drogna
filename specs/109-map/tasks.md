# Feature 109 — tasks

- [x] T801 EDR area query: POLYGON WKT parsed, bounding box sampled from the
      stored bytes by the position query's own sampler, Grid-domain CoverageJSON;
      coveragejson and edr-collections masters grown; subset statement and
      documented account amended together; refusals name coords/shape/empty-box
- [x] T802 Shell configuration grows the map's endpoints (edr, features,
      query_subsets) and topics (plan, run_published, advisories) — no literal
      paths in the shell
- [x] T803 Map data builders, pure: grid cells, greyscale-legible ramp, advisory
      validity (start-inclusive, end-exclusive), route interpolation with holds,
      projection cells shaded by fraction of saturation
- [x] T804 Map panel over Deck.gl: field layer from the area query, doubt layer
      from the plan's projection, route as a 4D curve with time control and
      conditions-at-arrival on click, advisories drawn by validity and listed
      regardless, reference geometry; WebGL absence stated, never faked
- [x] T805 EDR composer as a mode of the map: guided sequence, literal URL always
      visible and copyable, offerings enumerated from served metadata, results
      rendered where asked, null/declined/absent as three facts; declines to
      guide a trajectory, saying why
- [x] T806 Intro grown by 109 and closed as the walkthrough script (FR-42)
- [x] T807 `pnpm replay-proof` (T607's long-deferred close-out): states the claim
      and its boundary, runs every replay test, propagates the verdict — watched
      failing against a planted Math.random() in the advisory source
- [x] T808 Tests: area query agreement with position query, builder boundaries
      (validity plant watched failing), composer URLs and three-fact
      classification, panel against the live backend with WebGL absent
- [ ] T809 Field time-scrubbing and a gridded spread layer — *deliberately not
      done, recorded with reasons in spec.md ("Deliberately not in this
      feature"): the projection cells already show doubt decaying and refreshing,
      and a per-frame seam round-trip cache would be a second store.*
