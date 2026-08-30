# ADR-0039: a run arrives by having run

**Status:** Accepted
**Date:** 30 August 2026
**Feature:** 118 (start conditions, chosen on a welcome page)
**Requirements:** SRD-v2 FR-11 (provisioning runs the components' own code paths); FR-09
(the clock's step); FR-36 (stop and start); FR-65 (prompted events); FR-10 and AT-04
(replay from the manifest)
**Engages:** ADR-0030 (the composition root); ADR-0032 (addressability goes below the
panel); ADR-0029 (the HTTP seam is a fetch shim)

## Context

Every visit began at the epoch. The archive and one now-cast existed because provisioning
authors them on the clock's first sample; everything else — a track, an assimilation, a
staged package, a word from shore — existed only if the reader left the page running.
Feature 118 offers four situations to begin in instead, and each of them is a claim about
what the run holds.

There are two ways to make such a claim true, and the whole of this decision is which.

The cheap one is a fixture: write observations into the observation store, forecast fields
into the coverage store, and open the console over them. It is fast, it is exact, and
SRD-v2 FR-11 has forbidden it since the beginning — seed data is authored by the same
components and seams that author it during a run, so the guards a run enforces (validation
against the masters, digest checks at publication, publication atomicity) are the guards
the seed data passed through. V1 paid for the other answer once and wrote the rule down.

## Decision

**A start condition is a script of operator actions, and the run arrives in that situation
by having actually run there.** The composition root pins the clock, then drives the run
forward through the operator plane's own HTTP endpoints — stop a component, publish a
demand, prompt an event, step the clock — and mounts the shell when the script is spent.

Every one of those is a control a reader can work by hand in the Operator tab. Every
request crosses the release gate. Every message the run produces on the way is on the
broker, where the Messages tab can read it back. Nothing writes to a store, and the
pre-roll driver does not know what a holding is.

### The script is configuration, not code

A condition names the platform's initial vector and an ordered list of legs, in
`run.json`, against `config.start-conditions.schema.json`. Three things follow that would
not follow from a script in TypeScript.

It is **reviewable as a claim**: the card's prose and the leg list sit in one document, and
a test holds the first to what the second actually leaves behind.

It is **replayable**. AT-04 puts operator commands outside its claim, and says a demanded
run replays identically only when the same demands are issued at the same ticks. A
condition's demands and prompts are issued at ticks the configuration fixes, so that
proviso is met by construction and the pre-roll is back inside the claim — which is why
the manifest carries the condition, and why the run id does.

It is **extensible without touching the driver**. A fifth situation is a fifth entry.

### The choice travels in the query string

`?start=<id>`, beside the hash rather than inside it. ADR-0032 made the hash a view
address with an opaque remainder belonging to the panel; a condition is neither. Putting it
there would have meant a second grammar in `views.ts` or a link that opens the wrong tab.
In the query string the two compose without either knowing about the other, and
`?start=loitering#/view/map` is a link to the map of a run on station — which is what D16
wanted addressable views for.

### An address that names a view is not interrupted

Views have been addressable since feature 101 so a pull request or a blog entry can point
a reader at the thing being discussed. A welcome page in front of such a link puts the work
of finding it back on the reader, which is the work the link was supposed to save. So an
address naming a view boots the default condition and goes straight there. Only a bare
visit is asked.

### The planner is held back, and it is the only one

Measured leg by leg, a tick inside the work area cost about 3 ms with the planner running
and one pre-roll reached 25 seconds; with the planner alone stopped and the whole loop
live, the four conditions cost 1.1 to 5.2 seconds. The planner's route search is the
dearest thing in a tick and it runs every 600.

It is also the right one to hold back, and not only because it is dear: **it recommends**.
It publishes a plan and changes nothing else, so no card's promise depends on it, and it
replans within 600 ticks of the console opening — live, where a reader can watch it, which
is where that work belongs. Everything else runs through every pre-roll, which is what
makes each condition a run rather than an arrangement.

## Consequences

- A card is a falsifiable claim. `preroll.test.ts` drives each condition exactly as the
  composition root does and reads the stores; the table of promises is checked for
  completeness against the configuration, so a fifth condition fails the suite until
  somebody says what it promises.
- The run id becomes scenario, condition and seed. Two visits that chose differently are
  two runs — necessary, because a run id is stamped into every holding id and every
  observation id.
- `run-manifest.schema.json` gains a **required** `start_condition`. A manifest without one
  cannot replay its run: every seeded draw would be correct and the platform would be
  somewhere else entirely, silently, under the same run id.
- The console opens seconds after the address is entered rather than immediately, and the
  page says which leg it is on while it waits. That is the price, and it is paid once.
- Two faults in the scheduler were found by the first script and are **not** fixed here:
  stopping the analyst underneath it strands its one in-flight request for the rest of the
  run, and restarting it resets the sequence its run identifiers are built from, so
  holdings from an earlier cycle are silently replaced. Both are reachable today from the
  Operator tab's own restart control. The script never stops the scheduler; the faults are
  recorded in `specs/118-start-conditions/spec.md` for the feature that fixes them.
