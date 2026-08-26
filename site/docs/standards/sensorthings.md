---
title: SensorThings
---

# SensorThings

!!! warning "Stub — this primer is not written"
    The [observation path](../subsystems/c04-simulated-sensors.md) does not
    exist yet. This page records what the primer will cover.

OGC SensorThings API Part 1 (Sensing) is the vocabulary drogna's observations use
from the moment a simulated sensor publishes one, through the broker, into the
store, and back out through the [query layer](../subsystems/c09-query-layer.md).
It is deliberately adopted at the source rather than translated into at the edge,
so that there is one data dictionary rather than three.

## What the primer will cover

- **The entity model**, and why it has the shape it has: Thing, Sensor,
  ObservedProperty, [Datastream](../glossary.md#datastream), Observation,
  FeatureOfInterest, Location. The
  [datastream](../glossary.md#datastream) is the join that carries the meaning,
  and a reader who understands why one instrument produces several datastreams
  understands most of the standard.
- **Observation versus FeatureOfInterest**, which is the distinction newcomers
  most often collapse: what was measured, against what it was measured *on*.
- **Units of measurement**, and where the unit actually lives. A datastream
  carries one unit; an observation does not restate it. This is a design choice
  with consequences for anything that mixes datastreams.
- **Why the vocabulary is fixed this early**, with the counter-argument stated
  fairly: adopting a standard's vocabulary internally couples internal shapes to
  an external specification, and that is a real cost, not a free win.
- **What drogna does not use.** Part 2 (Tasking) is out of scope, and saying so
  explicitly matters, because a system that emits sampling recommendations and
  also speaks a tasking protocol is a system that has quietly crossed from
  recommending into commanding.

## The question drogna needs it to answer

Can a single vocabulary carry an observation unchanged from publication to query
response, without a translation step at either the store or the read boundary?
Every translation is a place where the unit, the quality flag or the observed
property can be dropped, and the value of adopting the standard at the source is
entirely in removing those places.
