---
title: C-14 Publisher
---

# C-14 Publisher

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** make completed runs visible atomically; announce them.
**Owns the failure mode of:** partial visibility.

## What it does

When a model run finishes, the publisher makes it visible in one step and marks
it current. No reader ever observes a partially written field. It then announces
the new run as an event on the control namespace.

## Why atomicity is a component and not a detail

A gridded forecast is many files, or many variables in one file, written over a
period of time. Without an explicit publication step, a reader can arrive
halfway and get a field whose temperature is from the new run and whose salinity
is from the old one. Nothing errors. The values are all plausible. The
[sound speed](../glossary.md#sound-speed) derived from them is wrong in a way
that no validation catches.

That is the failure mode this component exists to own, and it is the reason the
publication step is a named component rather than the last four lines of the
model runner.

## Why it announces

Consumers subscribe to the announcement. Nothing polls the query layer asking
whether anything has changed, because the query layer has no notification
mechanism and polling it would be an invented one. The announcement is how the
control loop closes: the run that the [scheduler](c12-scheduler.md) decided on
becomes a fact that the [telemetry](c16-telemetry.md), the
[planner](c15-planner.md) and the [client](c18-browser-client.md) all hear about
at the same moment.

**Requirements:** FR-30, FR-31. **Feature:** 009.
