# Feature 120 — tasks

One feature, one pull request, on the author's decision recorded in `spec.md`. Ticked as
they were done, with the reasons written at the moment they were taken (CLAUDE.md,
lesson 1).

## The departure era

- [x] T001 `coverage-holding.schema.json`: append `departure` to the era enumeration, in
      the reader's order, between the archive and the now-cast. Amended surgically — the
      first attempt round-tripped the document through a JSON formatter and rewrote 57
      lines to change two, which is exactly what "a master is amended, never casually
      rewritten" forbids.
- [x] T002 `config.env-generator.schema.json` and `run.json`: a `departure` block, its
      grid and its validity window. Required rather than optional: a run with no brief is
      a run whose Data tab has an empty branch and no reason for it.
- [x] T003 `pnpm generate`, and commit the output. The topology artefact moves too — the
      line numbers its constants are cited at shift when `run.json` grows.
- [x] T004 `generator.ts`: `publishDeparture()` at provisioning, beside the archive and
      the first now-cast, through the store's one write seam like everything else.
- [x] T005 The persistence mode: `evaluateAndPublish` takes `{ persistence: true }` and
      evaluates every step at the origin's instant. This is the whole feature of the era
      — the generator evaluates the *true* ocean, so a brief evaluated step by step would
      be a perfect forecast, which is not a forecast.
- [x] T006 The manifest records the derivation as its composition rule, in those words, so
      no reader mistakes the brief for a model run.
- [x] T007 `store.ts`: an era pointer and `departureHolding()`. The head comment said
      "three eras" and now says five — the record is a claim about the tree.
- [x] T008 `edr.ts`: the collection description. Nothing else — FR-29 means the brief
      becomes servable by being published, and T012 is the test that says so rather than
      the code that makes it so.
- [x] T009 `check-truth-initialisation`: the gate learns the second accessor, and its
      message names *which* holding leaked, because a message that always said "now-cast"
      would send a reader to the wrong one.
- [x] T010 **Watched failing**: a planted `departure-initialisation.ts` fixture, and the
      gate regex reverted to `currentNowcast` alone. The fixture went uncaught and the
      gate test failed. Reverted, and said so in the commit message.
- [x] T011 `departure.test.ts`: the brief exists at provisioning, is master-valid, names
      persistence, and **every step of its field is identical to the first** — the
      property, checked, rather than the descriptor, asserted. A third test probes a late
      step against the analytic form re-evaluated at the origin, so "held constant" is
      held to the ocean and not only to itself.
- [x] T012 `query.test.ts`: the collections list carries `departure` with no query
      configuration edited, and a position query answers the same value at every instant
      in the validity window — through the wire, not off the bytes.
- [x] T013 The analyst's background era, narrowed rather than the message's enum widened.
      An analysis stands on the forecast or on the now-cast at cold start; a third era
      arriving there would be feature 116's leak coming back through a different door, so
      it is refused by name.

## The tab

- [x] T014 `run.json` and the registry: the `holdings` view becomes `data`, labelled
      "Data", in the same slot.
- [x] T015 `git mv` the panel directory. A `holdings/` directory with no Holdings tab is
      the divergence this repository exists to end; the modules keep their names because
      the specs and ADRs cite them.
- [x] T016 `tree.ts`: the seven branches, the coverage ones derived from the master. Pure,
      and tested against the master rather than against itself.
- [x] T017 `address.ts`: `<branch>/<node>`, the node kept whole. A miss is carried through
      rather than absorbed — Background resolves an unknown remainder to its first step
      and is right to, because its remainder is a position in a course that always exists;
      this one names something the store either holds or does not.
- [x] T018 `read.ts`: every fetch the tab makes, in one place, each validated against the
      master the backend's own tests hold that response to. Returns a value **or a
      refusal**, never `undefined` for both — a branch is required to say why it is empty,
      and a function that answers `undefined` for "holds none" and for "would not answer"
      has thrown that distinction away before the panel can draw it.
- [x] T019 `DataPanel.tsx`: the tree, the detail region, and one subscription per store.
      Nothing on a timer.
