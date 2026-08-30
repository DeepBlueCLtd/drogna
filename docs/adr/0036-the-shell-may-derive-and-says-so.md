# ADR-0036: the shell may derive, and says so

**Status:** Accepted
**Date:** 30 August 2026
**Feature:** 114 (the tabs beyond Operator)
**Requirements:** SRD-v2 FR-65; amends the figure vocabulary of FR-57
**Engages:** Constitution VII (a display shows what it received); Constitution IX (no
skill claim without a persistence reference); ADR-0035, whose three kinds of figure this
adds a fourth to

## Context

Feature 113 fixed a vocabulary for every number the shell draws. A figure is **declared**
when configuration says it, **reported** when a component published it, or **observed**
when the shell counted it out of traffic it received itself. The three are typographically
distinct and a figure may not change kind between states. The point of the vocabulary is
Constitution VII: a reader can tell, without reading the source, whether the shell is
relaying something or asserting it.

Feature 114's Holdings comparison does neither. It asks the query layer for three
coverages at one instant and depth — a forecast instance, the now-cast that covers the
same instant (the truth), and a persistence reference held constant from the instance's
own initial step — and it subtracts them. The picture it draws is a difference field. No
document contains that field. No component published it. The shell computed it.

Under the three kinds, that figure has no name, and a figure with no name is exactly the
thing the vocabulary exists to prevent: it would be drawn in one of the three treatments
and would then be a lie in whichever one it borrowed.

The tempting alternative was a component that serves differences. It was considered and
declined in the specification, and the reason belongs here: a component built to save the
shell an arithmetic it is entitled to do is a component that exists for the diagram rather
than for the system. It would also have to be *fed* the same three documents, so the
subtraction would still be a subtraction — merely one performed on the other side of the
seam, where nobody could see it happen.

## Decision

**The shell may transform documents that crossed the seam. It may not invent a figure no
document contains. A figure produced by such a transformation is a fourth kind —
`derived` — and is drawn distinctly from declared, reported and observed.**

The boundary is not new. `app/src/panels/map/map-data.ts` has transformed served
CoverageJSON into cells, ranges and interpolated route positions since feature 109, under
exactly this rule; the map's colour ramp is a derived figure that has never been called
one. What is new is the name and the treatment, and the obligation that comes with them.

### What makes a transformation admissible

Three conditions, all of them:

1. **Every input crossed the seam.** The comparison's three coverages arrive as ordinary
   EDR area queries through the release gate, validated like anything else. A transform
   whose input is a constant typed into the shell is an invention wearing a derivation's
   clothes.
2. **The reader can re-derive it.** The three request URLs are on screen and copyable.
   This is constitutive of the display, not a convenience: a derived figure a reader
   cannot get back to is an assertion with an arithmetic-shaped alibi. SC-04 checks that
   the three URLs, fetched, return the three documents the picture was drawn from.
3. **The transformation is stated.** The panel says what it did — a difference at one
   instant and one depth, on a shared scale — in the same place it draws the result.

### What is inadmissible, and stays so

A figure that requires an input the shell does not hold. The most tempting instance is
right beside this one: **forecast skill**. Telemetry scores skill at the observations,
over a run's whole validity, against a persistence reference, and publishes the number
(`telemetry.schema.json`). The Holdings comparison draws a field-wide difference at one
instant. These answer different questions, and a second implementation of skill in the
shell would be free to disagree with the component that owns it — so the panel shows
telemetry's reported figure beside the derived picture, unrecomputed, with a sentence
saying which question each answers.

### Constitution IX travels with the derivation

A picture of forecast error alone is a skill claim, and Constitution IX admits no skill
claim without a persistence reference. So the comparison fetches three coverages and not
two, draws both differences on one shared scale, and says which is closer in the
principle's own words: where the model is not earning its compute, it says so.

## Consequences

- A fourth typographic treatment joins the three. Every place the shell draws a figure
  now answers a four-way question rather than a three-way one, which is a cost paid once
  in the stylesheet and repaid at every reading.
- The request URLs become part of the display's contract. A change to how the comparison
  queries is a change a test will notice, because the test fetches what the panel shows.
- The seam boundary is unchanged. Nothing here lets a panel reach past the seam; it lets
  a panel do arithmetic on what the seam handed it, which it has been doing since 109.
- A future display that wants a figure with no served input has nowhere to put it. That
  is the intended outcome: the answer is to publish it from the component that owns it.
