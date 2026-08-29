---
title: C-07 Feature store
---

# C-07 Feature store

!!! success "Status: built"

    - **Code:** `stores/features/` — the migration, `roles.sql`, and `provision.py`,
      which derives its content from the root seed
    - **Delivered by:** `specs/007-observation-path`
    - **Covered by:** `tests/integration/test_feature_store_readonly.py`, which
      provisions twice from one root seed and asserts the two instances agree, then
      asserts every write is refused once the scenario is running; it skips without a
      container runtime
    - **Not present:** as with the observation store, nothing runs the provisioning at
      scenario start: `deploy/seed.d/` holds no steps, so the pre-sail loading described
      below is done by hand rather than by the seeding path

**Responsibility:** static spatial reference — bathymetry, coastlines.

## What it does

It holds the parts of the world that do not change during a scenario: depth
soundings, coastlines, whatever else the planner and the client need in order to
avoid recommending a sample on dry land.

## Why it is read-only during a run

The feature store is provisioned by script at scenario start and is read-only
thereafter. This is the harness analogue of pre-sail loading: reference data is
taken aboard before departure, and what is aboard is what is available.

The engineering benefit is that it removes a whole class of question. Nothing
downstream has to ask whether the bathymetry it read at the start of a run is
the bathymetry it will read at the end, which means nothing downstream has to
cache defensively or invalidate anything.

It also keeps a rule the project holds generally: seed data is produced by
scripts, never accumulated. A fresh instance is equivalent to a long-running
one. Anything that only works after a system has been running for a while is a
thing nobody can reproduce.

**Requirements:** FR-12, FR-13. **Feature:** 007.