- [x] T020 `CoverageBranch.tsx`: Holdings' timeline, manifest and comparison, re-homed
      whole. The comparison keeps its three URLs.
- [x] T021 `Measurements.tsx` and `series.ts`: Thing → Datastream → chart, the geometry
      pure so the scaling is checked against values rather than against a picture.
- [x] T022 `ShoreUpdates.tsx` and `advisories.ts`: the regions, coloured by kind, lapsed
      ones drawn spent.
- [x] T023 `Volume.tsx` and `volume.ts`: the fourth axis, fetched lazily and cached. The
      cache answers *absent* rather than *nearest*, which is the only version of this that
      can be told apart from the wrong one by looking.
- [x] T024 `lazy.tsx`: the two WebGL surfaces code-split. Found while wiring, not
      specified: importing them directly would have pulled a third of the bundle into the
      first load through the door the map's deferral was built to close.
- [x] T025 The tour becomes the Data tour and grows to the tab's seven regions.
- [x] T026 The stylesheet: the tree, the chart, the canvases, and the narrow presentation
      where the tree is a strip above the branch rather than a column beside it.

## What the tests found

- [x] T027 The lane list was three literals and feature 116's `analysis` era had never
      reached it, so an analysis holding was drawn on no lane and nothing said so. Fixed
      by reading the eras from the master; **watched failing** with the literals restored,
      which named both missing eras.
- [x] T028 The panel wrote its default branch into the address on mount, so crossing the
      width threshold rewrote the reader's URL. Caught by feature 112's SC-005. Selecting
      writes the address now; mounting does not.
- [x] T029 Observations were fetched with the datastream id percent-encoded, and the query
      component refused a form it serves. The slash in `<thing>/<datastream>` is part of
      the id.
- [x] T030 The refusal a reader sees is the release gate's own — it names the path it
      would not clear, which is more use than the status code the old assertion looked
      for. Both tests now require the named refusal.
- [x] T031 The absorbed parity check walks the branches rather than counting bars on one
      timeline, so "every holding the store reports is reachable" survives the move.
      Weakening it to the era that happened to be open was the easy edit and would have
      retired the check while leaving it green.
- [x] T032 `data.test.tsx` primes the code-split module before asserting on the branch.
      Without it the assertions measure the Suspense fallback — the same fault the
      `panel-arriving` marker was added for on the map.
- [x] T033 A test binds `Volume.tsx`'s collection-id convention to the served collections
      list. The rule is the query component's and lives on the other side of the seam
      where it cannot be imported, so the two are held together by a check instead.

## The record

- [x] T034 SRD amendments: FR-14 (the tab list), FR-21 (the fifth era), FR-46, FR-69,
      FR-70 and FR-75 re-homed, and §5.18 appended as FR-91 to FR-101.
- [x] T035 The view-id gate named the links a search by hand would have missed: three in
      the Intro tab, one Background explainer, the demo index and a published blog entry.
      All updated.
- [x] T036 The blog entry, within the 300-word budget, with a motion capture.

## Not done, and why

- **No cross-tab wiring.** No "show this on the map", no filtering of the Messages traffic
  from a selected datastream. Both were offered in the interview and declined: the address
  of FR-96 is the linkage this feature builds, and anything more is a second feature's
  worth of coupling between four panels.
- **The chart shows one datastream, not a residual.** Drawing a measurement against the
  forecast it was scored on needs an EDR position query per observation, and the monitor
  already computes that residual where the Operator tab already draws it.
- **The volume does not step across forecast instances.** Watching successive forecasts of
  one instant change as assimilation bites is a comparison, and FR-70 is where comparisons
  live.
- **The departure forecast is not climatology.** A seasonal mean from the archive would
  contrast more sharply with the now-cast, and nothing in the tree computes a mean across
  archive months. Persistence costs nothing new and is already a named reference here.
- **The tree does not name the standard that answers each branch.** The cost of a
  kind-first spine, taken deliberately and recorded in `spec.md` and in FR-91.
