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
centre across the five AT-06 seeds, error in km against its own 40 km radius:

| terms | 1180001 | 1180002 | 1180003 | 1180004 | 1180005 |
|---|---|---|---|---|---|
| none (form 1) | 9.7 | 20.5 | 7.0 | declined | 25.5 |
| eddy, front and moving | 8.8 | 16.8 | 4.8 | **64.9** | 21.6 |
| front alone | 12.8 | **60.7** | 9.8 | declined | 33.6 |
| eddy and moving | 6.7 | 14.2 | 3.1 | 1.9 | 15.1 |

A global cold half and warm half at the layer's depth is a blob the size of the domain,
and a blob estimator finds it. Dropping the front leaves the estimator **better than form 1
on every seed**, including the one form 1 could not find at all. The front's own horizontal
step is already in the field through `frontAnomalyT`; stepping the layer with it as well
was double-counting the one feature that needs no help being seen. The front's anchor
recovery agreed independently: with the front displacing, seed 1180003 put the anchor 74 to
97 km across the front against a 30 km bound, at every grid size tried, and 1 km without it.

**And the coefficient is 20 m/°C because that is where the estimators still hold.** At 30
the front's anchor on seed 1180003 goes back over its bound; the drop from 30 to 20 costs
35 m of relief and one distinct depth in four.

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

`Volume.tsx` prints those shares. It was first written to print max minus min and call the
result doming, which against one analysis read "16 distinct depths spanning 840 m" — true of
two columns and false of the layer, and the same fault as form 1's arriving from the other
direction.

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
flatness is the grid's if it ever finds one again — with the spacing read off the levels
rather than typed, because that sentence said "200 m" while the axis was being changed to
40 m.
