---
title: Ensemble spread
---

# Ensemble spread

drogna publishes two fields every time it runs its model: a forecast, and a
number beside every value of that forecast saying how confident it is. The second
field is the one worth reading about, because the forecast is admitted rubbish —
analytic [advection](../glossary.md#advection) with noise on top, and
[derived here](advection.md) — while the uncertainty beside it is the thing the
rest of the system actually consumes. The
[planner](../subsystems/c15-planner.md) chooses where to sample from it. The
browser client colours the map with it. If it is wrong, everything downstream is
confidently wrong with it.

This page derives what that number is, from the code that computes it, and is
blunt about the parts of it that do not do what the phrase "uncertainty field"
would lead a reader to expect.

## The problem, before the method

You have a model. You want to know where its answer is shaky. The model itself
will not tell you: it produces one number per point and no error bar, and adding
an error bar to it means understanding the physics well enough to know where the
physics is hard — which, if you understood it that well, you would have put into
the model.

The ensemble trick sidesteps that. Run the model several times from starting
conditions that differ by about as much as you are unsure of the starting
conditions. Where those runs end up agreeing, the answer is insensitive to what
you did not know. Where they diverge, it is not. The disagreement between the
runs is then used as a stand-in for the uncertainty in any one of them.

Each run is a **member**; the collection is the **ensemble**; and the spread of
the members at a point is the
[ensemble spread](../glossary.md#ensemble-spread) there.

Nothing about that argument requires the model to be good. It requires the model
to react to its inputs the way the real thing would, which is a much weaker claim
and one drogna can partly make. It is why deriving this on a fake model is not a
pointless exercise, and it is also the seam where the whole thing can be
oversold, so the last two sections say where drogna's version of it breaks.

## What is actually computed

The reduction is four lines of arithmetic in
`services/model_runner/src/harness_model_runner/ensemble.py`. Every member is run
to completion; the forecast published is their arithmetic mean, cell by cell; the
uncertainty published is their standard deviation, cell by cell, about that same
mean. Temperature and salinity are reduced separately and independently, so the
published uncertainty field carries two variables, `temperature_spread` in
degrees Celsius and `salinity_spread` in practical salinity units.

Two details of that reduction are decisions rather than defaults.

**It is the population standard deviation, not the sample one.** The divisor is
the member count, not the member count minus one. The code's reason is that the
members *are* the population: there is no larger notional ensemble of which these
eight are a sample, so the correction that exists to compensate for sampling from
one would be correcting for something that is not happening.

**A member that fails fails the run.** If any member raises, the run is abandoned
and nothing is offered for publication. The temptation is obvious — seven members
finished, publish the spread over seven — and the code refuses it in as many
words: a spread over the members that happened to survive is a *different
quantity* from the one that was requested, and publishing it under the same name
and into the same variable would be a quiet lie that no consumer could detect. An
ensemble of one is refused for the same reason, at configuration time, with the
message "an ensemble of one has no spread".

## What the members are perturbed with

Two things are perturbed, and only two. For member `n`, drawn from that member's
own random stream:

| What is perturbed | How | Configured spread |
|---|---|---|
| Background temperature | One offset added to both the surface and the deep value, so the whole vertical [profile](../glossary.md#profile) shifts bodily | 0.2 °C |
| Background salinity | The same, on the salinity profile | 0.05 |
| Each feature's drift velocity | Both components scaled by the same factor, `1 + share` | 20% |

The seeded features themselves — the [eddy's](../glossary.md#mesoscale-eddy)
centre and radius, the [front's](../glossary.md#front) position and sharpness,
the [thermocline's](../glossary.md#thermocline) depth — are **not** perturbed.
Their positions at time zero are identical in every member. What differs is where
each member thinks the drifting feature will have got to by the end of the
forecast.

On top of that, each member's kernel adds independent Gaussian noise at every
grid cell, standard deviation 0.05 °C, drawn from a second stream derived from
the member's own. That noise is not an initial-condition perturbation — it is
added after the field is computed — but it lands in the spread all the same, and
the next section shows how much of the spread it is.

Every draw comes from a stream named `model_runner.member.<ordinal>`, derived
from the run's root seed and the run's own identifier. The consequence the code
calls out is worth repeating: a member's realisation is a function of the seed,
the run name and the ordinal, **and of nothing else** — not of how many runs
preceded it in the process. Without that, re-running one forecast after a restart
would draw further along a shared sequence and produce a different uncertainty
field for the same request, which is a replay claim that quietly is not one.

## How large the spread is, and what it is made of

The following figures are measured from the model runner's own test fixture — a
nine-by-five grid over three depths, seven hourly forecast steps, the shipped
perturbation settings — run at member counts the configuration does not allow, so
that the sampling noise can be seen for what it is. They are measurements, not
assertions.

**Domain-mean temperature spread, over five different root seeds:**

```text
members    at t+0     at t+6h    range across the five seeds
      4    0.221 °C   0.220 °C   0.137 - 0.342
      8    0.209 °C   0.210 °C   0.148 - 0.271
    200    0.199 °C   0.199 °C   0.194 - 0.206
```

Two things fall out of that table immediately, and both matter.

**The spread does not grow with forecast horizon.** Six hours out looks like zero
hours out, at every member count. A real ensemble spreads as errors in the initial
state are amplified by the dynamics; there are no dynamics here to amplify
anything, and no growth law has been authored to stand in for them. The
uncertainty drogna publishes at six hours is, to within the noise, the uncertainty
it publishes at the initialisation instant. This is the largest single gap between
what the phrase "uncertainty field" implies and what the field contains, and it is
stated here rather than left for a reader to discover by plotting it.

**At eight members the whole field's level swings by a factor of nearly two from
one seed to the next.** Not the shape — the level. The reason is in the
perturbation table above: the background offset is *one draw per member*, applied
identically to every cell of that member's field. So for the term that dominates
the spread, the ensemble has eight samples in total, not eight per cell, and the
domain-mean spread is essentially the sample standard deviation of eight numbers.
Two runs of the same scenario from different seeds will disagree about how
uncertain the whole domain is, by an amount that has nothing to do with the water.
A consumer comparing two runs' uncertainty fields is looking mostly at the
estimator.

Now the composition. Setting the background and noise perturbations to zero leaves
only the drift perturbation, and the picture changes completely:

```text
drift perturbation alone, 200 members, maximum over the grid

  t+0h    0.000 °C
  t+3h    0.020 °C
  t+6h    0.039 °C
  t+12h   0.077 °C
  t+24h   0.148 °C
```

That component behaves the way an uncertainty field is supposed to. It is exactly
zero where no feature reaches, it is largest near the drifting feature, and it
grows with the forecast horizon — linearly, because the displacement between two
members is a velocity difference multiplied by elapsed time and nothing else
compounds it.

So the structure exists. It is buried. The background perturbation shifts an
entire member's field by one constant, contributing the *same* spread at every
cell in the domain, and at 0.2 °C it is five times the structured contribution at
six hours. The two combine in quadrature, so what a reader would see on a map at
the shipped settings — one seed, 200 members, t+6h — is this:

```text
  minimum over the grid   0.183 °C
  mean over the grid      0.194 °C
  maximum over the grid   0.204 °C
```

An almost featureless constant, with a low-single-figure percentage bump near one
feature — and at the eight members the harness actually runs, that bump is smaller
than the run-to-run wobble of the constant it sits on. The mechanism that would
make the field informative is present, implemented and measurable; the numbers
chosen bury it. That is a scenario-configuration finding rather than an
architectural one, and it is written down because a field that looks plausible on
a map and carries no information is exactly the failure this repository exists to
catch.

## Why spread is the whole uncertainty story during cold arrival

drogna runs one scenario: *arrive cold, then loiter*. Something enters a region
where nothing has been measured, and then stays there sampling.

During the cold-arrival phase there are two candidate sources of uncertainty
structure and only one of them has any. The first is the spread. The second is
the age of the local observations — the idea that a measurement taken an hour ago
tells you less than one taken a minute ago, at a rate set by the local
[decorrelation timescale](../glossary.md#decorrelation-timescale).

On arrival, observation age is **spatially uniform**, because it is uniformly
infinite. Nowhere has been measured. Age therefore cannot distinguish anywhere
from anywhere else: it is a constant field, and a constant field carries no
information about where to go. Whatever structure the uncertainty has must come
from the spread, or there is none.

That is the whole of the requirement, and it is also why the gap in the previous
section bites where it does. Cold arrival is precisely the phase in which the
spread is the only thing the planner has to steer on, and it is precisely the
phase in which the spread is at its most featureless.

Once sampling begins the second source switches on, and the combination is
deliberately **not** done here. The model runner publishes the spread and nothing
else; its own uncertainty file says so in its metadata — "the per-cell spread
across the run's members, and nothing else". The combination of spread with
observation age lives in the [planner](../subsystems/c15-planner.md), which is
the only component that needs it. Putting it in the model runner would give the
runner a dependency on an observation stream it does not otherwise read, and a
component that must be told what has been measured in order to say how uncertain
its forecast is is a component that cannot be swapped for a real model. See the
[planning derivation](informative-path-planning.md) for the combination rule.

## What the spread does not capture

Four things, in rough order of how badly they would mislead someone.

**Systematic error shared by every member.** Members that are all wrong in the
same direction agree with one another perfectly, and the spread between them is
zero. Because every drogna member runs the *same* analytic kernel over the *same*
seeded features, every error of that kernel is shared by construction. The spread
measures sensitivity to the initial conditions and to nothing else, and drogna's
kernel error is not an initial-condition error.

**Model error, in the ordinary sense.** The kernel translates features along a
straight line and adds noise. It does not rotate the eddy, it does not deform
anything, it does not conserve anything. None of that absence appears in the
spread, because absence is not disagreement.

**Growth with lead time**, as measured above. The field says the six-hour
forecast is as good as the analysis. It is not; but nothing in the ensemble
knows that.

**Whether the spread is any good.** This is the important one and it is a plain
statement of what is not built. The spread is a *claim* that the forecast will be
wrong by about this much, at this point. drogna has a ground-truth manifest, so
the claim is checkable — one could take the forecast error at every cell, bin it
by published spread, and see whether the bins line up. Nothing does this. The
[telemetry](../subsystems/c16-telemetry.md) component scores forecast skill
against a [persistence](../glossary.md#persistence-forecast) reference, which is
a different question: it asks whether the forecast is better than doing nothing,
not whether the uncertainty beside it is calibrated. Constitution IX says ground
truth is scored rather than assumed, and on this quantity it is not yet scored.

## Where the code is

| Piece | File |
|---|---|
| Perturbation, member loop, mean and spread | `services/model_runner/src/harness_model_runner/ensemble.py` |
| The kernel that each member runs | `services/model_runner/src/harness_model_runner/analytic_kernel.py` |
| The port both kernels satisfy | `services/model_runner/src/harness_model_runner/kernel.py` |
| Variable names, units and file metadata | `services/model_runner/src/harness_model_runner/staging.py` |
| Ensemble size and perturbation settings | `config/<destination>/model_runner.json` |
| The reduction, recomputed from the members | `services/model_runner/tests/test_ensemble.py` |

## A note on notation

There is no mathematical notation on this page. Everything above is arithmetic
that survives being written in words, and the site has no renderer for
mathematics — see [Site tooling](../decisions/site-tooling.md). Where a formula
would genuinely have been clearer it appears as a fenced block in the same form
the source uses.
