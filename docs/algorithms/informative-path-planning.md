# Informative path planning: the value function, the sensing model and the search

The planner (C-15) answers one question: where would sampling most reduce uncertainty, over
the next few hours, from where the platform is now, under a budget. This document derives the
answer so a reader can check it rather than believe it, which is what Constitution IX asks of
every claim the harness makes.

Everything the planner emits is a **recommendation**. It commands nothing, addresses nobody
and renders nothing (Constitution VIII, SRD FR-36). That is not a matter of tone: the plan
contract admits no unconstrained string anywhere, so there is nowhere in the message a
sentence addressed to a person could be written, and a test asserts it over the schema and
over every emitted payload.

## The planning cell

Horizontal indexing is H3 at a configured resolution, layered with a separate depth index
(SRD FR-35). A **planning cell** is the pairing of an H3 index with a depth band, and it is
the unit over which uncertainty, prize and collapse are all expressed. The resolution is
configuration and is published in every recommendation, because a route through
resolution-6 cells is a coarser claim than one through resolution-9 cells and the difference
is not recoverable from the vertices.

The domain is covered by **overlap** rather than by centre containment. H3's ordinary cover
takes a cell when the cell's centre lies inside the domain polygon, which leaves the water
along the domain's edge in cells the cover does not contain — invisible until a projection
claims to cover every region and does not, or until an observation arrives from a cell the
planner has never scored.

## Uncertainty, and the two terms in it

The uncertainty the planner works over combines the per-cell **ensemble spread** published by
the model runner (SRD FR-29) with an **observation-age** term the planner maintains from
observation arrivals (SRD FR-07, FR-08). The SRD does not say which component combines those
two; the planner does, because it is the only consumer that needs the combination. Putting it
in the model runner would make the runner depend on an observation stream it does not
otherwise read, and putting it in telemetry would give the planner a second producer of its
primary input.

Write `u_sat(c, t)` for the spread at cell `c` at simulation instant `t`, and let a visit or a
measurement at `t₀` leave the cell at `u₀`. Then

    u(c, t) = u_sat(c, t) − (u_sat(c, t₀) − u₀) · exp(−(t − t₀) / τ(c, t))

with `τ` the decorrelation timescale. Four consequences, each a requirement rather than an
emergent nicety:

- **A cell never informed sits at the spread.** No visit, no deficit, so `u = u_sat`. That is
  the cold-arrival phase exactly: uncertainty driven by ensemble spread alone, and the
  absence of data emphatically not treated as low uncertainty.
- **A cell just informed is worth nothing to inform again.** At `t = t₀` the whole deficit is
  still there, so `u(t₀) = u₀`.
- **Quiet water is left alone and fast water is resampled.** The deficit decays at the local
  `τ`, so a revisit is worth only what has grown back and the revisit cadence follows the
  timescale without anybody scheduling it.
- **The deficit is measured against the saturation at the visit**, not against today's. A
  growing field would otherwise look like a collapsing one.

### tau is a field

ADR-0002 settles what `τ` is: a field `τ(latitude, longitude, depth, time)`, authored per
seeded feature over a domain-wide background and **evaluated per location**, with a moving
feature's timescale advecting with it. Three consequences bind this component:

- Every planning cell has a defined `τ`, open background water included. There is no
  special case for a cell outside a seeded feature and **no fallback constant anywhere in
  this package**.
- `τ` is evaluated at the instant asked about and never cached for the life of the scenario.
  A cell can be quiet at one replan and inside a fast feature at the next, because the
  feature drifted across it.
- The planner does not blend background and feature timescales itself. ADR-0002's last
  consequence forbids the authored per-feature representation reaching a consumer, so the
  planner reads the generator's ground-truth manifest and asks the generator's own evaluation
  for a number at a point.

## The prize

Uncertainty is what a visit *reduces*; **excess** is what a visit is *worth*:

    excess(c, t) = max(0, u(c, t) − θ)

with `θ` the configured usable-confidence threshold. A cell already below `θ` is fully
resolved for the purpose the harness has, so resolving it further collects nothing and a
route gains nothing from the detour. That is also the whole of the empty-route case: where
nothing in the domain is above `θ`, the honest recommendation is no route at all, stated with
its reason. **A planner that always recommends motion is a planner nobody can trust when it
recommends motion.**

## The sensing footprint

SRD FR-32 requires the footprint to be an explicit configured model rather than an implicit
consequence of the grid resolution, and the requirement is worth taking literally. If the
footprint were "the cell you are in", changing the H3 resolution would change what a visit is
worth, the diminishing returns between two nearby objectives would appear and disappear with
the index, and two recommendations at different resolutions would not be comparable.

The model is a product of two decays about the visited cell:

    w(v, c) = p · exp(−d_h(v, c) / L_h) · exp(−|d_z(v, c)| / L_v)

with `p ≤ 1` the peak reduction at the visited cell itself, `L_h` and `L_v` the horizontal and
vertical e-folding lengths, all three configuration. `p` strictly below one leaves residual
uncertainty at a sampled cell, which is honest: an instrument reading does not resolve a cell
exactly. The kernel is unbounded and the cover is not, so the extent it is evaluated over —
rings in the horizontal, bands in the vertical — is stated in configuration rather than left
to a tolerance nobody wrote down.

