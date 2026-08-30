---
title: Twenty years and forty-five minutes, on one axis
date: 2026-08-30
feature: specs/115-engaging-tabs
description: >-
  A catalogue of stored datasets was showing a four-dimensional ocean as five columns and
  twelve characters of a checksum. Drawing the archive filling up instead meant an axis
  that carries two decades and one afternoon at once.
---

# Twenty years and forty-five minutes, on one axis

## The background

A forecasting system files three different things in one drawer: an archive of what the
world did, a picture of what it is doing now, and forecasts reaching a little into a
future that has not happened. The obvious display is a table, and it hides the two
things anyone wants: accumulation — the archive as a long band, the forecasts as short
bars crowding the present — and whether the forecasts were any good.

## The requirement

The store filling up, and whether a forecast that had run its course turned out right. A
table is free keyboard and screen-reader surface and a picture is neither, so a check
proving every dataset announced and reachable in order had to pass first.

## The options considered

The axis is the awkward part. The archive covers twenty years and a forecast reaches
forty-five minutes past the moment it was made, so on a straight timeline a forecast is
a hairline at the right edge. Giving each row its own scale is worse: two bars
at the same position would be at different moments, and position meaning time is what a
timeline promises. So one axis, compressing elapsed time
logarithmically from the newest edge, and saying so rather than letting a reader
infer duration from tick spacing.

Three faults came from looking at the running page: two lanes landing on every line,
four timestamps printed over each other, and a forecast run publishing two datasets
over the same interval, so eight stored datasets drew as five. Overlapping bars stack
now.

## The demo

[Open it at the holdings tab](../../instances/main/#/view/holdings) and pick a forecast
whose window has passed: the comparison draws the forecast, the truth, and the starting
field held constant — error alone reads as a verdict.
