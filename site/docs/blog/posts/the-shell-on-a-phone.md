---
title: A docking manager is the wrong thing to squeeze into 390 pixels
date: 2026-08-29
feature: specs/112-mobile-support
description: >-
  The harness was never unusable on a phone so much as untested on one — but one of its
  failures was different in kind from the rest. It told a viewer to widen a window that
  had no width to give.
---

# A docking manager is the wrong thing to squeeze into 390 pixels

## The background

The application this site is about is a demonstration: an ocean, sensors that sample it,
a forecast loop that assimilates what they report, and a query layer that serves the
result — all of it running in one browser page, with seven views you can move around
like windows on a desk. Dragging a panel next to another one is the point of that
arrangement. You put the map beside the message traffic and watch one explain the other.

Then somebody opens it on a phone, from a link in a pull request, and none of that
means anything. There is no room for two panels. There is no drag: a finger moving
across the screen is a scroll, and a drag handle sized for a mouse pointer is a target
you cannot hit on purpose. Seven tabs sit on one row that does not scroll, so the last
three are somewhere off the right-hand edge with no way to reach them.

The obvious answer is to make the existing layout smaller, and it does not work. A
docking manager exists to divide space between panels; dividing 390 pixels between two
panels produces two panels of 195 pixels, which is not a smaller version of the thing —
it is a different, useless thing. And the problem is not really the phone. A panel
dragged narrow on a large monitor has exactly the same problem, and would need exactly
the same answer.

## The requirement

The seven views had to keep their tabs, their order, their names and their addresses at
a phone's size, with the space that was being spent on furniture given back to what the
view is actually for — and with everything that a desktop viewer can reach still
reachable, one gesture further away rather than gone.

One thing was not a layout problem at all. The course of explainers in the Background
view already reasoned about width, because a diagram has a size below which it stops
being readable: rather than shrink one past legibility, it replaces it with a line
saying how much room it needs and asking you to widen the panel. On a desktop that is
helpful. On a phone it is an instruction that cannot be followed — a claim the page
makes that has stopped being true.

## The options considered

**Squeeze the docking manager with stylesheets.** Rejected early. The tab row still
would not scroll, the drag handles would still be offered and still be useless, and
every rule would be an argument with a library's own stylesheet — the sort of fix that
works until the library's next release.

**Build a separate mobile version.** Rejected for a reason specific to how this project
demonstrates itself: every pull request links a running instance opened at the thing
being shown. Two builds means two addresses, and a link that works in one and not the
other.

**Two presentations of one application, chosen by the size it measures of itself.** This
is what was built. Above the threshold, the docking layout, unchanged. Below it, the same
seven panels — from the same list, behind the same tabs, at the same addresses — shown
one at a time. Each panel then decides for itself what to show at rest and what to put
behind a labelled control that opens in place: the message list first, with the topic
tree and the message's own document one tap away; the map first, with its controls and
its advisories folded down. Because each panel measures itself rather than being told
which presentation it is in, a panel docked narrow on a large screen behaves exactly as
it does on a phone.

Two things in that design came from running it rather than from thinking about it, and
both are worth admitting. The first draft chose the presentation from width alone, and
the automated check reported the docking layout at 844 by 390 — a phone turned sideways,
which is one of the two orientations the whole exercise exists to serve. Room to dock is
a question about both dimensions, and now it is asked about both.

The second is worse, and more instructive. The check that was supposed to catch layouts
that push the page sideways measured the page. Every panel clips its own contents, so
nothing inside one can widen the page: a deliberately over-wide table planted in a panel
passed the check clean. A test that cannot fail is not a test. What replaced it measures
every element against a short list of the containers that are *allowed* to scroll
sideways — a table, a diagram drawn at its own minimum, the tab strip, a document — and
it failed immediately, on two real faults nobody had noticed: a slider two pixels wider
than the row holding it, and a diagram label measured the wrong way.

And the diagram that cannot be widened is now drawn at the size it needs, in a frame you
push sideways with a finger. Full size, labels intact, panned rather than shrunk. The
advice to widen the panel is still there for the viewer who has a window to widen,
because that is where it can be taken.

## The demo

The running thing, at a phone's size, in a frame on a desktop browser — the size is
mocked, nothing else is; what is inside the frame is the application, choosing its own
presentation from the width it measures:

[Open the framed shell at the map](../../instances/main/mobile.html#/view/map)

The same instance without the frame, which a phone will show exactly as the frame does:

[Open it at the messages](../../instances/main/#/view/messages)
