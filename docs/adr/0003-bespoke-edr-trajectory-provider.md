# ADR-0003: Trajectory queries are served by a bespoke pygeoapi provider

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-50, FR-51 (v0.3); serves FR-20
**Supersedes:** the "spike before committing" position taken in SRD v0.2

## Context

FR-20 requires EDR trajectory queries with per-vertex timestamps: the response reports
conditions forecast for the moment of arrival at each point, not conditions at query
time. This is the client's centrepiece (FR-47) and the acceptance test AT-01 scores
against it.

SRD v0.2 recorded this as the load-bearing unknown and ranked a spike second in the
delivery order, on the reasoning that if per-vertex timestamps failed, both the read
path and the client's centrepiece would change shape.

Investigation of pygeoapi settled the question differently than expected. The standard
expresses per-vertex timestamps natively — EDR trajectory `coords` is WKT
`LINESTRINGM` or `LINESTRINGZM`, with the M ordinate carrying the vertex time — and
pygeoapi's query layer needs no change to carry them: it parses `coords` with
`shapely.wkt.loads` and passes the geometry to the provider untouched, leaving all M
interpretation to the provider. The response shape is CoverageJSON's Trajectory domain,
whose composite axis is a per-vertex (t, x, y, z) tuple.

What is missing is not support for the concept but an implementation. pygeoapi's
provider matrix lists `xarray-edr` as position and cube only, and that provider's
source defines no trajectory method. No supplied provider implements trajectory at all.

## Decision

drogna implements a **bespoke pygeoapi EDR provider plugin** for trajectory queries
over the coverage store. It is a planned component sitting behind the coverage output
port of SRD §2.1, not a workaround for a defect.

The deployment **pins Shapely >= 2.1 built against GEOS >= 3.12**, with a comment at
the pin explaining why, and a test asserts that the M ordinate survives WKT parsing.

## Consequences

- The delivery item ranked second changes character: from "EDR trajectory spike", a
  gamble whose outcome could reshape two features, to "EDR trajectory provider", a
  build with one narrow thing left to prove. The rank does not change, because the
  work is still load-bearing and still early.
- Feature 002 narrows to proving the M ordinate survives parsing and sampling one
  four-dimensional route. Feature 008 gains the provider as a first-class piece of
  work with its own user story.
- Feature 008 and feature 012 no longer carry contingency branches for the case where
  per-vertex timestamps are unavailable.
- **The version pin guards a silent failure and must not be tidied away.** Below
  Shapely 2.1 / GEOS 3.12 the M ordinate is returned as NaN. Nothing raises. The
  timestamps simply become absent, FR-20 fails, and the first symptom is wrong values
  in a trajectory response that looks structurally correct. This is why the pin carries
  its reason inline and why the test exists: a pin whose purpose is invisible gets
  removed by someone doing housekeeping.
- Writing the provider means owning a compatibility surface against pygeoapi's internal
  provider base class. That is accepted: it is the price of the standard being ahead of
  its implementations, and the alternative — stitching one position query per vertex —
  moves the same work into drogna while also abandoning the standard's own response
  shape.
