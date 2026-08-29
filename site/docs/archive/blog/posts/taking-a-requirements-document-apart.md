---
date: 2026-08-26
categories:
  - Process
slug: taking-a-requirements-document-apart
feature: specs/015-published-site
description: >-
  Turning a requirements document into sixteen features that can be built in
  parallel, a constitution enforced by lint gates, and an open-questions section
  that empties itself.
---

# Taking a requirements document apart

A requirements document is organised by subject. Messaging here, the query layer
there, security near the end. That is the right shape for reading it and arguing
about it, and the wrong shape for doing anything about it, because work is not
organised by subject. Work is organised by what must exist before something else
can start, and by what two people can do at once without treading on each other.

Converting one into the other is the first real engineering decision on a
project. It happens before a line of code is written and it is almost never
recorded.

<!-- more -->

The document in question specifies eighteen components, fifty-three functional
requirements and four acceptance tests, for a system that generates a synthetic
ocean, samples it, notices when its forecast starts disagreeing with the samples,
and recomputes.

## The ordering criterion is the decision

It ranks its own delivery priorities, and says what it ranks them by: **cost of
getting it wrong late**. Not size, not enthusiasm, not what would demo well.

Top of that list is deterministic replay — a shared simulation clock, seeded
random number generators, and a prohibition on any component asking the operating
system what time it is. It produces nothing anyone can look at. It is first
because retrofitting it is not a refactor: it is an audit of every line that ever
asked what time it is, including the ones inside libraries and the ones that took
a timestamp from the message broker's delivery metadata rather than from a
function call, and so do not look like time at all. A run that cannot be replayed
from its seed cannot be scored, and scoring is the only thing separating this
from a demonstration that asserts its own success.

Bottom of the list, explicitly below the line, is the blog machinery. Which is
what got built first. I will come back to that.

## Principles are only real if something fails the build

Alongside the requirements sits a constitution: ten principles, each a rule with
a rationale. It is a fashionable artefact and usually a useless one, because a
principle nobody can violate loudly is a principle everybody violates quietly.

The useful question is not whether the principles are good, but *what happens
when each is broken*. That sorts the ten into three groups.

**Five have a script that fails the build.** No wall-clock time. Seeded
randomness. Generated types only, with a drift check that regenerates and diffs.
No literal paths, hosts or ports in component source. No forbidden vocabulary
anywhere in the repository. Each is a grep with judgement, and each has one
escape hatch: an inline marker that must state a reason, reviewed like any other
line.

**Two are checked by acceptance tests instead**, because what they forbid is a
property of behaviour rather than of source.

**Three cannot be automated at all.** Honest ports; liveness rather than
configuration; recommendations rather than decisions.

That last group is where such a document earns its place, and "enforced" is the
wrong word for it. Take honest ports, which says the system claims exactly the
pluggability it has and no more. A table marks every boundary genuine port,
marginal, or not a port, and the observation store is marked *not a port* with
the reason: Postgres is not being swapped. The reflex — mine, certainly — is to
wrap the database in an interface anyway, because it looks tidy. That interface
would have exactly one implementation and would buy a flexibility nobody intends
to use. No script will catch it. What the constitution does is make adding it
require a written argument in a named place. That is a smaller claim than
enforcement, and it is the true one.

## What can actually run at the same time

Sixteen features, drawn as a dependency graph. The graph is the easy part. The
thinking went into noticing that dependency order is not the constraint that
bites: two features can be fully unblocked and still unable to proceed at once,
because they would be editing the same files. A wave therefore needs two
conditions, not one — inputs satisfied, *and* directories disjoint.

Both together give a first wave of five: the deterministic foundations library, a
proof that the query layer can serve a four-dimensional route query, the browser
shell, the deployment configuration, and the type generation chain. Five separate
trees, touching one shared surface — the directory of JSON schemas — where every
change is an addition rather than an edit.

The exit criterion for that wave is deliberately unimpressive: the client renders
all eighteen components greyed out, lit only by real heartbeats, of which there
are none. It looks like a broken application. It is the only honest picture of a
system with nothing running, and the rule producing it — a component is lit only
because a message from it arrived — matters more than a demo would. The day a
display can claim a component exists when it does not, the whole thing stops
being evidence of anything.

## The document moved while I was reading it

Here is the part I would rather not write, which is the reason to write it.

The document had four open questions, and I decomposed the whole thing into
features while they were still open. Then it was revised and answered them. Two
of the sixteen features changed shape.

The bigger change was to what had been a spike: whether the off-the-shelf query
layer handles per-vertex timestamps on a
[trajectory](../../../glossary.md#trajectory) query — give it a planned
route with a time at every waypoint, get back the conditions forecast for the
moment of arrival at each one. The answer turned out to be that the question was
wrong. No supplied provider implements trajectory queries at all, so the spike
into an unknown became a build.

One narrow unknown survived, and it is a good one. The standard carries
per-vertex time as the M ordinate of a WKT `LINESTRINGM`, which is an elegant
fit. Below a certain version of the geometry library — and of the C library
underneath *that* — M parses as NaN. The timestamps do not error. They vanish,
silently, before any application code runs, and the query returns a plausible
wrong answer. What remains is a version pin with a comment explaining itself, and
a test asserting that M survives parsing.

The specs had already been written against the older document, and had to be
revised. The sequence was not clean, and pretending otherwise would make this
less useful to read.

## The mechanism worth stealing

What made that recovery cheap is a rule about where answers are allowed to live.

The open questions section is a work queue, not a graveyard. When a question is
answered, the answer does *not* get recorded there. It migrates into a numbered
requirement, and the question is struck out. The section is now empty, and says
so:

> Nothing in this document is currently open. Questions are raised in this
> section as they arise and struck from it when they are answered, with the
> answer landing in a requirement rather than staying here.

An open questions section that only grows is a list of things everyone has agreed
to stop thinking about. One that empties is a queue. The difference is the rule
about where the answer may live, and it works because a requirement is something
implementations get checked against, whereas an answer in an appendix is
something people remember differently.

Nothing described here runs yet: sixteen features specified, a constitution
written, a graph drawn, no service existing. This site is the first thing built,
out of its place in the order and on purpose, for a reason familiar to anyone who
has watched a release pipeline fail on its first real use. A pipeline that has
never published is not known to work, and finding that out after fifteen features
is worse than finding it out now.
