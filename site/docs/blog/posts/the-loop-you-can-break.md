---
title: A list of twenty things cannot show you that they are a circle
date: 2026-08-30
feature: specs/113-operator-flowchart
description: >-
  The screen that let you stop any part of the running system was a table, and it was
  honest about everything except the one thing worth knowing: what else stops when you
  do.
---

# A list of twenty things cannot show you that they are a circle

## The background

Twenty or so pieces run in one browser tab — instruments feed a store, a check reads it, a
forecast follows — and one screen let you stop any of them. It was a
table: a lamp per row, a sentence, buttons to stop and restart. All true, and none of it
showed the shape. Those pieces are a circle, and stopping one greys a
row, which says nothing about what that row was feeding.

## The requirement

The system drawn as the connected thing it is, its connections taken from the actual
wiring rather than a drawing kept current by hand, and stopping something having a
visible consequence elsewhere on the screen.

## The options considered

The first attempt is the useful part. It drew twenty boxes in rows, two with a bespoke
display and eighteen the same card, and no connecting lines — from the
inside, staging; from the outside, a picture of twenty identical boxes. It came out that
way because the pieces had nothing to draw: each published a *sentence* about itself,
and a display wanting a bar would have to pick numbers back out of prose, inventing
figures the moment somebody reworded one. So the status schema gained an optional list
of figures: name, number, unit, and the bound it is measured against.

The lines came from a machine-derived record of who publishes where and who listens, so
the picture renders the wiring rather than describing it again and cannot drift; a check
fails the build if a piece is undrawn, or a connection neither drawn nor listed as
hidden.

## The demo

[Open it at the operator view](../../instances/main/#/view/operator) and stop the
vessel: two boxes along, the instruments start saying they have nothing to sample.
