---
title: A list of twenty things cannot show you that they are a circle
date: 2026-08-30
feature: specs/113-operator-flowchart
description: >-
  The screen that let you stop any part of the running system was a table, and it was
  honest about everything except the one thing worth knowing: what else stops when you
  do. Fixing that meant giving the machine something to report first.
---

# A list of twenty things cannot show you that they are a circle

## The background

The application this site is about simulates a stretch of ocean, samples it with
instruments, forecasts what it will do next, checks the forecast against the samples,
and forecasts again when the two have drifted apart. Twenty or so separate pieces, all
running in one browser tab, and one screen where you can look at them and stop any of
them to see what happens.

That screen was a table. Twenty rows, a lamp in each saying whether the piece was still
alive, a sentence from the piece itself saying what it was doing, and buttons to stop
and restart it. Everything in it was true. You could stop the forecast runner and watch
its lamp go out.

What you could not see was the shape. Those twenty pieces are not a list, they are a
circle: the instruments feed the store, the store feeds the check, the check triggers
the forecast, and the forecast is a claim about the water the instruments are sitting
in. Stopping a piece in a table greys one row. It tells you nothing about what that row
was feeding, which is the entire reason you stopped it.

## The requirement

The screen had to draw the system as the connected thing it is, with the connections
coming from the actual wiring rather than from a drawing somebody keeps up to date by
hand. Each piece had to show something specific to what it does — how many records it
holds, how far the forecast has drifted, how close it is to the level that will trigger
the next one — rather than twenty copies of a lamp and a sentence. And stopping
something had to have a visible consequence somewhere else on the same screen.

The last of those needed something that did not exist yet. Nothing in the simulation
held the vessel's own motion: the instruments worked out where they were from a formula
over simulated time, privately, so there was nothing to stop and nothing whose stopping
anyone would notice.

## The options considered

The first attempt was rejected, and it is the useful part of this entry.

It drew twenty boxes in rows, gave two of them a bespoke display, gave the other
eighteen the same card, and drew no connecting lines at all — with a note promising the
lines later. From the inside this felt like sensible staging. From the outside it was a
picture of twenty identical boxes, which tells you the same thing the configuration file
already told you, and less clearly.

The reason it came out that way is worth naming, because it was not laziness. The
pieces had nothing to draw. Each one published a *sentence* about itself, written for a
person to read. A display wanting to draw a bar or a trend line from that would have to
pick the numbers back out of the prose — and a display that parses a sentence starts
inventing figures nobody published the moment somebody rewords it. So the schema for
those status messages gained an optional list of figures: a name, a number, a unit, and
where one exists, the bound the number is measured against. Sixteen pieces now publish
numbers as numbers, and the twenty displays read names rather than positions, so adding
a figure to a seventeenth needs no change to the screen at all.

The connecting lines came from a file the project already had: a machine-derived record
of which piece publishes on which channel and which pieces listen. The picture is a
rendering of the wiring rather than a second description of it, which means it cannot
drift out of step — and a check that runs on every build now fails if a piece exists
with nothing drawn for it, or a connection exists that is neither drawn nor explicitly
listed as deliberately hidden. Exactly two are hidden: every piece listens to the clock
and every piece announces it is alive, so drawing those is forty lines that bury the six
that carry meaning. The screen says so, in words, rather than quietly omitting them.

Three kinds of number ended up on one screen, and keeping them apart turned out to
matter more than expected. Some are configuration — a threshold somebody chose. Some
are reported by the piece itself. And one, the message throughput, can only be counted
by the display, because nothing publishes it. Drawing that third kind the same way as
the second would be the screen asserting something no part of the system ever said.
They are drawn differently, and a test checks which kind each figure is, so a number
cannot quietly change class.

Then the vessel. It became a piece of the simulation in its own right, with a demanded
course, speed and depth, a current course, speed and depth, and limits it works within —
so a demand for a speed it cannot reach shows as a shortfall rather than as an instant
jump. It publishes its own position and motion as ordinary measurements through the same
path the water measurements take, which means the track it leaves comes back out of the
query interface like any other query rather than out of a private channel drawn straight
to the map.

And the instruments now sample where the vessel last said it was. Stop the vessel, and
two boxes further along the instruments start saying they have nothing to sample at, and
the count of skipped samples starts climbing. That is the consequence chain, on one
screen, where you applied the cause.

## The demo

The system as a circle, with the vessel bottom left and the forecast loop closing back
on itself. Stop the platform with its own button and watch the sensor box change its
sentence:

[Open it at the operator view](../../instances/main/#/view/operator)

The vessel's track on the map, drawn from a genuine query against the stored
measurements rather than from anything the map was handed directly:

[Open it at the map](../../instances/main/#/view/map)
