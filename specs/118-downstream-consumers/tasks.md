# Feature 116 — tasks

Ordered by build order: the record first, then the shared frame, then the three tabs in
the source's own sequence — each is expected to reuse what its predecessor established, so
building them out of order costs the family resemblance §2 of the source asks for.

Tick as you go, and write the reason at the moment a task is declined — the reason is the
part that cannot be reconstructed later (CLAUDE.md, lesson 1).

Features 101 to 109 are hard prerequisites: the shell and its addressing, the seam, the
broker, the coverage store and its EDR service, the planner and the map surface.

## Specification and record

- [x] T001 Write `spec.md` from the author's SRD: scope, the five open questions settled,
      the tree-versus-record corrections, and FR-76 to FR-85.
- [x] T002 Carry the author's SRD into the feature directory unmodified as
      `source-srd.md`, so what was asked for sits beside what was decided.
- [x] T003 SRD-v2 §5.15: FR-76 to FR-85, and the note on why the numbering starts at 71.
- [x] T004 ADR-0039: *a consumer may synthesise its inputs; it may never synthesise
      drogna's*. Owed before any synthesised lane is built, because Constitution VII
      forbids fixture data and the next reader must find the argument rather than infer
      it.
- [x] T005 Establish that Tab 2 stands on the right side of Constitution V, in the spec
      rather than in a commit message: a Monte Carlo over the whole domain infers no
      position, and the words `contact` and `detection` stay out of the code so the
      vocabulary gate holds the claim.

## Contracts and configuration

- [x] T006 `contracts/schemas/config.shell.schema.json`: `views[].kind`
      (`harness` | `consumer`, default `harness`), amended in place.
- [x] T007 Same master: a `consumers` block — hex resolution bounds and cell ceiling,
      depth-zone count, time budgets, expendable rates, the roster with its motion
      parameters, the objectives, the candidate count, the weighting bounds, the lanes,
      the tasks, the confidence weights, and every sample count the tabs are bounded by.
      Appended, never rewritten (CLAUDE.md).
- [x] T008 `app/config/run.json`: the three views and the `consumers` document.
- [x] T009 `pnpm generate`, commit `app/src/generated/`. The drift gate fails the build
      if this is skipped.

## The shared frame

- [x] T010 `panels/consumers/frame.tsx`: the provenance strip and the yellow chrome,
      rendered by the frame so a fourth consumer cannot be built without them.
- [x] T011 Yellow tabs in **both** presentations, driven by `views[].kind`: a custom
      dockview tab component and the stack's tab strip. The shell holds no list.
- [x] T012 `panels/consumers/freshness.ts`: the stale latch — `run/published` with
      `current: true` marks stale; recompute only on the reader's click; the superseded
      answer retained as a ghost naming its run; dismissible; replaced by the next
      accepted update, never by a local control change.
- [x] T013 `panels/consumers/rng.ts`: a seeded stream per tab, derived from the run
      manifest's root seed and a stream name. No `Math.random` anywhere (Constitution II,
      and the gate).
- [x] T014 `panels/consumers/domain.ts`: the domain read from the seam — horizontal and
      vertical extent from the EDR collection, the vessel's reach from the planner's
      published depth bands. No grid size, zone count or depth constant in any panel.
- [x] T015 `panels/consumers/hexes.ts`: the H3 grid over the domain at a chosen
      resolution, the aggregation of underlying cells, and the refusal when a resolution
      would exceed the configured cell ceiling.
- [x] T016 `consumers.css`: one stylesheet for the family — yellow chrome, ghosting,
      lanes, hexes. One breakpoint only (the gate reads `NARROW_WIDTH`).

## Tab 1 — Sampling

- [x] T017 `sampling/uncertainty.ts`: observations binned by hex and zone; recency,
      density and monotonic age decay toward saturation; unheard cells at saturation.
      Simulation time only (Constitution I, and the gate).
