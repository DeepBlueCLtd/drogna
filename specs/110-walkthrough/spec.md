# Feature Specification: The walkthrough, and the yellow button

**Feature Branch**: `110-walkthrough` (built on `claude/operator-flowchart-redesign-5kk7aa`)

**Created**: 29 August 2026

**Status**: Built

**Input**: "New feature: add a large yellow help button at the top right. Clicking it
should trigger a walkthrough of the system components, one by one, explaining what each
does, with a brief description of its UI panel and interactions. In the future we can
add this yellow button to other tabs. You are free to choose any walkthrough library."

## Context

`docs/v2/plan.md` §5 reserved feature **110** for "interactive walkthrough machinery (a
step-through mode driving the other panels)", named it as deliberately outside the
101–109 arc, and left it unclaimed — which is why feature 111 took 111 rather than
renumbering somebody else's slot, and why this specification takes 110 rather than
inventing a number. The reservation is now spent, and §5's note is amended to say so.

The request arrived while feature 112 was being built, and lands on it: 112's Operator
flow chart draws one node per declared component with a stable `data-flow-node`
attribute, which is exactly the anchor a step-through needs. A walkthrough written
against the old table would have had nothing to point at but rows.

## What this delivers, visibly

A large yellow **Guide me** button at the top right of the shell header. Pressing it
opens the Operator view and walks the harness: an opening step on the flow chart as a
whole, then one step per declared component — what it does, and what its panel shows —
and a closing step on the loop. Twenty-two steps for twenty components.

## The load-bearing choices

- **The steps are keyed to the declared components**, in the order the picture draws
  them, so the tour's order is the architecture's order rather than an author's. A
  component with no step, and a step for something that is not a component, are both
  reported by name (`missingSteps`) and held by a test. A walkthrough that quietly
  stopped covering a component would read as a complete tour, which is worse than no
  tour at all.
- **It teaches; it does not report.** Feature 111 established that an explainer does not
  engage Constitution VII, because it stands in for nothing. That holds only while the
  copy never claims a *particular* component's live state — so the prose says what a
  component is for and points at the node where the figures are, and a test rejects
  "it is running", "currently", "right now" and a published count. The first draft of
  that test also rejected *"a node is lit only because a heartbeat arrived"*, which is
  the rule being taught rather than a claim about a component; narrowing it is how the
  difference got stated instead of assumed.
- **The button takes a tour, not a script.** It is a component parameterised by a tour,
  and a tour names the view it runs in. Adding one to another tab is a tour and a line,
  not a second button — which is what the request asked for in the future tense.
- **The view is opened before the tour starts**, because a step highlighting an element
  on a tab you are not looking at highlights nothing. This takes two React commits and
  deliberately no timer: the obvious version used `requestAnimationFrame` and the
  wallclock gate refused it. The gate was right — reaching for a frame callback to mean
  "later" is how a harness starts keeping time by the host, one convenience at a time.
- **driver.js (MIT)** does the overlay, the focus trap, keyboard traversal and the
  scroll-into-view. Chosen over writing one: those are fiddly, well solved, and nothing
  about them is this harness's subject. Its popover is restyled into the shell's idiom
  rather than left as a light card on a dark page.
- **Yellow because it is the one control on the page that is for the reader.**
  Everything else in that header operates the machinery. A help affordance that looked
  like the others would be found only by the people who did not need it.

## Acceptance evidence

- The tour covers every declared component and explains nothing that is not one, in the
  picture's own order — watched failing with a component dropped from the copy, with
  copy left behind for a component removed, and with the order reversed.
- The live-state check watched failing against a planted "It is running right now."
- The button is driven in a test, not merely rendered: clicking it opens the tour's view
  and puts the first step's own words on the page.
- Seen working in the built app under headless Chromium: the button found, the first
  step read, six Next presses reaching "The coverage store" with its node highlighted,
  and no page errors. That run is also what found the two defects below.

## What the running page found that the tests had not

- Every component in the plane band — clock, broker, release gate — read **"no heartbeat
  has ever arrived"** while lit and beating. They publish no `detail` line, and the
  panel was treating an absent detail as an absent heartbeat: the display inventing a
  silence that had not happened. Now held by a test.
- The protected padlock was a codepoint with no glyph in the shell's font stack, and
  rendered as an empty box. Drawn as an SVG instead.

## Deliberately not in this feature

- **A tour on any other tab.** The mechanism is built to be repeated and the request
  put other tabs in the future tense; writing tours nobody has asked for yet would be
  copy without a reader.
- **Driving the panels' own controls from the tour** — stepping the clock, stopping a
  component. The reservation's words were "driving the other panels", and a tour that
  operated the machinery would need to undo what it did, or leave the harness changed
  by having been explained. It highlights and explains; the reader operates.
- **Remembering that a reader has seen it.** Version 2 persists nothing between visits,
  and a "don't show again" flag would be the first thing that did.
