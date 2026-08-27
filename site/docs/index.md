---
title: drogna
description: A learning harness for an environmental data architecture.
---

# drogna

!!! warning "Read this first"

    **drogna is a learning harness. Its data is synthetic and its numerics are
    deliberately fake. It is not a candidate system, not a prototype of one, and
    nothing it produces is a measurement of anything real.**

    Every temperature, salinity and [sound speed](glossary.md#sound-speed) value
    it holds was invented by a generator from a recorded seed. Its forecasts are
    analytic [advection](glossary.md#advection) plus noise, chosen because they
    are cheap and reproducible, not because they are right. Nobody should
    navigate, plan or decide anything on the strength of it.


## What it is

drogna is a small runnable system built to exercise one architectural pattern:
an event-driven control loop with command–query separation, applied to
environmental data. Writes travel a direct path into storage through a single
ingestion seam. Reads are served only through a standards-based query layer. A
sense → decide → act → publish cycle regenerates a forecast when observations
start disagreeing with it.

It exists so that its author can find out how eighteen components behave
together — and particularly where they misbehave together — in a way that no
diagram conveys. It is disposable scaffolding. What survives it is the
understanding, the exercised data-to-viewer contract, and this public record of
how it was built.

The name means nothing. It was coined precisely so that it would carry no
association with any domain, organisation or piece of work.

## What is actually built

Nothing yet, other than this site.

That is not modesty, it is the current state. Sixteen features have been
specified, a constitution written, and a dependency graph drawn. No service
runs. The [subsystem reference](subsystems/index.md) lists all eighteen
components and marks every one of them as not yet built, and it will keep
saying so about each until the code exists. A page that describes something
which does not exist says so at the top.

This site was published early, out of its place in the delivery order, for one
reason: a publishing pipeline that has never run is not a publishing pipeline.

## Where to start

- The [blog](blog/index.md) — one entry per feature that works, plus the
  occasional entry about the process itself. Written for a general technical
  reader who has not read the requirements document.
- The [subsystem reference](subsystems/index.md) — what each of the eighteen
  components does, why it exists, and which failure mode it owns.
- The [algorithm derivations](algorithms/index.md) — the mathematics that is not
  obvious: [ensemble spread](glossary.md#ensemble-spread), advection,
  informative path planning.

- The [standards primers](standards/index.md) — SensorThings, OGC API-EDR, CF
  conventions and CoverageJSON, for readers who have not met them.
- The [glossary](glossary.md) — start here if the vocabulary is unfamiliar. Half
  of it is oceanographic and none of it is assumed.

## How this site is made and published

The source is markdown in the repository. A workflow builds it and pushes the
built output to the `gh-pages` branch. That branch is machine-owned: anything
edited there by hand is overwritten by the next publication.

The site loads nothing from another origin — no fonts, no scripts, no
stylesheets, no analytics, no tracking of any kind. It declines to be indexed.
Outbound hyperlinks to standards documents are the only external references, and
those are links a reader chooses to follow, not resources the page fetches.

The tooling choice and the alternatives rejected are recorded in
[Site tooling](decisions/site-tooling.md).
