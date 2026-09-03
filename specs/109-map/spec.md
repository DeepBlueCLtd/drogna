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
- **The position is placed by clicking the canvas** (issue #53, FR-41 amended):
  typing two numbers to reach a place you are already looking at is the wrong way
  round. deck.gl unprojects the clicked pixel, so the plan view and the globe pick
  alike — a globe click dragged past the seam comes back wound, and is wrapped into
  [-180, 180) so a clicked query and a typed one are the same query — and a click
  that misses the sphere unprojects to nothing and is left alone. What is drawn is
  what is asked: `areaRing` builds the ring the canvas draws *and* the ring
  `composeUrl` writes into the WKT. The map says whether the position falls inside
  the domain it fetched from the reference collection; it is a warning, never a
  veto, because the server's own refusal is the authority (Constitution VII).
  **The affordance is part of the feature** (amended again): the first version of this
  was built and could not be found in the running shell — the way in was inside the
  view-controls disclosure, and the only cue that the canvas was armed was a crosshair
  cursor. A gesture nobody knows about is not a feature, so the toggle is the map's own
  control, named for the action; the instruction is drawn over the canvas where the
  gesture is, and states what the click will do; and the canvas is outlined while armed.
  Where WebGL is absent, none of it is said at all: there is no map to click, and the
  composer's number boxes are the way.
- **The time control carries the field, without a cache** (issue #60, FR-40
  amended): the slider drove the route, the platform and the advisories; the field
  stood at one instant. It now moves too. The decision the issue asked for is *no
  cache*: a client-side map of instant → coverage is a second store, and one that
  goes stale the moment the holding is replaced. Nor is there a timer to debounce
  the scrub. What throttles it instead is the holding's own time axis, read from
  the ground-truth manifest: the field is asked for the *step* the displayed
  instant falls on, so a scrub within a step costs nothing and a scrub across one
  costs exactly one query. The number that paces the scrubber therefore comes from
  a manifest rather than from a constant typed into the shell. Where the displayed
  instant falls outside the holding's axis the panel says so and shows the end of
  the extent, rather than letting the picture imply the field goes on.
- **Doubt is one layer, chosen** (issue #60): the run publishes its ensemble spread
  as its own instance, servable through the same area query, so drawing it is one
  more genuine query rather than a second computation of doubt. It *replaces* the
  projection cells rather than joining them, as the issue required. The two are
  different claims — the cells are the planner's doubt about the plan, the spread is
  the run's doubt about the field — and the spread is snapped to *its own* time axis:
  a forecast asked about the now-cast's step is asked about an instant outside its
  horizon, and is refused for asking (found in the running page, then held by test).
  The shade is normalised against the spread's observed range, which the status line
  states, because a normalised shade means nothing without one.
- **The depth volume is stacked, not invented** (issue #59, FR-40 amended): V1's map
  rotated a cube of the data volume; V2's map gained a globe and served depth one
  slice at a time. The cube view restores the volume without inventing one. Its
  levels are the holding's *own* depth axis, read from the ground-truth manifest the
  coverage store publishes (`minimum`, `spacing`, `count`) rather than a list typed
  into the shell, and each level is a genuine EDR area query — the same query the
  plan view issues, asked once per level. EDR's own `cube` query type stays refused
  by the served subset; this is the client stacking what the subset does answer, and
  the panel says how many levels answered and names any that declined. The frame
  that carries lon/lat/depth into the OrbitView's cartesian space carries a click
  back out again, so the composer's position *and* depth can be placed by clicking a
  slice (issue #53's handler, extended). Depth is exaggerated against the horizontal
  extent and the status line says so.
- **No literals in the shell:** the map's endpoints (`edr`, `features`,
  `query_subsets`) and topics (`plan`, `run_published`, `advisories`) joined the
  shell's configuration document and its master.
- **`pnpm replay-proof`** (T607, deferred from 105 → 107 → here, deliberately):
  states AT-04's claim and boundary — lockstep only, commands ephemeral and
  outside the claim — then runs the marked byte-identity tests and propagates the
  verdict. *This read "every replay test" until 101 T037's close-out found that the
  selector excluded the generator's; see that line for what replaced it.*

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
- Scrubbing: the panel test moves the slider a quarter of a step and holds that no
  query is issued, then a whole step and holds that exactly one is, with its
  `datetime` the manifest's step rather than the instant the slider sits on.
- The spread: the panel test turns the loop until the model runner genuinely
  publishes, turns on further until the two time axes disagree about the displayed
  instant — while they agree, a spread query snapped to the field's step passes for
  the wrong reason — and then holds the collection and the datetime the query asks
  for, and that the shade's range is stated.
- The cube: the panel test drives the view selector against the live backend and
  holds that the area queries issued are exactly one per level of the now-cast
  manifest's depth axis, at those z values, with no level declined; the frame's
  inverse is held as a round trip (a point put into the cube and taken back out is
  the point that went in), depth draws downwards, and a slice keeps the domain's
  aspect ratio rather than being stretched square.
- Picking: the wrap and the misses are held at the boundary (a wound globe
  longitude, a latitude no place has, a coordinate deck.gl could not unproject);
  the drawn ring is asserted equal to the ring in the WKT, coordinate for
  coordinate; and the panel test writes the position through the composer's boxes,
  which is the state a canvas click writes, then reads the URL and the
  inside/outside note back.
- Watched failing: the validity boundary was planted end-inclusive and the suite
  went red; the replay proof was watched failing against a planted `Math.random()`
  in the advisory source (exit 1, named), then both reverted. For the picking:
  the longitude wrap was removed, the domain test's ray casting made inclusive on
  both edges, `composeUrl` shifted off `areaRing` by a hundredth of a degree, the
  panel's `positionNote` cut, and the composer's choices frozen to a constant —
  five plants, each watched red, each reverted. For the cube: the manifest's axis
  swapped for a depth list typed into the shell (the requested z values went red
  against the manifest's own), a level dropped rather than named (the level count
  went red), and the frame's inverse offset by a degree (the round trip went red). For the
  scrubber: the raw displayed instant sent instead of the snapped step (red on the
  datetime), the effect keyed on the displayed instant rather than the step (red on
  the no-query-within-a-step assertion), the nearest-step tie flipped to the later
  step and the outside-the-axis flag dropped (both red in the builders). For the
  spread: the query pointed at the field's collection (red on the collection), the
  spread snapped to the field's step (red on the datetime — this was a real fault,
  found in the running page before it was planted), and the shade's range removed
  from the status line (red on the range).

## Deliberately not in this feature

- A basemap: the demo draws the domain's own reference geometry. Tiles would be
  the page's only external fetch, for coastline that is nowhere near the domain.
- ~~Time-scrubbing the *field*~~ — built (issue #60). The caching question it was
  waiting on is answered *no*, and the round-trip worry it raised is answered by
  the holding's own time axis: a scrub within a step costs nothing.
- ~~Uncertainty as a second gridded layer~~ — built (issue #60), but as a
  *replacement* for the projection cells rather than a second layer, which is what
  the deferral asked for. Two doubt layers at once still read as one wrong one, and
  the panel does not offer them together.
