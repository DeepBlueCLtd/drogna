# Feature Specification: Adaptive Sampling Planner

**Feature Branch**: `011-adaptive-planner`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD component C-15 (planner); SRD §5.5 FR-32 to FR-36; Constitution
principle VIII.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A route's value accounts for the sampling it does on the way (Priority: P1)

Given an uncertainty field and a candidate route, the planner works out what that
route is worth by walking it: each visit collapses uncertainty in the cells it
informs, and every later stop on the route is valued against what remains, not
against what was there at the start. A distant objective is worth less once the
sampling on the way to it has already resolved the water in between.

**Why this priority**: This is the whole of FR-32 and it is the part that is easy to
get wrong in a way that looks right. A value function that adds up per-cell
uncertainty along a route double-counts, prefers routes through one dense blob, and
produces recommendations that are confidently useless. Getting it right requires no
solver, no broker and no route search: it is a function from a field and a candidate
route to a number, and it can be tested exhaustively on hand-built fields.

**Independent Test**: Build a field with a near objective and a far objective on the
same bearing. Evaluate the route that visits the near one and then the far one.
Assert that the far objective's marginal contribution is strictly less than its
standalone value, and that the collapse-aware total is strictly less than the naive
sum of the two standalone values.

**Acceptance Scenarios**:

1. **Given** an uncertainty field and a candidate route, **When** the route is
   evaluated, **Then** the returned value is the sum of marginal reductions computed
   in traversal order, each measured against the field as it stands after all earlier
   visits have collapsed it.
2. **Given** two objectives on the same bearing whose sensing footprints overlap,
   **When** the near one is visited first, **Then** the marginal value of the far one
   is strictly less than its value when visited alone.
3. **Given** the same two objectives, **When** the collapse-aware value is compared
   with the naive sum of standalone values, **Then** the collapse-aware value is
   strictly smaller, and the difference is reported by the test so the size of the
   error being avoided is visible.
4. **Given** a route that revisits a cell it has already sampled, **When** it is
   evaluated, **Then** the second visit contributes only the uncertainty that has
   regrown since the first, governed by the decorrelation timescale evaluated at that
   cell, and not the original value again.
5. **Given** a cell whose uncertainty is already below the usable-confidence
   threshold, **When** a route passes through it, **Then** its marginal contribution
   is approximately zero and the route gains nothing from the detour.

---

### User Story 2 - One committed route, chosen under a budget, recommended not ordered (Priority: P2)

The planner searches over cells indexed by H3 in the horizontal and a separate depth
index in the vertical, and selects a single ordered route that collects as much value
as the budget allows. It does not attempt to visit everything. What it emits on the
control namespace is a recommendation: a route, its value, its budget consumption and
its reasoning. It contains no instruction, no addressee and no imperative.

**Why this priority**: This is FR-33's committed route and FR-35's problem
formulation, and it is where the failure mode this component owns — crossing into
tactical advice — is either avoided or not. It is second because it consumes the
value function of User Story 1; with a naive value function it would produce a
plausible-looking route that is wrong for reasons nobody could see.

**Independent Test**: Run the selection over a fixed field with a budget too small to
visit everything. Assert the route respects the budget, that it leaves candidate
cells unvisited, that it is ordered with per-vertex arrival times and depths, and
that the emitted message contains no field or string that could only be an
instruction.

**Acceptance Scenarios**:

1. **Given** a set of candidate cells and a traversal budget smaller than the cost of
   visiting all of them, **When** the planner selects a route, **Then** the route's
   cost is within the budget, some candidate cells are left unvisited, and the
   selection is reported as prize-collecting under a budget rather than as a tour.
2. **Given** a selected route, **When** it is emitted, **Then** each vertex carries a
   horizontal H3 index, a depth band, and the simulation time of arrival, so the route
   is a four-dimensional curve and not a two-dimensional line.
3. **Given** a plan message, **When** its schema and content are inspected, **Then**
   there is no addressee, no imperative verb, no tasking or directive field, and no
   text addressed to a person. The message states what would reduce uncertainty and
   by how much; it does not say what anyone should do.
4. **Given** the planner is running, **When** the system is inspected, **Then** no
   component acts on a plan automatically: `ctl/plan` has consumers that render and
   record, and none that actuate.
