# Feature Specification: The forward step, and what a run costs

**Feature Branch**: `claude/srd-app-integration-3at4gr`

**Created**: 2 September 2026

**Status**: Specified

**Input**: The *Forecast illustration tool* companion requirements document of 1 September
2026 (`docs/v2/forecast-illustration-srd.md`), with the instruction: "Consider how to
incorporate this into the overall SRD, and deliver it within the current app."

## Context

drogna assimilates but does not forecast, and until the companion document was written the
record did not say so. The analyst corrects a standing field by optimal interpolation and
publishes the analysis, its error and its per-cell provenance (FR-30); the model runner then
takes that analysis and *advects* it — `shift-advect-v1` displaces the whole field rigidly at
a configured velocity, samples the initial state at the displaced cell with edge clamping,
and adds noise whose deviation grows as the square root of the lead.

That is a translation, not a propagation. Nothing in it carries a state forward: the field at
lead six is the field at lead zero, moved and blurred. It has served, because the loop's
subject until now has been *whether and when* to forecast rather than *what a forecast is*.
But it means the harness cannot demonstrate the thing an operator most needs explained, and
it means the word "forecast" in every requirement above has been doing more work than the
code behind it.

The companion document closes that in two places at once, and the pairing is its argument: a
forward step honest enough to be called a forecast, and a surface that makes assimilation
visible. **The surface is the deliverable; the forward step exists because a surface
explaining a forecast needs a forecast to explain.** This feature is the second half of that
sentence. Feature 124 is the first.

**Feature number.** 123, after the 121 collision was resolved in this branch's first commit
(the Data tab keeps 121; operator actions moves to 122). Unlike 111 to 122 it does **not** sit
outside the arc: it changes the simulation, adds a message to the seam, and changes what the
scheduler decides. That is the largest change to the loop since 116 put the analysis inside
it, and the reason this spec is longer than its neighbours.

### What the interview settled, and what it cost

**The whole companion document is folded into `srd.md`, not only the part built here.** Its
FI- numbering existed to avoid colliding with the FR- space; once folded, that reason is
spent. FI-01 to FI-35 are FR-106 to FR-140 in §5.20, each citing its origin, and FA-01 to
FA-06 are AT-06 to AT-11. The cost is a section of the SRD that is visibly ahead of the tree:
FR-120 to FR-134 describe a surface nothing has built. That is stated rather than hidden —
§5.20's own prose says which requirements are feature 124's — and it is preferred to two live
requirements documents, which is the divergence V2 exists to end.

**Cost is simulation time. There is no third wall-clock exemption.** The document raised this
as its Q2 and left it open. It is declined rather than deferred. A host-clock duration is a
fact about the machine the tab is open on; admitting one would put a figure inside a run that
differs between two replays of the same manifest, and AT-04's byte-identical claim is the one
property that cannot be retrofitted at acceptable cost. What is given up is stated: the
magnitude of the cost is a declared rate, not a measurement. §8 of the companion document had
already conceded that.

**A run occupies its cost.** This was the interview's most consequential answer and it is the
one with the widest ripple. The alternative — state the cost beside a run that is still
instant — was rejected because it makes a run held for cost impossible to believe in: nothing
is ever actually occupied, so the hold is a label on a fiction. Occupying the ticks costs the
pre-roll, the committed snapshots and several existing tests, all of which are re-derived
rather than hand-adjusted.

**Affordability runs the opposite way to the obvious reading, and this is the finding.** The
first formulation — a run is affordable when it fits inside the standing forecast's remaining
validity — was accepted in the interview and then found, on reading it against FR-31, to
becalm the loop permanently. The cadence floor fires *precisely when* validity has lapsed. At
that instant the headroom is zero, so no run is ever affordable, so nothing ever runs again:
the exact fault FR-31 was written for and that `spikes/watched-turn/FINDING.md` watched
happen once already.

Inverted, it is a real planning behaviour. A warranted run is held **while the standing
forecast still has more life than the run costs** — there is no need to spend the compute
yet — and released when the remaining validity falls to the cost plus a declared margin, so
the new run lands as the old one lapses. It cannot becalm the loop: the hold releases as
validity decays, and the cadence floor still backstops it.

**A divergence is never held.** A hold is a bet that the standing forecast is still worth
something. A divergence is the world saying it is not.

**The new kernel becomes the configured default; the advection kernel stays registered.** Not
retired, and not offered as a live alternative either: it stays because a port with one
implementation is a claim about pluggability and a port with two is a demonstration of it
(Constitution VI), and because its tests are the ones that would catch the port's interface
being bent to fit the newcomer.

**The indicator socket is published by the monitor.** The monitor already computes the
residual and holds the threshold in force, both operator-tunable and both reported in its
heartbeat. Any other publisher would hold a second copy of the threshold, and the mark on the
gauge could then disagree with the rule that fires a run — which is the fault class this
repository keeps finding.

