# Feature 106 — uncertainty and planning

**Beat:** *doubt is measured, and directed* (plan §5).
**Source of scope:** SRD-v2 §5.6 (FR-33, FR-34); the formulation is
`docs/algorithms/informative-path-planning.md`, carried whole from V1, with the
plan message to the carried `plan.schema.json` master (H3 indexing, walked routes,
the naive figure beside the honest one).

## What this feature delivers, visibly

The planner (V2-C14) lights in System and `ctl/plan` carries master-valid
sampling recommendations: a committed route of H3-indexed vertices with per-vertex
arrival times and marginal values, the selection accounted (candidates considered
vs visited, restarts), the commitment stated (retained prefix, departure,
improvement, margin), and per-region projections of when confidence lapses —
`already-lapsed` being exactly what arriving cold looks like.

## The formulation, carried

- **u(c,t) = u_sat − (u_sat(t₀) − u₀)·e^(−(t−t₀)/τ)**, floored at zero: never
  informed sits at the spread; just informed is worth nothing; regrowth at the
  local τ, evaluated from the *published* ground-truth manifest at the instant
  asked about (the manifest's sufficiency claim, used); no fallback constant.
- **The planner reads only what publication released**: the spread instance the
  run-published announcement named (digest carried in the plan), the now-cast
  manifest, and the read-only region feature. It subscribes and it reads stores;
  it commands nothing (FR-34) — the plan master admits no free sentence.
- **Routes are walked** against the state at each arrival instant, collapse and
  regrowth included; the sensing footprint is the explicit configured
  product-of-decays model, memoised over the cover; selection is prize-collecting
  orienteering by greedy insertion with seeded restarts from the named stream.
- **One sounding is one measurement**: deduped by (thing, tick), so collapse is
  never applied three times for one visit.
- Replans on the configured cadence, and immediately when the field it was
  computed from is replaced.

## Acceptance evidence

- Honestly quiet before the loop turns: no field → no hollow message; state in
  the heartbeat.
- Once the loop turns: master-valid plan, walked route within budget, strictly
  increasing arrivals, digest naming the exact spread bytes, projections present.
- The four load-bearing consequences of u(c,t) held against a genuinely published
  field, including regrowth to saturation at ~20τ.
- The published naive figure differs from the walked value — on this growing
  spread field it is *smaller*, the algorithm doc's own second error case, and the
  test says so rather than asserting the static-field inequality.
- Determinism: one seed, one plan, twice, byte-equal.

## Deliberately not in this feature

- Uncertainty *rendering* (109's map draws it decaying and refreshing).
- The platform adopting recommended routes: the planner recommends and the loiter
  stands — Constitution VIII's boundary is *who recommends*, and the scenario's
  sampling behaviour is configuration. (Amends 103's "until then" phrasing: not
  "until 106" — until a scenario that steers by recommendation is wanted at all.)
- A worker thread for the search: a replan costs ~1–2 s on the main thread (V1
  quoted 2.5 s host time), felt only at high clock rates; moving it off-thread
  would reopen the lockstep determinism question ADR-0030 closed, so it stays
  in-thread until profiling in anger says otherwise.