5. **Given** the same field, budget and seed, **When** the selection is run twice,
   **Then** the same route is produced, because any randomisation in the search draws
   from a seeded generator.

---

### User Story 3 - The route is reconsidered as measurements arrive (Priority: P3)

The planner replans on a receding horizon: at its configured cadence, and when a new
uncertainty field is published or new measurements arrive, it recomputes the committed
route from where the platform now is. It does not thrash: the part of the route
already committed within the commitment window is retained unless a materially better
alternative exists.

**Why this priority**: A plan computed once and never revisited is a static answer to
a moving question, and FR-33 requires the receding horizon explicitly. It is third
because it needs a working single-shot planner to reconsider.

**Independent Test**: Feed a sequence of uncertainty fields and observation arrivals
and assert that a new plan is emitted at each trigger, that each carries the
identifier of the plan it supersedes, and that the committed prefix is stable when
nothing material has changed.

**Acceptance Scenarios**:

1. **Given** a committed plan, **When** a new uncertainty field is published on
   `ctl/run-published`, **Then** a new plan is emitted carrying a new plan
   identifier, the identifier of the plan it supersedes, and the horizon it covers.
2. **Given** a committed plan and no new information, **When** the replan cadence
   elapses, **Then** the recomputed route's committed prefix is unchanged, because the
   improvement did not exceed the configured commitment margin.
3. **Given** measurements arriving along the current route, **When** the planner
   replans, **Then** the cells those measurements informed have collapsed uncertainty
   and regrow from that moment at their decorrelation rate, so the plan reflects what
   has actually been sampled rather than what was intended.
4. **Given** a replan that would abandon the committed prefix, **When** the
   improvement exceeds the commitment margin, **Then** the prefix is changed and the
   plan records that it departed from its predecessor and by how much.

---

### User Story 4 - When a region will go blind is stated in advance (Priority: P4)

The planner projects uncertainty growth forward from the current field and reports,
for each region, the simulation time at which confidence will fall below the usable
threshold. A region with no crossing inside the horizon is reported as such, not
omitted. The output is therefore schedulable: a consumer can plan against a future
time rather than waiting for a problem to arrive.

**Why this priority**: FR-34 is what separates this planner from a reactive one, and
it is the requirement that makes the loiter phase of the scenario interesting. It is
last because it is an additional output of machinery the earlier stories build.

**Independent Test**: Take a field whose decorrelation timescales are known from the
ground-truth manifest and assert the reported crossing times match the times computed
analytically from the growth model,
and that every region in the domain appears in the report with either a crossing time
or an explicit statement that none occurs within the horizon.

**Acceptance Scenarios**:

1. **Given** a region whose uncertainty is growing at a known rate, **When** the
   projection is computed, **Then** the reported crossing time matches the
   analytically derived time to within one projection step.
2. **Given** a region whose uncertainty will not cross the threshold within the
   horizon, **When** the projection is published, **Then** the region appears with an
   explicit no-crossing-within-horizon state rather than being absent from the report.
3. **Given** a region that has just been sampled, **When** the projection is
   recomputed, **Then** its crossing time moves later by an amount consistent with the
   collapse and the regrowth rate.
4. **Given** the projection report, **When** it is inspected, **Then** it states when
   confidence will lapse and nothing about what should be done in response.

---

### Edge Cases

- **No uncertainty field published yet.** There is nothing to plan against. The
  planner reports `no-field` and emits no route. It does not invent a default field.
- **Budget too small for any candidate.** The recommendation is an empty route with
  the reason stated, not the nearest cell as a consolation prize.
- **Every cell already below the usable threshold.** The recommendation is an empty
  route with the reason `nothing-worth-sampling`. A planner that always recommends
  motion is a planner nobody can trust when it recommends motion.
- **Uncertainty field arrives mid-search.** The in-flight search completes and its
  result is discarded if superseded; a plan is never emitted against a field that has
  already been replaced.
- **Sensing footprint spans the H3 resolution.** If a single visit informs many cells
  at the configured resolution, the collapse is applied across all of them, and the
  resolution is recorded in the plan so the granularity of the recommendation is
  visible rather than implied.
- **Depth bands with no observations at all.** Uncertainty there is ensemble spread
  alone, exactly as in the cold-arrival phase of the scenario, and the planner does
  not treat absence of data as low uncertainty.
