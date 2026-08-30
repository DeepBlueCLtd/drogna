# Feature Specification: The Operator node opens where it stands

**Feature Branch**: `claude/operator-panels-expansion-aohdis`

**Created**: 30 August 2026

**Status**: Built

**Input**: "i like the new operator panels, but they are too small to be usable. Please
re-implement this UI, so that when one is selected, it expands, to make it easier to read
and interact with. ideally the other elements will flow to accommodate the size change"

## Context

Feature 113 drew the Operator tab as a flow chart: twenty components, each in a card of
208 by 116 pixels, wired by edges derived from the topology. Feature 114 put the controls
inside those cards' drawers, at the node each control acts on. Both landed, and the
author's judgement on the result is the input above: the picture reads, and the cards do
not.

The measurement behind that judgement is on disk rather than in taste. A resting card
carries a name, a status dot, a state word, a simulation instant and the component's
bespoke instrument, in a box the height of six lines of text. The instrument is the part
that gets squeezed: the monitor's residual sparkline is 26 pixels tall, the platform's
dial is 40 across, and the coverage store's stack of holdings is drawn at a size where
the *shape* is legible and no individual figure is. A reader can see that something is
happening and cannot read what.

The account was reachable — selecting a node opened a drawer — but the drawer opened
**below the whole chart**. On a 1440-pixel viewport that is between 400 and 700 pixels
away from the node that was clicked, and the reader has to carry the component's name
across the page to be sure they are reading the right one. Feature 114's own rule is that
consequence is visible where the cause was applied; the drawer was the one place in the
tab where it was not.

**Feature number.** 116 follows 115. Like 111 to 115 it sits outside the arc: it changes
no simulation, adds no component, moves no data across the seam, and asserts nothing new
about the ocean. It is entirely about what the Operator tab does when a reader selects
something.

## Requirements

- **FR-01** Selecting a node in the flow chart **opens that node in place**: the node
  itself carries the component's full account — its state, the detail sentence it
  published, its instrument at a size a figure can be read off, the controls the operator
  surface says it takes, and the wires it is on.
- **FR-02** The rest of the chart **flows around the open node** rather than being
  covered by it: nodes after it in its band move along by what it gained, every band
  below moves down by what it gained, and the canvas grows to hold it. No node is placed
  over another in any state.
- **FR-03** The wires stay attached. An open node is taller than its neighbours, so
  sibling relationships are read from the declared band and never from measured geometry;
  the loop's return runs under the taller of the two ends it joins.
- **FR-04** Closing returns every node to the position the reader learned it in.
- **FR-05** The open node is reachable and leavable by keyboard: focus moves into it when
  it opens and back to its own node button when it closes, and the card is brought into
  view where the canvas is panned.
- **FR-06** The list view carries the same account, with the same controls and the same
  refusals, below the table — a row has nowhere to expand into, and the two views remain
  each other's equals rather than each other's fallbacks (feature 113, FR-015).
- **FR-07** The open card's box is **declared geometry**, and a phone is given a
  different one: the space a phone has is vertical, so it is taller and narrower there.
  Nothing in the layout knows about a viewport — the panel chooses which geometry to
  place against.
- **FR-08** The rearrangement is **drawn rather than jumped**. Opening a node moves most
  of the chart at once, and a picture that rearranged between two frames left the reader
  hunting for which card had grown — the author's report, and the reversal recorded
  below. The chart walks from its old placement to the new one over about a fifth of a
  second, and every wire is re-routed from the interpolated boxes on every frame, so no
  wire is ever detached from a node that is moving.
- **FR-09** Nothing moves for a reader who has asked for that. `prefers-reduced-motion`
  is put to the platform rather than assumed, and where it is answered *reduce* the new
  placement is committed on the frame the selection changed — the picture this tab drew
  before the animation existed (feature 113, FR-016).
- **FR-11** An open card carries a **back and a forward arrow**, which open the previous
  and the next component without the reader returning to the chart to find them. The
  order they walk is the order the chart is drawn in — band by band down the arc, rank by
  rank across each — and it is the layout's own rule rather than a second sort, so the
  sequence a reader follows is the sequence the picture shows.
- **FR-12** The walk is a **round trip**: there is no first or last component, because
  the arc the chart draws has none. Each arrow **names the component it will open**, so
  the wrap is stated rather than sprung, and the card says where the reader is in the
  whole — a control that can be pressed forever with no sense of extent is a control that
  has stopped saying anything.
- **FR-13** Stepping leaves the keyboard **on the arrow**, not on the card: the card the
  arrow was in has left the document, and a reader stepping through must be able to keep
  pressing.
