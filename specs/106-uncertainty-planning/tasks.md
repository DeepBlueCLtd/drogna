# Feature 106 — tasks

- [x] T501 config.planner master (every constant of the formulation as
      configuration, region feature included); run.json, roles, plan message schema
      mapping; h3-js dependency
- [x] T502 Uncertainty model: u_sat from the published spread (memoised per cell ×
      time step), τ from the published manifest (memoised, no fallback constant),
      deficit records, multiplicative collapse, explicit footprint over the cover
- [x] T503 Planner: cover by overlap over the region feature, sounding dedupe,
      walked routes with arrival-instant scoring, greedy insertion + seeded
      restarts + shortlist, memoised walks, naive figure on demand, projections,
      commitment accounting, plan message to the master
- [x] T504 Runtime wiring, participants, streams; replan on cadence and on field
      replacement
- [x] T505 Tests: honest quiet, master-valid walked plan, the model's four
      consequences against a published field, determinism
- [ ] T506 The V1 optimality-gap measurement (exhaustive vs heuristic on small
      instances) — *deferred: the V1 measurement stands in the archived record for
      the same formulation; re-measuring in TS is worth doing when a blog post
      wants the figure, and the harness's own claim (right formulation +
      determinism, not optimality) is already tested.*
- [ ] T507 The wrong-implementation companion test (present-scoring vs
      arrival-scoring side by side) — *deferred with its V1 lesson recorded in the
      test that replaced it: this field grows, so the naive figure published in
      every message IS the visible gap; revisit if the spread model ever stops
      growing with lead.*
