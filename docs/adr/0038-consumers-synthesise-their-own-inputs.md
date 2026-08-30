# ADR-0038: a consumer may synthesise its own inputs; it may never synthesise drogna's

**Status:** Accepted
**Date:** 30 August 2026
**Feature:** 115 (the downstream consumer tabs)
**Requirements:** SRD-v2 FR-76 to FR-85
**Engages:** Constitution VII (liveness, not configuration); Constitution V (no tracked
entities); Constitution VIII (recommendations, not decisions); Constitution II (seeded
randomness); ADR-0027, whose seam these tabs are clients of

## Context

Feature 116 puts three tabs in the shell that are not part of drogna. They are notional
downstream systems — a sampling planner, a comparative course chooser, a temporal triage
aid — consuming drogna's forecast to reach a decision, and they exist to answer the "so
what" question the harness has never answered on screen.

Two of them need data drogna does not model. The feasibility tab reasons over tidal
windows, moon illumination, a ferry timetable, satellite overpasses and crew watch cycles;
drogna models none of these and is not going to. The courses tab reasons over hypothetical
vessel classes that may be present in a region; drogna holds no such thing by
constitutional prohibition. The author's requirements document permits synthesis
explicitly and asks for it freely, on the grounds that a densely populated illustration is
more convincing than a sparse and technically honest one.

Constitution VII forbids fixture data in the plainest terms it has: **no data path may
assert the existence of something that is not running.** Fixture data, canned traffic and
a "populate for the screenshot" mode are each named and each forbidden. The whole
evidential value of drogna rests on that.

Read carelessly, feature 116 is a fixture-data feature with a coat of paint. That reading
has to be answered before a single synthesised lane is drawn, because if it is right the
feature must not be built, and if it is wrong the next reader must be able to find the
argument rather than reconstruct it.

## Decision

A consumer view may synthesise inputs drogna does not model. It may never synthesise
anything that reads as a claim about drogna.

Four conditions, all of them checkable:

1. **A synthesised quantity is an input to a consumer's own reasoning, never a report
   about a component.** Constitution VII's subject is the harness's account of itself: a
   lit component, a counted message, a store's holdings. A downstream system's own
   assumption about tomorrow's tide is not an assertion that anything in drogna exists or
   is running, and no drogna display changes by a pixel because of it.
2. **Nothing synthesised crosses back over the seam.** The consumer tabs publish nothing —
   the shell's broker role has an empty publish list and that is unchanged — and no
   synthesised value is written into a store, a message, or an export. The synthesis is
   terminal.
3. **Every synthesised source is labelled on screen as synthesised by that tab**, beside
   the sources that genuinely crossed the seam, which name the collection or topic they
   came from. A reader can therefore see, without asking, which half of a feasibility
   answer rests on drogna and which half rests on the tab's own assumption.
4. **Synthesis is seeded from the run manifest** through a named per-tab stream, so it
   replays with everything else (Constitution II) and moves only as a function of
   simulation time. Stop the clock and the synthesised lanes stop with the real ones —
   which is the property that distinguishes a synthesised *input* from a generator running
   on its own account.

The yellow chrome and the provenance strip are part of this decision rather than
decoration. The boundary is only defensible if it is visible, and it has to survive a
screenshot: the strip does not scroll away and the tab colour is declared per view in
configuration, so a consumer view cannot be added without it.

## Consequences

**What this buys.** The three tabs can be dense and convincing without a single line of
fixture data reaching a drogna display. The feasibility tab can carry ten lanes when
drogna publishes two. The courses tab can put a cloud on the map without the harness ever
holding a position it did not place — a Monte Carlo seeded across the whole domain from a
likelihood infers no position at all, which is the distinction Constitution V already
draws between an entity and a hypothesis about a class.

**What it costs.** There is now a category of thing in the repository that looks like data
and is not evidence, and it lives inside the same page as the thing whose entire value is
that it is evidence. The mitigation is the visibility above, and it is deliberately
redundant: colour, strip, per-source label, and a code boundary — everything synthesised
lives under `app/src/panels/consumers/`, imports no backend module, and publishes nothing.

**What would make this decision wrong**, stated so a later reader can check rather than
re-argue:

- a synthesised quantity appearing on a harness tab, or in the manifest, or in an export;
- a consumer tab publishing anything, or its role acquiring a publish list;
- a synthesised source drawn without its label, so that the reader cannot tell which half
  of an answer is drogna's;
- a "populate for the screenshot" path — synthesis that runs when the clock is stopped, or
  that is not a function of simulation time and the seed;
- the yellow chrome or the provenance strip becoming dismissible, or absent at one width.

Any of these makes the feature the thing Constitution VII forbids, and the remedy is to
remove it rather than to widen this ADR.

## Alternatives considered

- **Build the consumers outside the repository**, as a separate application consuming the
  published instance. Cleanest boundary available, and rejected: the demonstration value
  is in the *seam*, watched live — a new forecast is published in one tab and goes stale
  in another, in the same page, in front of the reader. A second application would have to
  poll a static instance, which is exactly the polling FR-78 exists to avoid.
- **Restrict the consumers to what drogna already models.** Honest, and it produces the
  sparse illustration the author's §1.1 specifically rejects. The feasibility tab would
  carry two lanes and demonstrate nothing about competing commitments.
- **Publish the synthesised sources over the seam** so the consumers read everything the
  same way. Tempting, and it is the wrong direction across exactly the line this ADR
  draws: it would put a synthetic ferry timetable inside the harness, where Constitution
  VII does apply, to save the consumers a distinction they are better off making
  explicitly.
