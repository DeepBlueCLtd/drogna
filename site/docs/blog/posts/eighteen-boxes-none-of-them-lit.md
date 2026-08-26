---
date: 2026-08-26
categories:
  - Feature
slug: eighteen-boxes-none-of-them-lit
feature: specs/003-component-shell-client
description: >-
  The browser client draws drogna's whole intended architecture and reports that
  it has heard from none of it. An all-dark display is the correct display, and
  the rule that makes it correct also forbids the obvious way of improving it.
---

# Eighteen boxes, none of them lit

Here is the first thing drogna built that you can look at. It is an application in
which nothing works, and that is the finished state of it.

<!-- more -->

<figure markdown="span">
![The component shell: eighteen boxes arranged as a flow chart with a loop in it, every one of them greyed out and labelled NOT HEARD FROM. A line above the diagram reads: 0 of 18 components heard from within the window each declared.](../assets/shell-all-dark.png)
<figcaption>The component shell, served from the built client. Nothing was
running.</figcaption>
</figure>

Eighteen boxes: every component drogna intends to have, arranged as the flow chart the
architecture actually is, with its loop — monitor, scheduler, model runner, publisher,
back to the monitor — drawn as a loop rather than flattened into a row. Zero of them
lit.

## Why nothing lights

The rule is one line of the constitution and it is not negotiable. Any display of what
exists is driven by observed liveness, never by a configuration file listing what ought
to exist, and never by mocked traffic. A component is lit because a message from it
arrived inside the liveness window that message itself declared, and for no other
reason. There is no `enabled: true`, no hardcoded list of live components, no demo
mode, no fixture mode and no populate-for-the-screenshot path.

The reasoning behind the last of those is the part worth spelling out, because
populating a display with plausible traffic is such an ordinary thing to do. A mock
asserts the existence of something that does not exist. That is not a small
compromise on the way to the real thing; it is precisely and exactly the failure this
display exists to prevent. A system whose picture can claim a component is alive when
it is not has a picture that is decoration. Everything drogna hopes to be evidence of
rests on that picture being unable to lie, and the cheapest way to guarantee it is to
never build the code path in the first place.

Which leaves a testing problem: how do you check that something is absent? Bluntly.
A test reads the client's own source, every file of it, and asserts that none contains
a demo mode, a mock, a stub, a fixture, a build flag, or a read of the URL's query
string — and separately that nothing under the client ever publishes on the broker,
only subscribes. A second test, living with the deployment rather than the client,
asserts that nothing in the client reads the Compose file, the generated environment
file, or the list of which services this destination starts. Both are crude
instruments. The property being defended is an absence, and the only way to check an
absence is to look.

## Lit does not mean working

The legend says so in those words, and it is the most important sentence on the page.
A component that publishes heartbeats while failing at its job is lit, and reports its
own status — starting, ok, degraded, stalled, stopping — beside its box. Lit means
*heard from*. The display is not qualified to say more than that, and does not.

There are four states rather than two, and the third is the interesting one.

**Dark** means nothing has been heard, or what was heard has expired while the page was
listening. **Cannot tell** means the evidence expired while the page could not listen
at all. Those are different claims: a client that has gone deaf cannot honestly report
a death, and folding the two together would let a network problem look like a failure.
It is not a shade of lit — nothing on this page can produce lit without evidence — it
is a refusal to say.

**This page** is the fourth, and it applies to exactly one box. The browser client
cannot hear itself over the broker, so rather than fabricating a heartbeat for itself
it is drawn with a dashed outline and labelled as what it is: the page you are looking
at, lit by its own presence.

Every state carries a word and a mark as well as a colour, and the word is the primary
carrier. That is because these screenshots are meant to be printed in blog posts,
possibly in greyscale, and a display distinguished only by hue does not survive the
trip. `NOT HEARD FROM` is written in each of those eighteen boxes.

## Two panels for the awkward cases

A heartbeat arriving under a component id the layout does not recognise is the most
interesting message this page can receive: something is running that the picture does
not account for. Discarding it would be the display hiding a genuinely live component
in order to keep its own diagram tidy. So it gets its own panel, with the unknown id
printed exactly as it arrived.

The other panel handles two processes publishing the same component id, each still
inside its own window. The page cannot tell which one the drawing means, and choosing
would mean hiding something live, so both are listed by run id and configuration
digest and the conflict is left visible for someone to resolve where it can actually
be resolved.

## Square corners and round corners

The boxes have two shapes. Square corners mark bespoke components — logic written for
drogna because it could not be had off the shelf: the divergence rules, the scheduling
policy, the sound speed and uncertainty mathematics, the quality flagging. Round
corners mark plumbing: a broker, two stores, a query layer, a reverse proxy, and the
scaffolding around them.

Ten of the eighteen are round. That distinction is drawn on the diagram deliberately,
because a reader ought to be able to see at a glance how little of this system is
actually novel, and an architecture drawing that makes every box look equally
impressive is doing its author a favour rather than its reader.

## What is not built

Almost all of it. Every one of those eighteen boxes is a component that does not exist
or does not yet run: the drawing is a statement of intent, and it says so on the page
in words directly above the diagram. Adding a box to this layout adds a grey rectangle
and nothing else — no claim, no capability, no change to what the page can report.

The first component to publish a real heartbeat will change exactly one of those boxes,
and because of everything above, that change will mean something.
