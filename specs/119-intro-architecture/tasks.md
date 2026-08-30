# Feature 119 — tasks

One subject, one panel, no simulation change. Ticked as they were done, with the reason
written at the moment anything was declined — the reason is the part that cannot be
reconstructed later (CLAUDE.md, lesson 1).

Features 101 (the shell, addressing), 111 (the inert-panel pattern), 112 (one breakpoint)
and 115 (the arrow-key walkthrough on Background) are hard prerequisites.

**This file was itself stale and is rewritten.** It described the first design — a
storyboard module, a geometry module, a diagram component and a gate, none of which are
in the tree — while presenting itself as the record of what was built. That is the exact
fault this feature is about, found in its own paperwork. The retired work is kept below,
marked as retired rather than deleted, because what the gate caught is the most useful
thing this feature learned.

## Specification and record

- [x] T001 Write `spec.md`: the subject, what the numbered list was answering, and both
      amendments the author made in flight.
- [x] T002 Amend SRD FR-42 in place rather than leave it disagreeing with the tree, and
      add §5.17 with FR-86 to FR-90.
- [x] T003 Amend feature 115's "deliberately not in this feature — Intro" bullet with what
      it missed, rather than quietly contradicting it. It was not wrong about the risk it
      named; it was wrong that the tab had no subject of its own.
- [x] T004 Wireframe before code, at the author's request, five passes in `mockup.html`.
      The first drew all twenty components and was rejected in review, in these words:
      *trim it down to the significant components / flows*. The last is the shipped shape.
- [x] T005 Renumber the whole feature when main landed 118 and took FR-76 to FR-85 — the
      exact range these requirements occupied. 113, 114 and 115 each moved for the same
      reason before it; work still in flight moves rather than argues.

## Retired with the first design — kept for what it caught

- [x] T006 `storyboard.ts`, `geometry.ts`, `Diagram.tsx`, `check-intro-storyboard.ts` and
      its registry line: the derived drawing and the gate that held it to the declaration.
      **All deleted** when the author asked for an abstract picture. `spec.md` carries why,
      and what the trade cost.
- [x] T007 Watch that gate fail — planted by removing `offload` from the omissions, caught
      by id, reverted, recorded in the commit message.
- [x] T008 **What the gate caught for real**, which is why it is worth this much space: a
      merge landed the `analyst` component and the build named it as decided about by
      nobody. Fixing that surfaced a second fault no check was looking for — a step's prose
      claiming the model runner assimilates the observations had stopped being true once
      the analyst existed. A drawing derived from declarations does not protect the
      sentences written beside it.

## The drawing as shipped

- [x] T009 `roles.ts`: six roles, six channels with their protocols and notes, six beats,
      and a `Sample` per channel. Names no component; `ILLUSTRATIVE` is one constant so no
      sample can be added without a caveat.
- [x] T010 `IntroPanel.tsx`: the lanes, the narration, the inspector, the controls, and
      the foot carrying FR-01 and the run identity.
- [x] T011 `intro.css`: the whole animation, on one shared `--cycle`. Each event channel
      occupies its own slice of the cycle so the story stays in step with nothing
      co-ordinating it, and `prefers-reduced-motion` stops it and spreads the marks
      statically — one code path, not two.
- [x] T012 Marks are real `<button>`s with a screen-reader label, so what crosses a channel
      can be reached and opened by keyboard rather than only by mouse.
- [x] T013 `address.ts`: the step's *name* in the address, with a role id accepted so a
      link to a part opens the step that introduces it.
- [x] T014 Arrow keys anywhere on the page, Home and End on the panel. The listener moved
      to `shell/arrow-keys.ts` when main's Background gained the same three guards — one
      implementation, two panels, and Background's own tests pass unedited, which is the
      proof the move changed nothing.
- [x] T015 No help control. The tab is a walkthrough; a button offering to walk the reader
      through it would make the absence of a button stop meaning anything (FR-75).

## Holding it

- [x] T016 `intro.test.tsx`: the frame's wording, every sample's caveat enumerated, no
      component id or label anywhere in the drawing, the growth and the both-ends rule, the
      address round trip, the inert render, and the no-timer spy.
