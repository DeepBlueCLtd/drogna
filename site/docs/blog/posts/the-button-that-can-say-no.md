---
title: The most useful button on the screen is the one that can refuse
date: 2026-08-30
feature: specs/114-operator-controls
description: >-
  A screen full of controls for a simulated system has an easy failure mode: the
  controls make the screen change, and nobody finds out whether the system agreed.
  Building the honest version meant every button gaining the right to say no.
---

# The most useful button on the screen is the one that can refuse

## The background

A screen here draws the running system as a diagram, and you could do almost nothing on
it. The panel for steering the vessel did exist, behind a click, with nothing indicating
it was there — and a control nobody can find is a control that does not exist.

## The requirement

Three things to do to the running system — steer the vessel, prompt events, adjust the
two numbers the forecast loop turns on — each findable, and impossible to confuse with a
screen that only looks like it obeyed.

## The options considered

Take the button asking for a forecast run. The obvious build publishes the message that
starts one; it demos beautifully and it is wrong, because a scheduler already
exists whose job is deciding whether a run is warranted, and a button publishing that
request would be a second copy of the policy able to start runs the scheduler refuses. The button publishes a prompt to the scheduler instead, weighed exactly as a
genuine divergence is: press twice and the second is declined in the
scheduler's own words, beneath the button. That reads like a bug and is the feature — a
control that can never be refused has bypassed something.

Then the fault button took the screen down the first time it was pressed. It drew its
numbers straight from the traffic; a string arrived where a number belonged and every
box vanished — correct for exactly as long as nothing was ever wrong, which is strange
in a screen for watching things go wrong. It now draws only from messages that pass
their schema, and says how many it refused.

## The demo

[Open it at the operator view](../../instances/main/#/view/operator) and press **request
a forecast run** twice.
