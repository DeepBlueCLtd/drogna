---
date: 2026-08-28 10:00:00
categories:
  - Architecture
slug: one-file-two-readings
feature: specs/008-query-layer
description: >-
  Two halves of a system were built at the same time against one shared
  convention. They disagreed about five things, every test on both sides passed,
  and nothing either of them wrote could ever have been read by the other.
---

# One file, two readings

Two parts of a system share a directory on disk. One writes into it, the other reads out
of it. That is a good seam: no network call, no shared library, no interface to keep in
step — just a documented layout that both sides obey. It is the kind of dependency you
can build either side of independently, which is why the plan put them in the same wave
and named the layout as the one thing they shared.

The plan also named the risk in a sentence: the two might disagree about the layout, so
one of them owns the document. That mitigation is doing much less work than it looks like
it is doing. Owning a document does not make anybody read it.

They were built simultaneously and disagreed about five separate things, including the
one that made the other four irrelevant.

<!-- more -->

## The five disagreements

Where the root of the store sits. Whether runs sit directly under it or inside a
subdirectory. What the file describing a run is called. What prefixes a run directory's
name. And how the pointer that names the current run is written.

The first four are spelling. Given time, somebody would have noticed a path that did not
resolve, fixed one name, then the next, and so on. Annoying, visible, and self-announcing
the moment the two halves were run together.

The fifth is not spelling. The writer created the pointer as a **symbolic link** to the
run's directory. The reader opened the pointer as a **text file** and expected one
identifier on one line.

Reading a symlink-to-a-directory as a text file does not return a name. It raises. So
nothing the writing half published could ever have been visible to the reading half — in
either direction, whatever the other four names had been spelt as. Correcting all four
would have left the reader refusing every run for a fifth reason.

## Every test passed

Both sides were thoroughly tested, and every test on both sides was green throughout.

The writer's tests wrote a store and read it back with the writer's own code. The reader's
tests built a store fixture and read it with the reader's own code. Each half was
internally consistent and each half was correct about the store it had itself built.
Nothing anywhere drove one into the other.

That is the shape to recognise, because it is not a testing failure in the usual sense —
nobody omitted a test they had thought of. It is that a convention shared by two
components is a thing neither component can test alone, and both components' test suites
will look complete without it. The seam is the thing under test, and the seam is exactly
what a fixture replaces.

## What did not work, and the fifth divergence that showed why

Reconciling the four names first felt like progress and was not. The genuinely useful
discovery came last: even with the paths agreed, the *contents* of the run's descriptive
file did not match either. The writer was moving a staging descriptor into the store
unchanged, and its keys were not the reader's keys — `status`, `member_count` and
`digests` against a schema version, a root seed, a run sequence, a generator version, a
simulation time and an ensemble block.

So the pointer was one problem and the document was another, and both of them were the
same underlying mistake: each half had built what was convenient for itself and called it
the convention. The fix was a translation step in the writer — produce the document the
layout describes, rather than forwarding the document you happen to have.

## The argument for the symlink, and why it lost

The symlink had two real advantages and they should be stated, because the decision is
not obvious. A reader can open the current field at a fixed path in one step, with no
indirection. And two consumers had already assumed it, which is evidence about what people
expect.

It lost on a property the layout asks for that a symlink cannot express. The layout
requires that "two runs claim to be current" be a **reportable state** — a writer that
half-failed should leave evidence, and a reader should refuse and say which two.

A symlink points at one thing or at nothing. The conflict is inexpressible: the writer
cannot leave the evidence and the reader cannot report it. A text file can hold two lines,
and the reader refuses and names both identifiers. The atomicity argument that usually
decides this question is a wash — replacing a pending file is as atomic as replacing a
pending link.

## What is now known

A shared convention between two components is a third artefact, and it needs a test that
is not owned by either of them: one that drives the real writer into the real reader. Both
halves being green means both halves agree with themselves.

And when choosing a representation for a piece of coordination state, ask what failures it
has to be able to *represent*, not only what it has to say when things are going well. The
symlink is a better answer to "where is the current run" and no answer at all to "two
things claim to be the current run", which is the question the layout actually asked.
