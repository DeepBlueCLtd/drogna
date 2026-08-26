---
title: Ensemble spread
---

# Ensemble spread

!!! warning "Stub — the derivation is not written"
    The [model runner](../subsystems/c13-model-runner.md) does not exist, so the
    uncertainty field it emits does not exist either. This page records what the
    derivation will have to answer.

[Ensemble spread](../glossary.md#ensemble-spread) is drogna's estimate of
forecast uncertainty: run the model several times from perturbed initial
conditions, and take the disagreement between members, point by point, as the
uncertainty at that point.

During cold arrival — a vessel entering a region with no local observations —
spread is the *only* source of uncertainty structure, because observation age is
spatially uniform and therefore carries no information at all. Everything is
equally unobserved, so age cannot distinguish anywhere from anywhere else.

## Questions this derivation will answer

1. **What are the initial conditions perturbed with, and why that?** A
   perturbation drawn independently per grid cell produces noise that the model
   smooths away within a step, and spread that collapses for the wrong reason.
   A spatially correlated perturbation is required, and the correlation length
   has to be justified against the scale of the seeded features.
2. **How many members, and how is that number defended?** The standard deviation
   of a small sample is itself a noisy estimate. The derivation has to state the
   sampling error in the spread at the chosen member count, so that a change in
   the uncertainty field can be told apart from a change in the estimate of it.
3. **How does spread grow with forecast horizon?** In a real model, growth comes
   from the dynamics. In an analytic advection model there are no dynamics to
   grow it, so growth must be authored. The derivation has to give the growth law
   and say plainly that it is prescribed rather than emergent.
4. **What does spread *not* capture?** Members sharing a systematic error agree
   with one another and are confidently wrong together. The derivation has to
   name the errors drogna's ensemble is structurally blind to, because the
   client will render this field as "uncertainty" and that word implies more
   than the field contains.
5. **How does spread combine with observation age during loiter?** Once sampling
   begins, the uncertainty field must reflect both spread and the staleness of
   observations, weighted by the local
   [decorrelation timescale](../glossary.md#decorrelation-timescale). The
   combination rule is the load-bearing step, and it decides the revisit cadence
   the [planner](../subsystems/c15-planner.md) produces.
6. **How is the whole thing scored?** The spread claims to predict where the
   forecast will be wrong. Whether it does is measurable against the ground-truth
   manifest, and the derivation has to say how.
