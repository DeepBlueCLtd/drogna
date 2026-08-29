---
title: The blog
description: One entry per significant component, written after it works, with the running thing embedded.
order: 70
collapse: true
---

# The blog

An entry is written when a significant component arrives — a new face in the shell, or
a piece of backend simulation worth watching work. Not one per feature: a feature that
delivers three visible things earns three entries, and a feature that delivers plumbing
earns none until the plumbing does something a reader can see.

Entries are terse and take a fixed shape:

1. **The background** — what was there before.
2. **The requirement** — what had to become true.
3. **The options considered** — and why the one chosen won.
4. **The demo** — the running thing, linked or embedded, opened at the view in question.

The fourth part carries the weight the prose used to. Where the significant work is
visible, the entry embeds a playable instance of the shell. Where it is headless, the
entry embeds a small page that reads the component through the seam and exercises it
across its range — possible only because the data crosses in wire shape, which makes
such a page an ordinary consumer rather than a special build.

Entries are written for a general technical reader who has not read the requirements
document and has no particular reason to care about oceanography. Terms that need it
link to the [glossary](../glossary.md).

drogna is a demonstration harness. Its data is synthetic and its numerics are
deliberately fake — see [the landing page](../index.md) for what that means and why it
matters.

## Entries

<!-- generated: entry list -->

## Coverage

Every Version 2 beat, against the entries that name it. A beat with no entry gets a row
saying so: the gap is the reason the table is published at all, and the table is
counted from the tree — the feature directories under `specs/`, against the `feature`
field in each entry's own front matter — so it cannot flatter the record.

<!-- generated: blog coverage 1nn -->

## The Version 1 entries

Seventeen entries were written during Version 1, one per feature, and they are kept in
[the archive](../archive/blog/index.md). Several are about faults found in drogna's own
checks rather than in drogna, which is the part that aged best.
