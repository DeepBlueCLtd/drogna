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

Every coloured cell the map draws is one stored value fetched by a real query — no
smoothing, no interpolation. That rule is the point of the page, and it made the map a
chessboard: 480 cells twenty-three kilometres across, with the sixty-kilometre eddy the
world is built around covering three. Drawing it smoothly is the one thing the panel may
not do, so the field had to get denser at source.

## The requirement

Four times the values along each horizontal axis: 7,680 cells where there were 480,
without the page becoming something you wait for.

## The options considered

Sixteen times the values is sixteen times the work: a now-cast pass goes from 18 ms to
274 ms. Invisible at the rate the map is watched; not wound forward, where the
fast-clock buttons now deliver about half of what they did.

Then the acceptance check went red, which was the useful part. It recovers the eddy's
centre from the stored bytes, and allowed two grid cells of error: 47 km on the coarse
grid against 13 km measured, 11 km on the fine grid against 13.9 km. Measured at five
densities the error converges on 14 km, so it was never limited by the grid — the world
composes four features additively, and the centroid is pulled by the front and the
thermocline. A floor under the achievable error had been read as a ceiling over this
estimator's, true only while the grid was coarser than the bias. The check now claims
what it can — the recovered centre falls inside the eddy those bytes carry — and goes
red when the eddy is taken out of the world.

## The demo

The eddy is round.

[Open it at the map](../../instances/main/#/view/map)
