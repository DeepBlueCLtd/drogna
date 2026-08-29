---
date: 2026-08-27 14:00:00
categories:
  - Feature
slug: the-box-that-had-nothing-to-say
feature: specs/001-deterministic-foundations
description: >-
  Every screenshot this project has published shows an application in which nothing
  is running. The components were running. What none of them had was anything to
  publish with, and the one piece that could publish was locked inside a component
  that did not need it.
---

# The box that had nothing to say

For most of this project's life there has been a screen showing eighteen boxes, all of
them grey, above a line reading *0 of 18 components heard from*. That was published as
an honest picture of a system with nothing running yet, and for a long time it was one.

It stopped being one some time ago and nobody noticed. Sixteen of the eighteen
components had been built. They started, they did their work, they exited cleanly. The
screen still said it had never heard from any of them, and the screen was right — not
because the components were dead, but because none of them had been given anything to
speak into.

<!-- more -->

## A default argument that meant the opposite of what it looked like

Each component runs as a process with an entry point that looks roughly like this:

```python
def main(
    *,
    env: Mapping[str, str] | None = None,
    publisher: MessagePublisher | None = None,
) -> int: ...
```

`publisher` is the thing that puts a message on the broker. It is injected rather than
constructed, which is good design: it makes the component testable without a broker, and
it keeps knowledge of the messaging library out of the logic.

The default is `None`. Ten of the eleven components had that default, and nothing else
ever passed anything. So in production — in the only mode anybody actually ran them in —
every one of them started up, checked whether it had a publisher, found it did not, and
carried on in silence.

The code even said so, on the way past:

> `clock: no publisher was supplied, so no clock sample and no heartbeat is published and`
> `nothing lights up. That is truthful, not a degradation`

That message is correct and well-judged. A component with nowhere to publish should say
so plainly rather than pretending. What nobody had noticed is that it was being printed
on *every single run*, by nearly every component, for months. It had stopped being a
warning about an unusual configuration and become the description of normal operation.

## The comment that told us how long ago this was true

The clock's entry point carried this in its module docstring:

> There is no MQTT client in this repository yet — the observation path that brings one
> is feature 007 — and a component with no broker configured does not invent one and does
> not publish to a stub. […] The moment a publisher is supplied, this component is the
> first thing in drogna to light a box in the shell, and every later component follows
> the same three lines.

Feature 007 had landed. The MQTT client existed. It was a class called `PahoPublisher`,
about eighty lines, doing exactly what the docstring was waiting for.

It was inside the sensors component.

That is the whole failure, and it is not a dramatic one. Somebody needed a broker client
in order to publish observations, wrote a good one, and put it next to the code that
needed it. Nothing was wrong with that decision at the time. What made it expensive is
that it was *also* the piece nine other components were waiting for, and being filed
under one component's name made it invisible to the other nine — including to the
docstring that was explicitly waiting for it to exist.

The repository had seen this happen twice already. Its own build gate says so, in the
comment explaining why the gate exists:

> the repository has twice watched a shared shape sit inside a service and acquire
> consumers across a boundary — `encode_netcdf` in the environment generator,
> `read_netcdf` in the divergence monitor — before anybody moved it to `libs/`.

This was the third. The gate was written to catch exactly this and could not, because a
gate that reports coupling between components only fires once somebody *creates* the
coupling. Nine components quietly doing without the thing is not coupling. It is the
absence of coupling, and it looks identical to not needing it.

## Two states that were not the same state

Moving the class was straightforward. Wiring it up was not, and the interesting part is
why.

The obvious change is to make the default construct a publisher from the component's
configuration instead of being `None`. That is a one-line change and it immediately broke
four tests, all of which were right.

The problem is that `None` was carrying two different meanings that had never needed to
be distinguished, because only one of them had ever happened:

1. **Nobody supplied a publisher.** In production this is every run, and the sensible
   response is to build one from configuration.
2. **Somebody supplied "no publisher", deliberately.** In tests this is a component being
   run with no way to publish, on purpose, to check it behaves correctly with nothing to
   talk to.

Make the default construct a publisher, and case 2 disappears: a test that explicitly
asked for silence gets a component trying to open a socket to a hostname that does not
resolve, and exiting with a failure. The tests that caught this are the ones asserting
the project's rule that nothing may light up unless a real message arrived — so
collapsing the two states broke precisely the guarantee the whole screen is for.

The fix is a sentinel: a distinct default value meaning *not supplied*, so that `None`
keeps meaning *supplied, and it is nothing*. Unremarkable once written. Worth writing
down because the version that looks equivalent is not, and the difference only shows up
in the case that had never occurred.

## What happens when the broker is named but not there

That left a third state nobody had needed to decide: configuration names a broker, and
the broker does not answer.

The sensors component already had an answer — it exits. That is right for the sensors,
because publishing observations *is* what a sensor does; one that cannot publish has no
work to do and should stop rather than sit there looking healthy.

