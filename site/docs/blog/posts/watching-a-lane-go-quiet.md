---
title: The fastest way to see a system stop is to stop watching the numbers
date: 2026-08-30
feature: specs/115-engaging-tabs
description: >-
  A page listing every message a system passes is complete, honest and almost unreadable.
  Drawing the same traffic as marks on lanes turned out to answer a question the list
  never could — and the hard part was making sure the picture stands still when nothing
  is happening.
---

# The fastest way to see a system stop is to stop watching the numbers

## The background

Somewhere inside most working systems there is a message bus: a place where one part
announces something and the parts that care about it listen. Watching that bus is the
oldest debugging tool there is, and the usual way to watch it is a list. Newest at the
top, one line per message, the topic and a bit of the payload. Every tool that does this
does it the same way, and there is a reason: the list is complete and it is honest. If a
message crossed, it is in the list.

It is also nearly useless for the question people most often have, which is not *what
did that message say* but *is anything still happening?* A list scrolling past at forty
lines a second and a list scrolling past at four look identical from more than half a
metre away, and a list that has stopped scrolling looks exactly like a list you are not
looking at. To find out whether a particular producer has gone quiet you have to read
topics off individual rows and hold a rate in your head, which is a thing computers are
much better at than people.

The obvious fix is a counter — "1,204 received" — and the obvious problem with a counter
is that a number you are not watching does not change in front of you. You have to look
twice and remember the first number.

## The requirement

The display had to answer *is this still moving, and which part of it stopped* from
across a room, without reading a number, and it had to keep the list, because the list
answers a different question and answers it well.

One further constraint, and it turned out to be the interesting one. **The display must
not move when nothing is arriving.** That sounds like a nicety and it is not: a display
that animates on its own is asserting activity, and a viewer cannot tell an idling
animation from real traffic. A pulse that keeps pulsing at a dead system is worse than a
blank screen, because a blank screen is at least right.

## The options considered

The first instinct was a scrolling waterfall — marks drifting leftward on a timer, one
per message, the way a network monitor does it. It is a familiar shape and it fails the
constraint immediately: the drift is driven by a clock, so the picture keeps moving after
the last message arrives, and "quiet" and "still running, nothing to say" look the same.

The second was to place each mark by *how long ago it arrived*. That reads well and fails
the same way for a subtler reason: the position of every mark is a function of the current
time, so the display has to re-draw on a timer to stay correct, and it is animating again.

What worked was to place each mark by **where it sits in the receive order** rather than
by when it arrived. The newest message anywhere is at the right edge; a message twenty
arrivals back is twenty twentieths of the window from it; a message that has fallen off
the back of the window is not drawn. The whole display is then a pure function of the
messages received, so it advances when a message arrives and at no other time. Nothing
holds a clock; there is no timer to leave running.

That choice paid for itself twice. Because every mark is measured against the newest
message *anywhere* rather than the newest in its own lane, stopping one producer does not
freeze its lane — it **drains** it, rightward, as everything else goes on arriving. The
lane empties in front of you. That is a much stronger signal than a lane that has merely
stopped growing, and nobody designed it: it fell out of the ordering rule.

And it made the constraint checkable rather than intended. The check renders the panel,
stops the whole simulation, lets everything settle, and then asserts that the page is
byte-identical thirty seconds of real time later. Before trusting it, we broke it on
purpose — added a small timer that nudged the marks — and watched it fail. Then we broke
it a second way, with a CSS animation on the marks themselves, and watched the first
check *pass*: a CSS animation is motion the markup cannot see. So there are two checks,
and the second reads the stylesheet from disk and refuses any animation or transition on
the traffic display at all.

One thing the design got wrong on paper and the running system corrected. The plan was to
draw a lane per top-level namespace and treat *a namespace nobody declared* as the finding
worth flagging. That can never happen here: the bus enforces who may publish where, so a
message on an entirely unknown prefix is rejected before any subscriber sees it. The
fault that does happen is a topic nobody declared inside a namespace somebody did — and
that is what gets its own lane now, marked undeclared, sitting beside the declared one.

## The demo

Open the traffic display and watch it for a moment; the observation lane is the busy one
and the control lane beats steadily underneath it.

[Open it at the messages tab](../../instances/main/#/view/messages)

Then, in a second tab of the same page, open the operator view, find the sensors, and stop
them.

[Open the operator tab](../../instances/main/#/view/operator)

Go back. Nothing needs refreshing and there is no number to read: the observation lane has
gone empty while the control lane is still beating. Start the sensors again and it fills
back in from the right.

Everything here is synthetic. The ocean is generated from a seed and the numerics are
deliberately fake — see [the landing page](../../index.md) for what that means and why it
matters.
