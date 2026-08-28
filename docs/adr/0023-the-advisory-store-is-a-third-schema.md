# ADR-0023: The advisory store is a third schema, not a second engine

**Status:** Accepted
**Date:** 28 August 2026
**Requirements:** SRD FR-12, FR-13, FR-18, FR-63; C-06, C-07, C-19, C-20; the constitution's technology constraint
**Raised by:** feature 020's specification, which chose "a store of its own" for structural provenance and deliberately did not choose an engine

## Context

Feature 020 sends small forecast updates from shore during a voyage: a concise vector
description of a dominant environmental feature, arriving mid-run over the message
fabric and served read-only through the query layer. Planning it produced one decision
before any code — that the advisory takes a **new mutable path** rather than relaxing the
feature store's read-only-during-a-run rule (FR-13), so that what was aboard at departure
and what was sent en route stay structurally distinct, and no consumer has to remember
the difference.

That settles the separation. It does not settle where the separated thing lives, and the
specification said so in as many words: the store was chosen "for structural provenance,
not any particular engine".

Two documents then stood in the way of every answer. The constitution's technology
constraint reads **"Postgres + PostGIS as one instance carrying two schemas —
`observations` and `features`"**, and SRD FR-12 said the same in requirement form. A
third holding, written during a run, had no place in either sentence. The SRD's v0.4
scope amendment left the question open on purpose and delegated it here rather than
settling it in passing; this record is that decision.

## Decision

**The advisory store is a third schema, `advisories`, in the same Postgres instance.**

SRD FR-12 now names three schemas rather than two. The constitution's technology
constraint is amended to match, and its version moves to 1.5.0.

The alternative — a deliberately lighter store outside the database, whether files beside
the coverage store or a second engine — is rejected.

## Consequences

- **The separation 020 needs is a permission, not a process.** What has to be true is
  that the advisory ingestion seam is the only writer to `advisories`, and that no
  run-time role can write `features` at all. Both are grants, enforced by the database
  rather than by code, which is the shape FR-18 already uses for the observation store's
  sole writer. A second engine would express the same rule with a second thing to deploy,
  back up, and configure — buying a rule the instance already enforces at the price of an
  operational surface.

- **This repository has paid for file-backed state twice, and both bills were
  permissions.** The broker's password file exited 13 on every Linux run while reporting
  healthy on every Mac; the configuration directory was replaced under a running mount
  and every container saw it empty. Both were invisible to a developer's machine and
  fatal on the runner. A file-backed advisory store, written during a run by one process
  and read by another, sits in exactly that blind spot. Postgres roles do not.

- **The cost is that two schemas with opposite rules now live in one instance.**
  `features` is read-only for the duration of a run and `advisories` is deliberately
  writable throughout it, and what keeps them apart is a grant. A migration that granted
  too widely would be invisible to any test that only reads. **Feature 020's plan owes a
  test that asserts the negative from a run-time role** — insert into `advisories`
  succeeds for the advisory role and for no other, and every run-time role is still
  refused on `features` — extending the shape feature 007 already built in
  `tests/integration/test_feature_store_readonly.py` rather than inventing a second one.

- **The documents stay in step.** FR-12 and the constitution's technology line now say
  three schemas; C-20's row in the SRD's component table names the schema; SRD §11
  carries the question and its answer. A reader who finds one of them saying two schemas
  has found a defect, not a nuance.

- **What this does not decide**, and what remains 020's plan to argue: the advisory
  schema's tables and columns, whether the advisory geometry is carried as a PostGIS
  type or as a validated shape in the message schema alone, and the retention rule
  within a scenario. This record fixes the address, not the furniture.

- **Reversibility is moderate, which is why the rejected option is not foreclosed.**
  Moving the advisories to their own store later is a migration and a DSN, not a
  redesign: the query layer reads them through the same collection machinery either way,
  and the ingestion seam is a component (C-19) rather than a library call. If the
  demonstration ever wants to show a genuinely detached shore, that is the change to
  make, and this decision does not stand in its way.
