---
title: The tabs that are not part of the system
date: 2026-08-30
feature: specs/118-downstream-consumers
description: >-
  A simulator that samples an ocean and forecasts it can show every part of itself
  working and still never answer "so what". Three yellow tabs answer it — and the
  thing that proves they are genuinely consuming the forecast is that they refuse
  to recalculate when a new one arrives.
---

# The tabs that are not part of the system

## The background

A simulator can show every part of itself working and never answer *what would I do
differently if this were fresher?* A system that measures the world and also decides is
two systems; merging them hides the boundary an evaluator most wants to question.

## The requirement

Three notional systems consuming the forecast to reach a decision: unmistakably not part
of the simulator, and *checkably* consuming it rather than illustrating it.

## The options considered

**Build them elsewhere.** The cleanest boundary, rejected on the demonstration: the
moment worth showing is a forecast published in one tab and a recommendation going stale
in another.

**Keep them inside and mark them.** What was built — yellow, under a strip that cannot be
dismissed, declared in configuration so a fourth cannot arrive without it.
[ADR-0039](../../decisions/adr/0039-consumers-synthesise-their-own-inputs.md) settles the
conflict with drogna's rule against asserting what is not running: a consumer may
synthesise its own inputs, never drogna's, and says so.

**What makes it checkable.** A new forecast triggers no recalculation. The tab grows a
halo and waits; on the click, the previous answer stays as a ghost. If the recommendation
barely moves, that forecast was not decision-relevant. A tab faking its inputs would have
nothing to go stale.

## The demo

[Sampling](../../instances/main/#/view/sampling) — a hex grid coloured by observation
coverage, routed by value per mile. The grid covers what is in view, making fine
resolutions affordable; 3 hours against 24 changes the route's shape, not its length.

[Courses](../../instances/main/#/view/courses) — three classes of vessel that *may* be
present, each moving by its own model rather than a multiplier. Drag the weighting; the
ranking reorders.

[Feasibility](../../instances/main/#/view/feasibility) — no map, deliberately. Ten lanes
wearing their provenance, and the maximal feasible sets: *A and B, or B and C, never A and
C*.
