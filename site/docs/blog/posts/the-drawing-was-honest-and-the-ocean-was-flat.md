---
title: The drawing was honest and the ocean was flat
date: 2026-09-04
feature: specs/124-forecast-illustration
description: >-
  A new drawing of the thermocline came out as a plane, and its caption said so instead
  of calling it a surface. That sentence found a bug — not in the drawing, and not in
  the grid everyone blamed first, but in the synthetic ocean itself.
---

# The drawing was honest and the ocean was flat

## The background

The thermocline is the depth where the sea's temperature falls away fastest, and sound
bends at it. Where it sits is not one number: it domes over cold water and is pressed
down under warm, and that shape is what a sonar operator is actually asking about. So we
drew it as a surface through the water, one depth per column, and it came out as a
perfectly flat plane.

## The requirement

The drawing had to show shape, and — the part that mattered more — it had to say what it
found rather than what it was meant to find. It printed the count: 7,679 of 7,680 columns
placing the layer at exactly the same depth, and a sentence saying the flatness was
probably the grid's fault, not the ocean's.

## The options considered

That sentence was half right, and being specific is what exposed the other half. The
obvious fix was a finer depth axis — six levels over a kilometre cannot see a 30-metre
layer. But sampling at 200, 100, 50, 25 and 10 metres gave one depth every time. The
synthetic ocean's thermocline function took a depth and no position at all. It was flat
by construction, and no resolution could resolve a shape that was not there. So the ocean
gained one: the features that warm and cool the water now move the layer, as they do at
sea.

## The demo

![The forecast tab's volume: twenty-six semi-transparent levels of sound speed drawn as a
box with depth exaggerated, and a pale sheet running through the upper part of it — the
thermocline surface, placed per column — with a scattered handful of marks deeper down
where a column's steepest fall is somewhere else entirely.](../assets/124-the-ocean-was-flat.png)

[Open the forecast tab](../../instances/main/#/view/forecast) — run the clock forward,
pick a column on the share map, and press "show the volume". The caption under it counts
what it actually found, which is the habit that started all this.

