---
title: C-13 Model runner
---

# C-13 Model runner

!!! success "Status: built"

    - **Code:** `services/model_runner/` — `kernel.py` is the port, `analytic_kernel.py`
      the implementation behind it, and `ensemble.py` the perturbed members and their
      spread
    - **Delivered by:** `specs/009-control-loop`
    - **Covered by:** `services/model_runner/tests/`, including `test_kernel_port.py`
      for the boundary and `test_member_failure.py` for a member that dies, plus
      `tests/integration/test_runner_publisher_handoff.py`

**Responsibility:** analytic advection and noise; ensemble member runs.
**Owns the failure mode of:** being irreplaceable.

## What it does

It takes an initialisation state and produces a gridded forecast field. It does
this by [advecting](../glossary.md#advection) the seeded features forward
analytically and adding noise. It runs a small ensemble with perturbed initial
conditions and emits the [ensemble spread](../glossary.md#ensemble-spread) as an
uncertainty field alongside the forecast.

It does not implement real numerics, and it is not trying to. The numbers are
deliberately fake.

## Why "being irreplaceable" is the failure mode

This is the one component in drogna that is certain to be thrown away. Any real
version of this architecture would put an actual ocean model here. So the whole
value of building it is in the shape of the hole it leaves behind: initialisation
state in, gridded field out, and nothing else crossing the boundary.

A model runner that quietly acquired a dependency on the observation store, or
that wrote its output somewhere only it knew about, or that needed to be told
about the scenario in a way the interface did not express, would be a component
that could not be swapped. That is what the failure mode names. The interface
here is one of the four genuine ports, and it is genuine precisely because the
second implementation is not hypothetical.

## The ensemble

The ensemble is small — this is a harness, not a forecasting centre — and its
purpose is not accuracy. It is to produce an uncertainty field that behaves like
a real one: larger where the initial state was less constrained, larger further
into the forecast, and structured rather than uniform.

**Requirements:** FR-28, FR-29. **Feature:** 009.
