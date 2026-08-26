---
title: C-06 Observation store
---

# C-06 Observation store

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

**Responsibility:** persist point observations.

## What it does

Postgres with PostGIS, holding point observations: position, depth, simulation
time, [observed property](../glossary.md#observed-property), value, unit,
quality flag, and the [datastream](../glossary.md#datastream) the reading
belongs to. It is the punishing write path — many small inserts arriving
continuously — as opposed to the read-mostly reference data next door.

## Why it shares an instance with the feature store

The observation store and the [feature store](c07-feature-store.md) are two
schemas in one Postgres instance. The conceptual split is real and worth
preserving in the schema names; the operational split is not worth two
instances, two backup stories and two sets of connection configuration in a
system meant to start with one command.

## Why it is not a port

Postgres is not being swapped for anything. An interface over it would have
exactly one implementation, would exist to look tidy, and would make the code
harder to read in exchange for a flexibility nobody intends to use. drogna
names the boundaries that are genuine ports — the model kernel, the coverage
output, the clock, the RNG — and refuses to dress the others up as ports.
Introducing an abstraction here requires a written decision record arguing why.

**Requirements:** FR-12, FR-18. **Feature:** 007.
