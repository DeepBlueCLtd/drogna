---
title: A figure that is always zero
date: 2026-08-29
feature: specs/107-operator-view
description: >-
  A dashboard number that never moves is indistinguishable from arithmetic that
  never works. Measuring how late a measurement is, in a simulated world where
  nothing is late, turned out to need a test that made something late on purpose.
---

# A figure that is always zero

## The background

Ask an operations room how current its picture is and you are asking two different
questions at once. One is about the model: how long ago was the forecast made, and
how far has the world moved since. The other is about the plumbing: a measurement
was taken somewhere, and some time passed before anything downstream had folded it
into a number a person reads. The second question is unglamorous, and it is the one
that quietly ruins the first — a picture assembled from measurements that are an
hour old is an hour-old picture, however recent the model run stamped on it.

So a monitoring surface usually grows a latency figure, and the obvious way to build
one is to subtract two timestamps. That is where the trouble starts. Subtract the
wrong pair and you measure the machine's mood rather than the system: how busy the
host was, how fast the operator was clicking, whether a queue happened to be warm.
In a simulation, where time is a dial you can turn to six hundred times normal, a
wall-clock latency figure measures the dial.

There is a second trap underneath the first, and it is the reason this entry exists.
A latency figure computed from a system where nothing is ever late reads zero. So
does a latency figure computed by subtracting a number from itself, or by a sign
error, or by never folding anything in at all. All four look identical on the
screen.

## The requirement

Two things had to become true. Statistics about how well the forecast is doing had
to be available for parts of the area rather than only for the whole of it — a
scenario average is exactly the figure that hides a region where the model is
useless. And the surface had to state how long it takes an observation to reach the
statistics it belongs in, measured in the simulation's own time rather than the
host's.

## The options considered

For the regional figures, the awkward part is not the arithmetic; it is where the
grid comes from. Putting the area's extent in the telemetry component's
configuration would have worked immediately and left two copies of the same
rectangle in the repository, to disagree the first time anyone moved the scenario.
The grid is instead laid over the extent of the forecast the residuals were scored
against — which the component was already reading — so it can only be the same
rectangle. Configuration says how many rows and columns, and how few samples make a
region too thin to report soundly; it does not say where.

That left a smaller question with a sharper edge. What should a region nobody has
sampled report? Zero is available, and zero is a lie: an unsampled region and a
region whose residuals genuinely average zero are different facts, and only one of
them is a measurement. Unsampled regions are therefore absent from the report
entirely. In the picture below, one row appears where the grid has six cells,
because the platform is loitering and has not been anywhere near the other five.

The latency figure took a wrong turning worth recording. It was written, it read
zero, and the test asserted that it was a number, that it was not negative, and that
some samples had been folded in. All true, all passing, all worthless: with the
figure planted upside down — subtracting the fold instant from the observation
instant instead of the other way round — the tests still passed. With the fold
instant taken from something that was not the clock at all, they still passed. Zero
minus zero is zero whichever way round you write it, and a check that cannot fail is
worth nothing.

What fixed it was making something genuinely late. The test now takes a report the
monitor actually published, dates its samples an hour earlier in simulation time,
and folds it in again; the figure has to move by exactly that hour. Both plants go
red against that, and so does a third — reading the fold instant from anywhere but
the simulation clock.

The zero itself survived all of this, because it is true. The monitor scores a
residual within the tick the observation was taken, so this loop carries no
transport delay to report. The surface says that in words rather than presenting a
bare zero and letting a reader decide whether the number or the mechanism is broken.
When a later version puts a real transfer in the loop, the figure will move on its
own.

## The demo

[Open it at the Operator tab](../../instances/main/#/view/operator) and let it run
for a minute or two at ×600: the region table fills as the platform samples, and the
latency line states its zero along with the reason for it.

![The Operator tab of the drogna shell, two simulated hours into a run. A telemetry
block lists skill against persistence (the model is not earning its compute, skill
0.000 over ten samples), residual statistics, throughput per simulated second, and a
latency line reading "0 sim-s over 19 residuals: the monitor scores within the tick
the observation was taken, so this loop carries no delay to report". Below it a
by-region table holds exactly one row — region r1c1, extent -12 to -10 by 46 to 48,
ten residuals scored, mean magnitude 4.77 m/s, state reporting — because the
loitering platform has sampled one cell of the six-cell grid and the other five are
absent rather than shown as
zeroes.](../assets/107-telemetry-by-region.png)

## What is now known

A figure that is always zero cannot be told from arithmetic that always returns zero
by looking at it, and a test that only asserts the shape of such a figure asserts
nothing. The way out is not a better assertion about the zero; it is to introduce the
thing the figure is supposed to measure, deliberately, and require the figure to
notice.
