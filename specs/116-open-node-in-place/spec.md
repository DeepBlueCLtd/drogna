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

## What is deliberately not done

- **The card does not float over the chart.** A card that grew over its neighbours is a
  modal with extra steps: it hides exactly the neighbours whose state the reader opened
  this node to compare against, and it makes the wires meaningless for as long as it is
  open. The reflow is the requirement, not a nicety of it — it is what FR-02 holds.
- **The resting card is not made bigger.** Twenty cards at a readable size is a picture
  no viewport holds, and the shape of the flow — which is what the tab exists to show —
  survives only while the whole of it is on screen at once.
- **No animation.** A card that grows over 200ms would look better in a screenshot
  sequence and would move the neighbours while the reader is reading them. The chart
  reflows on the same render as the selection.
- **The account was not rewritten.** Its content, figures and refusals are feature 113's
  and 114's, unchanged; what changed is where it opens and how much room it has.

## Acceptance

- **SC-001** Selecting a component's node puts that component's account inside that
  node's own element in the document, and its controls with it.
- **SC-002** With a node open, its neighbour's leading edge is at or past the open node's
  trailing edge, that neighbour is the size it was, and the canvas is taller than it was.
- **SC-003** Closing restores every box to its resting position exactly.
- **SC-004** No two nodes overlap, whichever node is open, for every node in the chart.