Two properties the shape is chosen for, both asserted by tests rather than assumed. It
**overlaps**, so two objectives close together share informed cells and visiting the near one
collapses part of the far one's prize — that is the diminishing return, and a footprint
confined to one cell would not have it at any resolution. And it is **symmetric and
separable**, so a route's value is a function of the geometry rather than of the order the
footprint happened to be evaluated in.

Collapse at an informed cell is multiplicative:

    u⁺(c) = u⁻(c) · (1 − w(v, c))

Multiplicative rather than subtractive, so a nearly-resolved cell is not driven negative by a
strong visit and a wholly unknown cell is not resolved exactly by a weak one.

## The value of a route

This is FR-32 and it is the part of the planner that is easy to get wrong in a way that looks
right. A value function that adds up per-cell uncertainty along a route double-counts the
water two nearby stops both inform, prefers routes that stay inside one dense blob, and
produces recommendations that are confidently useless. Nothing downstream can detect it: a
wrong value produces a plausible route, and a plausible route is what a reader sees.

So the route is **walked**. For a candidate `(c₁, …, c_k)` with arrival instants
`(t₁, …, t_k)` computed from the traversal cost:

    V = Σᵢ Σ_{c ∈ footprint(cᵢ)} [ excess(c, tᵢ) − excess(c, tᵢ)·(1 − w(cᵢ, c)) ]

where each `excess(c, tᵢ)` is evaluated **against the state as it stands at `tᵢ`** — after
every earlier visit has collapsed it, and after regrowth from those visits to that instant.

Two distinct errors are avoided by the same walk, and they are worth separating because only
one of them is visible on a field that stands still:

1. **Earlier sampling has already resolved the water.** A distant objective is worth less
   once the stops on the way to it have collapsed the region in between. This shows on any
   field, moving or not.
2. **The field itself has moved.** `τ` advects with the feature that authored it and the
   published spread evolves across the forecast's valid time, so the cell a route reaches in
   two hours is not the cell it is now.

The second is the dangerous one. **On a static field, a planner that scored every vertex
against the field as it stands when the recommendation is computed agrees with the honest
one to the last digit.** Every test about diminishing returns passes; the recommendation
looks plausible. The moment a feature drifts, the two part company and the present-scoring
planner recommends the water that used to be interesting.
`services/planner/tests/test_value_at_arrival.py` carries the wrong implementation written
out beside the right one, and asserts that the two agree exactly on a static field and pick
different routes on a drifting one.

### The naive figure, published beside the honest one

Every recommendation also carries `value_without_collapse`: what the same route would have
been worth had each vertex been scored against the field at the horizon's start with nothing
collapsed. The gap between the two is the size of the error being avoided, and a number
nobody can see is a number nobody checks. On a field that does not change across the horizon
it is never smaller than the collapse-aware value; where it is smaller, the field itself grew
between the horizon's start and the arrivals, which is the same error in the other direction.

**Measured**, on the near/far bench of SC-001 — two objectives on one bearing with
overlapping footprints, on a uniform static field: naive sum 12.23, collapse-aware 10.28. The
error avoided is 1.95, or **15.9% of the naive sum**.

## The cost of a traversal

The budget is expressed in seconds of simulation time. The SRD says "under a budget" without
fixing its units, and time is the unit that makes the two axes of a four-dimensional route
commensurable: changing depth costs nothing horizontally and is not free, so a budget in
metres would price a descent at zero.

    cost(a → b) = d_h(a, b) / s_h + |z_b − z_a| / s_v

Horizontal and vertical are added rather than taken in parallel. A platform that descended
while transiting would be a platform model, and this component has no business holding one;
adding them is the conservative reading of a budget, which is the right way for a
recommendation to be wrong if it must be wrong.

## The search

Route selection is **orienteering, prize-collecting**: cells carry prizes, traversal carries
cost, and a subset is chosen under a budget (SRD FR-35). It is explicitly not
travelling-salesman — there is no requirement that every candidate be visited and no tour to
close — and the counts of what was considered against what was chosen are both published, so
the difference is checkable rather than asserted.

Orienteering is NP-hard and nothing in the requirements asks for optimality. What they ask
for is the right formulation and determinism (Constitution II).

**Greedy insertion.** Repeatedly consider putting each remaining candidate at each position in
the route so far, and keep the insertion with the best ratio of value added to time added.
Ratio rather than value, because a budget is what binds: an objective worth twice as much and
four times as far away is the wrong choice, and a greedy search on value alone takes it.

**Seeded randomised restarts.** A pure greedy insertion has one answer and can be led into a
poor one by its first move. Each restart after the first draws its move from a shortlist of
the best few insertions rather than always taking the best. Every draw comes from
`harness_core.rng.rng_for`; a bare generator anywhere in this package is a constitution
violation rather than a shortcut. With one restart the search is exactly the pure greedy
insertion and no draw is taken at all.