- [x] T018 `sampling/plan.ts`: value-per-transit insertion under a time budget, ending
      where the budget expires, seeded tie-breaks.
- [x] T019 `sampling/plan.ts`: expendable drops for the unreachable zones, constrained to
      lie on the route, each carrying the zone and the uncertainty it addresses.
- [x] T020 `SamplingPanel.tsx`: the hex map, the zone selector with its per-hex stack, the
      budget and rate controls with the coupled drop count, the plan action, the ghost.
- [x] T021 The no-drops comparison line, so that *depth changes route shape* is visible
      rather than asserted.
- [x] T022 Tests: the budget changes the route's shape, not only its length; a drop always
      lies on the route; uncertainty grows monotonically with time since observation; the
      resolution ceiling refuses rather than freezes.

## Tab 2 — Courses

- [x] T023 `courses/participants.ts`: three motion models — corridor on a schedule, seeded
      loiter over the shallows, seeded descent toward low detectability read from the
      fetched field. Behaviour drives motion, not a multiplier (source §4.3).
- [x] T024 `courses/candidates.ts`: three or four candidates drawn to span the trade,
      scored as exposure risk and objective achievement separately, combined under the
      reader's weighting.
- [x] T025 `CoursesPanel.tsx`: the roster with likelihoods, the objective, the cloud, the
      candidate table with its component scores, the weighting sliders, the ghost.
- [x] T026 Tests: the three clouds differ in character; likelihoods change the ranking;
      **the weighting flips the ranking** within the slider's range.

## Tab 3 — Feasibility

- [x] T027 `feasibility/lanes.ts`: the ten lanes, boolean and continuous, each carrying
      its provenance — from the seam, or synthesised by this tab and labelled so.
- [x] T028 `feasibility/sets.ts`: per-task thresholds, confidence weighting from
      configuration with `Off` excluding a source, and the top two or three **maximal**
      feasible sets with what each gives up.
- [x] T029 `FeasibilityPanel.tsx`: the Gantt, the draggable thresholds, the confidence
      controls, the task list with locking, the excluded tasks and what excluded them.
- [x] T030 Tests: a low-confidence source cannot veto a task alone; `Off` changes the
      sets; locking a task excludes the tasks that cannot coexist with it; the sets
      returned are maximal.

## What watching it run corrected

Written at the moment each was decided, because the reason is the part that cannot be
reconstructed later (CLAUDE.md, lesson 1). Each was found by looking at the running page,
not by a failing test.

- [x] T036 The tabs drew nothing until the first published forecast — several minutes of
      three blank yellow tabs, raised by the author watching the instance. A consumer now
      starts from the **now-cast** the store already holds (`basis.ts`), which also makes
      the freshness ceremony available from the first minute rather than after the first
      model run: with a now-cast answer on screen, the first forecast is already a change
      of basis.
- [x] T037 The uncertainty field was a flat dark rectangle: a consumer that counts only
      what arrived after it opened has an empty ocean, and a zero-to-saturation ramp draws
      it as one uniform shade. Two fixes, both honest: the view reads the **served
      observation history** on opening through an ordinary paged SensorThings GET, and the
      shading runs **between the values present** with the range printed beneath the map.
- [x] T038 The candidate ranking did not always flip on the default objective, and the
      test that claimed it did was passing on a lucky seed. Under *evasion* the two
      components genuinely move together, so no weighting reorders them. The view now
      **says when there is no trade at this objective**, opens on one where the trade is
      real, and the test names its objective rather than relying on the default.

- [x] T039 CI's narrow-presentation proof (`pnpm capture:mobile`) failed on the first
      push: all three tabs scrolled the page sideways at a phone's width. Two causes, both
      mine. The maps' 1px border sat outside a `width: 100%` box, putting two pixels past
      a 373px screen — a page that scrolls sideways by two pixels is still a page that
      scrolls sideways (FR-017) — so the consumer body measures borders inside its widths.
      And the tables were laid at their own minimum against the page rather than inside a
      container built to scroll; they now sit in `.table-scroll`, which is the idiom the
      System and Map panels already use and the one the proof's allow-list already names.
      **The proof existed and was not run before pushing**, which is the whole of the
      fault: `pnpm check` does not run the captures, and CI does.

