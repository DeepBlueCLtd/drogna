---
title: The expensive part of a tick was not the part doing the science
date: 2026-08-30
feature: specs/118-start-conditions
description: >-
  A demo that always opens at minute zero shows an empty console. Winding one forward
  before the reader arrives turned out to cost twenty-five seconds, for a reason that had
  nothing to do with the forecast.
---

# The expensive part of a tick was not the part doing the science

![The welcome page: four cards in a row — Leaving quay-side, Arriving in the work area
marked "default", Loitering in the work area, and Returning to quay-side. Each card gives a
sentence about where the vessel is and a short list of what the run will hold, including
"not one measurement inside the work area itself" and "a package staged for
offload".](../assets/118-the-welcome-page.png)

## The background

This simulation opens the same way every time: a vessel that has been at sea for zero
seconds. The track, the assimilation, the package for shore — none of it exists until it
has been running a while.

The obvious fix is to write plausible data into the stores at startup. We had forbidden
that: seeded data must come from the code that produces it live, or the demo is a picture
of a system rather than a system.

## The requirement

Offer a few situations to begin in — leaving the quay, arriving on task, working the area,
heading home — and make each true by actually having run.

## The options considered

So the page picks a situation and then *plays the simulation forward* before showing you
anything, through the same controls a user can press by hand.

That took twenty-five seconds, and we guessed wrong twice about where it went. Not the
assimilation — matrix algebra looks expensive and cost a second a cycle. It was the **route
planner**, searching for a survey track every ten simulated minutes. Then, with that off,
the **ocean generator**, rebuilding a field every fifteen and having all but the last one
discarded.

So the ocean is built once, at build time, and shipped — the thing we had forbidden, unless
a check rebuilds it and fails if one byte differs from what the generator would produce now.
It compresses to 0.43 MB, and the situations open in 1.5 to 5 seconds.

## The demo

[Open the welcome page](../../instances/main/) and pick one. Then compare **Leaving
quay-side** with **Returning to quay-side** in the same tab — same code, same ocean, a
different amount of it having happened:

[Holdings, arriving on task](../../instances/main/?start=arriving#/view/holdings) ·
[Holdings, on the way home](../../instances/main/?start=returning#/view/holdings)
