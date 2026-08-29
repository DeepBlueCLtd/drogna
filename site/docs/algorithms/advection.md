---
title: Advection
---

# Advection

drogna's forecast model is one idea long: *the features are where they were,
plus their velocity times the time that has passed.* There is no fluid dynamics
in it, nothing is stepped, nothing is integrated, and no equation of motion is
solved. This page derives what is there, states what the noise is for, and then
spends as much space again on what the model deliberately does not do — because
the second half is what stops a reader mistaking this for an ocean model.

## The problem, before the method

The rest of the harness needs a field that changes. The
[monitor](../archive/subsystems/c11-monitor.md) needs something to detect divergence
*from*. The [planner](../archive/subsystems/c15-planner.md) needs somewhere for the
interesting water to move *to*, or its revisit logic never has anything to chase.
The browser client needs something that visibly evolves.

What it does not need is a correct field. It needs one that is structured rather
than random, reproducible from a seed, and cheap enough to recompute whenever the
monitor asks. Those three requirements are satisfied by
[advection](../glossary.md#advection) alone, which is the transport of a property
by the bulk motion of the water carrying it — the cheapest thing a forecast model
can do that is not "nothing".

The requirements say so directly: the model runner advects the seeded features
forward analytically and adds noise, and *shall not implement real numerics*.
"Shall not" is unusual phrasing in a requirements document and it is deliberate.
Numerics that were half-real would be worse than numerics that are frankly fake,
because the first invites a reader to trust them.

## Where the features come from

The [environment generator](../archive/subsystems/c02-environment-generator.md) seeds four
features into the synthetic world and writes their true parameters to a
ground-truth manifest: a [mesoscale eddy](../glossary.md#mesoscale-eddy) of known
centre, radius and strength; a [front](../glossary.md#front) of known position and
sharpness; a [thermocline](../glossary.md#thermocline) at known depth; and a
moving feature of known drift velocity.

The model runner reads that manifest — the parameters, and emphatically not the
generated field. A runner that read the generator's arrays would be a runner with
the answer in it, and its forecast error against truth would be zero by
construction, which would make the whole scoring exercise meaningless. So the
runner rebuilds its own view of the world from the same parameters, using its own
formulas, and the difference between the two is a genuine forecast error that can
be measured.

Only one of the four features has a non-zero drift. The other three are advected
by zero, which means the code needs no special case for a stationary feature: it
carries them all the same way.

## The advection itself

For a feature whose centre is recorded at some latitude and longitude, with a
drift recorded in kilometres per day east and north, the centre after some elapsed
simulation time is:

```text
days       = elapsed_seconds / 86400
north_km   = north_km_per_day * days
east_km    = east_km_per_day  * days

latitude   = latitude  + north_km / 111.195
longitude  = longitude + east_km  / (111.195 * cos(reference_latitude))
```

That is the whole of it. Three points about those five lines are load-bearing.

**It is closed-form, not stepped.** The position at any instant is one
multiplication away from the manifest. There is no accumulation, so there is no
accumulated error, and the position at hour six does not depend on having computed
the position at hour five. A consumer holding only the manifest can compute where
the feature is at any moment, including moments that are not on the forecast's
time axis — which is exactly what a [trajectory](../glossary.md#trajectory) query
with per-vertex timestamps needs.

**The map from kilometres to degrees is a constant.** The longitude conversion
uses a `reference_latitude` recorded on the feature, not the latitude of wherever
the calculation happens to be evaluated. That makes the displacement an exact
affine map rather than a function of where you look from, and it is the same
convention the ground-truth manifest records the drift under, so the manifest and
the runner cannot disagree about where a feature went.

**A feature may leave.** Nothing clamps a drifting feature at the domain boundary.
The manifest records the initial centre and the velocity, so the position stays
computable after it has left; the field simply stops containing it. Clamping would
make the manifest describe a path the field does not contain, which is a worse
failure than a feature that leaves.

## What the field looks like at a point

Advecting a centre is not enough — something has to turn a centre into a
temperature. The kernel evaluates each feature's contribution in closed form at
every grid point and adds them onto a background, which is itself an exponential
relaxation from a surface value to a deep value.

| Feature | Horizontal form | Vertical form |
|---|---|---|
| Eddy, and the moving feature | Gaussian in distance from the advected centre | Gaussian about the feature's centre depth |
| Front | Hyperbolic tangent across the line through the anchor at its recorded bearing | Exponential decay with depth |
| Thermocline | none — horizontally uniform | Hyperbolic tangent in depth |

Each form is a shape chosen because it looks like the thing it is named after and
because it has a derivative everywhere. None of them is derived from a physical
argument, and the code says so in its own first paragraph: *none of this is
oceanography and none of it is claimed to be.*

## The noise, and what it is not

After the anomalies are summed onto the background, each cell gets an independent
Gaussian draw added: 0.05 °C on temperature and 0.01 on salinity at the shipped
settings, both configurable, both drawn through the seeded random-number port.

The noise exists to make ensemble members differ downstream of the same
initialisation, and to stop the field being a smooth analytic surface that a
consumer could reverse-engineer. It is **not** a model of anything. In particular
it is **independent per grid cell**, so it has no spatial correlation length:
neighbouring cells get unrelated draws. Real model error is strongly correlated
in space, and a noise field with the same magnitude but a correlation length of
tens of kilometres would behave completely differently — it would displace
features rather than roughen them, and it would survive the smoothing that any
downstream interpolation applies. drogna's noise does not do that, and no page
should imply it does.

Setting either deviation to zero draws nothing at all, rather than drawing and
multiplying by zero, so a run configured without noise stays byte-comparable with
another that is.

## What the model deliberately does not do

This is the half of the page that matters most.

**It does not solve anything.** There is no advection *scheme* here in the sense
that phrase normally carries — no semi-Lagrangian back-tracing, no Eulerian
update, no Courant condition, no time step to be stable at. The forecast at hour
six is computed directly from the initialisation, not from the forecast at hour
five. Every question about numerical stability, numerical diffusion and scheme
order is therefore not answered but *absent*, which is a different thing and a
better one to be honest about.

**Nothing rotates.** A [mesoscale eddy](../glossary.md#mesoscale-eddy) in the
ocean turns; that rotation is most of what makes it a coherent structure and most
of what makes its internal water different from its surroundings. drogna's eddy is
a Gaussian bump that translates. It has no circulation, no angular velocity, and
no internal structure to smear. The word "eddy" is doing considerable work.

**Nothing deforms.** A real feature carried through a shearing velocity field is
stretched, folded and eventually torn apart. Here the shape is re-evaluated
identically at every instant about a moved centre, so a feature keeps its exact
shape forever. It is perfectly recognisable after six hours or six weeks — which
makes it recoverable by construction, and means "the eddy was recovered from the
observations" is a weaker statement here than it sounds.

**There is no velocity field.** Only the features carry a velocity, and it is a
per-feature constant read from the manifest. The background water does not move.
There is no divergence, no vorticity, no continuity, and nothing that could be
called a flow. "Advection" here means "the recorded features are displaced"; it
does not mean "a property is transported by a fluid".

**Nothing is conserved.** No mass, no heat, no salt. Adding anomalies onto a
background and adding noise on top makes no attempt at a budget.

**The forecast does not use observations at all.** The model runner never reads
the observation store or the observation topics. The control loop is closed by the
[monitor](../archive/subsystems/c11-monitor.md) deciding a rerun is warranted, not by any
assimilation of measurements into the state. Each new run is re-initialised from
the same ground truth, advected further. Nothing in drogna corrects a forecast
towards what was measured.

**The uncertainty does not grow with lead time.** drogna estimates forecast
uncertainty as [ensemble spread](../glossary.md#ensemble-spread), and
[its derivation](ensemble-spread.md) measures the consequence: with no dynamics to
amplify an initial-condition error, there is nothing to make hour six less certain
than hour zero.

## The one thing this does earn

There is a second implementation of the same interface, and it is not a straw one.
The **persistence kernel** holds the initialisation state completely still: it
advects nothing, adds no noise, and returns the field as it was. That makes it
both the second implementation that proves the model kernel port is a real port,
and the [persistence reference](../glossary.md#persistence-forecast) that a
forecast has to beat before it has earned its compute.

Both kernels are selected by name from configuration, and the name is announced on
the control namespace when a run starts, so which one produced a given field is
recorded rather than inferred. Swapping one for the other is a configuration
change with no source edit outside the model runner package — which is the entire
claim the [model kernel port](../archive/architecture/overview.md#the-port-accounting)
makes, and the reason the fakeness of the numerics inside it is tolerable.

## Where the code is

| Piece | File |
|---|---|
| Advection, the anomaly forms, the noise, both kernels | `services/model_runner/src/harness_model_runner/analytic_kernel.py` |
| The port contract | `services/model_runner/src/harness_model_runner/kernel.py` |
| Reading the ground-truth manifest into an initialisation state | `services/model_runner/src/harness_model_runner/truth.py` |
| The displacement asked of the field rather than of the arithmetic | `services/model_runner/tests/test_advection.py` |
| Feature shapes as the generator authored them | `services/env_generator/src/harness_env_generator/features/` |

## A note on notation

There is no mathematical notation on this page. The five lines of displacement
arithmetic above are the whole model, and they are clearer as code than as
notation; the site has no renderer for mathematics in any case, which is recorded
in [Site tooling](../decisions/index.md).