- [x] T040 Renumbered three times, by three different features landing while this was
      being built. Worth naming as a process fault rather than three accidents: every
      branch picks *the next free number* when it is drafted, and the number is only
      claimed when it merges, so any two features drafted in the same window collide and
      the later one to merge pays. This beat paid three times — 115 to 116 to 117 to 118 —
      and the cost is not the directory rename, it is that the number is written into the
      ADR, the SRD, the panels' comments, the schema descriptions, the blog entry and the
      tests. Claiming the number when the branch is created, or deriving it from the issue
      rather than from a scan of `specs/`, would end it.

      First: feature 115 arrived — the tabs beyond Operator, itself renumbered from 114 on
      its way in — taking FR-68 to FR-75, ADR-0036 and ADR-0037. That moved this beat from
      115 to 116. Main also withdrew the System tab and added `check-view-ids`, which the
      merged configuration and registry satisfy: nine views, six of drogna's own and three
      consumers.

      Then feature **116** arrived — the analysis step — taking the number this beat had
      just moved to, and ADR-0038 with it. Then feature **117**, opening a node in place,
      took the number after that. So this beat is **118**, its ADR is **0039**, and its
      requirements are **FR-76 to FR-85**, which no other feature has claimed. Its
      SRD section stays **§5.16**: section numbers and feature numbers stopped tracking
      each other long ago (§5.13 is feature 110, §5.10 is feature 111), so the document
      keeps its sequence and the parenthetical carries the link. Each renumbering rewrote
      the feature directory, the ADR, the SRD, the panels' comments, the schema's
      descriptions, the blog entry and the tests.

      **Raised rather than fixed here:** main's §5.15 was relabelled "(feature 116)" by
      the analysis step's own renumbering merge, but its body is FR-68 to FR-75 — the
      *engaging tabs* requirements, which are feature 115 and still live under
      `specs/115-engaging-tabs`. The analysis step, meanwhile, has no SRD section on main
      at all; §5.16 was free for this beat to take because feature 116's own section is
      missing. This merge restores §5.15's label to 115, since a conflict on that line had
      to be resolved one way or the other and only one value agrees with the tree. The
      absent §5.16 for the analysis step is that feature's to write, not this one's.

      The lesson, twice paid: CI typechecks the *merge* with main, not the branch head, so
      a tree that passes `pnpm check` locally can still be red. Merge main before
      validating, not after pushing.

- [x] T041 Five faults raised from the running planning tab, all of them things a test
      could not see. **The wheel scrolled the page instead of zooming the map** — the map
      now has a view rectangle, a wheel that zooms about the cursor and a drag that pans,
      with the listener attached by hand because React attaches wheel handlers passively.
      **The hex resolutions were 2–5 and should be 4–8** — which the whole-domain cover
      could not afford, so the hexes cover the *view*: one decision with the zoom, not two.
      **The hexes were illegible** — absolute shading against saturation instead of a
      relative scale with nothing to spread, unheard cells outlined rather than filled, a
      ramp that runs bright for unobserved water over a dark ground, and visible edges.
      **The open consumer tab was indistinguishable from the other two** — muted yellow for
      the unopened, full yellow, bold and underlined for the open one. **The whole panel
      was yellow** — it is now the tab and one banner, and the body reads like any other
      panel of the shell.
