---
title: C-08 Coverage store
---

# C-08 Coverage store

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** gridded forecast and uncertainty fields.

## What it does

It holds model output: gridded forecast fields and the matching uncertainty
fields, written as NetCDF following the
[CF conventions](../standards/cf-conventions.md). One model run produces one
set of files; the store keeps several runs and knows which is current.

## The cataloguing convention

The requirement that shapes this component is that a new model run must become
servable *without editing collection configuration*. The naming and directory
convention has to carry enough information — run identifier, valid time,
variable — for the [query layer](c09-query-layer.md) to discover a new run
rather than be told about it.

This sounds like a filing preference and is actually the difference between a
control loop that closes and one that needs a human in it. If publishing a run
requires a configuration edit, the sense → decide → act → publish cycle stops at
"act" and waits.

## Why the output is a port

NetCDF today, Zarr plausibly later. This is one of
the four boundaries drogna is willing to call a genuine port, because a second
implementation is actually conceivable rather than theoretically conceivable.
The bespoke trajectory provider described under the
[query layer](c09-query-layer.md) sits behind this same port.

**Requirements:** FR-21, FR-29, FR-30. **Feature:** 008.
