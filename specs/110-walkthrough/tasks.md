# Feature 110 — tasks

- [x] T001 Claim the reserved slot: `docs/v2/plan.md` §5 named 110 for walkthrough
      machinery and left it unclaimed. Amended to say it is spent.
- [x] T002 `tour.ts`: the step content, keyed by component id, plus `componentTour`
      (built against the declared list, in the picture's order) and `missingSteps`
      (names a component with no step, and a step with no component).
- [x] T003 `HelpButton.tsx`: the yellow button, parameterised by a tour rather than
      wired to one, opening the tour's view before it starts — in two React commits and
      no timer, after the wallclock gate refused the `requestAnimationFrame` version.
- [x] T004 driver.js added and restyled into the shell's idiom; the popover carries the
      tour's own prose rather than a paraphrase.
- [x] T005 Tests: coverage against the declared components, the picture's order, and the
      live-state rule — each watched failing (a component dropped, copy orphaned, the
      order reversed, and a planted "It is running right now").
- [x] T006 The button driven in a test rather than only rendered: the view opens and the
      first step's words reach the page.
- [x] T007 Seen working in the built app under headless Chromium; the two defects that
      run found (the absent-detail silence and the missing padlock glyph) fixed, and the
      first held by a test.
- [ ] T008 A tour for another tab — *deliberately not done. The mechanism is built to be
      repeated and the request put other tabs in the future tense; a tour nobody has
      asked for yet is copy without a reader.*
- [ ] T009 A tour that operates the panels' controls — *deliberately not done. A tour
      that stepped the clock or stopped a component would have to undo what it did, or
      leave the harness changed by having been explained.*
- [ ] T010 SRD requirement for the walkthrough. *Owed: this landed as a request during
      112's implementation, and `srd.md` §5.12 carries FR-56 and FR-57 written from the
      feature as built — tick when that amendment is on `main`.*
