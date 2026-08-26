---
title: C-05 Ingest client
---

# C-05 Ingest client

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** validate and batch-write; the single ingestion seam.
**Owns the failure mode of:** ingest backpressure.

## What it does

It subscribes to the observation namespace, validates each message against its
schema, batches, and writes to the observation store. It is the only thing that
writes observations. Nothing else has credentials to.

## Why a single seam

Because "the only way in" is a property that can be tested, and "mostly the only
way in" is not. Every guarantee about what the store contains — that the units
are the declared units, that the quality flags are present, that the timestamps
came from the simulation clock — holds only if there is one place where those
guarantees are applied.

It is also the only honest place to observe backpressure. When the broker
delivers faster than the store accepts, something has to notice and say so. If
writes are spread across several components, the pressure appears in several
places at once and none of them has the whole picture.

## What it deliberately is not

It is not an abstraction over intake with a pluggable interface. The requirements
document is explicit that observation intake is aspirational as a port rather
than real: there is one implementation and there is not a second one in
prospect. Wrapping it in an interface would claim pluggability the system does
not have, which is a rule drogna takes seriously enough to require a written
argument before breaking it.

**Requirements:** FR-17, FR-18. **Feature:** 007.
