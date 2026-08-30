---
title: A guided tour is the one part of an honest display allowed to be written in advance
date: 2026-08-30
feature: specs/110-walkthrough
description: >-
  Everything else on these screens is forbidden from saying anything it did not
  observe. A walkthrough is prose somebody typed months ago — so the interesting
  question was what it is allowed to say.
---

# A guided tour is the one part of an honest display allowed to be written in advance

## The background

This application opens on a screen showing twenty moving parts and no explanation of
what any of them is. Everyone who has been shown it in person has been shown it by
somebody talking over their shoulder, which works fine and does not scale to a link in
a pull request.

The obvious fix is a help page. The obvious fix is also the one nobody reads, because it
is somewhere else: you have to leave the thing you did not understand in order to read
about it, and then come back and re-find what you were looking at.

## The requirement

A single obvious control — large, yellow, top right — that walks a reader through the
running system one part at a time, highlighting the part on screen while it explains it.
It had to be reusable on the other screens later, and it had to survive a part being
added or removed without quietly going out of date.

## The options considered

The rule that governs everything else on these screens is that the display may not claim
anything it did not observe. A lamp is lit because a message arrived, never because a
configuration file said the piece exists. A walkthrough breaks that rule by
construction: it is a paragraph written weeks ago and shipped in the bundle.

The resolution is a line, not an exception. A step may say what a part is **for**. It may
not say anything about its **state** — not that it is running, not how many records it
holds, not that it is healthy. Each step highlights the part's own display and says what
the part does; every live number in view was drawn from traffic that actually arrived.
The prose teaches, the panel reports, and the two never swap jobs.

The going-out-of-date problem got a mechanical answer rather than a promise. Steps are
keyed to the parts they describe, and checked against the list of parts the application
declares: a part with no step fails, and a step naming a part that no longer exists
fails too. A tour that had silently stopped covering something would be worse than no
tour, because it reads as complete.

The tour itself is [driver.js](https://driver.js.org/), which is small, keyboard-
operable, and does the one thing needed — spotlight an element, show a card, move on.
One thing it could not be trusted with: a step pointing at an element on a screen you
are not looking at points at nothing, so the button opens the right screen first and
waits for it to actually be there. The first version waited with an animation-frame
callback and was refused by the check that forbids reading the host clock. The check was
right; the wait is now two rendering passes, which is what was actually meant.

## The demo

The yellow button is top right on every screen. On the operator view it walks the whole
system, part by part:

[Open it at the operator view](../../instances/main/#/view/operator)
