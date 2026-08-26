---
title: Informative path planning
---

# Informative path planning

!!! warning "Stub — the derivation is not written"
    The [planner](../subsystems/c15-planner.md) does not exist. This page records
    what the derivation will have to answer.

The planner's job is to choose where to sample next. The naive version scores
every cell by its uncertainty and sends the vessel to the highest, which fails
immediately: the second-best cell is usually right beside the best one, and
sampling the first resolves the second for free. Scoring cells independently
means paying twice for the same information.

The correct formulation scores *routes*, and simulates the collapse of
uncertainty along a route as it is traversed, so that a distant objective's value
decays as nearer sampling resolves it.

## Questions this derivation will answer

1. **What is the objective function?** Expected reduction in uncertainty, over
   what region, over what horizon, subject to what budget. Each of those choices
   changes the behaviour visibly, and the diminishing-returns property has to
   fall out of the objective rather than being bolted on afterwards.
2. **How does uncertainty collapse when a sample is taken, and how far does the
   collapse spread?** A measurement at a point reduces uncertainty in a
   neighbourhood, and the size of that neighbourhood follows the local
   correlation structure — spatially, and in time through the
   [decorrelation timescale](../glossary.md#decorrelation-timescale). This is the
   step that makes the whole thing work or not work.
3. **Why orienteering and not travelling salesman?** The problem is to choose
   which cells are worth visiting under a budget, not to visit all of them in the
   best order. Treating it as a tour produces long routes that acquire little.
   The derivation has to state the budget and the prize function explicitly.
4. **Why H3 for the horizontal, layered with a separate depth index?** Hexagonal
   cells have uniform neighbour distances, which matters when the score of a cell
   depends on its neighbours. Depth is indexed separately because the vertical
   correlation structure is nothing like the horizontal one — a
   [thermocline](../glossary.md#thermocline) makes two depths a few metres apart
   almost independent.
5. **How is uncertainty growth projected forward?** The planner must report when
   a region *will* fall below usable confidence, not only where it is bad now.
   That projection is what makes the output schedulable rather than reactive, and
   it depends on the growth law from the
   [ensemble spread derivation](ensemble-spread.md).
6. **How does replanning on a receding horizon avoid oscillation?** Replanning as
   each measurement arrives can produce a vessel that changes its mind
   continuously and goes nowhere. Whatever commits the route — hysteresis, a
   commitment horizon, a switching cost — has to be derived and its effect on the
   objective stated.
7. **Where is the line between a recommendation and a decision?** The planner
   emits recommendations only. Computing where sampling would most reduce
   uncertainty is itself decision logic even when nothing draws it, so the
   derivation has to be explicit about which outputs are recommendations and
   which would cross into advising a human directly.
