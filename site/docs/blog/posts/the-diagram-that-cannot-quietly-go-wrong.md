---
title: A diagram is a claim about a system, and it is the one nobody checks
date: 2026-08-30
feature: specs/117-intro-architecture
description: >-
  Every architecture diagram starts accurate and ends up lying, because the system moves
  and the picture does not. The fix was to stop drawing it: derive the boxes and the
  wires from the same declarations the system runs on, and make the build fail when a
  component exists that the picture has not decided about.
---

# A diagram is a claim about a system, and it is the one nobody checks

## The background

Somewhere in every project there is a diagram of the architecture. It was drawn early,
usually by whoever understood the system best, and it was correct on the day. Then a
service was added, a queue was replaced, two boxes merged, and nobody opened the drawing
tool, because opening the drawing tool is not how anybody's afternoon gets better. The
picture stays on the wiki being wrong, and the particular danger is that it goes wrong
*quietly*: nothing fails, no test turns red, and the first sign of trouble is somebody new
spending a day looking for a component that was deleted eighteen months ago.

The obvious answer is to generate the picture from the code, and the obvious answer has a
well-known failure mode of its own. Generated diagrams are complete, and complete is
usually unreadable: every component, every connection, laid out by an algorithm that
cannot know which three of the fifty edges are the point. You end up with something
technically unimpeachable that nobody looks at twice — which is exactly the same outcome
as the stale drawing, arrived at from the opposite direction.

So the real question is not "hand-drawn or generated". It is: which parts of a diagram
are judgement, which parts are fact, and can you have the judgement without letting it
carry the facts?

## The requirement

This harness's front page was a list of numbered features, one per piece of work
delivered, growing by a paragraph each time. It answered "what has been built" for a
reader who already knew what the system was, and it answered nothing at all for the reader
it was actually in front of — somebody meeting the thing for the first time, who wants to
know what it is made of and how the parts fit together.

What had to become true: the first tab draws the architecture, builds it up a piece at a
time under the reader's own control with a sentence about each piece as it arrives, and
cannot go quietly out of date.

## The options considered

The first attempt drew everything. Twenty components on a five-column grid, every
connection derived from the system's own declared wiring, revealed one component per
press of the arrow key. It was complete and it was correct and it was a scribble:
forty-one lines, and a control loop — the single most important shape in the system — that
you had to be told was a loop before you could find it. That is the generated-diagram
failure mode, met in person. It was rejected in review with a sentence that reframed the
whole problem: *trim it down to the significant flows*.

The version that shipped draws thirteen of the twenty components. Four things a reader
arrives wanting: measurements coming in, being validated and stored, the forecast being
updated when the field drifts or enough time has passed, and the result being interrogated
from outside through standard interfaces. Four components sit at the four corners of a
banded rectangle, because the forecast loop *is* a loop and a picture of it that is not a
ring has thrown away the one thing worth saying about it.

Which brings back the staleness problem, now sharper. A subset is a curated picture, and
curation is exactly where a diagram rots: not by drawing something wrong, but by quietly
failing to draw something new. The split that made it work is this one.

**Judgement, authored:** the order of the ten steps, the words, which cell each box sits
in, and which components are deliberately left out.

**Fact, derived:** every box's text is that component's own declared label. Every wire is
the real wiring, taken from the same derivation the system's operator view uses — one line
per pair of components, solid where a message crosses the broker, dashed where two parts
are coupled directly and nothing is published. The strip along the bottom is whichever
components declare themselves infrastructure. The three slabs inside the coverage store
are the three eras its data format's schema permits, so a fourth would appear in the
picture without anybody remembering to draw it. The interfaces on the arrow leaving the
harness are the endpoints the system is configured to serve.

And the curation itself is checked. Every component that is not drawn is recorded with the
reason it is not drawn, shown to the reader in a disclosure under the diagram. A build
check fails when a declared component appears in neither list. That is the whole trick:
the picture is allowed to be a subset, but it is not allowed to be *silent* about being
one. A component that lands and nobody has decided about turns the build red, by name.

The check was planted before it was believed. One omission was deleted from the list, the
build was run, and it stopped with the name of the component nobody had decided about;
then the deletion was reverted. A check that has never been seen to fail is worth nothing.

One more rule, which cost nothing and prevents a specific kind of lie: **nothing in the
drawing lights up**. It is a picture of the wiring, not a report of a run. No box carries a
state, no heartbeat reaches the panel, and the tab says so in as many words and points at
the operator view, where every component's own account of itself lives. A diagram that
looks like a live readout is the cheapest way to end up asserting something you are not
actually measuring.

## The demo

Open it and press the right arrow ten times. The boxes and the band appear as they are
described; the loop's band only shows up once the write that closes the ring exists.
Anything already drawn is a way back into its own step, each step has its own address, and
the disclosure under the drawing says what has been left out and why.

[Open it at the Intro tab](../../instances/main/#/view/intro)

[Or start where the loop closes](../../instances/main/#/view/intro/the-loop)
