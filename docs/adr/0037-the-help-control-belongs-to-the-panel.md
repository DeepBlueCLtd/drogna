# ADR-0037: the help control belongs to the panel

**Status:** Accepted
**Date:** 30 August 2026
**Feature:** 114 (the tabs beyond Operator)
**Requirements:** SRD-v2 FR-70; amends FR-61 and the record of feature 110
**Engages:** ADR-0033 (two presentations of one shell); FR-50 (the narrow presentation
changes where a panel is, never whether it is)

## Context

Feature 110 put a yellow help button in the shell header. It was parameterised by a tour
rather than hard-wired to one, and the tour named the view it ran in, so the button opened
that view before starting. The record said, in as many words, that adding a tour to
another tab would be "a tour and a line — not another button".

That design has one button and many tours, which means it has to choose. With four tours
the header would carry either a menu — a control that asks a reader to pick a tour for a
tab they may not be on — or one button whose tour depends on the active view, which is a
control whose meaning changes under the reader's hand without the control changing. Both
are worse than what feature 110 had with a single tour, and the single tour was the only
reason the header placement worked.

There is a second thing the header cannot express. Intro is prose and has no tour, and
should have none: a tour of a page of sentences is a tour of the thing it would be
explaining. Background has eleven explainers and is its own walkthrough. A header button
present on those tabs is a promise the tab does not keep; a header button that hides
itself on those tabs is a control that appears and disappears in the chrome, which reads
as a bug rather than as information.

## Decision

**The help control is carried by the panel it explains, at that panel's top right. A view
with a tour shows one; a view without shows nothing, and the absence is information: the
button means *this tab explains itself*.**

FR-61 is amended rather than replaced. The control is still parameterised by its tour and
still visually distinct from the controls that operate the harness — that was the load-
bearing half of feature 110's decision and it survives intact. What goes is the one thing
the header placement forced: the button no longer needs to open a view before running,
because it is already in it. The two-commit start (`HelpButton.tsx`: open, then arm) was
there so the highlighted elements were in the document before driver.js looked for them;
a tour started from inside its own panel has them already, so the phase machinery is what
the move actually deletes.

### No fallback in the header

The header button goes rather than staying as a fallback for tabs with no tour. A fallback
would have to run *some* tour, and a control that runs a tour of a tab you are not looking
at is the fault the two-commit machinery existed to paper over. Keeping it would also
destroy the new information: if there is always a button, the absence of one says nothing.

### The completeness rule generalises

FR-61 held the component tour to the shell's declared component list, so a component with
no step is reported by name. That rule was never about components; it was about holding a
tour to something on disk rather than to a number typed into a test (CLAUDE.md, lesson 2).
Each tour now names its own authority:

| Tour | Held to |
|---|---|
| Operator (components) | `config.shell.components` — unchanged |
| Map | the panel's own layer registry, `mapTourSubjects` |
| Holdings | the regions the panel declares |
| Messages | the regions the panel declares |

A surface that gains a feature and not a step is named by the check, rather than passing
unnoticed. The plant that proves it is an unstepped map layer (SC-08).

FR-62 is untouched and now applies four times over: a tour teaches and does not report,
and the test that held the component tour to that covers every tour.

### Both presentations, one place

ADR-0033 folds header controls by presentation. Moving the control out of the header
changes what that fold applies to, and FR-50 governs the result: the narrow presentation
changes where a panel is, never whether it is. The control therefore sits inside the
panel's own header row at both widths and is never folded into a disclosure — a help
affordance behind a "more" label is one the people who need it will not find, which was
feature 110's reason for keeping it out of the header's disclosure and is unchanged by
the move.

## Consequences

- Four tours, four buttons, no menu. A fifth tour is a fifth panel carrying one.
- The absence of a button becomes a claim, and therefore a thing that can be wrong. It is
  wrong exactly when a panel has a tour and does not render its button, which the
  per-panel test catches.
- `HelpButton` loses `onOpenView` and its two-phase start. The comment recording why
  `requestAnimationFrame` was refused by the wallclock gate goes with it; the gate is
  unchanged and the reason is preserved here.
- Feature 110's record is amended, not replaced. Its decision — a control for the reader,
  parameterised by a tour, visually unlike the harness controls — is the part that
  survived contact with the second tour.
