---
title: The weights were there, and thrown away
date: 2026-09-03
feature: specs/124-forecast-illustration
description: >-
  Asking which measurement moved a forecast number looked like new science. It was not:
  the answer had been computed on every cycle and discarded a line later. Keeping it
  turned out to be the easy half — some of the influence has nowhere to be drawn from.
---

# The weights were there, and thrown away

## The background

An operator asked to trust a forecast asks one thing: what is this number made of? Not which
model ran — which measurements moved it, and where the rest came from when nothing sampled.

The obvious answer is to ask the system that combined them. Ours could not: it knew, and did not
keep it.

## The requirement

For the water column a reader picks, a line to every instrument that reached it, each as wide
as what it contributed — and beside it the two numbers behind that width: how far the reading
was from the cell, and how its declared error compared with the forecast's.

## The options considered

The tempting fix was to work the split out in the browser, from the instrument positions and
the declared correlation. It looks equivalent from the inside and is not: a second copy of the
arithmetic, free to disagree with the first, and a picture that adds up by construction proves
nothing about the analysis it claims to show.

The real fix was smaller. The kernel builds each weight row by row, then reports only the row
total. We kept the rows.

Then the surprise. The influence radius bounds the covariance, not the gain — so a cast beyond a
cell still moves it, through its overlap with one nearer. That part has nowhere to draw a line
from, and is a band rather than a ray.

## The demo

![The forecast tab's centre region. At the top a chooser of the four provenance shares, then a
depth control reading 0, 200, 400, 600, 800 and 1000 metres — the analysis's own levels. Below
it a map of the grid at 0 m, mostly rust-coloured hatching where the departure forecast still
dominates the field, with a green patch where the platform has been sampling; a small ring marks
the picked column, and the instruments that reached it are marked immediately beside it, because
on this scenario the platform loiters and every source is within a cell or two. Beneath the map a
depth profile, one stacked bar of hatched bands per level with its figures printed underneath. At
0 m: archive 0.0%, departure 0.0%, model 0.0%, measurement earlier cycles 76.8%, then this
cycle's four sources at 13.5%, 1.4%, 8.4% and −0.1%, and beyond this cell's reach at −0.0% —
summing to 100.0%. At 400 m two sources read 106.0% and 21.7% against an earlier-cycles band of
−1.5% and a remainder of −5.4%, and the row still sums to 100.0%: the gain extrapolating past the
readings, drawn at its magnitude rather than clamped. At 600 m an italic line states that no
observation was within reach of that level, because the correlation reaches exactly zero beyond
twice its half-width.](../assets/124-what-a-number-is-made-of.png)

Pick a square. The lines are the instruments that reached that column, each as wide as it
counted; pick a depth and they re-weight without moving. Every band is printed too: a loitering
platform puts its sources almost on top of each other, and the picture cannot carry it alone.

[Open it at the Forecast tab](../../instances/main/#/view/forecast)