- **A cell in open background water, outside every seeded feature.** It still has a
  decorrelation timescale, because tau is a field with a domain-wide background
  (SRD FR-05). There is no unscoreable cell and no fallback constant.
- **A moving feature drifts across a cell between replans.** The cell's tau changes,
  because a moving feature's timescale advects with it. The planner re-evaluates tau
  at replan rather than caching it for the life of the scenario.
- **Two regions with equal projected crossing times.** The tie is broken
  deterministically from the seed, not by iteration order of a dictionary.
- **A consumer wants the planner to command.** Out of scope by construction. The
  request would be a change to Constitution VIII and requires an ADR, not a field.

## Requirements *(mandatory)*

### Functional Requirements

#### Route value and the collapse of uncertainty

- **FR-001**: The planner MUST evaluate candidate routes against the uncertainty
  field, using the ensemble spread published by the model runner as the uncertainty's
  primary term. (SRD FR-32, FR-29)
- **FR-002**: Evaluation MUST simulate the collapse of uncertainty along a candidate
  as it is traversed: each visit reduces uncertainty in the cells its sensing
  footprint informs, and every subsequent visit is valued against the collapsed
  field. (SRD FR-32)
- **FR-003**: The value of a distant objective MUST therefore decay as nearer
  sampling resolves the intervening region. A value function that sums independent
  per-cell values without collapse does not satisfy this requirement. (SRD FR-32)
- **FR-004**: The sensing footprint — which cells a visit informs and by how much —
  MUST be an explicit, configured model, not an implicit consequence of the grid
  resolution. (SRD FR-32)
- **FR-005**: Collapsed uncertainty MUST regrow with elapsed simulation time at a rate
  governed by the decorrelation timescale evaluated at that cell, so a revisit is worth
  only what has grown back. The timescale is a field, tau(latitude, longitude, depth,
  time): authored per seeded feature over a domain-wide background and evaluated per
  location as the background blended with the contribution of any feature overlapping
  it, with a moving feature's timescale advecting with the feature. (SRD FR-05)
- **FR-006**: The planner MUST therefore obtain a defined tau at every planning cell it
  scores, including cells in open background water, and MUST NOT special-case cells
  that fall outside a seeded feature or substitute a constant for them. (SRD FR-05,
  FR-32, FR-34)
- **FR-007**: During the cold-arrival phase, uncertainty MUST be driven by ensemble
  spread alone; during loiter it MUST additionally reflect observation age, so the
  revisit cadence tracks the local decorrelation timescale — fast features resampled
  often, quiet water left alone. (SRD FR-07, FR-08)

#### Route selection

- **FR-008**: Horizontal indexing MUST use H3 at a configured resolution, layered with
  a separate depth index. A planning cell is the pairing of an H3 index with a depth
  band. (SRD FR-35)
- **FR-009**: Route selection MUST be treated as an orienteering, prize-collecting
  problem: cells carry prizes, traversal carries cost, and a subset is chosen under a
  budget. The planner MUST NOT formulate the problem as travelling-salesman and MUST
  NOT require every candidate to be visited. (SRD FR-35)
- **FR-010**: The planner MUST emit a single committed route, ordered, with each
  vertex carrying its H3 index, depth band and simulation time of arrival, so the
  route is a four-dimensional curve. (SRD FR-33, FR-20)
- **FR-011**: The emitted route's stated value MUST be its collapse-aware value, so
  diminishing returns are already incorporated in what is committed to, not applied by
  a consumer afterwards. (SRD FR-33)
- **FR-012**: The route MUST respect its budget. A plan exceeding the budget is a
  defect, not a suggestion. (SRD FR-35)
- **FR-013**: Plans MUST be published on `ctl/plan` and MUST conform to
  `contracts/schemas/plan.schema.json`.

#### Receding horizon

- **FR-014**: The planner MUST replan on a receding horizon, triggered by its
  configured cadence in simulation time, by a new uncertainty field announced on
  `ctl/run-published`, and by the arrival of measurements. (SRD FR-33)
- **FR-015**: Each plan MUST carry a plan identifier, the horizon it covers, and the
  identifier of the plan it supersedes, so a consumer can distinguish a replan from a
  first plan.
