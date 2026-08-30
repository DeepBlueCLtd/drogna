---
title: The forecast was not listening, and nothing in the code said so
date: 2026-08-30
feature: specs/116-analysis-step
description: >-
  Every part of the loop was individually honest, and the whole was a demonstration of
  something that was not happening: the instruments changed when the model ran and
  where the boat went, but never what the model believed. Finding out took asking about
  a picture.
---

# The forecast was not listening, and nothing in the code said so

## The background

The project samples a simulated Atlantic from a boat, forecasts the water, and
re-forecasts when the two drift apart. Somebody asked how much of the forecast came from
the instruments, and reading the loop end to end showed they contributed nothing. They
decided *when* to forecast and *where the boat went*; a run initialised from a copy of
the simulated truth. So the forecast was always right enough and its errors shrank,
exactly like learning.

## The requirement

A step that moves the field toward what the instruments reported, weighting each side by
how far it is worth trusting, and a field that can say cell by cell where its value came
from.

## The options considered

Nudging nearby cells toward each measurement is a dozen lines. Optimal interpolation won
on an algebraic accident: the observation operator picks out one grid cell, so the
analysed value is a weighted sum of forecast and measurements. The provenance bar is
not a diagram of the calculation; it is the calculation.

Two wrong turnings. A bell curve never quite reaches zero, and never quite compounds:
after four cycles the bookkeeping credited the instruments with 45% of every cell.
Chopping the tail off is worse — the covariance stops being positive definite
and the inversion returns nonsense — so the influence is Gaspari–Cohn, watched failing
against the chopped one. And the planner's five hand-tuned numbers for a measurement's
reach — a visit collapsing uncertainty by 85% where the arithmetic says 99.7% — are
gone; it asks the analysis.

## The demo

[Open it at the map](../../instances/claude-platform-measurements-nowcast-irl2cb/#/view/map)

Choose *where the value came from* in the doubt control: a corridor along the track
where the instruments own the value, elsewhere what was known before.
