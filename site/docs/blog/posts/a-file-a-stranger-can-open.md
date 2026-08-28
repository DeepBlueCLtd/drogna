---
date: 2026-08-28 12:00:00
categories:
  - Standards
slug: a-file-a-stranger-can-open
feature: specs/014-offload-export
description: >-
  Exporting data so that somebody who has never seen your project can plot it
  without writing bespoke code. The standard that makes it possible also made a
  provenance scanner report the standard's own vocabulary as suspicious.
---

# A file a stranger can open

Data leaves this system as a file. Somebody else receives it, and the test of whether the
export is any good is simple to state and hard to pass: can a person who has never seen
this project open the file in a standard tool and plot something, without writing code
against a description of the format?

Most exports fail that test in the same way. They are perfectly good arrays of numbers whose
meaning lives somewhere else — in a wiki page, in a README, in the head of the person who
wrote the exporter. Which is fine until the wiki moves, or until the reader in three years
is not the reader the documentation was written for. The fix is not more documentation. It
is putting the meaning inside the file.

<!-- more -->

## Self-description is a controlled vocabulary, not a comment

The conventions this export follows do two things that a homemade format usually does not.

Units say a number is in degrees Celsius. A *standard name* says what is in degrees Celsius,
drawn from a published table rather than invented at the keyboard. That is the difference
between a file a program can interpret and a file a person has to. "temp", "temperature",
"sea_temp" and "t" are four names for one quantity and no tool can unify them; one name from
a controlled list is a name every tool already knows.

The second is the harder one, and it is about shape. This export carries a series of
vertical [profiles](../../glossary.md#profile) — a column of measurements at a position —
taken at a sequence of positions along a path. That combination has a name in the
conventions, as one of a small set of
[discrete sampling geometries](../../glossary.md#discrete-sampling-geometry): a
[trajectory](../../glossary.md#trajectory) of profiles. Declaring it means a reader knows,
from the file alone, that the depths belong to positions and the positions are ordered in
time, rather than having to infer it from the dimension names.

## The ragged case is where homemade formats break

The profiles are not all the same length. The seabed is closer in some places than others,
so the deeper columns are longer, and a rectangular array cannot hold them without padding.

Padding is the obvious answer and it is a bad one. A fill value in a numeric array is a
value; whatever sentinel you pick, some tool somewhere will average it, plot it, or take its
minimum. The convention has a proper representation for this — the observations are stored
end to end, with a count per profile saying how many belong to each — so the file contains
exactly the measurements taken and no fabricated ones. That the export does this is
asserted by a compliance check on every build, over a fixture run pushed through the real
packaging code rather than a sample file kept beside the test.

## What did not work

The bundle is also scanned for provenance leakage: does anything in the file give away a
path, a hostname, a user, or the identity of a piece of equipment? The scanner works from an
allow-list of attributes known to be harmless, and anything not on the list is reported.

Run against a produced bundle it reported zero identifying hits — no path, no host, no user,
no equipment identifier, no revealing coordinate, in either the data file or its sidecar.
Good. It also reported a handful of attributes that were not on the list at all: the keys
that declare the sampling geometry, the dimension names it requires, the geometry's own type
string, and a conventional time-units string.

Every one of those is the standard's vocabulary. The allow-list had been calibrated against
the gridded products the release boundary normally handles, and this file is not one of
those. The scanner was not wrong; it was being asked about a kind of file it had never been
shown.

The tempting move was to widen the allow-list on the spot and get a clean run. That was
declined, for two reasons. Widening it is meant to be a deliberate, reviewable edit owned by
the component that owns the boundary — making it a side effect of some other feature's work
is how an allow-list stops meaning anything. And an exported bundle is not a released
artefact in the sense that list is about, so the edit would have been made in the wrong
place for the wrong reason.

What was done instead: the specific attributes are pinned by name in the test, so a hit that
is *not* one of them fails. "Zero identifying hits" is asserted. "Zero findings from an
unmodified rule file" is not asserted, and the difference is written down rather than
smoothed over.

## What is now known

Two things, one about the standard and one about the record.

Following a real convention costs more than inventing a format and it buys something
specific: the file stops depending on documentation, which means it stops depending on the
documentation still being findable and still being read. The ragged-profile representation
is the part that would have been got wrong, because padding is easier and looks fine right
up until somebody takes a mean.

And a check that reports something you were not expecting is worth more than a check you
tuned into silence. The honest close here was to write down exactly which claim is being
made and which is not — because a green run whose rule file was edited to make it green is
the same colour as a green run that means something, and only the record can tell them
apart.
