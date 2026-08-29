---
title: C-18 Browser client
---

# C-18 Browser client

!!! warning "Status: partly built"

    - **Code:** `client/src/` — the component diagram and its layout, the liveness
      reducer and its windows, the speed control, the arrival-time control, the
      [trajectory](../../glossary.md#trajectory) query, and the route and uncertainty
      layer data
    - **Delivered by:** `specs/003-component-shell-client`, extended by
      `specs/012-visualisation`; the capture harness under `client/e2e/` by
      `specs/016-visual-capture`
    - **Covered by:** `client/tests/`, including `no-mock.test.ts` for the rule below
      and `recorded.test.ts` against recorded broker traffic, plus the end-to-end
      specifications in `client/e2e/`
    - **Not present:** there is no map surface. The route and uncertainty layers exist
      as data, accessors and downsampling with a stated resolution, and are tested as
      such, but no Deck.gl layer object is constructed and nothing renders the forecast
      volume — the component diagram was delivered without a map base, so there is
      nothing yet to put a layer on

**Responsibility:** visualisation and control.

## What it does

React, TypeScript and Deck.gl. It draws the component layout, the forecast
volume, the planned route as a four-dimensional curve through that volume with a
time control showing conditions at arrival, and the uncertainty field decaying
and refreshing over time. It also exposes the simulation speed control, which
means the client drives the [clock](c01-simulation-clock.md) rather than merely
observing it.

## Liveness, not configuration

The client renders all eighteen components from the first day, greyed out, and
lights each one only because a message from it arrived within that component's
declared liveness window. There is no manual override, no `enabled: true` flag,
and no hardcoded list of what is running.

There is also no mocked traffic, ever. A mock asserts the existence of something
that does not exist, which is precisely the failure this rule exists to prevent.
There is no demo mode, no fixture mode, and no path that populates the display
for a screenshot.

The consequence, on day one, was a screen on which nothing was lit. That looked
like a broken application and was the only honest picture of a system with
nothing running. The first thing to light it was the simulation clock's
heartbeat, and every component since has lit the same way — which is why a
component that is running against a stack that is not shows nothing, still, and
correctly.

Those two states are worth seeing side by side, because the difference between
them is the whole of this rule.

<figure markdown="span">
![The component shell with every one of the eighteen boxes grey and labelled NOT HEARD FROM. The line beneath the heading reads "0 of 18 components heard from within the window each declared", and the transport panel reports that the page is not connected to the broker.](../blog/assets/003-shell-all-dark.png)
<figcaption>Nothing running, and the display says so. Every box grey; nothing
asserts a component that has not spoken.</figcaption>
</figure>

<figure markdown="span">
![The same component shell with one box changed. The line beneath the heading now reads "1 of 18 components heard from within the window each declared", the transport panel reads "Connected, and receiving control traffic", and the box for C-01 Simulation clock is dark and filled, labelled HEARD FROM with the line "reports starting · at 2026-01-01T00:00". The other seventeen boxes remain grey.](../blog/assets/001-the-clock-lights-its-box.png)
<figcaption>One real heartbeat, from one running component. Nothing else changed,
and nothing else lit.</figcaption>
</figure>

Neither picture was arranged. The second was taken against a running clock
publishing to a real broker, and the seventeen boxes that stayed grey stayed grey
because those components were genuinely not running. There is no path in the
client that could have produced the second image without the first being true
first.

## Making the core visible

The requirements ask the visualisation to make the distinction between bespoke
logic and bought plumbing visible rather than hiding it — so that it stays
obvious which parts of the system were built and which were configured.

**Requirements:** FR-01, FR-45 to FR-49, FR-52. **Feature:** 003, extended by 012.
