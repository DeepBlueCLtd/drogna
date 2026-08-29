---
date: 2026-08-28 10:30:00
categories:
  - Feature
slug: a-threshold-nothing-could-reach
feature: specs/011-adaptive-planner
description: >-
  A component compared a measured quantity against a configured threshold. The
  quantity could not physically reach the threshold, so the component returned
  "nothing worth doing" every time, correctly, for its whole life.
---

# A threshold nothing could reach

Part of this system decides where to go and measure next. It reads a field of uncertainty
over a grid, works out where the uncertainty is high enough to be worth visiting, and
plans a route under a travel budget. "High enough" is a configured number: uncertainty
above which confidence is no longer usable.

It was set to 0.35.

The field it scores is the
[ensemble spread](../../../glossary.md#ensemble-spread) — how far apart several slightly
perturbed forecasts of the same thing end up. At the settings the forecast component
ships with, and at the fixed seed the deployment pins, that spread across 810 cells looks
like this:

| minimum | median | 75th percentile | maximum |
|---|---|---|---|
| 0.1003 | 0.1593 | 0.1720 | 0.2156 |

Not "few cells above 0.35". None. The ceiling was below the threshold by a factor of about
1.6, so the excess was zero in every cell of every run, the planner returned an empty route
with the reason `nothing-worth-sampling`, and the assembled system could never recommend
anything at all.

<!-- more -->

## It was not a units error

That was the first thing checked, because it is the usual answer. It was not: the schema
says the threshold is in the units of the variable being scored, and both sides are degrees
Celsius. The planner was doing exactly what it had been told to do, arithmetically
correctly, about a field it had never been shown.

## Why nothing caught it

The two numbers live in different files, owned by different parts of the work. The
perturbation settings that determine the spread belong to the forecast component's
configuration. The threshold belongs to the planner's. Every test on each side passes, and
every test on each side is right.

The forecast component's tests assert that it emits a spread, and that the spread is the
members' deviation. That is true. The planner's tests assert that it selects a route under
a budget — using fixtures whose uncertainty values were chosen to exercise the planner,
which means chosen to be above the threshold, because otherwise there would be no route to
assert anything about.

Nothing drove one into the other. And this is the sentence the whole episode turns on:
**correct behaviour on inputs nobody supplies is indistinguishable from correct behaviour**
until something supplies them. The planner's tests would have passed identically if the
threshold had been 35, or 3500.

The defect was found by reading the two files in the same sitting, which nothing in the
repository had ever done.

## What did not work

The tempting fix is to make the threshold a quantile: "visit the most uncertain quarter of
the field" rather than "visit everything above 0.172 degrees". It is robust to everything
that moves the field, and something does move it — the dominant perturbation is one draw
per forecast member applied to every cell, so the field's absolute level shifts with the
seed while its shape stays much the same. Measured across five seeds, the maximum spread
ranged from 0.174 to 0.318. At one of those seeds the *whole field* would have sat above
the absolute threshold that was eventually chosen.

So the quantile is more robust, and it was rejected, because it answers a different
question. "Uncertainty above which confidence is no longer usable" is a claim about the
world: there is some spread beyond which a forecast is not worth acting on, and that does
not depend on how the rest of today's field happens to be distributed. A quantile always
finds a quarter of the field worth sampling — including on a day when the whole field is
excellent and the honest answer is that there is nothing worth going out for. Robustness
was bought by making the component unable to say no.

The threshold stays absolute. It became 0.172, the 75th percentile of the distribution
above, and the number is recorded with its derivation, because a number in a configuration
file cannot explain itself.

## What is now known

The number is the smaller half of the fix. The part that lasts is a test that drives the
real forecast component, at its shipped settings and the tracked seed, into the configured
threshold — and asserts the *relationship* rather than either value: some cell above it,
some cell below it, and a fraction between 5% and 60%, so the planner has a real choice to
make.

Pinning the two numbers instead would have made the test a copy of the configuration, and a
copy agrees with its original by construction. As written, moving either file in a way that
makes the planner blind or indiscriminate turns the test red. It was watched failing against
the state that shipped:

```text
no cell of 810 exceeds usable_threshold 0.35; the runner's maximum spread at the
shipped settings is 0.2156 ... the assembled system can never plan
```

The general lesson is about where defects of this kind live. Nothing was wrong inside
either component. The defect was in the relationship between two configuration files that
no test and no reader had ever considered together — and a threshold is the classic
instance, because it is a number in one file about a distribution produced in another.
