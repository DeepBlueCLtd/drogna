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

This simulation opens the same way every time: an ocean, an archive, and a vessel that has
been at sea for zero seconds. Everything worth looking at — the track, the assimilation,
the package for shore — only exists once it has been running a while.

The obvious fix is to write plausible data into the stores at startup. We had already
forbidden that: seeded data must come from the same code that produces it live, or the demo
is a picture of a system rather than a system.

## The requirement

Offer a few situations to begin in — leaving the quay, arriving on task, working the area,
heading home — and make each one true by actually having run.

## The options considered

So the page picks a situation and then *plays the simulation forward* before showing you
anything, through the same controls a user can press by hand.

That worked and took twenty-five seconds. The obvious suspect was the data assimilation:
big grids, matrix algebra, the part that looks expensive. Timing it leg by leg cleared it —
about a second a cycle. The cost was the **route planner**, which searches for a good survey
track every ten simulated minutes and takes two and a half seconds to do it.

Which is fine: the planner only ever *recommends*. It is the one component we can
leave switched off while winding forward and switch on when you arrive. The four situations
now open in two to eight seconds.

## The demo

[Open the welcome page](../../instances/main/) and pick one. Then compare **Leaving
quay-side** with **Returning to quay-side** in the same tab — same code, same ocean, a
different amount of it having happened:

[Holdings, arriving on task](../../instances/main/?start=arriving#/view/holdings) ·
[Holdings, on the way home](../../instances/main/?start=returning#/view/holdings)
