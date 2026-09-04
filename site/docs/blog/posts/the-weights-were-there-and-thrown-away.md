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
model ran — which measurements moved it, and where the rest came from when nothing sampled it.

The obvious answer is to ask the system that combined them. Ours could not: it knew, and threw
it away.

## The requirement

For the water column a reader picks, a line to every instrument that reached it, each as wide as
what it contributed — and beside it the two numbers behind that width: how far the reading was
from the cell, and how its error compared with the forecast's.

## The options considered

The tempting fix was to work the split out in the browser, from the instrument positions and
the declared correlation. It looks equivalent and is not: a second copy of the arithmetic, free
to disagree with the first, and a picture that adds up by construction proves nothing about the
analysis it claims to show.

The real fix was smaller. The kernel builds each weight row by row, then reports only the total.
We kept the rows.

Then the surprise. The influence radius bounds the covariance, not the gain — so a cast beyond a
cell still moves it, through its overlap with one nearer. That part has nowhere to draw a line
from: a band, not a ray.

## The demo

![The forecast tab's centre region. At the top a chooser of the four provenance shares, then a
depth control reading 0, 200, 400, 600, 800 and 1000 metres — the analysis's own levels — with 0 m
chosen. Below it a map of the grid at that depth, mostly rust-coloured hatching where the
departure forecast still dominates the field, with a green patch where the platform has been
sampling; a pale ring marks the picked column and the six instrument-sources that reached it are
marked immediately beside it, because the platform's two instruments sample the cells it is
crossing and every source is within a cell or two of the column. Beneath the map a depth profile, one stacked bar of hatched bands per level
with its figures printed underneath. At 0 m: archive 0.0%, departure −11.9%, model −81.4%,
measurement from earlier cycles 0.5%, then this cycle's six sources — the 50 m instrument's three
casts at 110.4%, 39.4% and 39.2%, the 200 m instrument's three at −1.4%, 1.6% and 3.7% — and
beyond this cell's reach 0.0%, summing to 100.0%. The bands run in the same order as the
table at the foot. At 600 m, 800 m and
1000 m an italic line states that no observation was within reach of that level, because the
correlation reaches exactly zero beyond twice its half-width; the 600 m and 800 m bars are the
departure forecast alone at 100.0%, and the 1000 m bar is departure 84.5% beside model 15.5%. At the foot a table of what produced each width: each source with its
contribution, its separation from the cell in kilometres and in depth, its own declared error and
the forecast's at that cell.](../assets/124-what-a-number-is-made-of.png)

Pick a square. The lines are the instruments that reached that column, each as wide as it
counted; pick a depth and they re-weight without moving. Every figure is printed too: a platform
crossing its own cells stacks its sources. Here six contribute 3.86 and the band beyond reach
−0.07, against ω = 3.79 — the gain extrapolating, at magnitude.

[Open it at the Forecast tab](../../instances/main/#/view/forecast)
