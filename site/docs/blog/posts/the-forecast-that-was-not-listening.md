---
title: The forecast was not listening, and nothing in the code said so
date: 2026-08-30
feature: specs/115-analysis-step
description: >-
  Every part of the loop was individually honest, and the whole was a demonstration of
  something that was not happening: the instruments changed when the model ran and
  where the boat went, but never what the model believed. Finding out took asking about
  a picture.
---

# The forecast was not listening, and nothing in the code said so

## The background

This project simulates a patch of the Atlantic, sails a boat through it, samples the
water with instruments on the boat, and forecasts what the water will do next. When the
forecast and the samples drift apart it notices, and forecasts again. That cycle —
measure, compare, re-forecast — is the whole idea, and it is what every ocean forecasting
service on earth does at a scale several million times larger.

Somebody asked a reasonable question about it: could you show how much of the forecast
came from the instruments? Not whether the instruments were working, which the screens
already showed, but how much of the number on the map the boat was responsible for.

Answering it meant reading the loop end to end. And the loop, read end to end, did not
have an answer, because the instruments were not contributing to the forecast at all.

They were contributing to two other things, both real. The samples decided *when* to
forecast: when a measurement disagreed with the prediction for long enough, a new run
was triggered. And they decided *where the boat went next*, through a planner that sends
it toward whatever the system is least sure about. What they never did was change a
single value in the forecast field. When a run started, it initialised from a fresh copy
of the simulated truth — the actual answer, evaluated straight from the equations that
generate the synthetic ocean — and forecast forward from there.

So the forecast was always roughly right, and it stayed roughly right, and the errors it
reported got smaller over time. All of which looked exactly like a system that was
learning from its instruments. None of it was.

## The requirement

The measurements had to reach the field: a step that takes what the instruments actually
reported and moves the forecast toward it, by an amount that reflects how much each side
is worth trusting. And the field had to be able to say, cell by cell, how much of its
current value it owed to the instruments rather than to the model — because that was the
question that started this.

## The options considered

The tempting first move was to write the explanation without building the thing. There
is a section of this application dedicated to explaining how it works, and a page about
data assimilation would have been genuinely educational sitting next to a system that did
not do any. That was rejected quickly and it deserves saying why: the entire premise here
is a demonstration that does not overstate itself. A tutorial describing a step the
software does not perform is the precise failure mode this project exists to avoid.

The interesting choice was between two ways of blending. The simple one is nudging: for
each measurement, pull nearby cells toward it by an amount that fades with distance. It
is a dozen lines, it is easy to draw, and for a demonstration it would look identical
from the outside.

The one chosen is optimal interpolation, which is heavier: it builds a covariance between
every pair of observations, inverts a matrix, and weights each measurement by how
uncertain the forecast was there against how precise the instrument is. It was chosen not
because it is more accurate — for this purpose the difference would be invisible — but
because of an algebraic accident that turns out to matter enormously.

Because the observation operator picks out a single grid cell, the analysed value works
out to be exactly a weighted sum of the old forecast and the measurements, with weights
that sum to one. Which means the picture somebody asked for at the start — the bar
showing how much of this cell came from where — is not a diagram *about* the calculation.
It is the calculation, written down. With nudging you could draw the same bar, but it
would be a cartoon of the arithmetic rather than the arithmetic itself.

Two wrong turnings, both instructive.

The first was the shape of the influence. A measurement's effect has to fade with
distance, and the natural choice is a bell curve. A bell curve never quite reaches zero,
and it turned out that "never quite" compounds: after four cycles of a boat sailing a
short line, the bookkeeping said that measurement was responsible for at least 45% of
*every cell in the domain*, including a corner the boat had never been within a hundred
kilometres of. Each cycle re-credited the instruments for water they had barely touched,
and the credit accumulated.

The fix looks obvious — cut the influence off at some radius — and it is wrong for a
reason worth knowing. A covariance function has to be positive definite, roughly meaning
it has to describe a set of relationships that could actually exist; chop the tail off a
bell curve and it no longer does, and the matrix inversion at the heart of the method can
fail or, worse, quietly return nonsense. The right answer is a function called
Gaspari–Cohn, a fifth-order polynomial designed to look like a bell curve while genuinely
reaching zero and genuinely staying positive definite. There is a test in the repository
that builds both matrices and watches the chopped-off one fail while the polynomial one
succeeds.

The second wrong turning was already in the code and had been for months. Once the
analysis existed, the planner should have been able to use it: the system now computes,
honestly, how uncertain it is about each patch of water, so the boat should go where that
number is largest. Except the planner had its own model of how far a measurement's
influence reaches — five hand-tuned numbers, written before there was any analysis to
imitate — and its numbers disagreed with what the analysis actually does. It believed a
visit collapsed uncertainty by 85%; the arithmetic says 99.7%. Two descriptions of one
physical claim, only one of them ever applied. Those five numbers are gone, and the
planner now asks the analysis.

Underneath that sat something quieter. The system publishes an "uncertainty" field with
every forecast, computed as the spread across an ensemble of slightly different runs.
Except every member of that ensemble started from the *same* state, so the only thing
that made them differ was noise added as they ran — which meant the spread was a function
of how far ahead you looked and nothing else. It had no spatial structure at all. It
could not distinguish water the boat had just sampled from water nobody had ever visited,
and it had been sitting there labelled uncertainty the whole time. The planner had been
compensating with a separate "how long since we measured here" term, which is exactly the
sort of workaround that hides the thing it works around.

## The demo

Open the map, and in the doubt control choose *where the value came from*. The tint is
the provenance: a corridor along the boat's track where the instruments own the value,
and everywhere else the colour of what was known before anyone sailed. It is the same
number the bar chart in the Background tab explains, drawn as geography.

[Open it at the map](../../instances/claude-platform-measurements-nowcast-irl2cb/#/view/map)

The explanation itself is the fifth card in the Background tab, and it follows one cell
from the quay to a week out — all prior knowledge at the start, mostly measurement as the
boat passes, drifting back toward the model as the forecast ages and nothing new is
measured there.

[Open it at the Background tab](../../instances/claude-platform-measurements-nowcast-irl2cb/#/view/background)

One last thing worth watching, because it is the tell that the change is real. The
system now triggers far fewer re-forecasts than it used to: over six thousand simulated
ticks the disagreements between forecast and measurement dropped from several to one. Two
of the project's own tests had quietly come to depend on the old behaviour — one of them
waited for the simulated ocean to misbehave twice in quick succession, and simply stopped
seeing it happen. A forecast that listens argues with its instruments less.
