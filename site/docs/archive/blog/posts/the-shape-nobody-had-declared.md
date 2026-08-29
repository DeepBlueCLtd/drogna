---
date: 2026-08-28 09:00:00
categories:
  - Architecture
slug: the-shape-nobody-had-declared
feature: specs/006-generated-types
description: >-
  A check forbids hand-writing the shape of a message that crosses between two
  programs. It had been passing for weeks with two hand-written copies of one
  shape sitting in the tree, and the reason is the same sentence in both halves.
---

# The shape nobody had declared

Two programs written in two languages have to agree about the contents of a message.
One writes it, the other reads it, and if they disagree by one field name the failure
arrives at runtime, in production, as a key error in the half that did not write the
message.

The standard answer is to write the shape down once, in a language-neutral schema, and
generate both sides from it. Nobody hand-writes the Python class or the TypeScript
interface; a script does, and a check compares the generated output against the schema
so that an edit to the output is caught. That is what this project does, and it has a
second check beside the first: a lint that fails if somebody declares a message shape by
hand, beside the code that uses it, where nothing will ever regenerate it.

Both checks were green. There were two hand-written copies of one shape in the tree, and
had been for the whole life of the second check. Neither check was broken.

<!-- more -->

## The check can only forbid what it has been told about

The lint works by comparing candidate declarations against the schemas. It walks the
repository looking for classes and interfaces that look like message payloads, and for
each one it asks: is this the same shape as something under the schema directory? If it
is, it is a second declaration of a shape that already has an authority, and that is a
finding.

Read that again with the failure in mind. A hand-written class is a finding *because a
schema describes it*. A hand-written class describing something no schema describes is
not a finding at all — it is an ordinary internal type, which the lint is explicitly not
supposed to flag, because most classes in most programs are exactly that and a check that
flagged them would be turned off within a day.

So the rule has a hole shaped precisely like the problem it exists to prevent. The
failure mode is somebody declaring a boundary shape beside the code that uses it and
nothing regenerating it ever again — and the very first step of that failure, declaring
it without a schema, is the step that makes it invisible.

## What was actually in the tree

The security work scores a statistic against the ground truth of where measurements were
taken: a list of positions and times, with a radius. That list was being carried around
in a file beside the exported bundle, read with hand-written field checks, and described
by no schema anywhere.

Two places needed to read it. Both declared a small class called `Measurement` with the
fields they expected. They had drifted no further than each other yet, which is the only
luck in this story, and the checker that read the file accepted a longitude in the 0-360
convention, a zero identification radius and any extra key you cared to add — silently,
because a hand-written field check is a list of the mistakes its author happened to think
of.

The fix was not to the lint. The specification had said all along that a run's
measurement locations belong in the run's own manifest, which is a document that *does*
have a schema. Extending that schema with the block was a small edit.

## What did not work

The first instinct was to treat the difference between the specification and the code as
the specification being loose, and to reword it. That would have been the fourth time on
this project that a requirement was quietly rewritten to match what had been built, and
it would have been wrong here: the requirement was right. A run's measurement locations
are the same kind of fact as its seeds and its versions, and the manifest is the document
that carries facts of that kind.

Putting the question the other way round — extend the schema or amend the requirement? —
took a minute and produced the better answer. Folding the standalone document into the
manifest also deleted two of its fields rather than moving them: they were the manifest's
own identifiers, restated. A document that has to be carried beside another document
usually turns out to be part of it.

The second wrong turning was smaller and more instructive. Once the block was declared,
the schema was deliberately weakened — the minimum-length rule and the longitude bounds
removed, the types regenerated — to see whether the two tests that ought to notice would.
They did not, at first. They had been asserting that a valid document was accepted, which
a validator with no rules also does. They now assert refusal, and were watched failing
with `DID NOT RAISE` before the schema was restored.

## What is now known

Declaring the shape took about ten minutes and immediately produced two findings that had
been sitting in the tree, invisible, for as long as the check that should have found them
had existed. Both places now import the generated model, and ten malformed documents were
each watched being refused by name and by field.

The general form is worth stating because it applies to every check of this kind: **a gate
that compares the code against a declaration cannot see anything nobody declared.** Its
clean run is a statement about the declarations, not about the code. The cheap defence is
that writing a schema is not documentation of a decision already taken — it is the thing
that makes the decision visible to everything downstream, including the checks you are
relying on to tell you when you get it wrong.

One shape is still hand-written, in the component that reads observations, and it stays
that way on purpose: it never crosses a boundary, so no schema describes it and none
should.
