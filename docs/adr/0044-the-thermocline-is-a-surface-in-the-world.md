# ADR-0044: the thermocline is a surface in the world, not only in the drawing

**Status:** Accepted
**Date:** 4 September 2026
**Feature:** 124 (the forecast tab), raised from it as issue #113
**Requirements:** SRD-v2 FR-120
**Engages:** Constitution VII (no false illumination); Constitution IX (the manifest is
sufficient); ADR-0002 (the evaluated form is what reaches a consumer); the
`analytic_form_version` contract in `manifest.schema.json`

## Context

FR-120 asks for the thermocline as a **surface** through a semi-transparent volume, and
puts its reason in the requirement rather than leaving it to be inferred: "a surface is
required rather than a depth slice because the thermocline domes, tilts and breaks, and
shape is the answer a sonar user is asking for."

Feature 124 drew that surface — per column, from the served field, using the run's own
definition of where a profile falls fastest — and captioned what it found rather than what
it wanted. What it found was a plane: 7,679 of 7,680 columns placed the thermocline at
100 m and one at 300 m. The caption said so, which is the only reason the next question
got asked.

The obvious diagnosis was the depth axis. Six levels over a kilometre is 200 m of spacing
against a layer authored 30 m thick, and the manifest already published that ratio as 0.15;
`model-runner/features.ts` already said in as many words that "a 200 m grid cannot see a
30 m layer". Raising the resolution looked like the whole answer.

It was not the answer at all, and the measurement is the reason this ADR exists rather
than a configuration commit. Sampling the analytic true ocean over the same 7,680 columns
at 200, 100, 50, 40, 25 and 10 m spacing gives **one distinct thermocline depth at every
one of them**. At 20 m spacing the winning level pair beats the runner-up by 13.7 % to
17.3 % in every column in the domain; the eddy's centre and the far field pick the same
depth. Nothing available was going to tilt it.

`thermoclineAnomalyT(parameters, depthM)` took no longitude and no latitude. The authored
thermocline was one scalar depth for the whole world. **FR-120's rationale described
something the harness did not contain**, and no drawing at any resolution could have shown
it, because there was nothing there to resolve.

## Decision

**The analytic form gains a displacement term, and becomes version 2. The features that
warm and cool the water also move the layer.**

`thermoclineDepthAt(world, longitude, latitude, seconds)` returns the layer's depth at a
place: the authored `depth_m` plus `displacement_m_per_c` times the eddy and moving
anomalies evaluated **at that nominal depth**. The three thermocline terms take that local
depth as an argument instead of reading `depth_m` themselves.

Four parts of that were arguable, and the fourth was found by measurement rather than
thought.

### The anomalies are read at the layer's nominal depth, not at the depth being sampled

A layer's depth is a property of the place. Reading the anomaly at the depth being asked
about would put the layer somewhere different for every sample taken down one column,
which is not a surface. `depth_m` is the one depth every column shares, so it is the one
that can be asked at — and it keeps the term out of a loop, since the eddy, front and
moving anomalies never read the thermocline.

### One coefficient, not one per feature

A displacement per feature would have been three parameters and three schema amendments,
and would have let the eddy's doming and the front's tilt be tuned apart. They should not
be: the physical coupling is the background stratification, which is one property of the
water, and a warm anomaly of a given size displaces an isopycnal by an amount that
does not depend on which feature made it. One coefficient also means the demo cannot be
tuned into a shape the composition rule does not imply.

### The argument is not defaulted

`thermoclineAnomalyT(p, depthM, layerDepthM)` could have defaulted its third argument to
`p.depth_m`. A caller that forgot it would then silently get form 1's flat field back —
which is the exact fault this version exists to remove, arriving quietly. It is required.

### The front does not displace the layer, and this was not the first answer

The first version used all three features, on the obvious argument that every anomaly
should move the layer. The front's anomaly is a `tanh`. It *saturates* rather than
decaying, so as a displacement it does not tilt the layer near the front — it holds one
half of the domain permanently deep and the other permanently shallow, out to the corners.
The eddy and the drifting feature use radial Gaussians that fall to nothing, which is what
a local displacement has to do.

The estimators said so before the argument was finished. Recovering the drifting feature's
centre, error in km against its own 40 km radius. Every figure is printed by
`features.test.ts` over the seeds that file runs, so the table reproduces by being the
test's own output — an earlier draft of it was taken from a standalone probe, quoted a
seed the repository does not contain, and did not reproduce, which is what a measurement
that lives beside the thing it measures is for:

| terms, at the shipped 20 m/°C | 1234 | 1180001 | 1180002 | 1180003 | 1180004 |
|---|---|---|---|---|---|
| none (analytic form 1) | 3.1 | 9.7 | 20.5 | 7.0 | *declined* |
| eddy, front and moving | 3.1 | 8.8 | 17.6 | 5.4 | *declined* |
| eddy and moving (shipped) | **2.4** | **8.3** | **14.5** | **4.7** | **3.6** |

A global cold half and warm half at the layer's depth is a blob the size of the domain, and
a blob estimator finds it. Dropping the front is better on every seed, and on 1180004 —
`returning`'s own — it is the difference between a position and a refusal: with the front
displacing, the estimator declines there exactly as form 1 does. The front's own horizontal
step is already in the field through `frontAnomalyT`; stepping the layer with it as well was
double-counting the one feature that needs no help being seen.

**And the coefficient is 20 m/°C because that is where the front's own anchor still lands.**
With the front excluded, 30 and 40 m/°C both recover the drifting feature better still —
1.9 km on 1180004 — and both put seed 1180003's front anchor outside its 30 km bound. The
layer's shape and the front's position are read off the same horizontal structure, so buying
more of one spends the other; the last section of this ADR is that tension at full size.

