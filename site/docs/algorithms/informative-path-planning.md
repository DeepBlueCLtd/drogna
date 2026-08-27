---
title: Informative path planning
---

# Informative path planning

Something has a limited amount of time and a region it can sample. Where should
it go?

The obvious answer is wrong in an instructive way, and the whole of this page is
about the shape of the correction. drogna's
[planner](../subsystems/c15-planner.md) is the component that makes it, and it is
the piece of the harness with the most arithmetic in it that nothing downstream
can check — a wrong route looks exactly like a right one.

## Why the obvious answer fails

Score every cell by how uncertain it is. Send the sampler to the worst one. Then
the next worst, and so on until the time runs out.

This fails immediately, and for a reason worth internalising because it recurs
everywhere in sensor planning: **the second-worst cell is usually next door to the
worst one, and sampling the first resolves the second for free.** Measuring
somewhere tells you about the water around it, not only about the point the
instrument was at. A scoring function that treats cells as independent therefore
pays twice for the same information, and the route it produces piles all its
effort into one dense patch of high uncertainty while leaving the rest of the
domain untouched.

The correction is that value is a property of a **route**, not of a cell, and that
a route has to be *walked* to be valued: each stop scored against the state the
earlier stops have already left behind.

That produces the diminishing-returns behaviour the requirements ask for as a
consequence of the formulation rather than as a rule bolted on top — which is the
difference between a planner that behaves sensibly and one that has been made to
look as though it does.

The size of the error is measurable. On the planner's own two-objective test
bench, two nearby objectives are each worth about 6.12 units in isolation; walked
together, the pair is worth 10.28 rather than 12.23. Naive scoring would have
overstated the route by **15.9%** — and would have chosen differently on that
basis.

## The uncertainty a cell carries

Three quantities, and the distinction between the second and third is the one that
does the work.

