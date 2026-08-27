---
title: C-15 Planner
---

# C-15 Planner

!!! success "Status: built"

    - **Code:** `services/planner/` — `value.py`, `collapse.py` for the simulated
      collapse of uncertainty along a route, `select.py` for the prize-collecting
      selection, `projection.py` for the forward growth, and `commitment.py` for the
      receding horizon
    - **Delivered by:** `specs/011-adaptive-planner`
    - **Covered by:** `services/planner/tests/`, including `test_optimality_gap.py` and
      `test_selection_determinism.py`, plus
      `tests/integration/test_planner_replans_on_new_field.py` and
      `tests/integration/test_plan_carries_no_instruction.py`, which asserts the
      boundary described below rather than trusting it

**Responsibility:** adaptive sampling recommendations.
**Owns the failure mode of:** crossing into tactical advice.

## What it does

It reads the uncertainty field and works out where sampling would reduce it
most, then emits a route. The interesting part is that it simulates the
*collapse* of uncertainty along each candidate route as that route is traversed,
so the value of a distant objective decays as nearer sampling resolves the same
thing. Without that, a planner recommends every high-uncertainty cell
independently and produces a route that visits the same information twice.

It replans on a receding horizon as measurements arrive, and it projects
uncertainty growth forward so that it can report when a region *will* fall below
usable confidence — which makes the output schedulable rather than merely
reactive.

The route selection problem is treated as orienteering, or prize-collecting: a
budget is spent on the cells worth visiting. It is explicitly not a
travelling-salesman problem, because nothing requires every cell to be visited
and treating it that way produces long routes that acquire nothing.

## The boundary it defends

The planner emits recommendations. It does not command, does not task, and does
not advise a human directly. Rendering and advice happen downstream.

This is a line worth stating precisely, because it is easy to state loosely.
Computing where sampling would most reduce uncertainty *is* decision logic, even
when nothing ever draws it. The boundary being defended is not "does the system
decide" — it does — but *who recommends*: the system produces a recommendation,
and a human elsewhere decides what to do with it.

**Requirements:** FR-32 to FR-36. **Feature:** 011. See also the derivation of
[informative path planning](../algorithms/informative-path-planning.md).
