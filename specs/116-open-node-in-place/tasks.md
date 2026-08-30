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

## The movement (added after the first round, on the author's report)

The author's words on the built version: *it's possible to lose track of which panel has
opened, animate the opening and the re-flowing of other panels*. The first round had
declined animation deliberately; the reason it was declined was about the two end states
and missed the transition, which is where the reader is. Recorded in `spec.md` as a
reversal rather than a quiet deletion.

- [x] T018 `layout.ts`: `tween(from, to, t)`, pure — every box, every band and the canvas
      interpolated. Linear, with the easing left to the caller: the shape of a movement is
      a judgement about how it should feel, and this is arithmetic. Facts that cannot be
      averaged — the band, whether a node is open — are taken from the target.
- [x] T019 `FlowCanvas` holds the placement it is drawing and walks it to the target over
      200ms, re-routing the wires from the interpolated boxes each frame. A JavaScript
      tween rather than a CSS transition **because the wires are computed from where the
      nodes are**: a transition glides the cards and leaves fifty edges pointing at where
      those cards used to be until it finishes. Planted and seen, T024.
- [x] T020 An animation in flight is retargeted, not restarted: opening a second node
      while the first is still moving continues from wherever the picture had got to.
- [x] T021 The card's *contents* follow the selection immediately; only its box is
      animated. Content that waited for the first frame is a click with nothing behind it,
      which on a slow frame reads as a click that missed.
- [x] T022 `prefers-reduced-motion` is put to the platform and honoured (FR-016): the new
      placement is committed on the same frame, and where `matchMedia` is not there to ask
      the answer is no — a silent downgrade for everybody is worse than the animation.
- [x] T023 Scroll the open card into view **at the end** of the movement, by the least
      that makes it whole. The first cut scrolled on focus, at which point the box was
      still resting-sized: the phone card ended up half off the screen and the desktop
      chart was dragged sideways for a card that had never left it. Found by looking at
      both captures, not by a test.
- [x] T024 Plant each fault the movement's checks exist to catch, and see it caught. Four
      planted, four caught, all reverted: (a) commit the target immediately, the "no
      animation" build — the part-way check failed, and so did the reduced-motion check,
      which asserts the platform was actually *asked*; (b) reduced motion ignored — the
      reduced-motion check failed; (c) wires routed from the destination while the boxes
      move, which is what a CSS transition would give — the wire check failed on
      `monitor->scheduler`; (d) the tween carrying the start's facts rather than the
      target's — the facts check failed.
- [x] T025 The wall-clock gate is watching these two lines: the marker was removed from
      one `requestAnimationFrame` call and `check-wallclock` failed with that file and
      line, then it was restored and the gate went green. An exemption nobody has seen
      enforced is an exemption that might not be one.
- [x] T026 Trace it in a real browser rather than only in jsdom: the card's box over
      consecutive frames is 208 → 211 → 221 → 262 → 292 → 366 → 450, and the wire leaving
      it starts at 708 → 950 — its right edge on every one of those frames.

## The walk (added on the author's second report)

*Also provide left and right arrows in each opened view of elements — these move forward
and backward through the system components.*

- [x] T027 `inReadingOrder()` in `layout.ts`: band by band down the arc, rank by rank
      across each. **`buildFlow` and `layout` both use it now** — the rule was written
      three times, once in each of those and once more in the panel's first draft of this
      walk, and three copies of an order agree until one of them does not.
- [x] T028 The arrows walk `flow.nodes`, which is already that order. The panel holds no
      sort of its own: a second opinion about the order would agree with the picture today
      and be free to drift from it later.
- [x] T029 The walk is a round trip, and each arrow names the component it will open, so
      the wrap is stated rather than sprung. The card says where the reader is in the
      whole — without it the arrows can be pressed forever with no sense of extent, and
      the wrap reads as the chart being stuck.
- [x] T030 Stepping keeps the keyboard on the arrow. The card the arrow was in is gone by
      the time the new one is in the document, so `FlowCanvas` is told how the reader
      arrived and focuses the same arrow in the card that replaced it.