**The surface opens with two of its four regions.** `#/view/forecast` carries the left region
and the timeline, which are what FR-115's four scheduler facts need in order to be visible at
all; the centre and right regions state that they are not built and name the feature that
will build them. A view that announces its own incompleteness for a whole feature is the cost,
and it is preferred to shipping a scheduler behaviour nothing can see.

## Requirements

Numbered locally; the mapping onto the SRD's global numbers is in *SRD amendments* below.

### The forward step

- **FR-01** A second implementation behind the model kernel port: a shallow two-layer
  advection–diffusion step over the coarse grid, integrating state forward. Two layers split
  at the thermocline interface, upwind advection and explicit horizontal diffusion per layer,
  interfacial exchange between them.
- **FR-02** It sub-steps internally to satisfy its own stability condition, and refuses with
  the numbers named rather than integrating unstably. The sub-step count is a function of the
  configuration and the grid, not a constant.
- **FR-03** It is a pure function of initialisation state, parameters and its seeded stream.
  No host clock, no unseeded randomness, byte-identical replay.
- **FR-04** The port's interface is unchanged. The parameters it needs arrive in an optional
  block, and the kernel refuses by name when that block is absent — a refusal, never a silent
  default. `shift-advect-v1` is untouched and its tests keep running.

### The four features

- **FR-05** The runner publishes the seeded features **as features** — the eddy's centre and
  radius; the front's position and orientation; the thermocline's depth; the drifting
  feature's track — per forecast step, each with an uncertainty growing with lead, and each
  with its own uncertainty rather than one block computed from the strongest feature.
  *Amended after measurement:* the **strengths**, the front's **amplitude** and the
  thermocline's **gradient** are not recoverable at this grid and are reported as not done
  under FR-07, with what the estimator does measure published under names that do not claim
  to be them. SRD-v2 FR-113 carries the same amendment.
- **FR-06** The parameters are estimated from **the analysis the run initialises from**. A run
  never reads the true field: that is feature 116's lesson, recorded in the runner's own head
  comment, and the reason the runner subscribes to the analysis announcement rather than to
  the run request.
- **FR-07** Each is **scored** against the manifest's ground truth, with the bound derived
  from the authoring jitter on disk. An estimator that cannot be made to score honestly is
  reported as not done, with the reason, and is never softened by widening its bound until it
  passes.

### Cost

- **FR-08** The model runner is the **sole publisher** of a run's declared cost: work implied
  by its configuration, divided by a declared rate, in ticks. No other component and no panel
  declares it.
- **FR-09** A run **occupies** its cost. The runner announces the start, integrates, and
  publishes when the ticks are spent. Nothing is smoothed, hidden behind a spinner, or
  amortised.
- **FR-10** The scheduler holds a warranted **scheduled or prompted** run while the standing
  forecast's remaining validity exceeds the run's cost plus a declared margin, and releases it
  as that headroom decays. A **divergence is never held**.
- **FR-11** *Held for cost* is a fourth decision beside *accepted*, *declined by the minimum
  interval* and *declined as a duplicate*, with the shortfall in ticks named, published on the
  telemetry topic and reported in the heartbeat like the other three.
- **FR-12** A reader may commit a run against the stated cost, and that run is weighed under
  exactly the policy a divergence is weighed under.

### The socket, and the view

- **FR-13** The monitor publishes an indicator on a declared topic beside its divergence
  events, carrying the figure, the threshold in force and what the figure is.
- **FR-14** A view `forecast`, labelled "Forecast", declared in configuration and registered
  in the shell's one registry.
- **FR-15** Its left region draws a vertical gauge of whatever is published on the indicator
  topic, with the threshold marked and the cost of a run stated beneath it in the same frame.
  With the topic silent it states the absence and draws no gauge.
- **FR-16** Its timeline draws runs in simulation time, each labelled by cause — scheduled,
  divergence-triggered, reader-requested, held for cost.
- **FR-17** Its centre region states that it is not built and names feature 124. *Amended
  after the tab was built:* the **right** region draws the forecast's own features in plan —
  the eddy, the drifting feature and the front across the lead steps, each with its
  uncertainty widening, and the thermocline stated in figures because a depth has no place in
  a plan view — and names feature 124 for the ensemble spread along the route alone.

  The amendment is here because the omission was real. As first built, this view had no
  graphic of a forecast anywhere: a gauge about the run loop, a cost, and a list of runs.
  `ctl/forecast/features` — FR-05's whole product — was published on every run and consumed by
  nothing, so the feature's output was unverifiable by anything a reader could open. Feature
  124 claims those features for its volume (its FR-05), but the volume waits on an analyst
  change 124 is itself blocked on, and a plan view needs neither it nor that change.
- **FR-17a** The runner **restates** the standing forecast's features on the cadence it already
  restates cost on. A run's features are a standing fact about the forecast that is current,
  not an event: published on the run alone, a console mounting afterwards — which every console
  does — had nothing to draw until the next run, 1800 ticks and half an hour away at the
  default rate. Nothing is recomputed; the message published on the run is republished with the
  instant it is said at, so there is never a second opinion about one run.
