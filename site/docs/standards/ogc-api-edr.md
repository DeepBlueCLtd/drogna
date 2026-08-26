---
title: OGC API-EDR
---

# OGC API-EDR

!!! warning "Stub — this primer is not written"
    The [query layer](../subsystems/c09-query-layer.md) does not exist yet. This
    page records what the primer will cover.

OGC API — Environmental Data Retrieval is the read interface over drogna's
[coverage store](../subsystems/c08-coverage-store.md). Its premise is that most
questions asked of an environmental dataset are one of a small number of
geometric shapes, and that a handful of query types therefore covers most needs
without a general query language.

## What the primer will cover

- **The query types** — position, area, cube, corridor, trajectory, radius,
  items, locations — and which of them drogna implements. The interesting
  property of this list is that it is short and closed.
- **How a query is expressed**: `coords` as WKT, `datetime` as an instant or an
  interval, `parameter-name` selecting variables, `z` selecting depth. Nothing
  about it is exotic, and that is the point.
- **The trajectory query in detail**, because it is drogna's centrepiece: given a
  route with a timestamp at every vertex, return the conditions forecast for the
  moment of arrival at each point, rather than conditions at query time.
- **Where the per-vertex time actually lives.** EDR carries it as the M ordinate
  of a WKT `LINESTRINGM` or `LINESTRINGZM`. That is a genuinely elegant fit, and
  it is also fragile in a way worth writing down: below Shapely 2.1 built against
  GEOS 3.12, M parses as NaN, so the timestamps vanish silently before any
  application code runs and the query returns a plausible wrong answer. drogna
  pins those versions and tests that M survives parsing.
- **What the response looks like**, which is [CoverageJSON](coveragejson.md).

## The question drogna needs it to answer

Whether a standards-based read interface can serve a four-dimensional trajectory
query well enough to be the *only* read path, with no bespoke endpoint alongside
it. The answer is already partly known and is not entirely comfortable: no
supplied pygeoapi provider implements trajectory queries at all, so drogna
builds one. The standard expresses the query natively; the implementations have
not caught up.
