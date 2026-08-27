# ADR-0013: A leakage statistic is scored per released variable, and the worst one is the answer

**Status:** Accepted
**Date:** 27 August 2026
**Requirements:** SRD FR-42; Constitution X; feature 013 FR-015, FR-016
**Raised by:** feature 013's implementation being stricter than its own requirement, and the amendment reconciling them

## Context

SRD FR-42 names two ways a released product set can give back what the exposure boundary
withheld. The second is the shape of the update: two successive released products, subtracted,
show which cells moved, and if only the neighbourhood of recent measurements was refreshed,
that picture is the sampling geometry. Feature 013 holds that path with a statistical gate —
a change mask, and Youden's J of that mask against the buffered measurement locations, with a
chance bound and a detection bound and a deliberately leaky control to prove the gate has
power.

FR-015 as originally written asked for **the** change mask: singular, over the released
product, scored once. `tests/leakage/updated_region.py` was built differently. It computes a
mask per released variable, scores the union *and* each variable on its own, and acts on the
worst of them. Its docstring recorded this as "a deliberate strengthening of FR-015 rather
than a reading of it", which is an honest label for an implementation that had quietly become
the stricter of the two artefacts.

The reason it was built that way is measurable, and the measurement is committed as
`tests/leakage/fixtures/age_driven_pair/`. That fixture applies the mitigation properly to the
temperature field — the whole domain is rewritten on every publication cycle, so its mask
covers 918 of 1024 cells and predicts nothing — and releases an observation-age field beside
it, whose mask is the 96-cell buffered sampling geometry exactly. The figures:

| Scored over | Recovery statistic | Verdict against the bounds |
|---|---|---|
| the union of the masks | 0.105 | at or below the 0.15 chance bound: **passes** |
| `sea_water_temperature` alone | 0.011 | at chance: passes, correctly |
| `observation_age` alone | 1.000 | at or above the 0.6 detection bound: **fails** |

A union-only gate reports that released set as mitigated. The union is not a summary of the
per-variable masks; it is the mask most easily dominated by whichever variable moved the most
cells, and a whole-domain rewrite is exactly such a variable. The mitigation and the leak
union to a number that looks like the mitigation working.

Two further facts made this a reconciliation rather than a judgement call. Feature 013's own
acceptance scenario US4-3 already required a released set containing an age-driven variable to
be **detected**, which the union-only reading cannot do — so the singular wording contradicted
the specification before it contradicted the code. And an implementation stricter than its
requirement is unstable: the requirement is what a later reader takes as the definition of
enough, and deleting the per-variable loop would have looked like removing gold-plating while
being the silent removal of the gate.

## Decision

**Where a statistic is offered as evidence that an exposure boundary is holding, it is
computed for every released variable separately as well as for the aggregate, and the figure
the gate acts on is the worst of them, reported with the name of the variable it came from.**

Feature 013's FR-015 and FR-016 are amended to require this. The aggregate is still reported,
because it is what a reader expects to see and its distance from the worst figure is itself
informative; it is not what the gate reads.

Rejected: scoring the union alone, which is what FR-015 said. It is cheaper by one loop over
a handful of variables, and it is the reading a person arrives at from the phrase "the change
mask". It is rejected because it passes the case the gate exists to catch, and the fixture
above is the evidence rather than the argument.

Also rejected: keeping the code stricter than the requirement and noting the divergence. That
is the state this ADR replaces. It leaves the definition of sufficient in the weaker artefact.

## Consequences

- **A gate that would have passed a leak now fails it**, and the control that shows so is
  committed. `test_an_age_driven_variable_is_recovered_even_when_the_union_is_not` asserts the
  union is *below* the chance bound in the same breath as asserting the worst is above the
  detection bound, so removing the per-variable scoring makes the test fail for the reason the
  scoring exists. A gate whose removal is not caught by a test is a comment.
- **The cost is a loop over released variables**, which is a handful of fields on a grid of a
  few thousand cells, and a report with more figures in it than before. Both are cheap. The
  real cost is that the report is longer, and a longer report is read less carefully; the
  worst figure and the variable it came from are therefore reported first and named, rather
  than being left for a reader to find among the per-variable rows.
- **The rule generalises past feature 013 and is meant to.** Any future leakage measure — a
  provenance statistic, an offload-export check under feature 014, a released-set diff of any
  kind — that reduces several released variables to one number inherits this: report the
  aggregate, score the parts, act on the worst. The failure mode is not specific to age-driven
  fields. It is that an aggregate over heterogeneous fields can be dominated by the loudest
  one, and a boundary gate is exactly the place where being dominated is fatal.
- **It cuts against Constitution X's own simplicity.** Principle X says access is binary, with
  no per-field redaction, precisely so that no one has to reason field by field about what is
  released. This decision reasons field by field about what has *leaked*, which is not the same
  thing and does not soften ADR-0001: the released-variable allow-list stays binary and whole,
  and `observation_age` is absent from it by design. What is per-variable is the measurement,
  not the policy. The distinction is worth holding onto, because a future reader finding
  per-variable machinery in the leakage tests could mistake it for the tiered access ADR-0001
  rules out.
- **Requirements are expected to be at least as strong as the code that satisfies them.**
  Where an implementation is found to be stricter than its requirement and the strictness is
  right, the requirement is amended rather than the divergence being noted. The alternative
  leaves the weaker statement as the one a future change is measured against, which is how a
  gate is removed by someone who believes they are simplifying.