- **FR-016**: The planner MUST hold its commitment: the portion of the route within
  the configured commitment window is retained across a replan unless the improvement
  from changing it exceeds a configured margin, and a departure from the previous
  plan MUST be recorded with its margin. (SRD FR-33)
- **FR-017**: A plan MUST NOT be emitted against an uncertainty field that has already
  been superseded. (SRD FR-30, FR-31)

#### Forward projection

- **FR-018**: The planner MUST project uncertainty growth forward from the current
  field and report, per region, the simulation time at which confidence falls below
  the configured usable threshold. (SRD FR-34)
- **FR-019**: The projection MUST be emitted with the plan so the output is
  schedulable — a consumer can act against a stated future time rather than only
  reacting to a present condition. (SRD FR-34)
- **FR-020**: Every region in the domain MUST appear in the projection, either with a
  crossing time or with an explicit no-crossing-within-horizon state. Omission is not
  permitted, because an absent region reads as a healthy one. (SRD FR-34)

#### Recommendations, not decisions

- **FR-021**: The planner MUST emit recommendations only. No output may command, task
  or address a person. (SRD FR-36, Constitution VIII)
- **FR-022**: `plan.schema.json` MUST contain no field that could only be an
  instruction — no addressee, no tasking, no directive, no order — and an automated
  test MUST assert both the schema and emitted payloads against a forbidden-vocabulary
  list. (Constitution VIII)
- **FR-023**: The planner MUST NOT render, and MUST NOT emit display text addressed to
  an operator. Rendering and advice occur downstream. (SRD FR-36)
- **FR-024**: No component may act automatically on a plan. Consumers of `ctl/plan`
  render and record. (SRD FR-36)

#### Cross-cutting

- **FR-025**: The planner MUST read exactly one configuration file whose path arrives
  in `HARNESS_CONFIG` and MUST validate it against
  `contracts/schemas/config.planner.schema.json` before any other I/O.
  (Constitution IV)
- **FR-026**: All horizons, cadences, arrival times, regrowth intervals and message
  timestamps MUST come from the simulation clock port. (Constitution I)
- **FR-027**: Any randomisation in the search — restarts, tie-breaks, sampling of
  candidates — MUST draw from a seeded generator obtained through the RNG port, and
  plan identifiers MUST be derived deterministically. (Constitution II)
- **FR-028**: The planner MUST publish a heartbeat on `ctl/heartbeat` carrying its
  component identifier, the simulation time and one of `planning`, `no-field` or
  `nothing-worth-sampling`. (Constitution VII)
- **FR-029**: No plan may carry a tracked entity, contact, detection or track. The
  sampling platform appears as a position, a depth and a budget. A route is a
  recommendation over cells, not a track. (Constitution V)

### Key Entities

- **Planning cell**: the pairing of an H3 index at the configured resolution with a
  depth band. The unit over which uncertainty, prize and collapse are all expressed.
- **Uncertainty state**: the planner's working field over planning cells, combining
  the published ensemble spread with an observation-age term, carrying for each cell
  its current value, the simulation time it was last informed, and its regrowth rate.
- **Decorrelation timescale field**: tau(latitude, longitude, depth, time), authored
  per seeded feature over a domain-wide background and evaluated per planning cell.
  It governs how fast collapsed uncertainty regrows, it is defined everywhere in the
  domain, it advects with a moving feature, and it is ground truth recorded in the
  generator's manifest.
- **Sensing footprint**: the model of which cells a visit informs and by how much,
  in the horizontal and in depth.
- **Candidate route**: an ordered sequence of planning cells with arrival times, under
  evaluation but not committed.
- **Committed route**: the single route the planner recommends, with per-vertex H3
  index, depth band and arrival simulation time, its collapse-aware value, its budget
  consumption, and the commitment window within which it will not be revised lightly.
- **Plan**: the published recommendation, carrying the committed route, the projection
  report, the plan identifier, the superseded plan identifier, the horizon, the
  uncertainty field identifier planned against, and the reason when the route is empty.
- **Projection entry**: for one region, the simulation time at which confidence falls
  below the usable threshold, or an explicit statement that it does not within the
  horizon.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a near/far objective geometry with overlapping sensing footprints,
  the collapse-aware route value is strictly less than the naive sum of standalone
  values, and the test reports the size of that difference.
- **SC-002**: The marginal value of a revisit to a cell equals the regrown uncertainty
  for the elapsed simulation time, to within the projection step, in 100% of tested
  cases.
