---
title: A title that is the finding, not the subject
date: 2026-01-01
feature: specs/1NN-the-feature-directory
description: >-
  One or two sentences naming the problem and what turned out to be true. This is
  what the index page shows beside the entry, so it is not a summary of it; it is
  the reason to read it.
---

# A title that is the finding, not the subject

## The background

Two or three paragraphs on the problem, in terms a reader outside the project would
recognise. No component names yet, no requirement numbers, nothing that assumes the
reader has seen the repository. If the problem is a question, ask it.

The second paragraph usually says why the obvious answer does not work, which is what
makes the rest of the entry worth reading.

## The requirement

What had to become true, in a sentence or two. Say what the requirement asked for rather
than naming it — a reader cannot look up "FR-14".

## The options considered

What else was on the table and why the one chosen won. If a wrong turning was taken
first, this is where it goes, with what it looked like from the inside before it was
recognised as wrong: that is the part a reader cannot reconstruct and the part they came
for. Link the first use of a term that needs it:
[decorrelation timescale](../../glossary.md#decorrelation-timescale).

## The demo

The running thing, which is the point of the entry — **captured**, so it is in the entry
rather than one click away from it. A change that moves is captured moving
(`pnpm capture:motion`); a change that does not is captured still (`pnpm capture:glance`,
which takes `DROGNA_GLANCE_VIEWPORT=390x844` for a phone). The capture goes at the top of
the entry where the subject is visual, not at the bottom.

Link the instance as well, opened at the view — for the reader who does click, and
because it is the system rather than a picture of it:

[Open it at the map](../../instances/main/#/view/map)

<!-- Two levels up, not three: an entry is published at `blog/posts/<slug>/`, and the
     estate's instances sit beside `blog/`. The link gate refuses the third level, and
     refused it the first time this template was used. -->

For headless work, the wrapper that reads the component through the seam and exercises
it across its range:

![A description of what is in the picture, long enough that a reader who cannot see it
loses nothing: what is on the screen, what state it is in, and what in it is the point
of the picture.](../assets/1NN-the-slug.png)
