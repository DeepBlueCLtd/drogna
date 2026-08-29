> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# ADR-0019: The planner's threshold stays absolute, and now has something to check it against

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD FR-29, FR-32, FR-35; Constitution II
**Raised by:** reading the planner's threshold and the runner's spread in the same sitting, which nothing in the repository had done

## Context

`config/<destination>/planner.json` set `planner.uncertainty.usable_threshold` to **0.35**.
The planner scores `temperature_spread`, the per-cell ensemble spread the model runner
publishes, and computes `excess = max(0, u - threshold)`.

Run at the settings the runner ships with — eight members, a temperature perturbation of
0.2, a drift fraction of 0.2 — and at the root seed `config/<destination>/common.json`
fixes, the spread over 810 cells is:

| minimum | median | p75 | maximum |
|---|---|---|---|
| 0.1003 | 0.1593 | 0.1720 | 0.2156 |

**Zero cells exceeded 0.35.** Not few: none, and the ceiling was below it by a factor of
about 1.6. So `excess` was zero in every cell of every run, `select_route` returned an empty
route with the reason `nothing-worth-sampling`, and the assembled system could never
recommend anything.

This is not a units error, which was the first thing checked: the schema says the threshold
is "in the units of the scored variable", and both sides are degrees Celsius.

## Why nothing caught it

The two numbers live in different files owned by different features — the perturbations in
`009-control-loop`'s configuration, the threshold in `011-adaptive-planner`'s — and every
test on each side passes. The runner's tests assert it emits a spread and that the spread is
the members' deviation. The planner's tests assert it selects a route under a budget, using
fixtures whose uncertainty values were chosen to exercise the planner rather than taken from
the runner.

Nothing drove one into the other. The planner was doing exactly what it was told, about a
field it had never been shown, and "correct behaviour on inputs nobody supplies" is
indistinguishable from correct behaviour until something supplies them.

## Decision

**The threshold becomes 0.172 and stays absolute.**

The number is the p75 of the distribution above, so the most uncertain quarter of the field
is worth visiting and the rest is not. The requirements fix no number — the schema says so —
and this is a planning policy rather than a physical constant, so what matters is that it
was derived from what the system produces rather than chosen and never revisited. It is
recorded here because a number in a configuration file cannot explain itself.

**`tests/integration/test_planner_threshold_against_runner_spread.py` is the part that
lasts.** It drives the real runner at the shipped settings and the tracked seed into the
configured threshold and asserts the relationship rather than either number: some cell above
it, some cell below it, and a fraction between 5% and 60% so the planner has a real choice.
Pinning the values instead would make the test a copy of the configuration, and a copy
agrees with its original by construction. Watched failing against the state that shipped:

    no cell of 810 exceeds usable_threshold 0.35; the runner's maximum spread at the
    shipped settings is 0.2156 ... the assembled system can never plan

## The alternative rejected, and the property behind it

**Expressing the threshold as a quantile** — "the most uncertain quarter" rather than "above
0.172 degrees" — would be robust to everything that moves this field, and something does
move it. The dominant perturbation is one draw per member applied to *every* cell rather
than one per cell, so the field's absolute level shifts with the seed while its shape stays
much the same. Across five seeds the maximum ranged from 0.174 to 0.318; at one of them the
whole field sat above the threshold chosen here.

It is rejected because it changes what the requirement says. "Uncertainty above which
confidence is no longer usable" is a statement about the world: there is some spread beyond
which a forecast is not worth acting on, and it does not depend on how the rest of the field
happens to be distributed. A quantile always finds a quarter of the field worth sampling,
including when the whole field is excellent — which is precisely the "recommending motion
for its own sake" the schema says this threshold exists to prevent.

So the concept stays absolute and the number stays checked. The harness fixes its root seed
in tracked configuration, so the distribution is reproducible; and if the seed or the
perturbation settings change, the test above fails and names the numbers, which is the
outcome that was missing.

## What is not changed here

**The spread is nearly featureless, and that is left alone.** Because the dominant term is
one draw per member applied everywhere, it contributes the same uncertainty to every cell,
and the only structured contribution is the drift term. A field that is almost uniform is a
poor thing to plan against: the planner is choosing between cells that barely differ.

That is a change to the numerics, and the numerics are declared fake and are the one
component certain to be replaced (C-13 owns "being irreplaceable" as its failure mode). It
is recorded here as a property of what the harness produces today rather than fixed, because
altering the perturbation scheme is a decision about the model rather than about the planner,
and this record is about the planner.
