---
date: 2026-08-26 16:00:00
categories:
  - Process
slug: the-gate-that-examined-nothing
feature: specs/001-deterministic-foundations
description: >-
  Four scripts enforce the constitution's non-negotiables. Writing the tests for
  them revealed that two were reporting a file of deliberate violations as clean,
  and the rule that caught it was the reason the tests existed at all.
---

# The gate that examined nothing

drogna has a constitution: ten principles, each a rule with a reason. Five of them
have a script that fails the build, and four of those five share a common shape —
walk the tree, report every violation with file, line, expression and rule, exit
non-zero if there are any.

<!-- more -->

What they hunt for:

**No host clock.** No component may ask the operating system what time it is.
Simulation time comes from one clock service, and a run that cannot be replayed from
its seed cannot be scored. Python is checked by parsing it into a syntax tree rather
than by matching text, so `from time import time as t` is caught along with the
obvious spelling. TypeScript and SQL are checked by pattern, which is coarser, and
SQL is where the interesting spellings live: `now()`, `current_timestamp`,
`clock_timestamp()`, `transaction_timestamp()`.

**Seeded randomness.** Not merely that generators are seeded, but that none is
constructed outside the one module allowed to construct them. A locally seeded
generator is reproducible and still wrong, because it does not appear in the run
manifest, and a run whose manifest does not describe all of its randomness is a run
nobody can repeat.

**No literal paths or hosts.** No filename, directory, hostname, port or URL in
component source, and no environment variable read other than the one naming the
component's configuration file. This is the rule that keeps two deployment
destinations from quietly becoming two systems.

**No tracked-entity vocabulary.** drogna holds environmental measurements, forecast
fields, uncertainty fields, sampling recommendations and telemetry, and nothing else.
Vocabulary is policed because vocabulary is how a data model acquires something by
accident: a field named `contact_id` is a tracked entity whatever the commentary
around it says.

## A gate that has never failed is not a gate

That sentence sits at the top of the test file, and it is there because a lint gate
which has silently stopped matching — a renamed module, a regular expression that no
longer fires, an exclusion that grew a directory too wide — looks exactly like a clean
tree. Both print the same thing. The only way to tell them apart is to hand each gate
something that must be caught and check that it complains.

So each gate got a fixture: a small file containing one deliberate violation, and for
two of them a matching clean file, because a gate that rejects correct code is worse
than no gate at all — it teaches people to stop reading its output.

The fixtures went where fixtures go, in a directory beside the tests. Two of the four
gates reported them clean.

Not "failed to match the pattern" — clean. Zero findings, exit code zero, a file
containing `time.time()` and `/var/lib/drogna/observations.db` pronounced free of both.
The wall-clock and literal-path gates treat any path under a directory named `tests`
as a permitted zone, because the constitution permits test harness setup to read a
host clock, and because a gate cannot read intent. It is a path rule on purpose: a
permitted zone that is hard to describe is a permitted zone that will be abused. The
fixtures were under a directory named `tests`. They were exempt for being exactly
what they were.

What happened next is the part worth recording. The assertions demanding a non-zero
exit failed loudly, which is how it was found. The assertions demanding a *clean*
exit — correct code accepted, a properly reasoned exemption honoured — passed. They
would have gone on passing for ever, against a gate that was examining nothing. Half
the suite was already vacuous and looked healthy.

That is precisely the failure the rule exists to catch, and the rule caught itself on
its first use. There is no better argument for planting a violation than watching the
technique find a hole in the machinery you built to plant it.

The fix has two parts, and both are needed. Fixtures are stored with a `.py.fixture`
suffix, which keeps them out of the repository-wide walk so that a planted violation
never fails the real gate run. And each is copied to a neutral temporary directory
before a gate is pointed at it, which is what actually defeats the test-zone rule. The
suffix alone would not have: a gate handed an explicit file path scans it regardless of
the exclusion list, and would then have skipped it for its location anyway.

## The marker that exempts nothing

Every gate has one escape hatch: an inline comment on the offending line or the line
above it, `harness:allow-wallclock` and its siblings, followed by a reason.

A marker with no reason exempts nothing. The gate reports the line anyway, with a
different message — *exemption marker carries no reason, so it exempts nothing* — and
there is a test that plants a bare marker over a real violation and asserts the build
still fails. An exemption nobody had to justify is an exemption nobody reviewed, and
the difference between a comment that switches a check off and a comment that records
an argument is entirely whether the machinery insists on the argument.

In Python the markers are read from comment tokens rather than from raw text, so a
marker quoted inside a docstring is prose and not permission. And any gate can print
the whole repository's exemptions as one list, which is the artefact a reviewer
actually wants: not "are there exemptions" but "here are all ten of them and why".

There are ten today. Three concern the host clock: the clock service's own real-time
driver, and two for the heartbeat exemption the constitution added by amendment —
liveness windows are measured in real time, because a simulation clock paused at rate
zero for a screenshot would otherwise grey out a running system. One is the single
relative URL a browser must know in order to fetch the document that tells it every
other location. Five are schema files being opened from inside the package that ships
them, which is not a deployment location. The last is a JSON pointer into a document,
which looks like a path and is not.

## What these gates are not

They are not a proof of compliance. Three of the constitution's ten principles cannot
be automated at all, and two more are checked by acceptance tests because what they
forbid is a property of behaviour rather than of source.

Nor are they free of rough edges. One import statement in the client carries a comment
explaining that it is deliberately not wrapped across lines, because the literal-path
gate reads a wrapped import's closing line as a bare string and flags it. That is the
gate being wrong, accommodated in the source rather than fixed, and the honest thing
is to write down which way round it is.
