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
      and its boundary, runs the byte-identity tests, propagates the verdict — watched
      failing against a planted Math.random() in the advisory source. *"Every replay
      test" was what this line said until 101 T037's close-out, and it was not true:
      the selector was `-t replay`, which excluded the generator's own byte-identity
      test. Selection is now by marker, and the claim here is narrowed to match.*
- [x] T808 Tests: area query agreement with position query, builder boundaries
      (validity plant watched failing), composer URLs and three-fact
      classification, panel against the live backend with WebGL absent
- [x] T809 Field time-scrubbing and a gridded spread layer (issue #60). The caching
      question the deferral was waiting on is answered *no cache*: a client-side map
      of instant → coverage is a second store, stale the moment a holding is
      replaced. No timer either — the field is asked for the step of its holding's
      own time axis that the displayed instant falls on, so a scrub within a step
      costs nothing and one across a step costs exactly one query, and the number
      pacing it comes from the manifest rather than from the shell. The spread landed
      as a *replacement* for the projection cells rather than a second doubt layer,
      as the deferral required, snapped to its own time axis and with its range
      stated.
- [x] T810 Point-and-click EDR query location (issue #53): the composer's choices
      lifted into the map panel so the canvas and the number boxes write one state;
      `pickedPosition` wraps a wound globe longitude and refuses a click that
      unprojects to nothing; `areaRing` builds both the drawn ring and the WKT; the
      map draws the composed position as a hollow ring (no filled dot, so it cannot
      be read as the platform or a route stop) and says whether it falls inside the
      domain. The cube view (issue #59) picks through the same handler when it lands.
- [x] T811 The rotatable depth volume (issue #59): an OrbitView mode stacking one
      genuine area query per level of the holding's own depth axis, the route drawn
      through it at the depths the plan states, the volume framed and depth
      exaggerated with the exaggeration stated, and a click on a slice placing the
      composer's position *and* depth through T810's handler. The plan view's status
      line now also states the depth the coverage answered for, which is not always
      the depth the selector asked for — the sampler is nearest-neighbour, and the
      difference belongs on screen. *Not done here: EDR's own `cube` query type,
      which would collapse the per-level round trips into one. It stays in
      `KNOWN_UNIMPLEMENTED`, the composer refuses it by name, and implementing it is
      a query-component change with its own master, subset statement and documented
      account — not a map change.*
- [x] T812 The picked location, made findable (issue #53's affordance): T810 built the
      click and left it invisible — it was looked for in the running shell and not
      found. Three causes, all fixed here. The composer's toggle sat last in a row of
      six selects inside the "view controls" disclosure, so at a narrow width the way
      in was behind a summary named for something else; it is now the map's own
      control against the canvas, named for the action ("compose an EDR query") and
      saying while closed what it is for. The only cue that the canvas was armed was a
      crosshair cursor, found by hovering something the viewer had no reason to hover;
      the canvas now carries the instruction over it (`pickPrompt`, pure and tested,
      stating on the cube that the click places depth as well) and is outlined while
      armed. Step 4 read as prose among the other steps' controls; it is now the
      step's own block, and states the position as a fact — "no position yet" rather
      than silence. Where WebGL is absent none of it is claimed: no canvas prompt, and
      the step says to type it, because an instruction naming a gesture that does
      nothing is worse than no instruction. *Not done here: a keyboard route to
      placing the position. The number boxes are that route and always were, which is
      why this is a discovery fix and not an access one — but "click the map" is a
      mouse instruction, and a picker driven from the keyboard is its own task.*