It is wrong for everything else. The clock still advances the run and answers questions
over HTTP. The environment generator still writes a world to disk. The packager still
moves bundles around. All of them have work that is not publishing, and making a missing
broker fatal would mean nine components refusing to start because a tenth was slow to
come up.

So the two policies differ, deliberately, and each says which one it is on the way past.
What neither does is publish to a stub, or report itself alive while disconnected.

## The picture

<figure markdown="span">
![The drogna component shell. The line beneath the heading reads "1 of 18 components heard from within the window each declared". The transport panel reads "Connected, and receiving control traffic" with zero messages discarded. In the flow chart below, the box for C-01 Simulation clock is drawn dark and filled, labelled HEARD FROM, with the line "reports starting · at 2026-01-01T00:00". Every other box in the drawing — environment generator, simulated sensors, ingest client, monitor, scheduler, broker, observation store, publisher, model runner, and the row below them — remains grey and labelled NOT HEARD FROM.](../assets/001-the-clock-lights-its-box.png)
<figcaption>One box lit, by a heartbeat that actually arrived. This is the blog's fixed
capture viewport rather than the whole page.</figcaption>
</figure>

One box out of eighteen. It is not much to look at, and it is the first time in this
project's history that the number on that line has not been zero.

## A decision that turned out to be load-bearing

Getting the picture required the simulation clock to be pinned — a capture of a moving
system differs everywhere and evidences nothing — which raised a question the project had
already answered on paper and never tested.

Heartbeats are how a component says it is alive. If a heartbeat were due every *simulated*
minute, then pinning simulated time would mean no heartbeat is ever due again, every
component would fall silent, and the screen would go dark during the very capture meant
to show it lit. The project decided early that heartbeat cadence is measured in real time
and that the simulated time a heartbeat carries is payload rather than schedule.

That decision had never been observed working, because there had never been a heartbeat
to observe. With the clock pinned at rate zero it emits no time samples at all — and two
heartbeats arrived in eleven seconds, exactly on their real-time cadence. Simulated time
stopped and nothing else did.

## What did not work, and what it cost

The capture failed three times before it succeeded, and each refusal was the mechanism
working rather than breaking.

**It refused to photograph a moving page.** With the clock running normally, the capture
gave up with *"its markup changed 838 times in 900 animation frames and never held still
for 12 consecutive frames"*. Exactly right: an image taken then would differ from the next
one for reasons having nothing to do with anything under evidence.

**It could not pin the clock.** In the real deployment the client and the clock's control
route sit behind one reverse proxy, on one origin. Run outside that, the browser's request
to change the rate is cross-origin and the browser blocks it — so the clock never
acknowledged, and the capture correctly refused rather than photographing an unpinned
page.

**Then it produced a picture with nothing lit, twice.** The clock was publishing
heartbeats — verified independently on the broker — and the shell still showed zero. The
reason is a real property of the system worth knowing: heartbeats are not retained
messages. A subscriber gets the *next* one, never the last one. The capture opens a
browser, waits for the page to settle, photographs it and closes, all inside about two
seconds; the heartbeat interval was five. Most of the time the browser had already gone
before the clock said anything.

Nothing was wrong. A live subscriber that has been listening for six seconds sees
everything. A subscriber that exists for two seconds sees whatever happens to fall inside
those two seconds, which is often nothing. Shortening the configured cadence fixed it.

## Two things this turned up that are not fixed

**The sensors cannot light their box, and the reason is the access control list.** The
broker's rules give the sensor role permission to write to the observation branch and
nothing else, which is deliberate and good: a sensor that could publish on the control
branch could forge a heartbeat. But heartbeats *are* on the control branch. So the sensor
publishes one, the broker refuses it — silently, because the client library reports
success for a message it has handed over locally — and the component believes it has
announced itself while nothing has heard anything. C-04 cannot light, however it is wired.
Fixing it means deciding whether a sensor may write one control topic, which is a change
to a security rule and not something to slip in while wiring publishers.

**The packager has a voice and no light.** It publishes telemetry but no heartbeat at all,
so it can report on its own work while remaining permanently grey.

Both are now regression tests that assert the current behaviour, so the day either
decision is taken, a test fails and says so.

## What the whole thing was about

The screen was never lying. Every one of those grey boxes was a true statement: nothing
had been heard from that component. What made it misleading was that the reason had
changed underneath it — from *this has not been built* to *this has been built, and has
nothing to publish with* — and the display has no way to tell those apart, because from
where it sits they are the same observation.

That is the right design. A viewer that could distinguish them would have to be told
something other than by a message arriving, and then it would be reporting an intention
rather than a fact.

The lesson is not about the display. It is that a component printing *"nothing lights up,
that is truthful, not a degradation"* on every run, for months, is a sentence that stopped
being read the second time it appeared. It was doing its job perfectly and telling nobody,
which is the same failure as the grey box, one level up.
