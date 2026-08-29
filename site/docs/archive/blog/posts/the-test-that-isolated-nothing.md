---
date: 2026-08-26 14:00:00
categories:
  - Architecture
slug: the-test-that-isolated-nothing
feature: specs/004-environment-generator
description: >-
  How fast a place forgets a measurement had to become a field rather than a
  property of a feature. Then a test written to isolate one feature turned out
  not to isolate it, and the generator was right.
---

# The test that isolated nothing

You measured the temperature at a spot in the ocean an hour ago. How much is that
measurement worth now? In water that is churning through a sharp
[front](../../../glossary.md#front), very little.
In quiet water a hundred metres down, a great deal. The quantity governing that decay
is the
[decorrelation timescale](../../../glossary.md#decorrelation-timescale), and drogna needs
it because it decides where to sample next: fast-changing water gets revisited often
and quiet water gets left alone.

<!-- more -->

The obvious place to put such a number is on the thing that makes the water
interesting. drogna's synthetic ocean is built by seeding four features into a
background — an eddy, a front, a [thermocline](../../../glossary.md#thermocline) and one
feature that drifts — so give
each of them a timescale. An eddy decorrelates faster than open water; the model
matches the intuition; it is trivial to record in the ground-truth manifest.

It does not survive contact with what consumes it.

## Two formulations that fail

**Per feature.** The requirement that quiet water be left alone is a statement about
the background, and per-feature authoring gives the background no timescale at all.
Every location outside a feature — most of the domain — would need a value invented
for it at the point of use. An invented value is not ground truth, so it cannot be
scored, and drogna's rule is that every claim about recovering the environment is
measured against what the generator recorded rather than asserted.

**Per region.** A static map over the domain, giving everywhere a timescale including
the background. This closes the gap and is defensible physically. It cannot follow the
drifting feature: the fast-decorrelating patch would stay where it was authored while
the water it describes moved away, so the revisit cadence would be applied to the
wrong water — confidently, and with no symptom.

So the timescale is a **field**: a value at every latitude, longitude, depth and time.
Authored per feature over a domain-wide background, because that is how a person writes
a scenario. Evaluated per location, because that is what every consumer needs. A moving
feature carries its timescale with it.

## Rates blend, timescales do not

Two features can overlap, so something has to say what happens where they do, and the
rule that suggests itself — average the timescales — is wrong in a direction worth
noticing. A location inside two fast features would come out *slower* than either of
them.

The blend is therefore done in rates: one over the timescale, which is how fast memory
is lost, and losses compose by adding. Each feature contributes a membership weight
from its spatial kernel. Where those weights sum to one or less, the rate is the
background's plus, for each feature, its weight times the difference between that
feature's rate and the background's. Where they sum above one, the weights are
normalised by their sum and the background drops out.

The normalisation is not tidiness. The additive form alone can drive the timescale
*below* the shortest contributing one where two weights are both near one, which the
requirement's own scenario forbids. Both branches are convex combinations and they
agree exactly where the weights sum to one, so the field is continuous, equals the
background where nothing overlaps, equals a feature's own authored timescale at its
centre, and where features overlap lies between the shortest contributing timescale
and the background. The rule is recorded in the manifest by name and version, so a
different rule replaces it without a schema change.

## The test that did not do what it said

The claim to be checked is that the minimum of the field sits on the drifting feature
and moves with it. Testing it needs a world in which that feature is unambiguously the
fastest thing present, so: give the other three the background timescale, and the
drifting feature should be the only disturbance left.

It is not. Run that world and the shortest timescale sits 14.8 km from the drifting
feature's centre — a long way on a domain a couple of hundred kilometres across.

Membership and timescale are separate quantities. A feature's weight at a location
comes from its spatial kernel and its own geometry, and is completely unaffected by
what timescale it carries. Where the weights sum above one, the blend normalises by
their sum — and the background, the very value the other features were just given,
drops out of the arithmetic entirely. A feature holding the background timescale still
pulls the blend towards itself and still moves the argument of the minimum. Setting the
value without removing the weight neutralised nothing.

The generator was right and the test was wrong, which is worth stating plainly because
the reflex when a test fails is the other way round. Isolating a feature means removing
its geometry, not changing its number. The eddy and the front are shrunk to a kilometre
and moved to the far corner of the domain, which is as close to absent as the generator
permits — it refuses a feature placed outside the domain rather than clipping it, on
the ground that a clipped feature is one the manifest describes and the field does not
contain. The thermocline needs no such treatment: its weight is a function of depth
alone, so it dilutes the field uniformly and cannot displace a horizontal minimum.

All of that is written into the test, at length, because it is exactly the kind of
thing the next reader will otherwise try again.

The check that matters most does not use the isolated world at all. In the world the
generator actually writes, with all four features pulling on the field, the location of
the minimum is found at two simulation times three hours apart, and the displacement
between them is asserted against the drift velocity times the elapsed time, to within
one grid cell. That is the property the whole decision was made for.

## A refusal

One more rule earns its place. A timescale shorter than a configured multiple of the
time step — twice, today — is refused when the scenario is authored, before anything
is written, with the offending ratio in the message so the author can see how far
under it fell. A field cannot represent decay faster than its own sampling interval,
and a timescale it cannot represent does not announce itself: it quietly produces a
revisit cadence that is wrong.

The values in use: three days for the background, thirty-six hours for the thermocline,
eighteen for the front, twelve for the eddy, six for the drifter. All of them are
recorded as ground truth, which means that recovering them later is a measurement
rather than a claim.