**Deterministic everywhere else.** Candidates are considered in cell order, never in the order
a dictionary handed them back. Routes of equal value are separated by their cost and then by
their cells, so two replays produce not merely equal values but the same route and the same
bytes.

### The measured optimality gap

Exhaustive search over every ordered subset is factorial, so it can only be run on small
instances. On three seeded instances of **seven candidate cells** at resolution 6 under a
5400-second budget, the heuristic found the exhaustive optimum every time:

| instance seed | exhaustive optimum | heuristic | gap |
|---|---|---|---|
| 20260826 | 2.0329 | 2.0329 | 0.00% |
| 20260827 | 1.9860 | 1.9860 | 0.00% |
| 20260828 | 1.8279 | 1.8279 | 0.00% |

Mean gap 0.00%, worst 0.00%. The limitation is stated rather than hidden: that is the gap on
instances small enough to enumerate, not a bound at scenario scale. What it rules out is the
case that matters — a heuristic that was *systematically* poor rather than occasionally
suboptimal would show a gap here too. `services/planner/tests/test_optimality_gap.py` is the
measurement, and it prints the figures above rather than asserting a conclusion.

### What the search costs

A search evaluates thousands of candidate routes and publishes one. Two things make that
affordable without changing a single published number:

- **Route walks are memoised across restarts.** A route's value is a pure function of its
  cells given the state, the start and the horizon's beginning, and restarts explore
  overlapping neighbourhoods of the same space.
- **The naive figure is computed on demand.** It is a second walk of the whole route and is
  wanted only for the route that is published; computing it eagerly made it most of the cost
  of a search that never looked at it.

On the scenario's own configuration — a domain of roughly two dozen resolution-6 cells
crossed with two depth bands, 8 restarts, a shortlist of 3 — a recommendation is produced in
about 2.5 seconds of host time. That figure is host time and is quoted only as a cost of
running the harness; nothing in the planner's own reasoning reads a host clock.

## The receding horizon and the commitment

A plan computed once and never revisited is a static answer to a moving question, so the
horizon recedes. Three triggers, stated as three because they mean different things: the
configured cadence in simulation time says how long a recommendation may stand; an
announcement on `ctl/run-published` says the field it was computed from has been replaced;
an observation says the world has been sampled since. Only the first is a schedule, and none
of them is a host clock.

One **sounding** is three observations — temperature, salinity and pressure at one place and
one instant — and it is one measurement of that water. The planner assembles no sounding and
keeps no observation; it holds the last cell and instant it was informed of, and a second
observation naming the same pair informs nothing new. Without that, the collapse would be
applied three times for one measurement, tripling the reduction and under-valuing every later
visit for a reason no reader could find.

But a route recomputed from scratch every few minutes is not a commitment; it is a sequence
of opinions, and a consumer watching the recommendation change under it learns nothing from
any single one of them. So the part of the route inside the **commitment window** is held,
and abandoned only when the freely replanned alternative beats it by more than a configured
**margin**. Commitment without hysteresis is not commitment: with a margin of zero the prefix
would be dropped for an improvement in the sixth decimal place, which is thrashing with extra
steps. A departure is recorded with its margin, so a reader can see the planner changed its
mind and by how much without diffing two recommendations.

## The forward projection

SRD FR-34 is what separates this planner from a reactive one. A reactive planner notices that
a region has gone blind; this one says when it will, so a consumer can reason about a stated
future instant instead of waiting for a present condition. Three decisions, each visible in
the published projection:

**Every region appears.** Omission is not permitted, because an absent region reads as a
healthy one. A region that does not lapse inside the horizon says so with a named state
rather than by not being there. The count is published beside the list, so a truncated
message is detectable rather than merely shorter.

**A region is decided by its worst band.** A region usable at the surface and blind at depth
is not a usable region, so the band that lapses first is reported and named.

**The march is stepped, not solved.** The growth law above has a closed form, and the crossing
could be computed exactly:

    t_cross = −τ · ln( (u_sat − θ) / d )       where d is the deficit a visit left

It is marched instead, at a configured step, and the accuracy is stated against that step
rather than claimed exact. A growth law without a closed form — a different regrowth model, a
`τ` that varies along the march — would then need no new machinery, only a different call
inside the same loop. `services/planner/tests/test_projection.py` compares the marched
crossing against the closed form above and asserts agreement to within one step: at
`u_sat = 0.80`, `τ = 3600 s`, `θ = 0.35` and a visit removing 95%, the analytic crossing is
1886.7 s and the march resolves it inside one 60-second step.

## What this component does not do

- It does not render, and emits no display text. Rendering the route as a curve through the
  forecast volume is feature 012's.
- It does not act, and nothing acts on what it publishes. No component subscribes to
  `ctl/plan` in order to actuate; consumers render and record (SRD FR-36).
- It holds no entity, contact or history. The sampling platform appears as a position, a
  depth and a budget, and a recommended route over cells is not a record of anything that
  happened (Constitution V).
- It publishes only on the internal control namespace and adds no exposed path. Planned
  routes are among the things explicitly withheld at the boundary (SRD FR-42); enforcement
  there is feature 013's, and this document records the constraint so that no later
  convenience endpoint is added here.
