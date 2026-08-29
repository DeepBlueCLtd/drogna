---
title: The component reference
description: Every component, what it may publish, what it may hear — generated from the declaration the program is built from.
order: 30
---

# The component reference

Version 1's site carried one hand-written page per component. Eighteen of them. They
were written before the code, because writing them was how the boundaries were argued
about — a component whose page cannot be written without describing another component
is not a component — and they earned their place. They also went stale, twice: first
carrying a notice saying no code existed long after code existed, and then describing
software that had been retired.

So this reference is generated. Its spine comes from `contracts/topology.json`, which
is itself derived from the configuration documents the components are constructed
from, and which a drift gate rebuilds and compares on every run. A component that
exists appears here. A component that stops publishing something stops saying it does.
Nobody has to remember.

What that buys is a narrow but real guarantee: **this page cannot be wrong about who
may say what.** It can still be incomplete about what a component is *for*, and the
prose below is where that is said.

## The components

<!-- generated: component table -->

The two entries with no source of their own — `advisory-source` and `advisory-store` —
are roles the shore-advisory path fills without a module directory of its own.

The permission columns are permissions, not behaviour: they say what the broker will
carry for a component, not what it chooses to send. `#` is the read-everything filter,
held by the shell alone, because the shell's job is to display whatever crosses.

## What each of them is for

**The world.** `clock` owns the time; nothing else in the system may read a wall clock,
so its heartbeat is also the first liveness signal every other component follows.
`env-generator` produces the 4D field — temperature, salinity, pressure, with
[sound speed](../glossary.md#sound-speed) derived rather than stored — from a recorded
seed, with four seeded features whose ground truth is written into a manifest so
recovery can be scored.

**Sensing.** `sensors` sample the generated field along platform paths and publish
observations. `ingest` is the one door into the observation store: a single writer,
which is what makes the write path something you can reason about.

**Storage.** `observation-store` holds what was sensed, `feature-store` the ground
truth, `coverage-store` the gridded holdings across their three eras — a multi-decade
historic archive authored at provisioning, a now-cast replaced on a cadence, and the
accumulating forecast instances once the loop turns.

**Serving.** `query` is the only read path. It answers
[OGC API-EDR](../standards/ogc-api-edr.md) and
[SensorThings](../standards/sensorthings.md) requests and returns
[CoverageJSON](../standards/coveragejson.md); no panel reads a store directly.
`boundary` is the release gate, and publishes its refusals so a refusal is visible
rather than silent.

**The loop.** `monitor` scores the forecast against what is arriving.
`scheduler` decides when the loop should turn. `model-runner` advects the field
forward — see the [advection derivation](../algorithms/advection.md) and
[ensemble spread](../algorithms/ensemble-spread.md). `planner` chooses where to sample
next, by the [informative path planning](../algorithms/informative-path-planning.md)
method.

**The edges.** `advisory-source` and `advisory-store` carry shore advisories — the
world outside speaking. `offload` announces an export without performing one.
`telemetry` reports on the machinery itself. `operator` is the machinery interrogated
from the operator's side.

**The view.** `shell` is the front-end: the dockable panels, and the only component
holding a read-everything subscription.

## The topics

Every topic on the broker, the schema its messages are governed by, and which
components may publish and subscribe. This is the same generated source: a topic
nobody declares does not appear, and a topic declared by a component nobody built
would fail the drift gate before it reached this page.

<!-- generated: topic table -->

## The Version 1 reference

The eighteen hand-written pages are kept in
[the archive](../archive/subsystems/index.md). They describe the containerised system
Version 1 delivered — the reverse proxy, the publisher, the browser client as a
separate thing — and they are accurate about it. They are not a description of what
runs now.
