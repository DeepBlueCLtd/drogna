---
title: drogna
description: A demonstration harness for an environmental data architecture. Synthetic data, deliberately fake numerics, one browser page.
---

# drogna

!!! warning "Read this first"

    **drogna is a demonstration harness. Its data is synthetic and its numerics are
    deliberately fake. It is not a candidate system, not a prototype of one, and
    nothing it produces is a measurement of anything real.**

    Every temperature, salinity and [sound speed](glossary.md#sound-speed) value it
    holds was invented by a generator from a recorded seed. Its forecasts are analytic
    [advection](glossary.md#advection) plus noise, chosen because they are cheap and
    reproducible, not because they are right. Nobody should navigate, plan or decide
    anything on the strength of it.

## What it is

A synthetic ocean, sensors that sample it, a forecast loop that assimilates what they
report, and a query layer that serves the result through
[OGC API-EDR](standards/ogc-api-edr.md) and [SensorThings](standards/sensorthings.md).
All of it is a genuine program. All of it runs in one browser page.

The components do not know that. They talk to each other over a broker and read each
other's data over HTTP, in the shapes those standards define — the difference is that
the transport is a shim rather than a network. That boundary is the point of the
exercise, and the reason the whole thing can be a URL rather than a deployment.

The name means nothing. It was coined so that it would carry no association with any
domain, organisation or piece of work.

## Run it

[**Open the demo**](demo/index.md) — the current build of the default branch. Every
visit provisions a fresh seeded run; nothing persists between visits.

Views are addressable, so a link can open the page at the thing being discussed rather
than at the front door. The same page explains where the per-branch
[review instances](demo/index.md#instances-under-review) live.

## Where to start

- [**The demo**](demo/index.md) — the running thing, and the instances published for
  review.
- [**The architecture**](architecture/index.md) — what the seam is, and what it buys.
- [**The component reference**](components/index.md) — every component, what it may
  publish, what it may hear. Generated from the same declaration the program is built
  from.
- [**The standards primers**](standards/index.md) — SensorThings, OGC API-EDR, CF
  conventions and CoverageJSON, for readers who have not met them.
- [**The algorithm derivations**](algorithms/index.md) — the mathematics that is not
  obvious from the code.
- [**The glossary**](glossary.md) — start here if the vocabulary is unfamiliar. Half of
  it is oceanographic and none of it is assumed.
- [**The decision records**](decisions/index.md) — why it is built the way it is,
  including the record that ended Version 1.

## Version 2

Version 1 was twelve containers across Python, SQL and nginx, deployed to a server.
It worked, and reviewing a change to it meant reasoning across containers, so it was
slow. Version 2 keeps the architecture and moves it behind a wire-protocol seam into
the browser; the reasoning is [ADR-0027](decisions/adr/0027-version-2-client-side-rewrite.md).

The Version 1 record is not deleted. Its blog entries, its eighteen-component reference
and its architecture overview are kept in [the archive](archive/index.md), marked as
what they are: an accurate description of software that no longer runs.

## How this site is made

The source is markdown in the repository, built by a TypeScript script and pushed into
the `gh-pages` estate. That branch is machine-owned: anything edited there by hand is
overwritten by the next publication.

The site loads nothing from another origin — no fonts, no scripts, no stylesheets, no
analytics, no tracking of any kind. It declines to be indexed. Outbound hyperlinks to
standards documents are the only external references, and those are links a reader
chooses to follow, not resources the page fetches.
