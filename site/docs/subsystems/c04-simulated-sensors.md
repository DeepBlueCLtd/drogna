---
title: C-04 Simulated sensors
---

# C-04 Simulated sensors

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

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

Sampling error, instrument noise and quality flags are added here rather than
in the generator, because that is where they belong: the generator produces the
ocean, the sensor produces an imperfect view of it. Keeping the two apart is
what makes the recovery error meaningful.

## The vessel

The simulated vessel is a sampling platform and a coordinate. It is not a track,
it is not a contact, and drogna holds no analogue of one. This is not a
sensitivity; it is a statement about what the data model admits, which is
environmental measurements, forecast fields, uncertainty fields, sampling
recommendations and system telemetry, and nothing else.

**Requirements:** FR-16, FR-17. **Feature:** 007.
