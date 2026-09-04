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
bends at it. Where it sits is not one number: it domes over cold water, is pressed down
under warm, and that shape is what a sonar operator is asking about. We drew it as a
surface, one depth per column. It came out a flat plane.

## The requirement

The drawing had to show shape and, more importantly, say what it found rather than what
it was meant to find. It printed the count — 7,679 of 7,680 columns at one depth — and
blamed the grid rather than the ocean.

## The options considered

That sentence was half right, and being specific exposed the other half. The obvious fix
was a finer depth axis — six levels over a kilometre cannot see a 30-metre layer. But
sampling from 200 metres down to 10 gave one depth every time. The thermocline function
took no position at all: flat by construction, with no shape to resolve.

So the ocean gained one, and it taught us something. Letting the ocean front move the layer
tilted the whole domain, and the harness stopped finding a drifting eddy it had found
before: the feature-finders read exactly the structure we had added. A basin-wide tilt did
the same. Broad shape and reliable feature-finding compete for one signal, so only local
features move the layer.

## The demo

![The forecast tab's volume: twenty-six semi-transparent levels of sound speed drawn as a
box with depth exaggerated, and a pale sheet running through the upper part of it — the
thermocline surface, placed per column — with a scattered trail of marks deeper down where
a column's steepest fall is somewhere else entirely. The caption beneath counts 1,920
columns over thirteen distinct depths, level to within one 40-metre level.](../assets/124-the-ocean-was-flat.png)

[Open the forecast tab](../../instances/main/#/view/forecast) — run the clock forward,
pick a column, press "show the volume". The caption counts what it found and names what it
cannot tell: the analysis it reads is noisy enough that the count would look the same on a
flat ocean. Saying so beats claiming the win, and is the habit that started this.

