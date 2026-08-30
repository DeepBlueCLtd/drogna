# Feature 116 — tasks

Small feature, one surface. Ticked as they were done, with the reasons written at the
moment they were taken (CLAUDE.md, lesson 1).

Features 113, 114 and 115 are hard prerequisites: the flow chart, its layout, the faces,
the controls statement and the narrow presentation all come from them.

## The geometry

- [x] T001 `layout.ts`: `layout()` takes the id of the node that is open and gives it the
      expanded box, keeping its declared rank. The box is stated as two columns by four
      rows rather than as two numbers, so it visibly takes the space its neighbours were
      in.
- [x] T002 Reflow around it: nodes after it in its band move along by the width it gained,
      the band's row is as tall as the tallest thing in it, and every band below moves
      down. The canvas grows to hold the result.
- [x] T003 `Placed` carries its band, and `route()` decides siblings from the band rather
      than from measured centres. An open node's centre agrees with none of its
      neighbours', and centre-based routing sent the loop's own wires out of the wrong
      face — planted and seen, T011.
- [x] T004 The right-to-left return runs under the *taller* of its two ends, so a return
      lane does not run through an open node.
- [x] T005 `NARROW_METRICS`: a phone's open card is taller and narrower. Declared beside
      the desktop geometry; nothing in `layout.ts` knows what a viewport is.

## The surface

- [x] T006 `FlowCanvas`: an open node is a `<section>`, not a `<button>`. This is why the
      feature is a re-implementation and not a stylesheet change — a button may not
      contain the sliders and buttons the account carries, and the first cut that tried
      it produced invalid markup whose controls could not be operated.
- [x] T007 The account (`Drawer`) takes where it is drawn — in the node, or below the
      list — and changes only its chrome between the two. One component, so the list
      cannot drift from the chart (feature 113, FR-015).
- [x] T008 Focus: into the open card when it opens, back onto its node button when it
      closes. Without it the card replaces the focused button and a keyboard reader is
      returned to the top of the tab.
- [x] T009 The open card is scrolled into view by its leading edge. Found by looking at a
      390-pixel capture, not by a test: focusing alone scrolls by the least it can, which
      left the monitor's `set` buttons over the edge of the screen.
- [x] T010 `operator.css`: the open card sits above the wire layer, carries the selection
      border, and scrolls within itself. A wide table inside it scrolls in the card rather
      than stretching it — the geometry is the layout's to decide, not the content's.

## Holding it

- [x] T011 Plant each fault the new checks exist to catch, and see it caught. Four
      planted, four caught, all reverted: (a) the open node grows and the band does not
      reflow — the overlap check and the "moves out of its way" check both failed;
      (b) siblings decided by measured centres again — the wire check failed;
      (c) the account rendered below the chart as it used to be — the in-place check and
      the focus check both failed; (d) the canvas laid out without being told what is
      open — nine tests failed, including every feature 114 control test, because the
      account was then unreachable inside a card the size of a resting one.
- [x] T012 `layout.test.ts`: the expanded box, the reflow in both directions by exactly
      what was gained, no overlap for any open node, wires on their own faces, the phone's
      geometry, and placement unchanged when nothing is open.
- [x] T013 `operator-panel.test.tsx`: the account is inside the node's own element with
      its controls; the neighbour moves along and is unchanged in size; the canvas grows;
      closing restores every box exactly; focus lands and returns; the list view opens the
      same account below the table.
- [x] T014 Look at it running, at 1440 and at 390, with a node open. Both captures are in
      the pull request. The height was raised from three rows to four because the
      monitor's second tunable sat under the fold at three, and a control a reader has to
      scroll to find is the complaint this feature answers.
- [x] T015 `pnpm check`: typecheck, lint, 363 unit tests, 36 script tests, 18 gates.

## Not done, and why

- [x] T016 No new gate. Nothing here is a rule a future change could quietly break in a
      way a gate reads better than a test: the two properties that matter — the reflow and
      the overlap — are geometry, and `layout.ts` is pure, so a test holds them directly
      and cheaply. `scripts/gates.registry` is unchanged.
- [x] T017 No change to the faces. Each was designed for the resting card and each is
      drawn larger in the open one by the room it is given; redesigning twenty
      instruments for a second size is a feature, and this one is about where the account
      opens.
