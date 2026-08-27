# Forecast skill, residual statistics and the persistence reference

The telemetry component (C-16) publishes two families of number: running statistics of the
residuals the monitor has already computed, and a forecast skill score against a persistence
reference. Both are defined here so that a reader can check them rather than believe them,
which is what Constitution IX asks of every claim the harness makes about itself.

## The residual

The residual is defined on **sound speed**, and only on sound speed:

    residual = measured sound speed − forecast sound speed        [m/s]

Both terms come from the single implementation in `libs/harness_core/soundspeed.py`
(ADR-0005). Sound speed is derived at the point of use and is never published and never
stored, so there is no sound-speed datastream to read instead and no second copy of the
equation anywhere in the harness. The residual is signed: a bias and a scatter are different
faults, and averaging magnitudes hides the first.

## Incremental moments

Memory must not grow with the number of samples or the length of the scenario (FR-003), so
nothing is retained. Each residual updates a fixed set of counters by Welford's recurrence:

    n     ← n + 1
    δ     ← x − mean
    mean  ← mean + δ / n
    M₂    ← M₂ + δ · (x − mean)

The mean is the bias. The root mean square is recovered from the second central moment
rather than from a running sum of squares, because the deviation form does not lose precision
when the residuals are small and the mean is not:

    variance   = M₂ / n
    mean square = variance + mean²
    RMS        = √(mean square)

Extremes are two more scalars. The whole aggregate for one scope is eight numbers regardless
of how many residuals passed through it, which is the property SC-002 measures.

### What a summary cannot support

A per-residual report carries the signed difference, so it supports every moment above. A
producer's *interval summary* carries a count and a mean of **magnitudes**, which supports a
count and a mean magnitude and nothing else: a mean of magnitudes is not a bias, and a second
moment cannot be recovered from a first. An aggregate fed any summary therefore reports null
for the moments it cannot honestly claim and says why through its `basis` field. Publishing a
zero where a number is unknown is the failure this component exists to prevent.

## The persistence reference

The persistence reference is the forecast field that was current **immediately before the
latest publication**, held constant. That is the claim that conditions stay the same, and it
is the claim a forecast has to beat before it is earning its compute.

It moves only at a publication boundary. Until a second run has been published there is
nothing prior to hold, and the reported state is `insufficient-reference` — not a zero, and
not a comparison of a field with itself. The reference is read through the coverage read
port, which is the same route the monitor takes for the current field; the query layer is the
external read path and telemetry is inside the boundary, so no request is made to it at all.

## Skill

Each measurement is scored twice over the same sample set — once against the current forecast
and once against the held reference — and reduced to two mean-square errors:

    MSE_model       = Σ (measured − forecast)²  / n
    MSE_persistence = Σ (measured − reference)² / n

The score is the conventional form:

    skill = 1 − MSE_model / MSE_persistence

A measurement the reference does not cover is scored against neither field, so every sample
in one error is present in the other and the ratio compares like with like.

The score is published together with both errors, the sample count, the minimum sample count
that was applied, and the formula itself, so the arithmetic a reader checks is the arithmetic
that was done.

### What the states mean

| State | When |
|---|---|
| `beating-persistence` | `MSE_model < MSE_persistence` |
| `not-beating-persistence` | `MSE_model ≥ MSE_persistence`, including equality |
| `insufficient-samples` | fewer scored measurements than the configured minimum |
| `insufficient-reference` | only one field has ever been published |
| `reference-without-error` | `MSE_persistence = 0`, so the ratio has a zero denominator |
| `no-forecast` | nothing has been published at all |

Only the first two carry a score. In every other state the score, both errors and the ratio
are absent: no default, no zero, and no value carried forward from when there was one. Those
three are the ways a quality figure quietly becomes a decoration, and all three are refused.

A losing score is published as computed. There is no smoothing, no floor and no
minimum-quality gate, and the message carries the plain-language sentence that goes with the
state so that every consumer says the same thing about a run that is not earning its compute.

## Freshness

Every published figure carries the simulation instant of its last **real** update and a
freshness state. A statistic is `fresh` while that instant is within the configured staleness
window and `stale` thereafter; republishing a statistic does not refresh its timestamp, which
is what makes staleness detectable at all. The stale span reported on recovery is measured
from the moment the window expired, not from the last update, so an outage is not overstated
by the width of the window.

Every interval here is simulation time (Constitution I). The single real-time exemption
ADR-0006 carries covers heartbeat emission and liveness evaluation, and ageing a statistic
towards `stale` is neither: a paused clock stops the residual stream and stops the ageing
with it.