- **FR-14** **← and → walk the components** from anywhere the reader is in the open card,
  *except* inside a control whose own keys they are — a range input, a number or text
  field, a select, an editable region. Those keep them. A modified arrow is left alone:
  that is somebody asking the browser or the operating system for something else.
- **FR-15** The shortcut is **declared on the arrows themselves** (`aria-keyshortcuts`,
  and in the control's own tooltip), not left to be discovered. A keyboard affordance
  nobody can find is in the same position as the control feature 114 found buried in a
  drawer: genuinely implemented and, to the reader, absent.
- **FR-10** The open card is brought into view **once it has stopped moving**, by the
  least that makes it whole. Scrolling to a box that is still growing aims at the wrong
  place: on a phone the card ended up half off the screen, and on a desktop, where
  nothing needed to move at all, the whole chart was dragged sideways.

## What is deliberately not done

- **The card does not float over the chart.** A card that grew over its neighbours is a
  modal with extra steps: it hides exactly the neighbours whose state the reader opened
  this node to compare against, and it makes the wires meaningless for as long as it is
  open. The reflow is the requirement, not a nicety of it — it is what FR-02 holds.
- **The resting card is not made bigger.** Twenty cards at a readable size is a picture
  no viewport holds, and the shape of the flow — which is what the tab exists to show —
  survives only while the whole of it is on screen at once.
- **~~No animation.~~ Reversed, and the reason it was reversed is the point.** The
  original decision was that a card growing over 200ms would look better in a screenshot
  sequence and would move the neighbours while the reader is reading them, so the chart
  reflowed on the same render as the selection. That reasoning was about the two *end*
  states, both of which are correct, and it missed the transition — which is where the
  reader actually is. The author's report on the built version: *it's possible to lose
  track of which panel has opened*. That follows directly from the reflow: opening a node
  moves most of the chart at once, so between two frames a dozen cards are somewhere else
  and the one that grew is not distinguished by having moved. Drawing the move is what
  tells them apart, and it is now specified rather than declined (FR-08 to FR-10). What
  the original decision was right about is kept: a reader who has asked for less movement
  gets exactly the picture it described (FR-09).
- **The animation carries no state and no meaning.** It is a transition between two
  placements the layout produced. Nothing derived from it reaches a figure, a message, a
  query or a test assertion — the movement belongs to the render path and stays there,
  under the wall-clock marker ADR-0007 established for exactly that.
- **~~The arrow keys are not bound to the walk.~~ Reversed on the author's request, and
  the original objection still stands — it was the conclusion that was wrong.** The
  objection: the card holds range inputs, and a range input's own keys *are* the arrow
  keys, so a handler at the card would take fine adjustment away from every tuning
  control in order to move the card. That is true, and it argues for leaving those keys
  with the control that owns them — not for leaving them unbound everywhere else. The
  keys are now taken across the whole card and given up inside any control that uses
  them (FR-14), which is what the objection actually asked for. Held by a test that
  presses ← on the monitor's live threshold slider and requires the card not to move.
- **The walk does not skip to what is interesting.** It steps one component at a time
  through every one of them, including the components that take no controls and the ones
  that have never been heard from. A walk that skipped the silent ones would be a walk
  whose length changed with the state of the system, and a reader who pressed forward
  twice would not know what they had passed.
- **The account was not rewritten.** Its content, figures and refusals are feature 113's
  and 114's, unchanged; what changed is where it opens and how much room it has.

## Acceptance

- **SC-001** Selecting a component's node puts that component's account inside that
  node's own element in the document, and its controls with it.
- **SC-002** With a node open, its neighbour's leading edge is at or past the open node's
  trailing edge, that neighbour is the size it was, and the canvas is taller than it was.
- **SC-003** Closing restores every box to its resting position exactly.
- **SC-004** No two nodes overlap, whichever node is open, for every node in the chart.
- **SC-005** Part-way through opening, the card is strictly larger than it was and
  strictly smaller than it will be — a rearrangement that arrives between two frames
  passes neither test.
- **SC-006** Part-way through, every wire leaving the moving node starts on a face of
  that node's box *as it is drawn at that moment*.
- **SC-007** With reduced motion asked for, the placement after the click is already the
  final one and does not change as frames pass.
- **SC-008** From any open component, forward then back returns to it; the arrows walk
  the same order the chart is drawn in; and exactly one component is open at any time.
- **SC-009** Each arrow's accessible name is the label of the component it will open.
- **SC-010** After a step, the focused element is the same arrow in the newly opened
  card.
- **SC-011** ← and → step the walk from the open card and from anything in it that does
  not own those keys; from a range, number, text, select or editable target, and from any
  modified arrow, the card does not move.
- **SC-012** Each arrow declares its key in a form assistive technology reads.