## The depth axis moves too, and pays for itself

Form 2 gives the layer 69 m of relief across the domain, and a pick quantised to level
midpoints needs spacing fine enough to carry it. Six levels still show one depth. The
axis goes to **26 levels, 40 m apart** — the layer-to-spacing ratio the manifest publishes
rises from 0.15 to 0.75.

**The doming is local, and the drawing says so rather than being made to look otherwise.**
The two features that displace the layer are tens of kilometres across in a domain hundreds
wide, so most of the field is level: over the now-cast the surface takes three distinct
depths, 1,831 of 1,920 columns at 100 m with 48 at 140 m and 41 at 60 m. That is what an
eddy does to a thermocline, and it is not the domain-wide undulation the first version
produced by letting the front step the whole field. Over a served **analysis** it is looser,
which is worth stating because the drawing draws an analysis and not the truth — thirteen
depths, 82% at 100 m, two holding ninety-four per cent inside 40 m.

`Volume.tsx` prints the count and, on the shipped configuration, the level it is level to
within — its other branch, which names the modal share, is for a field whose commonest depths
span more than one level and nothing ships in that state. It was first written to print max
minus min and call the result doming, which against one analysis read "16 distinct depths
spanning 840 m" — true of two columns and false of the layer, and the same fault as form 1's
arriving from the other direction.

**And it attributes nothing.** The count it prints is four with the displacement and four
without, because the analysis it reads carries assimilation scatter that moves a weakly-held
column's steepest pair on its own; only over the truth field does the count separate the two
forms (three against one). So the caption says where each column's gradient sits and says it
cannot tell a displaced layer from an unsure column — and the proof of the shape is a unit
test over the manifest, not a picture.

Depth multiplies against the horizontal, and the horizontal was generous: 96 × 80 over the
domain is 5.3 km cells against an eddy of 64 km radius, twelve cells across its radius. The
now-cast grid becomes **48 × 40 × 26**. The eddy keeps six cells across its radius and the
front, the tightest horizontal feature, keeps 2.8 cells across its sharpness — about eleven
across its full transition. The committed artefacts go from 27.7 MB to 30.4 MB and the
rebuild from 17 s to 20 s, which is the whole cost of the change.

The alternative costs were measured rather than assumed, because the obvious one was
ruinous: keeping 96 × 80 and adding depth alone takes the artefacts to **115.7 MB**, with
`returning` alone at 49 MB, and the snapshot codec already gzips with a byte-plane shuffle,
so that is a floor rather than a starting point.

## Consequences

Every stored field changes, every manifest changes, and the four seed artefacts were
rebuilt by `pnpm snapshots` under `check-snapshot-drift`. `ANALYTIC_FORM_VERSION` is 2, and
a reader that understands only form 1 must refuse the new manifests rather than reconstruct
a flat layer from them — which is what the version exists for.

**Nothing was enforcing that**, which the bump exposed: `lib/manifest-world.ts` cast a manifest
to a world without looking at the number, so a form 1 document would have produced
`depth_m + undefined × anomaly` — `NaN` at every point in the domain, with no reason given
anywhere. It now refuses, in both directions, and `manifest-world.test.ts` watches the refusal
fail as well as pass. The protection the master describes is a mechanism rather than a sentence
for the first time.

Two manifests carried `analytic_form_version: 1` as a typed literal while spreading the
env-generator's manifest wholesale: the analyst's and the model runner's. The bump made
them wrong — form 2 thermocline parameters under a form 1 label, telling a reader it could
reconstruct a doming layer with the flat rule. Both now take the number from the manifest
they spread, so the next bump cannot leave them behind.

FR-120 is **not amended**. That was the second option issue #113 offered and it was the
wrong one: the requirement described the ocean correctly and the harness did not contain
it. `CLAUDE.md` warns that a specification disagreeing with the code is right about four
times in five, and this was one of the four.

What the drawing says about itself is unchanged in kind. `Volume.tsx` still measures the
distinct-depth count in the field it was served and still states it, and still says the
field is level when it finds it so — with the spacing read off the levels rather than
typed, because that sentence said "200 m" while the axis was being changed to 40 m.

## What this does not deliver, and why it is here rather than in a follow-up

FR-120's rationale is that the thermocline "domes, tilts and breaks". Form 2 delivers the
doming and the breaking, both local. It does **not** deliver a domain-wide tilt, and the
attempt to add one is the reason this section exists rather than an issue saying "next
time".

Two shapes were tried and both failed for the same reason. The front's `tanh` step is
recorded above. A smooth basin-scale ramp — `depth_m + tilt × (latitude − mid)`, which is
what actually sets thermocline depth at basin scale and has no localised extremum for a
blob estimator to catch on — gives exactly the broad shape wanted: at 20 m per degree the
surface takes four distinct depths, the commonest three spanning 80 m, and the modal share
falls from 95% to 41%. It also puts seed 1180003's front anchor 74 km across against its
30 km bound, at every tilt tried down to 10 m per degree.

**The tension is structural, not a bug in either.** `model-runner/features.ts` locates all
three features by horizontal temperature structure, and a thermocline whose depth varies
horizontally *is* horizontal temperature structure at the depths near the layer. Broad
layer shape and estimator bounds derived from the authoring jitter are competing for the
same signal. Resolving it needs one of: an estimator that reads the depth structure rather
than the depth-averaged anomaly, bounds that account for a sloping layer, or a decision
that the demo prefers the shape to the scores. All three are larger than this change and
none is a panel's or a data commit's to take.

So the surface domes where a feature displaces it and is level elsewhere, the drawing
counts and states both, and the requirement's third verb is unmet with the measurement on
the record.