- [x] T031 The arrow **keys** are not bound, and the reason is written into the code where
      the temptation is: the card holds range inputs, whose own keys are the arrow keys.
      Binding them would take fine adjustment away from every tuning control to move the
      card. **Reversed by T034**, which keeps the reason and drops the conclusion.
- [x] T032 Plant each fault these checks exist to catch. Five planted, five caught, all
      reverted: (a) `buildFlow` no longer putting the nodes in the drawn order — the
      order check failed; (b) a walk that stops dead at the ends rather than coming round
      — the round-trip check failed; (c) the keyboard left on the card — the stepping
      check failed; (d) arrows labelled with a direction rather than a destination — the
      naming check failed; (e) a reading order that ignores rank — the order unit test
      failed.
- [x] T033 A first attempt at (a) did not fail, and the reason is worth keeping: the plant
      was *the panel sorting `flow.nodes` itself*, which passed because `buildFlow`
      already sorted — two implementations of one rule, agreeing. That is what sent the
      rule into `inReadingOrder` and left the panel with none. The unit test uses a
      deliberately jumbled input, because the components on disk are declared in an order
      that is not the drawn one (the clock is declared first and drawn last) and a check
      fed only the real configuration would be reading the file back to itself.

## The keys (added on the author's third report)

*Please support keyboard navigation of arrows (left & right).*

- [x] T034 Reverse T031. The objection recorded there was right and its conclusion was
      not: leaving the arrow keys to a range input is an argument for giving them up
      *inside the control*, not for declining them everywhere else. `walkKeys` takes ← and
      → across the whole open card and returns them to any `input`, `textarea`, `select`
      or editable region — the closest ancestor decides, so a key pressed in the tuner's
      own text entry is the tuner's.
- [x] T035 A modified arrow is left alone: alt, control, meta or shift means the reader is
      asking the browser or the system for something else.
- [x] T036 The keys are declared on the arrows themselves — `aria-keyshortcuts`, and the
      key named in each control's tooltip. A keyboard affordance nobody can find is in the
      position feature 114 found the demand control in: implemented, and absent.
- [x] T037 One listener, in the place that already hears the whole card: the open node in
      the chart (everything inside bubbles to it), the account itself in the list, which
      is what the reader is in there.
- [x] T038 Plant each fault. Three caught, all reverted: (a) the keys unbound, which is
      the state this round started from — the walk-by-key check failed; (b) the guard
      dropped — the slider check failed, with the card stepping off the threshold the
      reader was adjusting; (c) modified arrows taken too — the modifier check failed.
- [x] T039 A fourth plant did **not** fail, and the comment it disproved was corrected
      rather than left standing. The plant was a second key listener on the account inside
      the chart, which the code's comment claimed would step twice per press. It does not:
      both calls read the same selection from the same render and ask for the same next
      component, so the second is a no-op. Harmless, and not a property to design around —
      the single listener stays, and the comment now says what was actually observed.

## The palette (added on the author's fourth report)

*Too little contrast on the dark gray text* — with a screenshot of the feature-store card
at a phone's width.

- [x] T040 Measure before changing anything. `#6b7785`, the muted colour in both palettes,
      is 3.11:1 on `#222c36`, 3.53:1 on `#1a2229`, 3.60:1 on `#18202a`, 3.84:1 on the open
      card and 4.02:1 on the shell's own background. Ordinary text needs 4.5:1 and the
      text drawn in it runs down to 0.62rem, so no large-text allowance applies. Every
      other colour in both palettes already passes, the nearest at 4.90:1 — one token was
      the whole fault.
- [x] T041 Raise it to `#8a97a6`, chosen for the worst surface rather than the average:
      4.76:1 there, 6.16:1 at best, and still muted enough to stay a level below
      `--flow-fg` at 10–13:1. Both palettes carry the same value, so both moved.
- [x] T042 `walkthrough.css` held its own copy of `#6b7785` and would have kept the fault
      after the palettes were fixed. It uses the token now — one number in one place, the
      rule this repository already applies to its breakpoint.
