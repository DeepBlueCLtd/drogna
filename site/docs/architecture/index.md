---
title: The architecture
description: One browser page, two halves and a seam between them.
order: 20
---

# The architecture

drogna is one browser application with two halves and a seam between them.

The **front-end** is the dockable multi-panel shell, its panels, and everything that
renders. The **in-browser backend** is a set of components that generate, sense, store,
assimilate, plan and serve — each with its own configuration document, its own seed
stream, its own heartbeat and its own lifecycle. They are not fixtures and no canned
data ever stands in for one: they are genuine programs that happen to be running in
the same process as the thing displaying their output.

## The seam

Everything the two halves say to each other crosses in wire shape, and nowhere else.
There are three carriageways:

- **HTTP** — the front-end calls `fetch` against relative URLs it reads from
  configuration. An interception layer answers. The requests and the responses are the
  ones [OGC API-EDR](../standards/ogc-api-edr.md) and
  [SensorThings](../standards/sensorthings.md) describe.
- **Pub/sub** — a broker component with MQTT topic semantics, behind a transport
  interface whose wire shape is MQTT-over-WebSocket.
- **The release gate** — what may leave the boundary, and what is refused.

Front-end code may not import backend modules, and backend code may not import
front-end modules. Only the seam's client interfaces and the generated types are shared.
That is not a convention: a gate reads the import graph and fails the build.

## Why a seam at all

Because Version 3 replaces the in-browser backend with a server-side one, and the
client should not notice. The switch is configuration — a base URL for HTTP, a broker
URL for pub/sub — and no code path is allowed to distinguish the two cases. No client
configuration may carry an absolute URL: every fetch is relative and same-origin, which
is also what lets the page be served from any host and any base path.

The seam pays for itself twice before that. Because the data crosses in wire shape, a
small HTML page can be an ordinary consumer of a component — which is what makes it
possible to demonstrate a headless component honestly rather than describe it. And
because the two halves cannot import each other, the reviewable unit is small.

## The shapes are generated, never written

Every shape that crosses the seam is governed by a committed master under `contracts/`:
JSON Schema for messages and configuration, OpenAPI for HTTP, `$ref`s joining them
where a shape appears in both. TypeScript is generated from those masters, committed,
and drift-checked. Nothing at the boundary is hand-written, which is why the
[component reference](../components/index.md) on this site can be generated from the
same declaration the program is built from rather than maintained beside it.

## The loop

The control loop carries unchanged from Version 1. Writes travel one ingestion seam per
store, with a single writer behind each. Reads are served exclusively through the
standards-based query components. A sense → decide → act → publish cycle regenerates
the forecast when the observations start disagreeing with it.

The arc the build followed is the same as the arc a demonstration follows: *a world
exists → it is sampled → it is served → it is assimilated → doubt is measured and
directed → the machinery is interrogated → advice travels light → it is seen.*

## Time and randomness

There is no wall clock anywhere in the system. A simulation clock component owns the
time, publishes it, and every other component reads it; a gate fails the build on
`Date.now`, `setTimeout` and their neighbours in component source. Randomness is
likewise seeded from a recorded seed and never drawn from `Math.random`, so a run can
be replayed from its manifest.

Both rules exist so that the same seed produces the same run, which is the only thing
that makes a claim about what the harness does checkable.

## What was Version 1

Twelve services across Python, SQL, nginx configuration and Compose, deployed to a
server. It delivered what it set out to prove, and reviewing a change to it meant
reasoning across containers. [ADR-0027](../decisions/adr/0027-version-2-client-side-rewrite.md)
records the reversal and what it cost to decide. The Version 1 architecture overview is
kept, accurately labelled, in [the archive](../archive/architecture/overview.md).