- **FR-18** Everything is fetched through the seam and validated against the master the
  response declares before anything is drawn; refusals are stated where the content would have
  been. Nothing polls: the view refreshes on announcement.
- **FR-19** Legible in greyscale, keyboard-traversable, honouring `prefers-reduced-motion`,
  and carrying its own help tour held to a list on disk.

## SRD amendments this feature requires

Made in this branch, ahead of the implementation, because the requirements are the
deliverable the author asked for and the code is the second half.

- **§5.20 appended**, FR-106 to FR-140, folding the companion document whole. The SRD's
  numbers are cited across `specs/` and the ADRs, so they are **appended, never inserted**.
- **§9 gains AT-06 to AT-11** from FA-01 to FA-06.
- **§10** strikes the companion's Q1 and Q2 with their answers and carries Q3 as Q-01.
- **§4** restates V2-C11's and V2-C13's responsibilities; **§2.2** upgrades the kernel port
  from a claim about pluggability to a fact.
- **§5.18's FR-91 and FR-92 renumber to FR-104 and FR-105.** Feature 118 had taken those two
  numbers on another branch and both landed, so the document defined each twice and every
  citation of them was ambiguous. Done in a separate commit, with the citations chased.
- **The constitution goes to 2.1.1**, editorial: one citation in the Data constraint follows
  the renumbering. No rule is touched.

## What is deliberately not done, and why

- **The illustration surface.** FR-120 to FR-134 — the semi-transparent volume, the clickable
  column grid, the rays, the depth profile, the ghost layer. Feature 124. This is the
  deliverable the companion document exists for, and it is deferred on the author's decision
  that a surface explaining a forecast should be built after the forecast it explains.
- **A real assimilation scheme.** 3D-Var, EnKF and their relatives are named in the explainer
  and implemented nowhere (FR-107).
- **The indicator itself.** FR-117: socket, not science. Drogna's residual is wired in as the
  reference implementation and the surface says that is what it is showing.
- **Cost realism.** The harness cannot demonstrate the real system's compute profile and does
  not pretend to. It demonstrates that cost is in the domain model; the magnitude is a matter
  for the afloat appliance.
- **Clicking into the volume.** Ruled out at FR-121 with the reason recorded, so it is not
  rediscovered as an idea later.
- **A blog entry for this feature.** Deferred to the implementation, which is where the
  demo is. An entry is an invitation to a running thing, and this branch carries requirements
  and decision records only — there is nothing to open (CLAUDE.md: deciding a change needs
  neither is a fine answer, said in the sentence it takes).

## Acceptance

- **SC-001** A forecast run initialised from a published analysis propagates the seeded eddy,
  and the forecast position is scored against the manifest's ground truth with the error
  reported, not asserted (AT-06).
- **SC-002** The two-layer kernel replays byte-identically from the same seed, and the whole
  scenario including a forecast run replays byte-identically from its manifest — AT-04's claim
  surviving both the second kernel and the held publication (AT-09). Held by `pnpm
  replay-proof`.
- **SC-003** The kernel refuses an unstable configuration with the stability numbers named,
  rather than integrating it. Watched failing against a configuration that violates the
  condition, before the refusal is trusted.
- **SC-004** `shift-advect-v1` is still selectable and its existing tests still pass unchanged
  — the port's interface was not bent to fit the newcomer.
- **SC-005** A run held for cost, a run declined by the minimum interval, and no run requested
  are distinguishable on the surface without reading a log (AT-08).
- **SC-006** **The hold cannot becalm the loop.** With a warranted run held for cost, advancing
  the clock past the standing forecast's validity releases it. Held by a test that plants the
  becalmed state and asserts the run is requested — the specific fault this design almost had,
  and the reason the rule is inverted.
- **SC-007** A divergence is never held: with headroom that would hold a scheduled run, a
  divergence is accepted at the same tick.
- **SC-008** No component but the model runner declares a run's cost. Held by a gate, watched
  failing against a planted cost figure in the scheduler's configuration master.
- **SC-009** With the indicator topic silent, the left region states the absence and draws no
  gauge; with the monitor's residual published, the gauge names what it is showing (AT-10).
- **SC-010** Nothing in the view polls. Held by a test that advances the clock with no
  announcement published and asserts no fetch was made — neither a redraw nor a request.
  *Amended:* the second half of this, "then publishes one and asserts the view refetched",
  describes a surface that fetches on announcement. This one does not: it makes a single
  request on mount, for the history that had already happened, and everything after it
  arrives as a message. There is no refetch to assert.
- **SC-011** The committed snapshots regenerate clean under `check-snapshot-drift` after the
  kernel change, and the diff is read and explained rather than accepted.
- **SC-012** Every acceptance above is **watched happening in the shell** across the full path
  through the seam and captured, never inferred from green tests (AT-11, PR-06).