- **SC-003**: Every emitted plan's route cost is within its budget: the count of
  budget-exceeding plans over a full scenario is zero.
- **SC-004**: In a scenario whose budget is smaller than the cost of visiting all
  candidates, the fraction of candidate cells visited is strictly less than one,
  demonstrating prize-collecting rather than tour construction.
- **SC-005**: A plan is produced within the configured planning budget in simulation
  time for a domain of the scenario's configured H3 cell count and depth band count.
- **SC-006**: Across a scenario with no new information between replans, the committed
  prefix changes in no more than the configured churn fraction of replans.
- **SC-007**: 100% of regions in the domain appear in every projection report, each
  with either a crossing time or an explicit no-crossing state.
- **SC-008**: Projected crossing times match analytically derived times to within one
  projection step, for 100% of tested regions with known growth rates.
- **SC-009**: The tau values the planner evaluates match the ground-truth
  decorrelation timescale field recorded in the generator's manifest, to within the
  stated interpolation tolerance, at 100% of sampled planning cells — including cells
  in background water and cells a moving feature has drifted across.
- **SC-010**: The forbidden-vocabulary test over `plan.schema.json` and over every
  emitted plan payload finds zero instruction-shaped fields or strings.
- **SC-011**: No component subscribes to `ctl/plan` in order to actuate: the count of
  automatic actions taken on a plan across the system is zero.
- **SC-012**: The same scenario replayed from its manifest produces an identical
  ordered sequence of plans with identical routes and identical projections.

## Assumptions

- The decorrelation timescale is a field, per SRD FR-05: authored per seeded feature
  over a domain-wide background, evaluated per location, advecting with a moving
  feature. The planner therefore assumes a defined tau at every H3 cell and depth
  layer it scores and needs no special case for background water. Both the background
  and the per-feature timescales are ground truth in the FR-04 manifest, which gives
  this feature's uncertainty-growth projections something to be scored against rather
  than merely asserted (Constitution IX).
- Evaluating tau is the environment generator's business, since it authors the field
  and records it in the manifest. The planner reads it and interpolates it to its own
  planning cells; it does not author its own blend of feature and background
  timescales. Recorded here because the SRD says what tau is without naming the
  component that evaluates it.
- The uncertainty the planner works over combines the ensemble spread published by
  the model runner (SRD FR-29) with an observation-age term the planner maintains from
  observation arrivals, per SRD FR-07 and FR-08. The SRD does not say which component
  combines those two terms; the planner is chosen because it is the only consumer that
  needs the combination, and putting it in the model runner would make the runner
  depend on the observation stream it does not otherwise read. Recorded here rather
  than fixed silently.
- The planner subscribes to `obs/#` for measurement arrivals, in the same manner as
  the monitor, and keeps only the last-informed simulation time per planning cell. It
  does not query the observation store.
- The sensing footprint is taken as a decaying influence over horizontal distance and
  depth separation, with the decay lengths supplied by configuration. The SRD requires
  that collapse be simulated; it does not fix the sensing model, so the model is
  configuration and its form is documented in
  `docs/algorithms/informative-path-planning.md`.
- Route selection uses a greedy insertion heuristic with seeded randomised restarts.
  Orienteering is NP-hard and the harness has no requirement for optimality; what it
  has is a requirement for the right problem formulation (SRD FR-35) and for
  determinism (Constitution II). The heuristic's optimality gap on small hand-built
  instances is measured and reported rather than assumed.
- The budget is expressed as traversal time under a configured nominal platform
  speed, converted to distance where the geometry needs it. The SRD says "under a
  budget" without fixing its units.
- The commitment window and the improvement margin that governs departing from a
  committed prefix are this feature's choice, made because FR-33 says "a single
  committed route" and commitment without hysteresis is not commitment. Both are
  configuration.
- The usable-confidence threshold that FR-018 reports against is scenario configuration. The
  SRD fixes no value.
- H3 resolution is scenario configuration. The scenario's domain size and the sensing
  footprint decay length together determine a sensible value; the planner records the
  resolution in every plan so the granularity of a recommendation is never implicit.
- The plan is consumed by the client for rendering (feature 012) and by nothing else.
  This feature emits `ctl/plan` and owns its schema; it draws nothing.
