# ADR-0038: measurements reach the field

**Status:** Accepted
**Date:** 30 August 2026
**Feature:** 116 (the analysis step, and where a value came from)
**Requirements:** SRD-v2 FR-21, FR-30, FR-33, all amended by this feature
**Engages:** Constitution VI (honest ports); Constitution IX (ground truth is scored,
not assumed); ADR-0002 (τ from the published manifest); ADR-0005 (sound speed derived
at the point of use)

## Context

For nine features drogna demonstrated a forecast loop that did not learn.

The coverage store had two writers. The environment generator evaluated the historic
archive and a rolling now-cast from the analytic true ocean. The model runner
initialised from that now-cast, ran its ensemble, and published a forecast. Observations
reached the observation store through the ingest seam and were served through the query
layer, and from there they fed exactly two things: the monitor's sound-speed residuals,
which decided *when* a run happened, and the planner's uncertainty field, which decided
*where* the platform sampled next.

No observation modified a field value anywhere. There was no innovation applied to a
field, no gain, no increment, no analysis. The loop converged, and the residuals the
monitor reported fell — but they fell because the now-cast was re-evaluated from truth
every nine hundred ticks, not because anything had been learned. Truth leaked in on a
timer.

Nothing in the tree lied about this. Every component was individually honest: the
generator said it evaluated an analytic world, the runner said it initialised from the
now-cast, the manifests recorded their derivations exactly. The arrow was simply
missing, and no document claimed it was there. It survived nine features because a
missing arrow looks like nothing at all.

It was found by asking a question about a display — *show the contribution of platform
measurements to the now-cast* — and reading the loop to answer it.

## Decision

An **analyst** component stands between the scheduler's request and the runner's
forecast. On a run request it takes the standing forecast as background and the
observations taken since its last cycle, and computes

```
xᵃ = xᵇ + K(y − Hxᵇ)        K = BHᵀ(HBHᵀ + R)⁻¹
```

publishing three holdings through the coverage store's one write seam — the analysis,
the diagonal of `Pᵃ = (I − KH)B`, and the provenance of every cell — and then announcing.
The model runner subscribes to that announcement rather than to the run request.

Four choices inside that are load-bearing, and each was made for a reason that is not
accuracy.

**Optimal interpolation, because the provenance is then exact.** `H` is
nearest-neighbour selection, so every row of `H` sums to one, so
`xᵃ = (I − KH)xᵇ + Ky` exactly: each analysed value is a linear combination of its
background and the observations whose weights sum to one. The provenance shares are read
straight off the gain. A nudging scheme would have drawn the same stacked bar, but the
bar would have been an illustration rather than the arithmetic. The figure is the reason
for the method, not the other way round.

**Gaspari–Cohn, because a truncated Gaussian is not a covariance.** The correlation must
have compact support, or a measurement's influence never quite reaches zero and the
provenance saturates: measured over four cycles with an unlocalised Gaussian, measurement
owned at least 0.449 of *every* cell in the domain, including a corner the platform never
approached. But cutting a Gaussian off at a radius destroys positive definiteness, and
the system the analysis solves would stop being one any covariance could produce.
Gaspari–Cohn is compactly supported and positive definite, and a test builds both
matrices and watches the truncated one fail Cholesky while the tapered one factorises.
Compact support here is a claim about physics — beyond this distance a measurement
informs nothing — and never a computational shortcut: at this observation count a cutoff
buys no speed at all.

**The correlation is declared once, and the planner reads it.** The planner used to carry
a `footprint` block: a peak of 0.85, two exponential e-foldings and two hard ring
cutoffs. It was a hand-authored model of what an analysis does, written before there was
an analysis, and it disagreed with the arithmetic — the real collapse at an observed cell
is `σ²ᵦ/(σ²ᵦ+σ²ₒ)`, which for the declared deviations is 0.997. A planner scoring a
collapse at one scale while the analysis applies it at another is scoring a system that
does not exist. The block is gone; the planner reads the analyst's correlation and
derives the collapse from the analysis's own closed form.

**The ensemble is perturbed from the analysis error.** Every member used to start from
the identical initial state, so the ensemble's only divergence was the kernel's per-cell
noise growing as √lead — the published spread was a function of lead time with no spatial
structure whatever. The planner's observation-age field existed to supply the structure
the spread lacked. Perturbing each member by the error the analysis left is what makes
the spread mean *how well is this state known*, and it is what lets a measurement's
effect survive into the next cycle's gain. The age proxy is retired with it.

The generator keeps evaluating truth on its cadence. That is not a leak left behind but
the point: it is the reference the monitor scores against and what makes `|analysis −
truth|` computable and watchable. A gate holds that no component outside the permitted
four reads it, and one deliberate reading remains — the cold start, where the first
cycle of a scenario has no forecast to correct, recorded in the analysis manifest's
lineage rather than hidden.

## Consequences

The loop now learns, and it shows: over six thousand ticks the divergence count fell from
several to one, because a forecast corrected by what was measured breaches its threshold
far less often. Two tests had encoded the old behaviour — one waited for the sea to
breach twice inside the scheduler's minimum interval, one read a second published run
without asserting there was one — and both were rewritten to exercise what they were
about rather than what the ocean used to do.

Three masters were amended. `coverage-holding` and `holding-published` admit an
`analysis` era; `manifest`'s time-axis count falls from an unargued minimum of 2 to 1,
because an analysis is a correction at a single instant, and the bound now carries the
reason it never had.

Two things the maths does not let us claim, both stated rather than smoothed:

The observation weight is not confined to [0, 1]. Where a cell's background error greatly
exceeds the observed cell's, the gain extrapolates past the reading rather than averaging
toward it, and the prior shares go below zero to pay for it. That is optimal interpolation
behaving correctly, and perturbing the ensemble from `Pᵃ` makes it routine rather than
exotic — σ is now small where the boat has been and large where it has not, which is
exactly the configuration that produces it. It is reported unclamped and the Map states
the count, because a share silently clamped is a display telling a story the maths did
not.

And the departure share is a bookkeeping convention. Everything it holds came from the
archive — a forecast moves information without creating any — so it is credited by
relabelling the archive share at the moment the platform sails, and it is kept separate
because "how much of this did we know before we sailed" is worth answering, not because
the two are different in kind. The Background explainer says so on the step that
introduces it.

## Alternatives considered

**Explain the maths without building it.** The Background tab would have taught
background, innovation, gain and analysis beside a shell that did none of them. Rejected:
the tab's own frame is *the standards, and what it takes to use them honestly*, and an
explainer describing a step the system does not perform is the exact dishonesty this
harness exists to avoid.

**A stage inside the model runner.** Fewer moving parts, no new component, no new
configuration document. Rejected because the analysis would never be a holding: EDR could
not serve it, the Map could not draw it, Holdings could not list it, and the step the
whole feature is about would be invisible at the seam.

**Local analysis by observation selection** — for each cell, solve using only the
observations within its reach — which is guaranteed SPD as a principal submatrix and is
what many operational systems do. Rejected in favour of Gaspari–Cohn as the standard
answer to the localisation problem, keeping one global solve; at tens of observations
neither is meaningfully cheaper than the other, so the choice was made on which is easier
to argue rather than on cost.

**Two provenance bars rather than four.** Information-theoretically, everything traces to
either prior knowledge or measurement, and model error is not a source of information at
all. Rejected: the model share is what makes a measurement's share decay as its forecast
ages, and without it a cell measured once stays measurement-coloured for ever, however
stale. The departure bar was kept knowingly, with the admission above.
