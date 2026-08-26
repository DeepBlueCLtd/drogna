---
title: C-18 Browser client
---

# C-18 Browser client

!!! warning "Status: not yet built"
    No code for this component exists. What follows is intent taken from the
    requirements, not a description of anything running.

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

The consequence, on day one, is a screen on which nothing is lit. That looks
like a broken application and is the only honest picture of a system with
nothing running. The first thing that lights it is the simulation clock's
heartbeat, and every later component follows the same pattern.

## Making the core visible

The requirements ask the visualisation to make the distinction between bespoke
logic and bought plumbing visible rather than hiding it — so that it stays
obvious which parts of the system were built and which were configured.

**Requirements:** FR-01, FR-45 to FR-49, FR-52. **Feature:** 003, extended by 012.
