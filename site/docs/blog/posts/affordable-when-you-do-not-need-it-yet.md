---
title: Affordable when you don't need it yet
date: 2026-09-02
feature: specs/123-forward-step
description: >-
  We gave a forecast a price and let the scheduler decide when to pay it. Read the
  affordability rule the obvious way round and the loop stops running forecasts for
  good — and the reason it stops is the reason the rule has to be inverted.
---

# Affordable when you don't need it yet

## The background

Running an ocean forecast on a ship is not free. It takes real compute on a box with other
jobs, so when to run one is a decision somebody makes, not a detail to optimise away.

The obvious answer is to run when there is room. That answer has a hole in it, and the
hole only shows when you set it beside the rule that stops the system going quiet.

## The requirement

A run states what it will cost before it starts, then spends it. The scheduler gains a
second question beside *is a forecast warranted*: *can we afford one now*. A run waiting
on cost must look different from one refused, and different again from one nobody asked
for.

## The options considered

We wrote it the natural way first: affordable when the run fits inside what is left of the
standing forecast's life. Then we read it against the rule that says a forecast must
happen eventually — which fires *exactly when* the standing one expires. At that instant
nothing fits, so nothing is ever affordable again, and the loop never forecasts again.

Inverted, the same numbers describe real behaviour. Wait *while* the standing forecast
still has more life than the run costs; start as that margin runs out, so the new one
lands as the old one lapses.

## The demo

![The Forecast tab. Left: a vertical gauge headed "Why now", showing a sound-speed residual
of 0.12 m/s against a threshold of 1.2 m/s marked as a dashed line across the bar, with the
streak at 0 of 3 beneath it, and under that the sentence "A run costs 12 ticks of simulation
time — 4 steps x 1 sub-step x 3 work units, declared against a nominal cell of 11 km",
attributed to the model-runner component. Centre and right: two dashed panels headed "What it
is made from" and "What next", each stating that it is feature 124 and is not built. Along the
foot: a panel headed "Runs, in simulation time", listing the forecasts the store holds.
](../assets/123-affordable-when-you-do-not-need-it-yet.png)

Open the Forecast tab. The gauge is the disagreement between what the instruments measure
and what the forecast said, with the cost of a run under it in the same frame. Along the
foot, runs in simulation time — and the waits, saying how much life is left.

[Open it at the Forecast tab](../../instances/claude-srd-model-forecast-specs-ws9x3d/#/view/forecast)
