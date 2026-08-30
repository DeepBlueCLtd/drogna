---
title: A bound that only held while the grid was coarse
date: 2026-08-30
feature: specs/102-synthetic-ocean
description: >-
  The map drew the synthetic ocean as 480 coloured squares, so it was made sixteen
  times denser. The interesting part was not the cost, which was measurable, but the
  acceptance check that had been passing on the coarse grid for the wrong reason.
---

# A bound that only held while the grid was coarse

## The background

drogna's map draws a field: temperature or salinity over a patch of the eastern
Atlantic, at a depth you pick from a list, at an instant you scrub to. Every coloured
cell on it is one stored value, fetched by a real query against a real service, and the
panel is careful never to draw anything else — no smoothing, no interpolation, nothing
the server did not answer with. That rule is the point of the whole page.

It also meant the map looked like a chessboard. The field was stored on a 24 by 20 grid,
so an area covering four degrees of latitude and six of longitude arrived as 480 squares
about twenty-three kilometres on a side. The eddy that the world is built around is
sixty kilometres across: it occupied roughly three cells. A reader looking at the page
could tell that something warm was there, but not that it was round.

The obvious answer — draw it smoothly — is the one thing the panel may not do. A
smoothed picture is a claim about values between the stored ones, and no document that
crossed the seam contains them. So the field had to get denser at the source, or not at
all.

## The requirement

The stored field had to carry enough values that the map draws the ocean rather than a
mosaic of it, without the page becoming something you wait for. Four times as many
values along each horizontal axis: 96 by 80, so 7,680 cells where there were 480.

## The options considered

Sixteen times the values is sixteen times the work, and the work is not spread out. A
now-cast is published in one synchronous pass — every cell evaluated from the analytic
form, then hashed, then hashed again by the store's digest check — and it is republished
on a cadence for as long as the run lasts. Measured on a development machine, that pass
goes from 18 ms to 274 ms; a forecast run, which inherits the same grid and runs a
five-member ensemble over it, goes from 27 ms to 420 ms.

At the rate the map is actually watched, that is invisible: the now-cast is rebuilt every
fifteen minutes of wall time and a forecast run happens perhaps twice an hour. Wound
forward, it is not invisible at all — the shell's fast-clock buttons already fail to
deliver the rate they name, and after the change they deliver about half of what they
delivered before. That is the honest price, and it is why the vertical axis was left
alone: the map draws one depth level at a time, so more levels would add no density to
what a reader sees while multiplying every one of those figures again.

Then the acceptance check failed, and it was the useful part of the day.

One of the ocean's checks recovers the eddy from the stored bytes: take the depth level
nearest the eddy's authored centre, subtract the median, take the centroid of everything
above half the peak, and compare it with the centre recorded in the manifest. Its bound
was two grid cells, read from the manifest rather than typed into the test, on the
reasoning that a recovery from a grid cannot honestly beat the grid. On the coarse grid
that bound was 47 km and the error was 13 km. On the fine grid the bound became 11 km,
the error stayed at 13.9 km, and the check went red.

The tempting reading is that the finer grid broke something. Measuring the same recovery
at five densities said otherwise. The error is 13.3 km at 24 by 20, then 14.4, 14.0,
13.9, and 14.1 km as the spacing falls by a factor of eight. It converges. It was never
limited by the grid: the world composes four features additively, so the eddy's level
also carries the front, the drifting cold core and the thermocline, and the centroid of
everything above half the peak is pulled by them. A finer grid measures that pull more
precisely instead of removing it.

So the bound had been a claim about what a grid can resolve — a floor under the
achievable error — being read as a ceiling over this estimator's. It was true only while
the grid was coarser than the bias, and it had been quietly true for exactly that reason
since the check was written. The check now states what it can actually claim: the centre
recovered from the stored bytes falls inside the eddy those bytes carry, a bound the
manifest also states, and one that goes red when the eddy is taken out of the world.
That was watched happening before it was believed.

## The demo

The field, at the density the page now serves it. The eddy is round.

[Open it at the map](../../instances/main/#/view/map)
