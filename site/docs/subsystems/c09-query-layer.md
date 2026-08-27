---
title: C-09 Query layer
---

# C-09 Query layer

!!! success "Status: built"

    - **Code:** `query/` — the pygeoapi configuration template, and the bespoke plugins
      under `query/plugins/`: the [trajectory](../glossary.md#trajectory) provider, the
      position and cube provider,
      the CoverageJSON encoder, the run catalogue and the SensorThings provider
    - **Delivered by:** `specs/008-query-layer`, after the spike recorded in
      `specs/002-edr-trajectory-spike` and `spikes/edr-trajectory/`
    - **Covered by:** `tests/integration/test_edr_trajectory.py`,
      `test_edr_position_cube.py`, `test_sensorthings.py`,
      `tests/unit/test_wkt_m_ordinate.py` — the M-ordinate assertion described below —
      and `tests/acceptance/test_at01_trajectory.py`
    - **Not present:** SensorThings Part 1 is served as a declared subset.
      `query/conformance.md` lists what is absent and why, including the MQTT
      subscription extension and query options inside an expansion

**Responsibility:** SensorThings and EDR read access.

## What it does

pygeoapi, configured to expose two read interfaces:
[SensorThings](../standards/sensorthings.md) Part 1 over the observation store,
and [OGC API-EDR](../standards/ogc-api-edr.md) over the coverage store. All
reads go through here. Nothing else is permitted to read the stores directly,
which is the query half of command–query separation and the reason the read path
can be reasoned about at all.

## The trajectory query

The interesting query is the four-dimensional one: given a planned route with a
timestamp at every vertex, return the conditions forecast for the *moment of
arrival* at each point, not the conditions at query time. That is a
[trajectory](../glossary.md#trajectory) query in EDR terms, and it is the
client's centrepiece.

It also turned out to be the load-bearing unknown. No supplied pygeoapi provider
implements trajectory queries: the provider matrix lists the relevant provider
as position and cube only, and its source defines no trajectory method. So it
was a build and not a configuration exercise, and the bespoke EDR provider
plugin that came out of it sits behind the coverage output port in
`query/plugins/`.

## The version pin that matters

EDR expresses per-vertex timestamps as WKT `LINESTRINGM`, with the M ordinate
carrying vertex time. Below Shapely 2.1 built against GEOS 3.12, M comes back as
NaN: the timestamps are lost silently, before any provider code runs, and the
query returns a plausible wrong answer rather than an error. The deployment pins
those versions, the pin carries a comment saying why, and a test asserts that M
survives parsing.

**Requirements:** FR-19 to FR-21, FR-50, FR-51. **Feature:** 008.
