---
title: C-17 Offload packager
---

# C-17 Offload packager

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** export with an integrity guarantee.
**Owns the failure mode of:** premature eviction.

## What it does

It packages data for transfer off the system as NetCDF following the
[CF conventions](../standards/cf-conventions.md), with an integrity guarantee
attached, so that the receiving end can establish that what arrived is what was
sent.

## Premature eviction

The failure mode it owns is deleting the local copy before the transfer is
confirmed. This sounds like a trivial ordering bug and is in fact the central
design constraint: an offload packager that reports success on write rather than
on confirmed receipt will, on the day the link drops mid-transfer, lose data
that cannot be regenerated.

The integrity guarantee is what makes confirmation possible. Without it,
"confirmed" means "the bytes stopped arriving", which is indistinguishable from
a truncated transfer.

## Why the format matters here

An export is the point at which data leaves the system's own conventions and has
to stand on its own. A CF-conforming NetCDF file carries its own units, its own
coordinate definitions and its own description of what each variable means. A
file whose meaning depends on documentation held elsewhere is a file that will
be misread.

This is also one of the two tested leakage paths: NetCDF global attributes are
a natural home for provenance — paths, usernames, software versions — and
reviewing them by eye is not a control.

**Requirements:** FR-43, FR-44. **Feature:** 014.
