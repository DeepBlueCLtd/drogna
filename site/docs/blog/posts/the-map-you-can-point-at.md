---
title: The map you can point at
date: 2026-08-29
feature: specs/109-map
description: >-
  Asking a data service about a place meant typing two numbers for a spot already
  on the screen. Fixing that turned out to be less about the click than about
  making sure the thing drawn and the thing fetched cannot be different things.
---

# The map you can point at

## The background

A gridded service answers "what is the temperature here, at this depth, at this time".
How a person gets the coordinate is never settled: they read it off a map, retype it,
and get a digit wrong. Once retyped, nothing on screen is bound to the request that went
out: picture and query are two claims about one place, free to drift apart.

## The requirement

Place a query by clicking the map; show the volume rather than one slice at a time; and
make what the canvas draws the same thing the request asks for, by construction.

## The options considered

The click is easy. The composer had been holding its own state, so a click and a typed
number would have been two copies of one position with a synchroniser between them to go
wrong; the state moved up to the map. The cube stacks one area query per level.

The binding is the part worth copying: one function produces the ring an area query
covers, the canvas draws it, the request is built from it, and a test holds them equal
coordinate for coordinate.

Then a bug the tests missed and the page found. The map shades uncertainty from a
forecast's spread, which covers its run's horizon rather than the field's; the first
version asked about the field's instant. The server refused, naming the extent it does
cover, and the map printed the refusal — caught in a minute. The test that should have
caught it passed because the time steps agreed that tick; now it runs on until they
disagree.

## The demo

[Open it at the map](../../instances/main/#/view/map), switch to the depth cube and
click a slice: position and depth land in the form, the marker where the URL says.

![The Map tab of the drogna shell in its depth-cube view, with the query composer
open on the right. Six stacked slices are drawn in a rotated box, warm orange at the
surface grading to deep blue at the bottom, each one the answer to its own area
query. The composer shows collection "nowcast", query type "position", longitude
-11.184, latitude 46.147 and depth 280 m — the position filled in by a click on one
of the slices — a note reading "position -11.184, 46.147 — inside the domain", and
beneath it the request line the query composes:
/api/edr/collections/nowcast/position?coords=POINT(-11.184
46.147)&z=280.](../assets/109-the-map-you-can-point-at.png)
