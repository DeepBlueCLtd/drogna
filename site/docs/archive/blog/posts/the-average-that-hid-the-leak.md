---
date: 2026-08-28 11:30:00
categories:
  - Feature
slug: the-average-that-hid-the-leak
feature: specs/013-security-proxy
description: >-
  A check scored one number over everything released and reported it safe. One
  of the released variables was a perfect map of the thing being withheld, and
  the aggregate is the shape that makes that invisible.
---

# The average that hid the leak

Some data can be released and some cannot, and the interesting failures are the ones where
everything released is individually permitted and the *set* still gives away what was
withheld.

The case this component guards is a good example. Publish a forecast field twice, an hour
apart. Subtract one from the other. The cells that changed are the cells the model
refreshed, and if the model only refreshed the neighbourhood of recent measurements, that
picture of changed cells is a map of where the measuring happened — which is the thing the
boundary exists to withhold. Every number in both files was allowed out. The subtraction
was not.

So there is a check: compute the mask of changed cells, score it against the true
measurement locations, and fail if the agreement is better than chance by a margin. It
worked, it had a deliberately leaky control to prove it had power, and it was scored over
the released product as a whole.

Scored that way, it passes a released set containing a perfect leak.

<!-- more -->

## The fixture is the argument

The evidence is committed rather than argued, which is the right way round for a claim like
this. It is a pair of released products with the mitigation applied *properly* to the
temperature field — the whole domain is rewritten on every publication cycle, so its changed
mask covers 918 of 1024 cells and predicts nothing whatsoever — and, released beside it, a
field recording how old the observations behind each cell are.

That second field's changed mask is the buffered sampling geometry. Exactly. Ninety-six
cells, and nothing else.

| Scored over | Recovery statistic | Against the bounds |
|---|---|---|
| the union of the masks | 0.105 | at or below the 0.15 chance bound: **passes** |
| the temperature field alone | 0.011 | at chance: passes, correctly |
| the observation-age field alone | 1.000 | at or above the 0.6 detection bound: **fails** |

A perfect leak, and a check reporting the set as mitigated.

## Why the aggregate is the wrong thing to score

It is tempting to read the union as a summary of the parts, and it is not. It is the mask
most easily dominated by whichever variable moved the most cells, and a whole-domain rewrite
is precisely such a variable. The mitigation working on one field and the leak on another
union to a number that looks like the mitigation working.

That is worse than a check that is merely insensitive. Its failure mode is anti-correlated
with the thing you want: **the better the mitigation on the well-behaved variable, the more
completely it hides a leak on any other.** A team doing the right thing on the field they
were worried about buys themselves a green result on the field they were not.

## What did not work

The requirement, as written, asked for **the** change mask. Singular. Scored once over the
released product.

The implementation had been built differently — a mask per released variable, the union
*and* each variable on its own, acting on the worst — and its source recorded this as "a
deliberate strengthening of the requirement rather than a reading of it". Which is an honest
label, and an unstable place to leave things.

The instinct was to leave it there: the code is stricter than it has to be, the divergence
is noted, nobody is harmed. That is wrong in a way that takes a moment to see. The
requirement is what a later reader takes as the definition of *enough*. Somebody tidying up
in six months finds a loop over variables that the requirement does not ask for, deletes it
as gold-plating, and every test still passes — because the tests were written against a
requirement that says the union is sufficient. Removing the gate would look exactly like
removing decoration.

Two things settled it. The fixture above, which is a measurement rather than an opinion.
And the feature's own acceptance scenarios, which already required a released set containing
an age-driven variable to be *detected* — so the singular wording contradicted the
specification before it contradicted the code. This was a reconciliation, not a judgement
call.

## What is now known

The requirement was amended, and the rule it now states is worth having in general terms:
**where a statistic is offered as evidence that an exposure boundary is holding, compute it
for every released variable separately as well as for the aggregate, and act on the worst of
them, named.**

The aggregate is still reported, because it is what a reader expects to see and its distance
from the worst figure is itself informative — a large gap means one variable is carrying
something the others are not. It is simply not the number the gate reads.

And the smaller lesson, which is the one that will recur: an implementation that is stricter
than its requirement is not a safe place to sit. Whichever of the two artefacts is weaker is
the one that will eventually be believed.
