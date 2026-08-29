---
title: Algorithm derivations
order: 50
---

# Algorithm derivations

Three pieces of mathematics in drogna are not obvious from the code — how
[ensemble spread](../glossary.md#ensemble-spread) is arrived at, what
[advection](../glossary.md#advection) does and does not do, and how a route is
chosen — and this section is where they get derived rather than gestured at. The
test each page has to pass is that a reader can follow it *without the source
beside them*.

All three are written. Each derivation states the problem before the method,
derives what the code actually does rather than what the requirements asked for,
and is explicit about the parts that do not do what their names imply.

| Derivation | Component | Status |
|---|---|---|
| [Ensemble spread](ensemble-spread.md) | [C-13 Model runner](../archive/subsystems/c13-model-runner.md) | Written |
| [Advection](advection.md) | [C-13 Model runner](../archive/subsystems/c13-model-runner.md) | Written |
| [Informative path planning](informative-path-planning.md) | [C-15 Planner](../archive/subsystems/c15-planner.md) | Written |

Each page ends with a table of the files it was derived from, so a reader who
wants the source can find it without searching, and a reader who suspects the page
has drifted from the code knows where to check.

## A note on the mathematics being fake

drogna's numerics are deliberately not real. The advection is analytic, the
ensemble is small, and no part of it is a physical ocean model.

That does not make the derivations pointless, because the thing being derived is
not the physics. It is the *behaviour of the uncertainty*: what the spread is made
of, how it collapses when a measurement arrives, how the collapse propagates to
nearby cells through the
[decorrelation timescale](../glossary.md#decorrelation-timescale), and how a
planner scoring routes against that field avoids paying twice for the same
information. Those are properties of the estimation, not of the fluid, and they
are as real in a fake model as in a true one.

It does mean the derivations have to be blunt about where the fakeness shows
through, and they are. The spread does **not** grow with forecast horizon, because
there are no dynamics to grow it and no growth law was authored in their place;
the ensemble spread page measures that and says so. Nothing rotates or deforms;
the advection page says so. Where a derivation depends on a physical assumption
drogna does not actually make, the page says so at that point rather than at the
end.

## A note on notation

None of the three pages uses mathematical notation. The site serves no renderer
for it — the reasoning is in [Site tooling](../decisions/index.md) — so
formulas appear as fenced blocks in the form the source states them, and
everything else is prose and tables. That constraint turned out to cost these
three derivations very little: what needed writing down was a regrowth law, a
sensing kernel and five lines of displacement arithmetic, and all three read
better as code than as notation for the audience this site is written for.
