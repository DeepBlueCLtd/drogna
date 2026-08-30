---
title: A diagram is a claim about a system, and it is the one nobody checks
date: 2026-08-30
feature: specs/119-intro-architecture
description: >-
  Every architecture diagram starts accurate and ends up lying, because the system moves
  and the picture does not. The fix was to derive the boxes and wires from the same
  declarations the system runs on, and fail the build on a component the picture has not
  decided about.
---

# A diagram is a claim about a system, and it is the one nobody checks

## The background

Every architecture diagram starts accurate. Then a component lands, the picture does not
change, and nothing says so. Code that drifts from its callers fails a test; a drawing that
drifts just quietly lies, to exactly the readers who trusted it most. Can a diagram be made
to fail?

## The requirement

The Intro tab had to answer what a first-time reader arrives with — what is this made of,
and how do the parts fit? One drawing, grown a part at a time under the arrow keys. And it
had to stay true without anybody remembering to maintain it.

## The options considered

Generating all of it gives completeness and an unreadable scribble: the first attempt drew
twenty components and forty-one wires, and the loop was invisible. Drawing it by hand reads
well and rots. What worked was a split — judgement authored, facts derived. A node's text is
its component's declared label; the wires are the wiring; the store's eras are an enum in a
schema.

That leaves curation, because a picture rots by silently not drawing something new. A gate
fails on any component in neither the drawing nor a list of omissions carrying reasons. It
fired the day it was written: a merge landed a new component, the build named it, and a step
claiming the model runner assimilates observations had stopped being true.

## The demo

Press the right arrow. Boxes appear as they are described, the loop's band shows up only
once the write that closes the ring exists, anything already drawn is a way back into its
own step, and the disclosure underneath says what is missing and why.

[Open it at the Intro tab](../../instances/main/#/view/intro)

[Or start where the loop closes](../../instances/main/#/view/intro/the-loop)
