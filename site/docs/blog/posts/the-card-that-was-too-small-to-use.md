---
title: A card you can read and a card you can use are different sizes
date: 2026-08-30
feature: specs/116-open-node-in-place
description: >-
  A diagram of twenty running components has to fit on a screen, so each component gets
  a small box. Then someone asks to turn a dial inside one of those boxes, and the two
  requirements are not compatible. The fix was to let the box grow and make the diagram
  move aside.
---

# A card you can read and a card you can use are different sizes

## The background

There is a screen in this application that draws a whole running system as a diagram.
Twenty pieces, the connections between them taken from the actual wiring, and — the part
that makes it worth looking at rather than reading — each piece showing an instrument
built for what that piece specifically does. A store shows how much it holds and how fast
it is growing. A monitor shows how far a measurement has drifted from a forecast, against
the threshold that will eventually fire. A vessel shows a compass and two tapes: what it
was asked for, and where it actually is.

Twenty instruments have to fit on one screen at once, because the shape of the system —
which pieces feed which, and where the loop closes — is the thing the diagram exists to
show, and it survives only while the whole of it is visible. That constraint sets the
size of each box: about 200 pixels wide and 116 tall, or six lines of text.

At that size an instrument is legible as a shape and not as a number. You can see that
the drift line is climbing. You cannot read what it has climbed to. And a few days
earlier the same screen had gained controls — sliders that adjust the numbers the system
actually turns on — which were placed inside those same boxes, on the principle that you
should be able to see the effect of a change where you made it. A slider in a box that
size is not a control. It is a picture of one.

The person who commissioned the screen put it plainly: *the panels are too small to be
usable*.

## The requirement

Selecting a piece should open it — big enough to read a figure off and to move a slider
in — and the rest of the diagram should move out of the way rather than being covered.

## The options considered

The account of each piece already existed. Clicking a box opened a panel with everything
in it: the full-size instrument, the controls, the connections, the last thing the piece
said about itself. The panel opened **below the diagram**, which on a wide screen is
somewhere between 400 and 700 pixels from the box that was clicked. That distance is the
real defect, and it is easy to miss because nothing is missing: you click a thing, a
thing appears, it is the right thing. But you have to carry the piece's name across the
page to be sure of it, and the whole design rule of this screen is that a consequence
should be visible where the cause was applied. The drawer was the one place that rule was
broken.

So: open it in the box. Which leaves the question of what the neighbours do, and there
are two answers.

The card can **float over** the diagram — a panel anchored to the box, drawn on top,
neighbours untouched. It is the cheaper build by a wide margin: nothing about the layout
changes, only what is painted over it. It is also a modal with extra steps. The
neighbours it covers are exactly the ones a reader opened this piece to compare it
against — you lower the monitor's threshold in order to watch the loop two boxes along
start turning, and a card that hides those two boxes has taken away the reason you
opened it. Worse, the wires stop meaning anything for as long as it is open: they still
run to a box that is now underneath something.

Or the diagram can **make room**. The open box takes the space of two columns and four
rows; the boxes to its right in the same row move along by what it took; every row below
moves down; the canvas grows. Nothing is covered, every wire stays attached to both its
ends, and the piece you opened stays where you learned it was, which is the property that
makes a diagram learnable in the first place.

That is the version built, and it cost more than the geometry.

The first thing it broke was the markup. A resting box is a button — one element, one
click, the whole card is the target, which is right for something whose only job is *open
me*. An open box cannot be a button, because a button may not contain other buttons, and
an open box contains a slider, a send button and a close control. So the two states are
genuinely different elements: a button while it rests, a section with a heading and its
own close control while it is open. That is why this was a re-implementation rather than
a stylesheet with a bigger number in it.

The second thing it broke was subtler and would have been very hard to see. The routing
that draws the wires worked out whether two boxes were side by side in the same row by
comparing their vertical centres — which is a perfectly good test right up until one box
is three times taller than its neighbours and its centre agrees with nobody's. Wires that
should have left the open box's right-hand edge started leaving its bottom edge and
looping around. The fix was to stop measuring what was already declared: two boxes are in
the same row because they were placed in the same row, not because their middles happen
to line up.

Four deliberate faults were planted to check the new tests would notice, and all four
were caught: a box that grows without the row reflowing (the overlap check and the
neighbour-moved check both failed); the old centre-based routing restored (the wire check
failed); the account rendered below the diagram as it used to be (the in-place check and
the keyboard check both failed); and the layout left uninformed about which box is open,
which failed nine tests including every one of the control tests, because the controls
were then inside a card the size of a resting one — which is, precisely, the bug this
feature exists to fix, reproduced on demand.

The last thing was found by looking rather than by testing. The open card was three rows
tall, which fits the monitor's first slider and puts its second one just under the fold.
A control you have to scroll to find is the complaint this feature started with, so the
card is four rows tall. On a phone it is a different shape again — taller and narrower,
because the space a phone has is vertical — and it is scrolled into view by its leading
edge, since focusing an element scrolls by the least it can get away with and that left
the *set* buttons over the edge of a 390-pixel screen.

## The demo

Open the operator view and click any box with a **▸** on it — the mark means that piece
takes a control.

[Open it at the operator view](../../instances/main/#/view/operator)

Click the **monitor**, top row: it opens where it stands, the boxes to its right slide
along, and the rows below move down. Both of its dials are on screen without scrolling,
and the residual line above them is at a size where you can read the number. Close it and
everything returns to where it was.

Then click the **platform**, bottom left, and use the presets: *all stop* drops the
demanded speed mark to zero while the course mark stays exactly where it was. That is the
comparison the old drawer made you scroll for, and it is now happening inside the box
your hand is already on.
