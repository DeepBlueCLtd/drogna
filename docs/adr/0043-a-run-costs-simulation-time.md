# ADR-0043: a run costs simulation time, and the loop is not becalmed by it

**Status:** Accepted
**Date:** 2 September 2026
**Feature:** 123 (the forward step, and what a run costs)
**Requirements:** SRD-v2 FR-114, FR-115, FR-116; answers the companion document's Q2
**Engages:** Constitution I (no wall-clock time — a third exemption declined); Constitution
II and AT-04 (byte-identical replay); SRD-v2 FR-31 (the loop shall not be permanently
becalmable) and FR-32 (three facts, never one appearance); ADR-0006 and ADR-0007, the two
exemptions that stand

## Context

The insight the companion requirements document exists for is that **a forecast that takes
minutes is not an engineering embarrassment to be optimised away; it is a planning problem
the operator owns.** The vessel chooses when to spend the compute — on passage, in quiet
water, before a decision point — and the system's job is to make need and cost legible
together.

Two questions follow, and the document left both open. What is the cost figure made of? And
what does the scheduler do with it?

The first is constitutional. Principle I permits exactly two wall-clock exemptions —
heartbeat liveness (ADR-0006) and render-path interpolation (ADR-0007) — and says a third
"must be argued on its own merits, never by analogy". The document's FI-09 asked for one:
let the kernel report the wall-clock duration a run actually took, because "a forecast that
is expensive in the real system and free in the harness would teach the wrong lesson".

## Decision

### The exemption is declined, and cost is simulation time

**No third exemption.** A host-clock duration is a fact about the machine the tab happens to
be open on. Admitting one puts a figure inside a run that differs between two replays of the
same manifest, and AT-04's byte-identical claim in its strong form — components in lockstep,
byte-for-byte across every store and every seam crossing — is the one property that cannot
be retrofitted at acceptable cost. Principle I stays at two.

Instead: the kernel reports the **work** a run covers, configuration declares a **rate**, and
the cost is their quotient, in ticks. Deterministic, replayable, and a property of the run
rather than of the machine.

What is given up is stated rather than glossed: the magnitude is a declared rate and not a
measurement. §8 of the companion document had already conceded exactly this — the harness
demonstrates that cost is *in the domain model*, and the magnitude is a matter for the afloat
appliance.

### A run occupies the ticks

The alternative was to state the cost beside a run that remains instant. It was rejected
because it makes a run held for cost impossible to believe in: if nothing is ever actually
occupied, the hold is a label on a fiction, and FI-09's own words forbid a cost "hidden
behind a spinner". So the runner announces the start, integrates, and publishes when the
ticks are spent.

### One publisher

The model runner is the sole publisher of a run's cost. A figure in the scheduler's
configuration would be a second copy of something the runner owns, able to disagree with it —
the fault class this repository keeps finding, most recently in the timeline's hand-written
lane list that feature 116's new era never reached. A gate holds it: no component but the
runner declares a cost, watched failing against a planted figure.

### The hold runs the opposite way to the obvious reading

**This is the part worth keeping.** The first formulation was: a run is affordable when it
fits inside the standing forecast's remaining validity. It was accepted in the interview and
is wrong, and reading it against FR-31 is what showed why.

The cadence floor fires **precisely when** the current run's validity has lapsed. At that
instant the remaining validity is zero, so no run of any cost fits inside it, so no run is
ever affordable, so nothing ever runs again — the permanently becalmed loop FR-31 was written
to forbid, and which `spikes/watched-turn/FINDING.md` has already watched happen once for a
different reason.

Inverted, the same figure is a real planning behaviour. **A warranted run is held while the
standing forecast still has more life than the run costs** — there is no need to spend the
compute yet — and is released when the remaining validity falls to the cost plus a declared
margin, so the new run lands as the old one lapses. The hold cannot becalm the loop: it
releases as validity decays, and the cadence floor still backstops it.

### A divergence is never held

A hold is a bet that the standing forecast is still worth something. A divergence is the
world saying it is not: the observations have contradicted it, and its nominal remaining
validity is worthless. Scheduled runs and reader prompts wait; a divergence does not.

A reader's prompt being held is not an oversight but the demonstration — FR-116 has the
operator committing a run *against the stated cost*, and a prompt that is held is the surface
saying what that cost buys and when.

## Consequences

**Four facts where FR-32 asked for three.** Held for cost joins declined by the minimum
interval, declined as a duplicate, and nothing requested — each with its own appearance and
the shortfall in ticks named, never one appearance for two states.

**The becalm test is not optional.** A test plants a held run, advances the clock past the
standing forecast's validity, and asserts the run is requested. Written because the design
almost shipped with the fault, not because the fault was hypothetical.

**The pre-roll and the snapshots move.** A run occupying ticks changes what a start
condition's legs leave behind; the feature-120 test that holds each card's prose to its legs
is the one that will say so.

**Cost realism is still not claimed.** The rate is declared. Anyone reading the number as a
prediction of what the afloat appliance will take is reading it wrongly, and the surface says
so where a reader meets it (FR-106).
