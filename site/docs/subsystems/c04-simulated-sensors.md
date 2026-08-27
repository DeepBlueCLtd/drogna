---
title: C-04 Simulated sensors
---

# C-04 Simulated sensors

!!! success "Status: built"

    - **Code:** `services/sensors/`
    - **Delivered by:** `specs/007-observation-path`
    - **Covered by:** `services/sensors/tests/`,
      `tests/integration/test_observation_path.py` and
      `tests/integration/test_topic_isolation.py`
    - **Not present:** the published message carries no quality flag, and that is
      decided rather than pending. `contracts/schemas/observation.schema.json` declares
      none and the store has no column for one, because whether a reading is acceptable
      is judged at the ingestion seam and not carried on the row — **ADR-0014**

**Responsibility:** publish observations in SensorThings vocabulary.

## What it does

A simulated vessel carries instruments — nominally a
[CTD](../glossary.md#ctd) — that sample the generated field at the vessel's
position and publish what they read. The published messages use the
[SensorThings](../standards/sensorthings.md) vocabulary from the outset: each
reading belongs to a [datastream](../glossary.md#datastream), which joins a
Thing, a Sensor and an [observed property](../glossary.md#observed-property),
and carries a single unit of measurement.

## Why the vocabulary is fixed this early

Because the alternative is a bespoke message shape that gets translated at the
store, and then translated again at the query layer, and the translation is
where the meaning goes missing. Publishing in the vocabulary the read path
already speaks means there is one data dictionary, not three.

Sampling error and instrument noise are added here rather than in the
generator, because that is where they belong: the generator produces the ocean,
the sensor produces an imperfect view of it. Keeping the two apart is what makes
the recovery error meaningful. Each instrument declares its noise model, and the
declaration is stored beside the readings so a value can be scored against the
field it was drawn from.

Quality flagging is not here, and that is settled rather than pending. The
requirements name it among the bespoke logic, and what it amounts to in drogna is
the judgement made one component downstream: the
[ingest client](c05-ingest-client.md) either accepts a message or refuses it,
counts the refusal and keeps it with the reason. A flag on the row would be the
opposite arrangement, and the number it carried would be knowable in advance,
because an instrument's error is a draw from a distribution the harness itself
declares. The reasoning, and the alternative it rejects, are **ADR-0014** in the
[decision records](../decisions/adr/index.md).

## The vessel

The simulated vessel is a sampling platform and a coordinate. It is not a track,
it is not a contact, and drogna holds no analogue of one. This is not a
sensitivity; it is a statement about what the data model admits, which is
environmental measurements, forecast fields, uncertainty fields, sampling
recommendations and system telemetry, and nothing else.

**Requirements:** FR-16, FR-17. **Feature:** 007.
