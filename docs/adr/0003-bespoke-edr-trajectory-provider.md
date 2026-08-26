# ADR-0003: Trajectory queries are served by a bespoke pygeoapi provider

**Status:** Accepted
**Date:** 26 August 2026
**Requirements:** SRD FR-50, FR-51 (v0.3); serves FR-20
**Amended:** 26 August 2026, twice: first with measured evidence from the feature 002
spike, then with the spike's full three-mode table once it distinguished the Shapely and
GEOS versions independently. See `spikes/edr-trajectory/FINDING.md`.
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
- **The version pin guards a silent failure and must not be tidied away.** The
  failure below the pin is worse than FR-51 anticipated, and the spike measured it
  rather than citing it. Shapely and GEOS fail independently, giving three modes rather
  than the one FR-51 names, and none of them raises:

  | Shapely | GEOS | What happens to the M ordinate |
  |---|---|---|
  | >= 2.1 | < 3.12 | Returned as **NaN**, which is the case FR-51 describes. `shapely.has_m` raises `UnsupportedGEOSVersionError` rather than returning False. |
  | 2.0.x | >= 3.12 | Not NaN — **absent**. No `include_m` parameter and no `has_m` attribute exist. `LINESTRING M` yields `(x, y)` tuples; `LINESTRING ZM` yields `(x, y, z)` and round-trips out as `LINESTRING Z`. **This is the pygeoapi image as it ships today.** |
  | 2.0.x | < 3.12 | Worse than either. `LINESTRING M` comes back as a `LINESTRING Z` whose Z values are the timestamps, with `has_z` True — a Unix timestamp silently promoted into the depth axis. |

  The middle row is the one that would actually have been met, and the one this record
  originally missed: it is the shipped pygeoapi image, and its failure is absence rather
  than NaN. A test asserting only "M is not NaN" passes there while the timestamps are
  already gone. The test must assert that M is recovered *and* that Z is what it should
  be.

  A second version sensitivity, separate from M: the OGC API-EDR specification writes the
  geometry type without a space, `LINESTRINGZM(...)`. GEOS accepts that spelling from
  3.12 and rejects it before, with `ParseException: Unknown type: 'LINESTRINGZM'`. That
  failure at least is loud. Emit `LINESTRING ZM (...)`, which every tested version
  accepts.

  This is why the pin carries its reason inline. A pin whose purpose is invisible gets
  removed by someone doing housekeeping.
- **The spike and the deployment are on different pygeoapi versions, and the difference
  changes how a provider registers its query types.** The feature 002 spike measured
  `0.25.dev0`, where `BaseEDRProvider.__init_subclass__` builds `query_types` from the
  subclass's own `__dict__` — so a plugin subclassing `XarrayEDRProvider` and adding only
  `trajectory` silently loses `position` and `cube`. The deployment pins **0.20.0**, which
  instead has `@BaseEDRProvider.register()` append to a `query_types` list that is a
  *mutable class attribute of the base*, shared by every provider in the process. That is
  the more dangerous of the two: the first loses capability visibly in one collection,
  the second lets one provider's registration leak into another's.

  Feature 008 satisfies both mechanisms rather than choosing between them — all three
  query types are declared in the subclass's own `__dict__`, as delegations where
  inherited, *and* named in a `query_types` list set on the class, which shadows the
  base's shared one. A test asserts both. The served collection was verified live to
  advertise `['cube', 'instances', 'position', 'trajectory']`.

  The general lesson is the one the spike wrote into its own shelf-life note and which
  nearly went unread: **a measured finding is measured against a version.** Pinning a
  different version than the one measured does not merely weaken the finding, it can
  replace the hazard with a different one. Where a spike and a deployment disagree on a
  version, that disagreement is itself a finding.

- Writing the provider means owning a compatibility surface against pygeoapi's internal
  provider base class. That is accepted: it is the price of the standard being ahead of
  its implementations, and the alternative — stitching one position query per vertex —
  moves the same work into drogna while also abandoning the standard's own response
  shape.
