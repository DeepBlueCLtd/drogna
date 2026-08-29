---
date: 2026-08-27 09:00:00
categories:
  - Feature
slug: the-mean-of-magnitudes
feature: specs/010-telemetry-quality
description: >-
  A component published a count and a mean of its errors. Downstream needed a
  bias, an RMS and a skill score. None of the three survives that summary, and
  nothing in either component would have said so.
---

# The mean of magnitudes

drogna's telemetry component exists to answer one question: is the forecast any
good? It answers it by comparing what the model predicted against what the sensors
measured, and — crucially — against what you would have got by assuming nothing
changed. That last comparison is the one that matters. A forecast that beats
*persistence* has earned its compute; one that does not is an expensive way of
saying "much as before".

To do that it consumes what the monitor already publishes. And the monitor
publishes this:

```json
{
  "kind": "residual-summary",
  "scored": 1184,
  "exceeding": 12,
  "outside_domain": 3,
  "shed": 0,
  "mean_absolute_m_per_s": 1.37
}
```

A count, and a mean of the magnitudes. It is a perfectly sensible thing to
publish. It answers "how wrong are we, roughly?" in one number, it costs nothing
to compute, and it is what almost anyone would write.

It also makes three of the four figures telemetry needs impossible to compute, and
neither component contains anything that would tell you so.

<!-- more -->

## What does not survive

**Bias is gone, and it went first.** Bias is the *signed* mean: it tells you the
forecast runs warm or runs cold. `mean_absolute_m_per_s` is the mean of `|r|`, and
the absolute value is applied before the averaging. A forecast that is 1.4 m/s too
warm everywhere and a forecast that is 1.4 m/s too warm in half the domain and 1.4
too cold in the other half produce the identical number here. The first has a bias
of +1.4 and is a calibration error you could correct in an afternoon. The second
has a bias of 0 and is a structural problem. The summary cannot distinguish them,
because the sign was discarded at the point of measurement and there is no
arrangement of downstream arithmetic that brings it back.

**RMS is gone, for a different and more fundamental reason.** Root-mean-square
needs the second moment — the mean of `r²` — and you cannot recover a second moment
from a first. This is not a limitation of the format; it is that the mapping is
not injective. Infinitely many error distributions share a mean absolute value and
have wildly different RMS. Averaging is lossy in the way that matters: it is a
projection, and what it projects away does not come back.

**Skill is gone, and it was never close.** The skill score is

```
skill = 1 − MSE(model) / MSE(persistence)
```

which needs two mean-squared errors, so it inherits the RMS problem twice over.
Worse, it needs the *persistence* error, which means scoring each measurement
against the reference field — the field that was current just before the latest
forecast landed. That is a per-measurement operation. A summary has already thrown
away the individual measurements, so there is nothing left to score.

Of the four things telemetry wanted, exactly one survives the summary: the count.
And the mean magnitude itself, which is a real number about a real thing, just not
any of the ones being asked for.

## The interesting part is that nothing breaks

Here is what makes this worth writing down rather than just fixing.

If nobody notices, the system works. The monitor publishes correctly. Telemetry
receives correctly. The schema validates. Every test passes. A skill score appears
on a dashboard, and it is a number, and it is wrong — not wrong in the sense of
miscalculated, but wrong in the sense that no calculation could have produced it
from the available inputs, so whatever produced it was reaching for a value that
was not there.

That is the failure mode drogna is arranged against, and it is why the
constitution has a principle that ground truth is *scored, not assumed*. The
component could have divided the numbers it had and published something. It would
have looked exactly like the truth.

Instead the accumulator carries this:

```python
class Basis(StrEnum):
    """Which inputs an aggregate was built from, and so which figures it can support."""

    NONE = "none"
    SAMPLES = "samples"
    SUMMARIES = "summaries"
    MIXED = "mixed"
```

Four states, and the whole design is in the docstring's second clause. An aggregate
knows what it was built from, and therefore what it is entitled to claim. Fed
per-measurement samples, it reports `samples` and every figure is available. Fed
summaries, it reports `summaries`, publishes the count and the mean magnitude, and
returns **null** for bias, RMS and extremes — not zero, not a placeholder, not a
best guess. Null, with a state saying why.

`MIXED` is the state that shows the design was taken seriously. If a scope receives
some samples and some summaries, the aggregate is neither one thing nor the other,
and pretending otherwise would be the same error in miniature. It says so.

A test pins the behaviour, and it is the sort of test that only gets written if
somebody decided the gap mattered:

```
test_a_summary_yields_a_count_and_a_mean_magnitude_and_null_moments
```

## Whose bug is it?

Nobody's, which is the point.

The monitor's summary is not wrong. Reset at each forecast-run boundary, a count
and a mean magnitude is a reasonable thing for a component to say about itself, and
it was designed before anything downstream wanted a bias. The telemetry
component's requirements are not wrong either. What is wrong is the seam, and the
seam is invisible from either end: the monitor cannot see what will be asked of its
output, and telemetry cannot see that what it is receiving is a projection rather
than a sample.

Summarising is a design decision about *which questions remain answerable*, and it
is almost always made implicitly, by whoever writes the producer, at a moment when
the consumer does not exist yet. `mean(|r|)` versus `sum(r)`, `sum(r²)` and `n` is
three numbers against one, and the second set answers every question the first does
plus bias, plus RMS, plus everything derived from them. The cost is two more floats
per summary. That is the entire trade, and it is invisible unless someone states it.

So the contract now carries the shape for the day the monitor emits it:

```
residual-sample: position, depth, signed residual, measured sound speed, run id
```

Signed, and per-measurement. Until then, half of one user story and the whole of
another are exercised from fixtures rather than from live traffic — and that
sentence is in the feature's report, in the schema description, and now here,
rather than being quietly true and unmentioned.

The number is not available yet. The system says so. That is the feature working.
