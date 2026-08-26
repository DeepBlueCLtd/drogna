---
title: Advection
---

# Advection

!!! warning "Stub — the derivation is not written"
    The [model runner](../subsystems/c13-model-runner.md) does not exist. This
    page records what the derivation will have to answer.

[Advection](../glossary.md#advection) is the whole of drogna's forecast model:
the seeded features are carried forward along a velocity field, noise is added,
and the result is published as the next forecast. There is no physics beyond
transport.

The honest framing is that this is not a model of the ocean. It is a mechanism
for producing a field that changes over time in a structured, reproducible way,
so that the [monitor](../subsystems/c11-monitor.md) has something to diverge
from and the [planner](../subsystems/c15-planner.md) has something to chase.

## Questions this derivation will answer

1. **Which advection scheme, and what does it cost in accuracy?** Semi-Lagrangian
   back-tracing is stable at long time steps and diffuses; a straightforward
   Eulerian scheme is cheap and unstable above a Courant limit. The choice
   changes what the uncertainty field looks like, so it has to be argued rather
   than defaulted into.
2. **What velocity field carries the features, and where does it come from?**
   The [environment generator](../subsystems/c02-environment-generator.md)
   records a drift velocity for the moving feature. Whether the background water
   also moves, and whether the velocity is steady, is a scenario decision with
   visible consequences for the revisit pattern.
3. **How does a rotating feature advect?** A [mesoscale
   eddy](../glossary.md#mesoscale-eddy) both translates and turns. Advecting its
   centre is easy; advecting its internal structure without smearing it over
   several forecast cycles is the actual problem, and it is what determines
   whether the eddy is still recognisable — and therefore still recoverable —
   after several runs.
4. **What does the noise represent, and how is it seeded?** Noise added after
   advection stands in for everything the model does not do. It must be
   reproducible from the run seed, spatially correlated rather than
   pixel-independent, and small enough not to swamp the features it is added to.
5. **How does the decorrelation timescale field advect with a moving feature?**
   The timescale is a field authored per feature, and a feature that moves takes
   its timescale with it. Advecting a derived field alongside the state it
   describes, consistently, is the step most likely to be got subtly wrong.
6. **What is the divergence threshold in terms of this model?** The
   [monitor](../subsystems/c11-monitor.md) fires at roughly half a degree Celsius
   equivalent of [sound speed](../glossary.md#sound-speed) residual. How long a
   purely advective forecast takes to drift that far determines the natural
   period of the control loop, and that number should be derived, not discovered
   by watching it.