**Saturated uncertainty** is what a cell is worth knowing nothing about: the
published [ensemble spread](../glossary.md#ensemble-spread) there, read from the
[coverage store](../subsystems/c08-coverage-store.md) at the instant asked about.
It is a function of simulation time, because the forecast field it comes from
evolves.

**Uncertainty now** is what the cell is at, given whatever has been measured
there. It sits below saturation by a deficit that a visit created and that decays
away afterwards:

```text
u(t) = u_sat(t) - (u_sat(t0) - u0) * exp(-(t - t0) / tau(t))

  u_sat(t)   the saturated uncertainty now
  u_sat(t0)  the saturated uncertainty at the moment of the visit
  u0         what the visit left behind
  tau(t)     the local decorrelation timescale, evaluated now
```

Four consequences fall straight out of that one line, and each is a requirement
rather than a happy accident:

- A cell that has never been informed has no deficit, so it sits exactly at the
  spread. That is the cold-arrival phase of the scenario precisely: uncertainty
  driven by ensemble spread alone.
- A cell just informed is worth nothing to inform again.
- Quiet water is left alone and fast water is resampled, because the deficit
  decays at the local
  [decorrelation timescale](../glossary.md#decorrelation-timescale) — so the
  revisit cadence tracks the water without anybody scheduling it.
- The deficit is measured against the saturation *at the moment of the visit*, not
  against today's. Using today's to measure yesterday's deficit would make a
  growing field look like a collapsing one.

**Excess** is the third quantity and the one a route actually collects. A cell is
"good enough" once it is below a configured usable-confidence threshold, so the
prize at a cell is how far above that threshold it is, and never less than zero.
The difference between uncertainty and excess is the whole reason the planner does
not recommend motion for its own sake: where nothing is above the threshold, the
honest output is **no route at all**, stated with its reason, rather than the
nearest cell offered as a consolation. A planner that always recommends motion is
a planner nobody can trust when it recommends motion.

The two numbers involved have to be set consistently, and they are set in
different files by different features — which is exactly how they came to disagree.
Until 27 August 2026 the threshold was 0.35 °C, and the largest per-cell spread the
model runner produces at its shipped settings is **0.2156 °C**. Not close: no cell
of 810 was above the threshold, so every excess was zero and the only recommendation
the assembled system could ever make was the empty one.

That is the design working exactly as described above, which is why no test caught
it. The runner's tests assert it emits a spread; the planner's tests assert it plans
under a budget, using fixtures whose uncertainty values were written to exercise the
planner rather than taken from the runner. Nothing drove one into the other, and
correct behaviour on inputs nobody supplies is indistinguishable from correct
behaviour.

The threshold is now 0.172 °C, the upper quartile of what the runner actually
produces, so the most uncertain quarter of the field is worth visiting. **ADR-0019**
records why it stays an absolute number rather than becoming a quantile, and
`tests/integration/test_planner_threshold_against_runner_spread.py` now drives the
real runner into the configured threshold and asserts the relationship rather than
either number: something above it, something below it, and a fraction in between
that leaves a real choice. The [ensemble spread derivation](ensemble-spread.md) has
the measurements of what the field contains, including why its absolute level moves
with the root seed.

## What a visit informs

A visit does not inform only the cell it is in. If it did, changing the spatial
resolution would change what a visit is worth, the diminishing return between two
nearby objectives would appear and disappear with the index, and no two route
values computed at different resolutions could be compared.

So the sensing footprint is an explicit, configured model in metres, and the
resolution only decides how finely it is sampled:

```text
weight(cell) = peak * exp(-horizontal_distance / L_h) * exp(-|depth_difference| / L_v)
```

with the shipped settings `peak = 0.8`, `L_h = 9 km`, `L_v = 60 m`, evaluated over
at most two rings of neighbours horizontally and one band either way vertically.
The peak is at most one, so a visit never claims to resolve a cell exactly.

The collapse a visit applies is **multiplicative**, not subtractive: a cell at
uncertainty `u` visited with weight `w` is left at `u * (1 - w)`. Subtraction
would drive an already-resolved cell negative when visited strongly, and would
resolve a wholly unknown cell exactly when visited weakly. Multiplication does
neither.

Two properties of that kernel are asserted by tests rather than assumed. It
**overlaps**, so two nearby objectives share informed cells and visiting the near
one collapses part of the far one's prize — the diminishing return, present at any
resolution. And it is **symmetric and separable**, so a route's value depends on
the geometry rather than on the order the footprint happened to be evaluated in.

## Walking a route

A candidate route is evaluated by simulating it, on a forked copy of the belief
state so that thousands of candidates can be tried without any of them disturbing
the others:

```text
for each cell in the candidate route:
    add the traversal time to reach it        -> arrival instant
    ask the field what it looks like          at that instant
    collect the excess this visit removes     across the footprint
    write the collapse into the forked state
    move on
```

The phrase doing the work is *at that instant*. Every read passes an explicit
simulation time. This avoids two different errors that a single discipline fixes,
and only one of them is visible on a field that stands still:

- **Earlier sampling has already resolved the water.** A distant objective is
  worth less once the stops on the way have collapsed the region between. This
  shows up on any field.
- **The field itself has moved.** The decorrelation timescale advects with the
  feature that authored it, and the published spread evolves across the forecast's
  valid time. The cell a route reaches in two hours is not the cell it is now. On a
  static field, a planner scoring every vertex against the present agrees exactly
  with one scoring against arrival — which is why this error survives most tests
  and fails the moment a feature drifts.

Alongside the honest value, every route also carries what it *would* have been
worth with nothing collapsed. That second number is not used for anything. It is
published so the gap between the two is visible, because a number nobody can see
is a number nobody checks. (It is computed lazily: a search evaluates thousands of
candidates and publishes one, and computing the comparison eagerly turned out to
be most of the cost of a search that never looked at it.)

## Why orienteering and not travelling salesman

The travelling-salesman problem asks for the cheapest order in which to visit
**every** stop. That is not the question here. The question is *which* cells are
worth visiting at all, given a budget — and the answer is usually "a small
minority of them".

The family that asks that question is
[orienteering](../glossary.md#orienteering), also called prize-collecting: cells
carry prizes, legs carry costs, there is a budget, and a subset is chosen. Treating
the problem as a tour instead produces long routes through low-value water,
because the formulation obliges them to close.

Two consequences are visible from outside. Most candidates are deliberately left
unvisited, and both counts — how many cells were considered and how many were
chosen — are published with every recommendation, so the gap between them is
inspectable. And the budget is expressed in **seconds**, not metres: a change of
depth costs nothing horizontally and is not free, so a budget in metres would
price a descent at zero. Distance is still reported, because a reader wants to
know how far a recommendation reaches, but the budget binds on time.

There is a further wrinkle that separates this from textbook orienteering: the
prizes are not fixed. Collecting one reduces its neighbours'. That is what the
walk above is for, and it is why the value of an insertion has to be recomputed
rather than looked up.

### The search, and its measured gap

Orienteering is NP-hard and nothing here needs optimality. What is needed is the
right formulation and deterministic replay. So:

**Greedy insertion.** Repeatedly consider placing each remaining candidate at each
position in the route so far, and take the insertion with the best *ratio* of
value added to time added. Ratio rather than value, because the budget is what
binds — an objective worth twice as much and four times as far away is the wrong
choice, and a greedy search on value alone takes it.

**Seeded randomised restarts.** A pure greedy pass has one answer and can be led
into a poor one by its first move. Each restart after the first draws its move
from a shortlist of the best few rather than always taking the best, every draw
coming from the seeded random-number port. Eight restarts, a shortlist of three,
at the shipped settings. With one restart the search is exactly the pure greedy
pass and no draw is taken at all.

**Determinism everywhere else.** Candidates are considered in cell order, never in
whatever order a dictionary handed them back, and routes of equal value are
separated by cost and then by their cells — so two replays produce not merely
equal values but the same route.

The gap between that heuristic and the true optimum is measured rather than
assumed. On instances small enough to enumerate exhaustively — five to seven
candidate cells — the heuristic found the optimal route every time: **mean gap
0.00%, worst 0.00% over three instances of seven cells.** That is a real
limitation stated plainly, not a bound at scenario scale; what it rules out is the
case that matters, a heuristic that is *systematically* poor rather than
occasionally suboptimal, which would show a gap on small instances too.

## Why H3, layered with a separate depth index

The horizontal index is [H3](../glossary.md#h3) at resolution 6 — hexagonal cells
of about 36 square kilometres. Hexagons matter because every neighbour of a
hexagon is the same distance away. On a square grid, four neighbours share an edge
and four share only a corner, and any calculation in which a cell's value depends
on its neighbours has to fudge the difference; the sensing footprint above is
exactly such a calculation.

Depth is indexed separately, in explicit bands, and this is not merely convenient.
The vertical correlation structure is nothing like the horizontal one: a
[thermocline](../glossary.md#thermocline) can make two depths a few metres apart
nearly independent, which no horizontal index would ever say about two points
seven kilometres apart. A single three-dimensional index would have to pick one
notion of "nearby" and be wrong in one of the two directions.

Two things are deliberately absent from the indexing. There is **no interpolation
between cells** — the resolution is configuration and is published with every
recommendation, so the granularity of a claim is visible rather than implied, and
smoothing would hide it. And there is **no ordering by anything but the index**,
so two cells with equal prizes are separated by their index and then by their
band, never by iteration order.

## Saying when a region will go blind

A reactive planner notices that a region has become unusable. This one is required
to say *when* it will, which is what makes its output schedulable rather than
merely responsive.

Every region in the domain appears in the projection, with one of three states —
it is already lapsed, it crosses the threshold at a stated instant, or it does not
cross within the horizon. Omission is not permitted, because an absent region
reads as a healthy one. A region is decided by its **worst band**: usable at the
surface and blind at depth is not a usable region, and the band that decided it is
named so a reader can see which part of the water column is responsible.

The march forward is stepped — 300-second steps over a three-hour horizon at the
shipped settings — rather than solved, even though the regrowth law above has a
closed form and the crossing could be computed exactly. The accuracy is stated
against the step rather than claimed exact. The reason is that a different regrowth
model, or a timescale that varies along the march, would then need no new
machinery here, only a different call inside the same loop. It is also why the
timescale is re-evaluated at every step rather than taken once: a moving feature's
timescale advects with it, so a region can be quiet at the start of the march and
fast by the end of it.

## Changing its mind, but not constantly

Two requirements pull against each other. The horizon must recede — a plan
computed once and never revisited is a static answer to a moving question — and
there must be a *single committed route*, because a route recomputed from scratch
every few minutes is not a commitment but a sequence of opinions, and a consumer
watching it change learns nothing from any one of them.

The resolution is a commitment window with hysteresis. The part of the route
inside the window is held, and it is abandoned only when the freely replanned
alternative beats it by more than a configured margin. **Commitment without
hysteresis is not commitment**: with a margin of zero the prefix would be dropped
for an improvement in the sixth decimal place, which is thrashing with extra
steps. When the prefix is abandoned, the departure is recorded with its margin, so
a reader can see that the planner changed its mind and by how much rather than
having to compare two recommendations by eye.

Replanning has three triggers, and they are kept as three rather than folded into
one timer because they mean different things: the **cadence** says how long a
recommendation may stand; a **new field** says the thing it was computed from no
longer exists; a **measurement** says the world has been sampled since. Only the
first is a schedule, and none of them is a host clock — simulation time
throughout.

## Where the line is

The planner emits recommendations. It does not decide, and nothing in drogna
carries a recommendation into an action.

That boundary is worth stating precisely, because the naive version of it is
wrong. The line is not "does anything draw the route" — computing where sampling
would most reduce uncertainty is decision logic whether or not it is ever
rendered. The line defended is **who recommends**: the harness computes and
publishes, and any step from a published recommendation to something acted on
happens outside it. Every empty route, every held prefix and every abandoned
commitment is published with its reason for the same purpose, so that the thing
downstream is reading an argument rather than an instruction.

## Where the code is

| Piece | File |
|---|---|
| The regrowth law, collapse, excess and prize | `services/planner/src/harness_planner/collapse.py` |
| The route walk and the naive comparison | `services/planner/src/harness_planner/value.py` |
| Orienteering selection, greedy insertion, restarts | `services/planner/src/harness_planner/select.py` |
| The sensing footprint | `services/planner/src/harness_planner/sensing.py` |
| H3 cells and the vertical index | `services/planner/src/harness_planner/cells.py` |
| Forward projection of the lapse instant | `services/planner/src/harness_planner/projection.py` |
| Receding horizon and hysteresis | `services/planner/src/harness_planner/commitment.py` |
| The measured optimality gap | `services/planner/tests/test_optimality_gap.py` |
| Thresholds, budgets, footprint and search settings | `config/<destination>/planner.json` |

## A note on notation

There is no mathematical notation on this page. The regrowth law and the sensing
kernel are the only two expressions that needed writing down, and both appear as
fenced blocks in the same form the source states them; the site has no renderer
for mathematics, which is recorded in
[Site tooling](../decisions/site-tooling.md).