- [x] T043 Define `--flow-cy`. Three rules have asked for it since feature 113 and nothing
      declared it, so the broker's advisory lane drew a bar with no fill and `.face-pill`
      took the colour it inherited. Found while measuring the pill in the author's own
      screenshot — and visible in the capture afterwards, where the pill has an outline
      for the first time.
- [x] T044 `app/src/shell/contrast.test.ts`: the palettes and the surfaces are **read off
      the stylesheets**, so the check cannot pass while the application draws something
      else. The only number typed into it is the 4.5:1 itself. A token must be classified
      as text or not-text before the test will accept it, and the exclusions carry their
      reasons — a border and a status dot are graphical objects and a text threshold would
      push the whole picture towards white for nobody's benefit.
- [x] T045 Plant each fault. Four planted, four caught, all reverted: (a) the reported
      colour put back — the AA check failed, naming every surface and its ratio; (b)
      `--flow-cy` undefined again — the asked-for-nothing check failed; (c) a new token
      added and never classified — the AA check failed on it; (d) a token renamed out from
      under its exclusion — three checks failed at once.
- [x] T046 No gate for this. It is a property of two stylesheets, held by a test that
      reads them; `scripts/gates.registry` stays as it is. Should a third palette appear,
      the test's own file list is what needs extending, and it fails loudly rather than
      passing over what it cannot see.

## The map's paper (added on the author's fifth report)

*The EDR query box isn't readable, it's white on white.*

- [x] T047 `map.css` was written for light paper — `#f4f2ec`, `#dcd8cc`, `color: #444` —
      and the shell is dark. Five rules were the rest of that inheritance:
      `.composer-url` (the one reported), `.map-arrival`, `.map-advisory-detail`, the
      selected advisory row, and `.map-status`, which is the same fault upside down. The
      note beside `.map-compose` had already recorded this exact bug being fixed once,
      for `.composer-pick`, at about 1.1:1 — so the fix's shape was already decided and
      only the rest of the file had been missed.
- [x] T048 The map's own canvas keeps its pale paper. It is what the globe is drawn on,
      deck.gl paints over it and the shell writes nothing on it: a surface, not a page.
- [x] T049 The holdings timeline's bar fill was a copy of the old muted grey, leaving its
      own label at 4.16:1. Moved with the palette, to 6.38:1.
- [x] T050 Extend `contrast.test.ts` from two stylesheets to **every** stylesheet, and
      from the palette question to the general one: for every rule painting an opaque
      surface, is the text landing on it legible. The previous round's test could not
      have found this — it read two files and the fault was in a third, which is the same
      as not having a check.
- [x] T051 Teach it the bit of cascade this needs: a rule that overrides only the
      background leaves the colour set by another rule on the same element. Without that
      it reported two faults in the holdings timeline that were not there, and a check
      that cries wolf gets its exclusions widened until it sees nothing.
- [x] T052 Hold a literal text colour to the same rule as a palette colour. `#444` on
      nothing it paints itself has no pair for a surface check to measure, and the first
      version of the extension went straight past it.
- [x] T053 **`#444` went past it a second time**, and that is the finding worth keeping:
      the pattern matched six hex digits and the reported colour was written in three.
      A colour one shade away in six-digit form was caught while the actual fault was
      not. Both forms are the same colour to a browser; the check now expands the short
      one before measuring anything.
- [x] T054 Plant each fault. Five planted, five caught, all reverted: the reported box put
      back (1.23:1, named); `#444` put back (1.65:1 on the darkest surface); a literal
      that fails only on the lightest surface; the timeline fill put back; and a
      text-free excuse whose rule had been renamed.
- [x] T055 Measure the **rendered** page as well as the stylesheets, since the cascade is
      the truth and a static check reads only what it can see. At 1440 by 900, walking
      every text node in every view and resolving the real backdrop: nothing under
      4.5:1 anywhere, once disabled controls are excluded — WCAG 1.4.3 exempts them, and
      the two that turned up were the composer's own GET and copy buttons before a
      collection is chosen.

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
