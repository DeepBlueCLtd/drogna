---
date: 2026-08-28 11:00:00
categories:
  - Architecture
slug: borrowing-a-clock-you-are-not-allowed-to-read
feature: specs/012-visualisation
description: >-
  A rule says no component may read the host clock. A display that obeys it
  literally steps and stutters. The exemption that fixes it is three sentences,
  and the three sentences are the entire design.
---

# Borrowing a clock you are not allowed to read

This project has a rule near the top of its list: nothing reads the wall clock of the
machine it is running on. Everything is paced by a simulated clock published as a stream of
discrete samples, so a run can be slowed down, sped up, paused or replayed and every part
of the system agrees about what time it is.

It is a good rule and it is genuinely load-bearing. It is also, read literally, a rule that
makes a smooth display impossible.

A browser draws sixty frames a second. Simulation time arrives as samples at whatever rate
the transport delivers them — perhaps one a second, perhaps less. If the display only moves
when a sample arrives, it moves once a second and holds still in between, which does not
look like a slow clock. It looks like a broken program.

<!-- more -->

## The conventional fix is the forbidden thing

Everybody solves this the same way. You keep the two most recent samples, and between them
you interpolate using the browser's own animation timestamp — how far through the gap are
we, in real milliseconds? — and you draw the intermediate value.

That timestamp is host time. It is precisely what the rule forbids, and there is no clever
substitute: the information you need is "how much real time has passed since the last
sample", and only the host can tell you.

So there are three honest options. Break the rule quietly. Ship a display that stutters.
Or write down an exemption narrow enough that it cannot grow.

The first is how a principle becomes decoration — one silent violation, and the next person
to want one has a precedent instead of a rule. The second is a real answer and it was
weighed: a display that steps at the sample rate is not wrong, it is just bad. It was
rejected on the grounds that the display exists to be watched, and a display nobody can
bear to watch is not evidence of anything.

## The exemption is three rules, and they are the design

The client may read the browser's animation timestamp for one purpose: interpolating
between two received simulation clock samples, for display. Three constraints bound it,
and each one closes a specific way the exemption could turn into the thing it is an
exemption from.

**It may only interpolate between two samples actually received — never extrapolate past
the most recent one.** This is the important one. Extrapolation would mean the display
inventing a simulation time the clock has not reached, which is not smoothing; it is the
display making a claim about the system that the system has not made. Interpolation between
two known points cannot do that: every value it produces is one the clock has already been
through.

**Every arriving sample is authoritative and snaps the display to it.** The interpolated
value is discarded on arrival rather than blended with the new one. Blending is the shape
that feels gentler and is worse: it lets error accumulate, so the display's idea of the
time drifts steadily away from the clock's while never visibly jumping. Snapping means the
worst case is one visible correction, bounded by the sample interval, and never a
compounding lie.

**Nothing derived from it leaves the render path.** Not into a query, not into a message,
not into a stored measurement, not into a screenshot's recorded time, not into any
assertion in any test. The moment an interpolated value is written down somewhere, it stops
being a rendering convenience and becomes a fact the system believes.

## What did not work

The first shape of this had the display continue moving when samples stopped arriving —
carrying on at the last known rate, on the reasoning that a gap is probably transport
latency rather than a stopped clock, and that freezing looks like a bug.

It is wrong for a reason worth naming. If the clock is running at a rate of zero, samples
stop; if the transport has failed, samples stop. The display cannot tell those apart, and
a display that keeps moving has *chosen* one of them and shown it to a person as fact. A
paused simulation would be drawn as a running one.

Holding at the last sample gets both cases right by refusing to distinguish them: a rate of
zero and a broken transport both look like a display that has stopped, which is exactly what
is true in each. Preferring the reading that makes both cases honest, over the one that
makes the common case prettier, is the trade this project keeps making.

## What is now known

The value of an exemption is entirely in how narrowly it is written, and the way to write
it narrowly is to enumerate the ways it could grow and forbid each one by name. "Host time
for display smoothing" is a sentence anybody could argue their way past. "Interpolate only,
never extrapolate; snap on arrival; nothing leaves the render path" is not.

It was also worth the delay. This was originally carried in the feature's specification as
an open complexity item rather than committed quietly to the code, which meant that when it
came to be decided there was a written record of somebody knowing it was a violation — and
that is the difference between an exemption and a slip that nobody has noticed yet.
