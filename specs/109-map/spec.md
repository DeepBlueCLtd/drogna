# Feature 109 — the map

**Beat:** *it is seen* (plan §5) — the arc's final beat and the demo's closing scene.
**Source of scope:** SRD-v2 §5.9 (FR-40 to FR-42); NFR-05 names Deck.gl.

## What this feature delivers, visibly

The **Map** tab draws, and the Intro completes into the walkthrough script. Every
pixel traces to a document that crossed the seam: no store is read, no analytic
form is evaluated shell-side, and where WebGL is unavailable the canvas states it
rather than pretending (Constitution VII, carried into presentation).

## The load-bearing choices

- **The field comes from a genuine EDR area query.** The subset grew one
  capability for the map (E9's grain): `area` takes `coords=POLYGON((…))`, samples
  the ring's bounding box at one `z` and one `datetime`, and returns a Grid-domain
  Coverage of the **stored** points — the same nearest-neighbour sampler the
  position query uses, so the map and a probe cannot disagree. The conformance
  statement, its documented account, the collections' `data_queries`, and the
  `coveragejson` master all grew in the same commit, and `area` left
  `refused_by_name`.
- **Doubt is drawn from the plan, not recomputed.** The uncertainty layer shades
  the planner's own projection entries — H3 cells at the fraction
  `uncertainty_now / saturated_uncertainty` — refreshing with each published plan.
  Decay and regrowth are therefore the planner's facts arriving over the topic,
  never a second implementation of tau in the shell.
- **The route is a four-dimensional curve.** The time control slides the displayed
  instant across the plan horizon; the platform marker interpolates between
  arrival times; clicking a stop issues a genuine position query at that place and
  that arrival instant — conditions at the moment of arrival, fetched, not stored.
- **Advisories are drawn by validity and listed regardless** (FR-40): valid at the
  displayed instant means drawn; outside validity means undrawn yet still in the
  table below, queryable. Validity is start-inclusive, end-exclusive, and the
  boundary is tested.
- **The composer offers only what is served.** Collections from the collections
  list, query types and parameters from the served subset statement — so when the
  subset grows, the composer grows with no edit here. One function builds the URL
  shown and the URL fetched. Null, declined and absent render as three different
  facts, in the server's own words for the latter two. The composer declines to
  guide a trajectory, saying why (per-vertex times it does not collect), rather
  than stub one.
- **No literals in the shell:** the map's endpoints (`edr`, `features`,
  `query_subsets`) and topics (`plan`, `run_published`, `advisories`) joined the
  shell's configuration document and its master.
- **`pnpm replay-proof`** (T607, deferred from 105 → 107 → here, deliberately):
  states AT-04's claim and boundary — lockstep only, commands ephemeral and
  outside the claim — then runs every replay test and propagates the verdict.

## Acceptance evidence

- Area query: master-valid Grid coverage over the domain, agreeing value-for-value
  with the position query at the same grid point; refusals name the missing
  coords, the wrong WKT shape, and the empty box.
- Map data builders: cell decomposition, greyscale-legible ramp (luminance
  monotone in value), validity boundaries, route interpolation with holds at both
  ends, projection fractions capped at one.
- Panel against the live backend: WebGL absence stated; advisories present and
  stating empty; the composer enumerates nowcast/archive and the three query
  types from served metadata and names the missing step until the URL assembles.
- Watched failing: the validity boundary was planted end-inclusive and the suite
  went red; the replay proof was watched failing against a planted `Math.random()`
  in the advisory source (exit 1, named), then both reverted.

## Deliberately not in this feature

- A basemap: the demo draws the domain's own reference geometry. Tiles would be
  the page's only external fetch, for coastline that is nowhere near the domain.
- Time-scrubbing the *field* (the slider drives route, advisories and platform):
  the area query serves any instant in a holding's extent, so a scrubber is a
  consumer-side loop away — but each frame is a fresh seam round-trip, and a
  cache would be a second store. Deferred until someone actually wants it.
- Uncertainty as a second gridded layer (the spread instance is servable through
  the same area query): the projection cells already show doubt decaying and
  refreshing, which is what FR-40 asks to be *seen*; two doubt layers at once
  read as one wrong one.
