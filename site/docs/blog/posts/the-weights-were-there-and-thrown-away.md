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

The obvious answer is to ask the system that combined them. Ours could not say. It knew,
and did not keep it.

## The requirement

For the water column a reader picks, a line to every instrument that reached it, each as wide
as what it contributed — and beside it the two numbers behind that width: how far the reading
was from the cell, and how its declared error compared with the forecast's.

## The options considered

The tempting fix was to work the split out in the browser, from the instrument positions and
the declared correlation. It looks equivalent from the inside and is not: a second copy of the
arithmetic, free to disagree with the first, and a picture that adds up by construction proves
nothing about the analysis it claims to show.

The real fix was smaller. The kernel builds each measurement's weight row by row and then
reports only the row total. We kept the rows.

Then the surprise. The influence radius bounds the covariance, not the gain — so a cast
beyond a cell still moves it, through its overlap with one nearer. That part has no place
to draw a line from, and is a band rather than a ray.

## The demo

![The forecast tab's centre region. At the top, a chooser of four provenance shares and a
depth control reading 0, 333, 667 and 1000 metres. Below it a map of the analysis grid at
0 m, mostly rust-coloured hatching where the field is model-dominated, with a green patch
where the platform has been sampling; a small ring marks the picked column and four short
coloured lines fan out from it to the instruments that reached it. Beneath the map, a depth
profile: four rows, one per level, each a stacked bar of hatched bands with its figures
printed underneath. At 0 m the bands read archive 0.0%, departure 0.0%, model 0.0%,
measurement earlier cycles 76.8%, then this cycle's four sources — temperature-050m ·1 at
13.5%, temperature-200m ·1 at 1.4%, temperature-050m ·2 at 8.4%, temperature-200m ·2 at
−0.1% — and beyond this cell's reach at −0.0%, summing to 100.0%. At 667 m one band reads
−122.3% against another at 106.0%, and the row still sums to 100.0%. At 1000 m an italic
line states that no observation was within reach of that level, because the correlation
reaches exactly zero beyond twice its half-width.](../assets/124-what-a-number-is-made-of.png)

Pick a square on the field. The lines are the instruments that reached that column, each as
wide as it counted; pick a depth and they re-weight without moving. Every band is printed, and
the row sums to one because the gain says so.

[Open it at the Forecast tab](../../instances/main/#/view/forecast)
