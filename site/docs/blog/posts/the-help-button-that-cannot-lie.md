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

The application opens on twenty moving parts and no explanation of any of them. In
person somebody talks you through it, which does not scale to a link in a pull request.
A help page is the obvious fix and the one nobody reads: you have to leave the thing you
did not understand in order to read about it.

## The requirement

One obvious control — large, yellow, top right — walking a reader through the running
system a part at a time, highlighting each part as it explains it. Reusable on the other
screens, and unable to go quietly out of date.

## The options considered

The rule governing everything else here is that the display may not claim anything it
did not observe, and a tour is a paragraph written weeks ago and shipped in the bundle.
So it gets a line rather than an exception: a step may say what a part is **for**, and
nothing about its **state**. The prose teaches, the panel reports.

Going stale got a mechanical answer. Steps are keyed to the parts they describe and
checked against the parts the application declares, so a part with no step fails, and so
does a step naming a part that is gone.

The tour is [driver.js](https://driver.js.org/). A step pointing at a screen you are not
on points at nothing, so the button opens the screen and waits — the first version
waited on an animation-frame callback, which the check forbidding reads of the host
clock refused. The wait is two rendering passes now, which is what was meant.

## The demo

[Open it at the operator view](../../instances/main/#/view/operator), where the yellow
button walks the whole system part by part.
