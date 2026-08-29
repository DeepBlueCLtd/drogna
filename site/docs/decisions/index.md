---
title: The decision records
description: Every decision that was hard to reverse or genuinely contested, with the status read out of the record itself.
order: 80
collapse: true
---

# The decision records

An architecture decision record is written for any decision that is hard to reverse,
was genuinely contested, or where a plausible alternative was rejected. Routine choices
do not earn one. Each record carries Status, Context, Decision and Consequences, is
numbered sequentially, and is dated. Superseded records are kept and marked, never
deleted — the numbering continues across the version boundary rather than restarting,
so a record's number is a fixed address for the life of the project.

The records live in the repository, at `docs/adr/`. They are published here from there:
the direction of travel is out of the repository record and into the site, never the
other way, and nothing on this site is the master copy of a decision.

The **status column is read out of each record**, not retyped beside it. A record
amended by a later one says so in its own status line and therefore says so here. That
is the whole reason the table is generated: V1's index was hand-maintained, and the
first thing that went wrong with it was a status that had moved on in the record and
not in the list.

Records 0001 to 0026 belong to Version 1 and describe software that has been retired.
They are kept because the reasoning is the part worth keeping, and each carries a banner
saying what it is. **0027** is the reversal itself; the records from 0028 on are
Version 2's.

<!-- generated: decision index -->
