---
title: C-16 Telemetry
---

# C-16 Telemetry

!!! success "Status: built"

    - **Code:** `services/telemetry/` — `skill.py` and `persistence_reference.py` for
      the forecast comparison, `freshness.py` and `accumulator.py` for the health half
    - **Delivered by:** `specs/010-telemetry-quality`
    - **Covered by:** `services/telemetry/tests/`, including `test_no_suppression.py`
      and `test_insufficient_samples.py`, plus
      `tests/integration/test_skill_against_persistence.py` and
      `tests/integration/test_telemetry_from_monitor.py`

**Responsibility:** health and forecast-skill indicators.
**Owns the failure mode of:** silent degradation.

## What it does

It publishes two different kinds of number. The first is health: is each
component alive, how far behind is the ingest, how long did the last model run
take. The second is skill: how good is the forecast, measured against what
actually got measured afterwards.

## Skill is always reported against persistence

A forecast is compared with a
[persistence forecast](../../glossary.md#persistence-forecast) — the forecast that
says conditions stay exactly as they are now. This is the cheapest possible
prediction and it is often surprisingly hard to beat over short horizons.

A model that does not beat persistence is not earning its compute, and the
display says so. Reporting skill without the persistence reference beside it
lets a model look useful by being merely plausible, which is the specific
dishonesty this rule exists to prevent.

## Silent degradation

The failure mode is a system that keeps producing output after it has stopped
producing good output. Nothing errors, nothing stops, the display keeps
refreshing, and the forecasts have been worthless for an hour. Whatever
telemetry cannot detect will be detected by a person noticing, eventually, and
"eventually" is the problem.

**Requirements:** FR-37, FR-38. **Feature:** 010.