- [x] T042 Two faults found while fixing T041, each by measuring rather than reasoning.
      The tab colour had come from the wrapper element all along, and the rule written
      against dockview's own tab did nothing: dockview paints it through a five-class
      selector that out-specifies anything shorter, and with `background-color` rather than
      the shorthand. Measured in the running page, where the computed colour came back as
      dockview's with the rule sitting there unapplied. And `coverExtent` enumerated before
      it checked the ceiling, so a fine resolution over a wide view died inside h3 with
      "Memory allocation failed" before it could refuse; it now estimates from h3's own
      average hex area first, and a test holds both the refusal and its two remedies.

## Proof, and showing the work

- [x] T031 Panel tests against a genuine backend, in the shape `panels.test.tsx` already
      uses: nothing mocked below the seam.
- [x] T032 `pnpm check` green, gates included.
- [x] T033 AC-01 to AC-10 watched in Chromium against the built site, and reported in the
      pull request with what each showed: the strip and the yellow tab in both
      presentations, the tab computing from the moment it opens, 3 h against 24 h changing
      the route's shape (4 points to 13), the drop count following budget and rate, the
      ranking flipping `direct` to `wide`, a lane switched off changing the feasible sets,
      and a locked task carried by every set. Said precisely, because the difference
      matters: this was the same build the instance serves, served locally, rather than the
      hosted URL — every visit seeds a fresh run, so a reviewer opening the instance sees
      the same behaviours over a different ocean. The three per-view links are in the pull
      request body (CLAUDE.md, *showing the work*).
- [x] T034 Blog entry: three new faces in the shell is the case D17 names. Background,
      requirement, options considered, demo.
- [x] T035 The greyscale and keyboard proofs, as `pnpm capture:consumers` and
      `app/src/panels/consumers/greyscale.test.ts`. (The narrow *geometry* was already
      proved by `capture:mobile`; this is the rest.)

      Declined once, then done, and the reason for the reversal is the useful part. The
      decline said extending `scripts/capture/background.ts` would be a rewrite rather
      than an addition — that much was right, and this is a separate script for exactly
      that reason. What the decline got wrong was assuming the proof had to take
      Background's *form*. Background shoots pictures because whether a drawing reads is a
      judgement. What these tabs encode in colour is checkable, so the bound belongs in a
      test that fails a run, and the pictures are illustration.

      **What the keyboard proof turned up is that the claim could not yet be made.** Every
      control in the family is a native range, select or button and was keyboard-operable
      the day it was written — but the map was not. It had a wheel and a drag and nothing
      else, so a viewer without a pointer could not zoom or pan at all. `view.ts` now
      carries `viewAfterKey`: arrows pan by a share of what is in view, `+`/`-` zoom about
      the centre, `Home` returns to the whole domain, and the panels declare those keys in
      `aria-keyshortcuts` and take focus. A key the map does not use is left to the page;
      an arrow pressed against the edge of the domain is still the map's, which is the one
      distinction the listener rests on and has its own test.

      **Watched failing, in both directions.** Against the tests: a ramp changing hue at
      constant lightness (16 non-rising steps and 1.97:1 at the ends), a ghost given the
      route's dash pattern, an unheard hex drawn as a fill, a chip stripped of its ground,
      an inverted north, a fixed pan step, and unknown keys claimed from the page — every
      one reported. Against the capture: the keydown listener removed (the map stopped
      zooming and panning, on both tabs), the focus ring removed (37 controls reported by
      name), a button emptied of its label, and — the one that mattered — `tabIndex` taken
      off the map. That last exposed a real blind spot: the sweep takes its expectations
      from what the document already declares focusable, so removing focusability removed
      the map from the expected set and the sweep went quiet (7 controls became 6). It is
      caught from the other side now — an element declaring `aria-keyshortcuts` promises
      keys and must be reachable, and every map must declare them — and the script's
      header states the limit that remains, since a `div` with a click handler is still
      invisible to it.

      Shared with main's `contrast.test.ts` rather than copied: the WCAG arithmetic and
      its two bounds moved to `app/src/shell/colour.ts` when the second caller appeared.