- [x] T017 Amend `shell/contrast.test.ts`'s `NO_TEXT_ON` for the three mark variants —
      a 12px mark on a coloured track whose label is for a screen reader and is never
      painted.
- [x] T018 The lane is a flow that wraps. **Watched failing on an iPad, reported by the
      author with a screenshot**: seven parts would not sit side by side at 1194px, the
      lane had no `flex-wrap`, so it overflowed its column and the narration painted over
      the last box.
- [x] T019 The second half of that fault, found in the capture rather than by test: a
      wrapping flex container breaks the line at each part's *basis* and only shrinks what
      is already on the line, so a basis above the minimum wraps a lane that would still
      have fitted. At 1440px the loop lane broke with eighty spare pixels and left `The
      forecast` orphaned under `Measurements`. Every basis is now its own `min-width`;
      the property is a test, planted three times and caught by name and number each time.
- [x] T020 Measured in a browser at 1600, 1440, 1194, 1024, 834, 768 and 390: one row per
      lane at desktop widths, wrapping below, and at every width zero parts past their own
      column, zero overlapping the narration, no sideways scroll.
- [x] T021 The effect that returned a value. `useEffect(() => address.write(...))` hands
      React whatever `write` returns as a cleanup function; a test double that pushed to
      an array made it a number, and ten tests failed on unmount with "destroy is not a
      function". Fixed in the panel rather than in the double — the panel was relying on
      `write` returning nothing.
- [x] T022 A stylesheet lookup that was reading the wrong rule. The unanchored
      `.intro-chan` regex matched inside `.intro-drop .intro-chan` and the width checks had
      been examining an override nobody meant them to read — and passing. Anchored, and
      the reason recorded beside it.
- [x] T023 `pnpm check` whole: typecheck, lint, 497 app tests, 39 script tests, 20 gates,
      build.

## Outside the tab, both deliberate

- [x] T024 Operator's wires at rest, by request: opacity 0.32 → 0.45, width 1.2 → 1.3,
      arrowheads 5 → 6.5 in both charts. The selected and pushed-back figures are
      untouched, because the gap between them is the mechanism that answers *what does
      this one talk to?*.
- [x] T025 `.intro-figure-pan` declared in `scripts/capture/mobile.ts`'s
      `MAY_SCROLL_SIDEWAYS` with its reason. Watched failing on CI itself rather than by
      plant: the narrow-presentation proof named the container and all three phone sizes.

## The blog entry

- [x] T026 `site/docs/blog/posts/the-check-worked-and-the-drawing-still-went.md`. Rewritten
      once: the first version described the derived design and its gate as what shipped,
      which two rewrites had already made false — the entry about diagrams that quietly
      lie, quietly lying. The finding it carries now is the reversal itself: the check was
      never wrong, it was propping up a claim the page should not have been making.
- [x] T027 The capture, by `pnpm capture:motion` with the clock pinned at rate 0. **This
      reverses an earlier decision not to capture**, and the reason it reverses is that the
      earlier one was about a still picture of a static drawing, where a screenshot adds a
      picture and no evidence. The drawing now moves, and a GIF whose header reads `rate 0`
      throughout while the messages keep crossing is the evidence for FR-90's central
      claim — that the motion is an illustration on a fixed cycle and not a readout of this
      run. Verified before it was written: the marks' positions were sampled twice with the
      clock stopped and had moved.

## Declined, with the reason

- [x] T028 **Lighting the drawing from heartbeats.** Refused: FR-89. Two surfaces
      answering "is it alive" would put the less complete one first, and a diagram that
      looks like a readout is the cheapest way to break Constitution VII.
- [x] T029 **Driving the motion from received traffic.** Refused by the author in favour of
      a fixed cycle, "so it's independent of app". FR-90 records the exception this takes
      to FR-71 and the three obligations it is paid for with.
- [x] T030 **Drawing all twenty components.** Refused in review: the picture that resulted
      was forty-one wires and a loop nobody could see. Completeness belongs to the tab
      that is about interrogating a running system.
- [x] T031 **Labelling a store `PostgreSQL / PostGIS`.** Refused: this build runs no such
      engine. Moot in the shipped drawing, which names no store — kept because the
      requirement asked for it in those words.
