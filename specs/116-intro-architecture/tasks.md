# Feature 116 — tasks

One subject, one panel, no simulation change. Ticked as they were done, with the reason
written at the moment anything was declined — the reason is the part that cannot be
reconstructed later (CLAUDE.md, lesson 1).

Features 101 (the shell, addressing), 111 (the inert-panel pattern, the figure floor),
112 (one breakpoint, the measurement helpers) and 113 (`panels/operator/graph.ts`, the
derived wiring) are hard prerequisites. Nothing here derives the wiring a second time.

## Specification and record

- [x] T001 Write `spec.md`: the subject, what the numbered list was answering, and the
      review that cut the first design down.
- [x] T002 Amend SRD FR-42 in place rather than leave it disagreeing with the tree, and
      add §5.16 with FR-76 to FR-79.
- [x] T003 Amend feature 115's "deliberately not in this feature — Intro" bullet with what
      it missed, rather than quietly contradicting it. It was not wrong about the risk it
      named; it was wrong that the tab had no subject of its own.
- [x] T004 Wireframe before code, at the author's request. The first pass drew all twenty
      components and was rejected in review — recorded in `spec.md` with the words that
      rejected it. `mockup.html` is the second pass, generated from the storyboard and the
      real derived wiring so that what was reviewed is what was built.

## The storyboard, and what holds it to the tree

- [x] T005 `app/src/panels/intro/storyboard.ts`: ten steps, thirteen nodes, the cells, and
      `NOT_DRAWN` — the seven components left out, each with its reason.
- [x] T006 `storyboardFindings`: a component in neither list, a node for something
      undeclared, a duplicate, two nodes in one cell, an omission with no reason or one
      that is also drawn, a plane component outside the strip and a stranger inside it, a
      node inside the loop band that does not declare the loop.
- [x] T007 `scripts/gates/check-intro-storyboard.ts`, and the line appended to
      `scripts/gates.registry`. The runner names no gate, which is what lets this be one
      line.
- [x] T008 Watch the gate fail. `offload` was removed from the omissions; the gate named
      it by id and said what was missing; the plant was reverted. Recorded in the commit
      message (CLAUDE.md, lesson 2).
- [x] T009 The gate's permanent test in `scripts/tests/gates.test.ts`, with the four
      plants and the clean tree, plus the missing-configuration case — the outcome that
      proves nothing must not look like a pass.

## The drawing

- [x] T010 `geometry.ts`: the grid, the bands, and the two hops that need more than a
      straight line — along a row past a node, and down a column into the gutter. Pure, so
      the routing is held by a test rather than judged by eye.
- [x] T011 `Diagram.tsx`: wires in one SVG layer, nodes as focusable DOM on top. Labels
      from the declaration, wires from `buildFlow` collapsed one per pair, eras from the
      holding master, endpoints from the shell's declared endpoints.
- [x] T012 The loop band, drawn only once every component inside it has been revealed. A
      band around an incomplete ring would claim a loop that does not yet turn.
- [x] T013 The plane strip, drawn only once something is in it, and captioned with the
      filters the flow already suppresses.
- [x] T014 The one box that is not a component: dashed, unclickable, and named as outside.

## The panel

- [x] T015 `IntroPanel.tsx`: the drawing, the narration, the controls, and the foot that
      keeps the walkthrough's links. The disclaimer and the run identity are untouched.
- [x] T016 Arrow keys, Home and End, and every drawn node as a way back into its own step.
- [x] T017 `address.ts`: the step's *name* in the address, with a component id accepted so
      that clicking a node and pasting a link mean the same thing.
- [x] T018 Fit: drawn whole where there is room, scaled to fit down to a floor, panned at
      full size below it. Feature 111's rule stands — never scaled past legibility, never
      rendered having dropped its labels.
- [x] T019 The omissions on screen, in a disclosure, with the link to the Operator tab.
- [x] T020 No help control. The tab is a walkthrough; a button offering to walk the reader
      through the walkthrough would make the absence of a button stop meaning anything
      (FR-75). `narrow.test.tsx` already asserts Intro shows none, and still passes.

## Verification

- [x] T021 `intro.test.tsx`: the planted findings, the geometry, the growth, the wires,
      the loop band, the address, the omissions, and inertness under a client whose every
      method throws.
- [x] T022 The effect that returned a value. `useEffect(() => address.write(...))` hands
      React whatever `write` returns as a cleanup function; a test double that pushed to
      an array made it a number, and ten tests failed on unmount with "destroy is not a
      function". Found by the tests failing, fixed in the panel rather than in the double —
      the panel was relying on `write` returning nothing.
- [x] T023 `pnpm check` whole: typecheck, lint, 375 app tests, 38 script tests, 19 gates,
      build.

## Declined, with the reason

- [x] T024 **Lighting the drawing from heartbeats.** Refused: FR-79. Two surfaces
      answering "is it alive" would put the less complete one first, and a diagram that
      looks like a readout is the cheapest way to break Constitution VII.
- [x] T025 **Drawing all twenty components.** Refused in review: the picture that resulted
      was forty-one wires and a loop nobody could see. Completeness belongs to the tab
      that is about interrogating a running system.
- [x] T026 **Labelling the store `PostgreSQL / PostGIS`.** Refused: this build runs no
      such engine. The prose says the store is in memory behind a store interface, that
      the same interface stood in front of PostgreSQL in V1, and that SRD §11 has the
      engines returning in V3.
- [x] T027 **A capture proof for the growth.** Not built. The existing tests walk all ten
      steps and assert what is on the canvas at each; a screenshot would add a picture of
      that and no evidence. Reconsider if the animation ever carries a claim the DOM
      cannot.
