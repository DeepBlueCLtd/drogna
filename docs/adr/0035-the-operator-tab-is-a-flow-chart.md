# ADR-0035: the operator tab is a flow chart

**Status:** Accepted
**Date:** 29 August 2026
**Feature:** 113 (the Operator flow chart)
**Requirements:** SRD-v2 FR-35, FR-36, FR-57 to FR-59
**Engages:** Constitution VII (liveness, not configuration); ADR-0030 (the control
registry); ADR-0033, whose two presentations this must survive

## Context

The Operator tab listed the declared components as rows, each with a liveness lamp, the
component's own detail sentence, and stop/restart buttons. It was correct and it was
mute about the thing the SRD has always said the architecture is: a loop. Sensors feed
ingest, ingest feeds the store, the monitor scores the store against the forecast, the
forecast assimilates, and the sensors sample the world the forecast is about. A table has
no cycle in it, and a reader who stopped a component in a table saw one row grey and
learned nothing about what it fed.

Two further things were missing, and they turned out to be the same thing. The rows were
uniform — twenty variants of "a lamp and a sentence" — so the display could show *that* a
component was alive but nothing about what it was doing. And the components had nothing
structured to say: the heartbeat carried a `detail` string written for a human, so any
figure on screen would have had to be parsed out of prose. Parsing a sentence is exactly
how a display starts inventing figures nobody published.

The first attempt at this feature shipped uniform cards in bands with no edges drawn, and
was rejected. The record is here because the reason it happened is instructive: the
picture could not be built until the components reported numbers, and the tempting move
was to draw the picture anyway and read the numbers out of the prose.

## Decision

**The Operator tab is a directed flow chart of the declared components, with a bespoke
face per component, drawn from things the harness already holds rather than from a second
description of itself.**

### Edges are derived, not authored

Topic edges come from `contracts/topology.json`, the master `scripts/derive-topology.ts`
derives from the run configuration and `check-topology-drift.ts` keeps honest. The
picture is a rendering of the wiring; a new publish rule appears as a new edge with no
panel edit, and the two cannot diverge because there is only one of them.

`check-flow-completeness.ts` (gate 17, one line appended to `scripts/gates.registry`)
closes the remaining gap in both directions: a declared component with no node fails the
build, and a topology edge that is neither drawn, nor terminal at a topic nobody hears,
nor named as suppressed fails it too. It was watched to fail before it was believed, four
ways — an undrawn component, a drawn stranger, colliding ranks, a port edge naming a
stranger. A fifth plant found the topic check **vacuous**: it counted every topic it
looked at, and a list that counts everything can never report anything missing. It was
rewritten to mean what it says, planted against again, and caught.

Two things the topology cannot supply are declared beside it, and only two:

- **Suppressed filters**, exactly `ctl/clock` and `ctl/heartbeat`. Every component
  subscribes to the clock and publishes heartbeats, so drawing them is forty edges that
  hide the ones carrying meaning. They are drawn as the plane the flow runs on, and the
  panel names the suppression on screen rather than silently omitting it. A third entry
  needs the requirement amended.
- **Port edges**: the world-sampler port and the store interfaces. These carry no broker
  traffic and therefore never pulse. Without them the environment generator — which
  publishes nothing but heartbeats — would sit isolated in a picture of the system it is
  the source of.

### Every figure declares its kind, and may not change kind

Three kinds, kept visibly apart because the tab puts them side by side:

| Kind | Source | Treatment |
|---|---|---|
| declared | a configuration document | hairline outline, no fill |
| reported | a message from the component | solid fill, the component's own words |
| observed | the shell's own count of traffic it received | dotted underline, *counted here* in the drawer |

Broker throughput is the case that forces the third kind: only the shell can count it, and
calling it *reported* would be the display asserting something nothing published. The
panel test asserts the kind of each figure, so a figure cannot quietly change class.

To make *reported* possible at all, `heartbeat.schema.json` gains an optional `figures`
array — key, value, optional unit, bound and caption, at most eight. Components publish
numbers as numbers. A component with nothing countable to say omits the array, and its
face says so rather than drawing zeroes.

### Illumination is heartbeats and nothing else

Constitution VII's rule, inherited from the System tab verbatim: structure is declared,
liveness is observed, and nothing is drawn for a component that does not exist. A future
adaptive sampler is therefore **not** a greyed node — that reads identically to a
component that has stopped, and the display cannot tell those apart. It is an open socket
on the platform node: the demand topic is real and declared, and the panel says in words
how many publishers have ever been heard on it and names them.

### The table did not retire

It is the list view, fed from the same graph, carrying every fact and every control the
chart carries. An SVG graph is not a keyboard surface and not a screen-reader surface.
Neither view is the other's fallback and both are always reachable — including at a
narrow width, where the chart scrolls and the *controls* disclose (ADR-0033). An earlier
draft swapped the chart for the list below the threshold; SC-007 caught it, because
swapping removes a surface and the narrow presentation may only fold.

## Consequences

- **Consequence is visible where the cause was applied.** Stop the platform and the
  sensors' own sentence changes two nodes along, on the same screen, because they have
  no position to sample at (ADR-0034). This is the demonstration the table could not give.
- **Twenty bespoke faces are twenty things to keep true.** The gate covers structure —
  every declared component has a node, every edge is accounted for — not design. A
  component added later gets a node and a generic face and the build stays green, which
  is deliberate: a missing face is a poorer picture, a missing node is a lie.
- **Most of the components gained `figures` in their heartbeats**, and the ones that did
  not have nothing countable to say. Adding a figure to another is a schema-clean change
  with no panel edit, because the faces read keys and not positions. The platform is the
  exception in the other direction: its face reads `platform-state.schema.json`, because
  demanded-versus-current and the binding limit are not counts.
- **Series windows are bounded and in memory**, sized from configuration (`series_samples`)
  rather than from a number typed into a panel. They are discarded on reload and never
  persisted: a window that outlived the page would be a second store. An empty series
  states its emptiness; a gap in simulation time is drawn as a gap, not bridged.
- **Five defects were found by opening the running page, not by a test.** Components with
  no detail line read as "no heartbeat has ever arrived"; a padlock codepoint had no
  glyph; two temperature instruments at different depths carried the same label. They are
  recorded because they are the class of fault a green suite does not catch, and the
  instance link on the pull request is what caught them.

## Alternatives rejected

- **An authored edge list in the shell's configuration.** A second description of the
  wiring, which would diverge from the first — precisely the reconciliation fault V1 paid
  for twice.
- **Edges from observed traffic alone.** An edge that appears only when it carries cannot
  express "this path exists and is quiet", which is the whole point of stopping a
  component. Constitution VII forbids showing silence where there is traffic; showing
  nothing where a wire exists and is idle is the same error facing the other way.
- **A graph layout library.** The graph is twenty nodes in declared bands with one
  deliberate back-edge; the layout is fifty lines of arithmetic in `layout.ts`, is pure,
  and is tested. A solver would place the return edge wherever it liked, and the return
  edge is the one thing the picture exists to show.
- **Keeping the uniform rows and adding edges.** It was tried first and rejected by the
  reader who asked for the feature. A picture of twenty identical boxes tells you the
  topology, which `topology.json` already told you; what it cannot tell you is what any
  of them is doing.
- **Parsing figures out of the detail sentence.** No schema change, no component edits,
  and a display that invents numbers the moment a component rewords itself.
