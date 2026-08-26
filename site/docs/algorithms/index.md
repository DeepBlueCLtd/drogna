---
title: Algorithm derivations
---

# Algorithm derivations

Three pieces of mathematics in drogna are not obvious from the code, and this
section is where they get derived rather than gestured at. The test each page
has to pass is that a reader can follow it *without the source beside them*.

!!! warning "All three pages are stubs"

    None of the three algorithms has been implemented, so none of the
    derivations has been written. Each page below states the questions it will
    answer. That list is not filler: it is what the derivation is being written
    to settle, and it was drawn up before the implementation so that the
    implementation has something to be checked against.

| Derivation | Component | Status |
|---|---|---|
| [Ensemble spread](ensemble-spread.md) | [C-13 Model runner](../subsystems/c13-model-runner.md) | Stub |
| [Advection](advection.md) | [C-13 Model runner](../subsystems/c13-model-runner.md) | Stub |
| [Informative path planning](informative-path-planning.md) | [C-15 Planner](../subsystems/c15-planner.md) | Stub |

## A note on the mathematics being fake

drogna's numerics are deliberately not real. The advection is analytic, the
ensemble is small, and no part of it is a physical ocean model.

That does not make the derivations pointless, because the thing being derived is
not the physics. It is the *behaviour of the uncertainty*: how spread grows with
forecast horizon, how it collapses when a measurement arrives, how the collapse
propagates to nearby cells through the
[decorrelation timescale](../glossary.md#decorrelation-timescale), and how a
planner scoring routes against that field avoids paying twice for the same
information. Those are properties of the estimation, not of the fluid, and they
are as real in a fake model as in a true one.

Where a derivation depends on a physical assumption that drogna does not
actually make, the page will say so at that point rather than at the end.
