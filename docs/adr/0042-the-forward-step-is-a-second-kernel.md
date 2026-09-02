# ADR-0042: the forward step is a second kernel, and it becomes the default

**Status:** Accepted
**Date:** 2 September 2026
**Feature:** 123 (the forward step, and what a run costs)
**Requirements:** SRD-v2 FR-109, FR-112, FR-113; §2.2's kernel port
**Engages:** Constitution VI (honest ports); Constitution II and AT-04 (byte-identical
replay); ADR-0040 (a run arrives by having run); the feature-116 rule that a run
initialises from the analysis and never from the true field

## Context

§2.2 has listed the **model kernel** among drogna's genuine ports since V2 began —
"initialisation state in, gridded field out", with more than one conceivable
implementation. There has only ever been one: `shift-advect-v1`, which displaces the whole
field rigidly at a configured velocity, samples the initial state at the displaced cell
with edge clamping, and adds per-cell noise whose deviation grows as the root of the lead.

Constitution VI says the documentation claims exactly the pluggability that exists. On the
letter of it the port was honest — the interface is narrow, the runner holds only the
interface, and a V3 numerical model plugs into it. On the spirit of it the claim was
untested: no second implementation had ever been written against that interface, so nobody
knew whether it was a port or a description of the one function behind it.

There is a second problem, and it is the one the companion requirements document names.
Advection is not a forecast. It slides a field sideways rather than propagating a state:
the field at lead six is the field at lead zero, moved and blurred. Every requirement above
that says "forecast" has been doing more work than the code beneath it, and the harness
cannot demonstrate the mechanism an operator most needs explained.

## Decision

**A shallow two-layer advection–diffusion step is written as a second implementation behind
the unchanged port, and becomes the configured kernel. `shift-advect-v1` stays registered
and stays tested.**

Three parts, each of which was arguable.

### It goes behind the existing port, and the port does not move

The port is not redesigned to accommodate it. The new kernel's parameters arrive in an
**optional** block on `KernelParameters`, and the kernel refuses by name when that block is
absent — the idiom the runner already uses when it is handed a kernel name it does not
know. `shiftAdvectKernel` is not edited at all.

This is the test, and it is deliberately a strict one: **if the interface has to be bent to
fit the newcomer, that is the finding.** A port that needs widening for its second
implementation was a description of its first, and Constitution VI would then require the
documentation to say so rather than the interface to be quietly reshaped.

### The new kernel becomes the default rather than an alternative

The three options were: default, chosen per start condition, or tunable from the operator
plane. The last two both put two kernels in one run history, and every comparison feature
124's surface will draw — this run against the last, this source's contribution then and
now — would carry an invisible extra variable. One forecast in the harness, and it is the
honest one.

`shift-advect-v1` is nonetheless **not retired**. Two reasons, and the second is the one
that matters. It is the demonstration that the port is real: a port with one implementation
is a claim about pluggability, a port with two is a fact about it. And its tests are the
ones that catch the port's interface being bent — they are written against the interface as
it was, and they fail if it changes underneath them.

### The features are forecast as features, from the analysis

The seeded eddy, front, thermocline and drifting feature are published with their
parameters and a growing uncertainty, per forecast step, and scored against the manifest's
ground truth. A forecast that publishes only a field makes no falsifiable claim about next
week; it draws a picture of it.

Their parameters are **estimated from the analysis the run initialises from**, and from
nothing else. Reading them out of the manifest would be a forecast made from the truth —
the exact fault feature 116 found and fixed, when the runner initialised from a now-cast
the generator had evaluated from the true ocean and nothing the platform measured ever
reached a forecast. That fault is recorded in the runner's own head comment and in a blog
entry, and it is the one this decision is most at risk of reintroducing.

## Consequences

**Every published field changes.** The committed snapshots regenerate and
`check-snapshot-drift` fails until they do. That is the gate working, and the diff is read
before it is committed rather than accepted as churn (ADR-0041).

**Replay must survive it.** The kernel is a pure function of state, parameters and its
seeded stream, so AT-04's byte-identical claim holds by construction — and is checked by
`pnpm replay-proof` rather than argued.

**The estimators are the risk, and it is a real one.** Four estimators over a noisy ensemble
mean at a coarse grid is signal processing, not plumbing; the front and the thermocline are
the two expected to be difficult. The discipline is stated in advance because it is easy to
break under pressure: an estimator that will not score honestly is **reported as not done**,
never rescued by widening its bound until it passes (Constitution IX).

**A V3 numerical model now has a worked example of the seam it plugs into**, which is the
thing the port was declared for and had not yet been asked to do.
