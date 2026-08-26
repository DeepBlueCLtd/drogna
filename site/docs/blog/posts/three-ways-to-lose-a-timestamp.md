---
date: 2026-08-26
categories:
  - Standards
slug: three-ways-to-lose-a-timestamp
feature: specs/002-edr-trajectory-spike
description: >-
  A requirement predicted one silent failure in a geometry library and prescribed
  a test for it. Measurement found three, and the one the deployment would
  actually have met is the one that test would have sailed past.
---

# Three ways to lose a timestamp

Ask a data service what the conditions are along a planned route and there are two
questions you might mean. What is it like now, everywhere along the line; or what
will it be like at each point at the moment I arrive there. For anything that moves
slowly through a changing medium — which is to say a ship — only the second question
is worth asking.

<!-- more -->

[OGC API-EDR](../../standards/ogc-api-edr.md) is a web standard for retrieving
environmental data at a position, along a route, or through a volume. Its trajectory
query is the one that answers the second question, and the way it carries the arrival
times is genuinely elegant. A route is sent as WKT, the ordinary text spelling of a
geometry: `LINESTRING (-3.6 48.4, -2.55 49.45)`. WKT allows two optional extra
ordinates per vertex — Z, conventionally elevation, and M, a "measure", which is
whatever the application says it is. EDR says M is the vertex time. So a
four-dimensional route is one string, `LINESTRING ZM (lon lat z t, ...)`, and the
timetable rides inside the geometry rather than alongside it.

drogna's query layer is [pygeoapi](../../subsystems/c09-query-layer.md), which parses
that string with Shapely and hands the resulting geometry to a provider untouched.
Shapely is a Python wrapper around GEOS, a C geometry library. Both halves matter,
and that turns out to be the whole story.

## The prediction

The requirements said: below Shapely 2.1 built against GEOS 3.12, the M ordinate is
returned as NaN. They prescribed a version pin, a comment at the pin explaining
itself, and a test asserting that M survives parsing. That is a sound response to a
silent failure, and it was written before anyone had run it.

## The measurement

Three combinations were built and probed with the same two strings. Shapely and GEOS
fail independently, so there are three modes rather than one.

| Shapely | GEOS | What happens to M |
|---|---|---|
| 2.1.2 | 3.13.1 | Every vertex time recovered exactly, in order. This is the pin. |
| ≥ 2.1 | < 3.12 | Returned as **NaN**. The predicted case. |
| 2.0.x | ≥ 3.12 | Not NaN — **absent**. `LINESTRING ZM` yields `(x, y, z)` tuples and round-trips back out as `LINESTRING Z`. |
| 2.0.x | < 3.12 | `LINESTRING M` returns as a `LINESTRING Z` **whose Z values are the timestamps**. |

The third row is the published pygeoapi image as it ships today. It is, in other
words, the row the deployment would actually have met, and it is not the row the
requirement described. There is no `include_m` parameter and no `has_m` attribute in
that version of Shapely for a check to interrogate; the M ordinate is not corrupted,
it is simply not a concept. A test written to catch NaN is looking for a value this
failure never produces, and the per-vertex times are gone either way.

The fourth row is worse. The vertex times arrive in the Z slot with `has_z` reporting
true, and a provider that reads Z as elevation takes 1,788,220,800 for a depth in
metres. The route is then a request for the temperature about one and three quarter
billion metres from the sea surface — roughly four and a half times the distance to
the Moon — and what comes back depends entirely on a provider setting that is
invisible from outside. Configure it to return nulls beyond the edge of its domain
and the response is full of nulls; configure it to extrapolate and the response is
full of numbers. Both are HTTP 200. Both are structurally valid CoverageJSON, the
standard's own response format, with a correctly formed composite axis and correctly
formed referencing blocks. Nothing in the document says which setting produced it.

Nothing raises in any of the three failures. There is no exception, no warning and no
degraded status. The first symptom is wrong values in a response that looks right.

## Why the pin is not a version constraint

`shapely >= 2.1` expresses half of it. The other half cannot be expressed at all:
Shapely's wheels bundle their own GEOS, so the GEOS version is a property of the
built artefact and not of anything a dependency resolver can be asked to satisfy. Two
machines can install the identical pinned Shapely and get different geometry
libraries underneath.

So the pin became an assertion about behaviour instead. A script runs during the
query layer's image build, parses one two-vertex `LINESTRING ZM` whose Z values are
small negative depths and whose M values are large timestamps, and compares what it
recovers against what it sent. A mismatch exits non-zero and fails the build. It
checks Z as well as M, deliberately: a check on M alone cannot tell a correct parse
from one that has quietly moved the times into the depth axis. The script is left
inside the image so the same assertion can be made against a running container the
day a base image moves.

The two ordinates in that fixture are chosen to be unmistakable for one another. That
is the entire trick, and it is the only reason the third failure mode is detectable
at build time rather than in a plausible-looking answer six weeks later.

## Two other things nobody would guess

pygeoapi decides which query types a provider advertises by reading the subclass's
own `__dict__`. Subclass the supplied gridded-data provider, add a `trajectory`
method, and `position` and `cube` disappear from the collection's advertised
capabilities — silently, because the base class's methods are not the subclass's own.
There is no registration decorator. Defining a method with the right name is the
whole mechanism, and redeclaring the two you inherited is the whole fix.

A trajectory query is a GET, and its route travels in the URL. At six decimal places,
91 vertices is a 4,081-byte request line and works; 92 is 4,125 bytes and is refused
by the web server before pygeoapi sees it. There is no POST form of the endpoint — it
returns 405 — so the ceiling is real, and it is a server setting rather than anything
about the standard.

## What is actually built

No provider. drogna cannot answer a trajectory query today, because the component
that would do it does not exist yet. What exists is a throwaway plugin that ran once,
sampled one twenty-vertex route against a synthetic field whose analytic form is
known, and agreed with the closed-form answer to 2.7 × 10⁻⁸ °C — against 12.8 °C of
error for the same route evaluated at a single time. That is the number that makes
the whole exercise worth doing: it is the size of the mistake the silent failure
would have introduced, measured rather than asserted.

The requirement was right about the consequence and wrong about the mechanism, and it
named the one case that would not have arisen. A mechanism stated too narrowly does
not stay a documentation error. It becomes a test that passes.
