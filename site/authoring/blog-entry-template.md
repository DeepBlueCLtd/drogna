---
title: A title that is the finding, not the subject
date: 2026-01-01
feature: specs/1NN-the-feature-directory
description: >-
  One or two sentences naming the problem and what turned out to be true. This is what
  the index page shows beside the entry, so it is not a summary of it; it is the reason
  to read it. Fifty words at most.
---

# A title that is the finding, not the subject

<!-- Three to six tweets in total: 300 words of prose, checked by `check-blog-length`,
     which reads that number out of the table in site/authoring/README.md. Roughly 70
     words a part — two or three sentences each. The demo carries the rest. -->

## The background

The problem, in terms a reader outside the project would recognise. No component names
yet, no requirement numbers, nothing that assumes the reader has seen the repository.

Then why the obvious answer does not work, which is what makes the rest worth reading.
One sentence is usually enough for it.

## The requirement

What had to become true, in a sentence or two. Say what the requirement asked for rather
than naming it — a reader cannot look up "FR-14".

## The options considered

What else was on the table and why the one chosen won. If a wrong turning was taken
first, it goes here rather than the recap does: what it looked like from the inside
before it was recognised as wrong is the part a reader cannot reconstruct and the part
they came for. Link the first use of a term that needs it:
[decorrelation timescale](../../glossary.md#decorrelation-timescale).

## The demo

The running thing, which is the point of the entry and the reason the prose can stop
early. For visible work, an instance opened at the view, with a line saying what to do
when it opens:

[Open it at the map](../../instances/main/#/view/map)

<!-- Two levels up, not three: an entry is published at `blog/posts/<slug>/`, and the
     estate's instances sit beside `blog/`. The link gate refuses the third level, and
     refused it the first time this template was used. -->

For headless work, the wrapper that reads the component through the seam and exercises
it across its range. A screenshot is the fallback, not the deliverable; its alt text is
exempt from the word budget and should be long enough to stand in for the picture:

![A description of what is in the picture, long enough that a reader who cannot see it
loses nothing: what is on the screen, what state it is in, and what in it is the point
of the picture.](../assets/1NN-the-slug.png)
