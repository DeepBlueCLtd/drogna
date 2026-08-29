---
title: C-06 Observation store
---

# C-06 Observation store

!!! success "Status: built"

    - **Code:** `stores/observations/` — the migration, the grants in `roles.sql`, and
      `apply.py`, which orders them and emits a digest guard after each so an edited
      migration stops a run rather than leaving two instances quietly disagreeing
    - **Delivered by:** `specs/007-observation-path`
    - **Covered by:** `tests/integration/test_observation_path.py`, which provisions a
      PostGIS container through the store's own tooling and reconciles the counts; it
      skips without a container runtime
    - **Not present:** nothing applies the provisioning at scenario start —
      `deploy/seed.d/` holds no steps yet, so `scripts/seed.sh` runs none and
      provisioning is a deliberate invocation. There is also no quality-flag column, for
      the reason given on the [simulated sensors](c04-simulated-sensors.md) page

**Responsibility:** persist point observations.

## What it does

Postgres with PostGIS, holding point observations: position, depth, simulation
time, value, and the [datastream](../../glossary.md#datastream) the reading belongs
to, which carries the [observed property](../../glossary.md#observed-property), the
unit and the instrument that produced it. It is the punishing write path — many
small inserts arriving continuously — as opposed to the read-mostly reference
data next door.

There is no quality flag on a stored reading, and that is a decision rather than
an absence. A reading that fails its contract is refused at ingestion and
counted, so what reaches a row has already been judged; a flag would record on
every row a question that was answered before the row existed. **ADR-0014** sets
this out, and the [simulated sensors](c04-simulated-sensors.md) page says what it
means where the readings are produced.

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
