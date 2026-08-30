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

Ask how current an operations picture is and part of the answer is plumbing: time passes
between a measurement being taken and anything downstream folding it into a number a
person reads. The obvious build subtracts two timestamps, which in a simulation
whose clock can run at ×600 measures the dial. Underneath that is the
trap: a latency figure from a system where nothing is ever late reads zero — and so does
a sign error, or a fold that never happens.

## The requirement

Forecast statistics per region rather than for the whole area, since a scenario average
hides a region where the model is useless; and how long an observation takes to reach
them, in simulation time.

## The options considered

The regional grid is laid over the forecast extent the residuals were scored against,
which the component already reads, so there is no second copy to disagree with. An
unsampled region reports nothing rather than zero: absent and averaging zero are
different facts, only one a measurement.

The latency figure took the wrong turning. It read zero, and its test asserted the
figure was a number, not negative, with samples folded in: all true, all passing, all
worthless. Planted upside down it passed; with the fold instant read from anything but
the clock it passed. What fixed it was making something genuinely late — the test dates
a published report's samples an hour back in simulation time and requires the figure to
move by exactly that hour. The zero itself is true: the monitor scores within the tick
the observation was taken, and the surface says so in words.

## The demo

[Open it at the Operator tab](../../instances/main/#/view/operator) and let it run: the
table fills as the platform samples.

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
