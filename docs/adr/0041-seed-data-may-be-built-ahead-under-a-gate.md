# ADR-0041: seed data may be built ahead of time, under a gate

**Status:** Accepted, amended 3 September 2026 (feature 125: the forecast eras declared)
**Date:** 30 August 2026
**Feature:** 120 (start conditions, chosen on a welcome page)
**Requirements:** SRD-v2 FR-105 (FR-92 when this was written; see §5.18); amends FR-11's application; Constitution 2.1.0 (Data)
**Engages:** ADR-0040 (a run arrives by having run); Constitution II (seeded randomness),
III (the drift-check discipline), VII (liveness, not configuration)

## Context

ADR-0040 made a start condition true by running it: the page builds the backend and
drives the condition's pre-roll through the operator plane before mounting the shell. It
costs two to eight seconds in a browser, and the author asked whether some of that state
could be pre-generated instead.

Measured first, because the obvious answer was wrong twice over. Switching components off
one at a time put 300 of a tick's 568 microseconds in the **environment generator** — not
in the assimilation, which looks expensive and is not — and the reason is that it
re-evaluates a 96×80×6 grid over four time steps every 900 ticks while the coverage store
keeps only the newest. `returning` computed ten now-casts and threw eight away. Nothing
reads the intermediate ones: the monitor scores against the forecast, and the analyst
falls back to a now-cast only on a cold start.

Then the sizes, which decide the shape of any artefact. Field bytes are float32 and
compress badly — the eras a whole pre-roll produces are 20.1 MB raw and still 11.3 MB
after byte-plane shuffling and gzip. But they are not alike: the archive is a smooth
analytic field on a coarse grid and comes to 0.01 MB, the now-cast to 0.42 MB, while the
forecast instances carry per-cell ensemble noise and barely move at 1.4:1.

| pre-generated | on the wire | `returning`'s pre-roll |
|---|---|---|
| nothing | — | 4.21 s |
| the ocean: archive and now-cast | **0.43 MB** | 2.48 s |
| everything | 11.3 MB | 0.40 s |

The ocean is 45% of the saving for 4% of the bytes.

## Decision

**Seed data may be produced ahead of time and committed, when three things hold together:
the same components produce it, a drift gate holds it to them, and it re-enters through
the store's own publication seam.** The constitution's Data constraint is amended to say
so at 2.1.0, rather than being quietly broken.

The three are not a list of nice properties; each closes a specific way the cheap version
goes wrong.

**Produced by the same components.** `scripts/build-snapshots.ts` does not write a file
describing an ocean. It constructs the backend from the shipped configuration — every
document validated against its master — and drives the condition's pre-roll through the
operator plane, exactly as the browser does. What comes out is what a run produced.

**Held by a gate.** `check-snapshot-drift` runs that again on every build and fails on any
difference in descriptors or field bytes. This is the whole load-bearing part, and it is
the discipline Principle III already applies to generated types, applied to data. Without
it, an artefact is a fixture: bytes answerable to nothing, drifting the moment the
analytic form or the grid or a leg of a pre-roll changes — and drifting *silently*,
because the store's digest check only proves the bytes match the descriptor that
travelled with them, and a stale pair is perfectly consistent with itself.

**Through the store's own seam.** A `store.publish` call in the composition root would
have got the bytes in. It would not have got the digest check, the atomic landing, the
announcement on the store's topic, or a component that can be stopped — and it would have
put a write into a store from outside a component into the one module that imports both
halves of the seam. So there is a component, `snapshot-source`, which subscribes to the
clock, republishes each holding at the instant its descriptor records, appears in the
Operator chart, and says in its heartbeat how many it replayed. A reader who wants to know
where the ocean came from can look.

### What is given up, stated rather than glossed

**A condition's seed is now declared, not drawn.** The fields are a function of the seed,
so a visit that drew a fresh one would have its sensors sampling an ocean the artefact
does not describe. Each condition carries a `root_seed` in configuration and
`crypto.getRandomValues` leaves the application entirely — which is *more* conformant with
Principle II, not less, and has a second effect worth having: two people following one
link now see the same ocean, which for a harness whose purpose is showing people things is
most of the point.

**The values were not computed during this visit.** That is the honest cost and there is
no way to have both. It is bounded by the gate, and by the source saying so where a reader
can read it.

### A missing artefact is a slow run, not a broken one

The page falls back to authoring live, and the source's heartbeat goes *degraded* and says
which artefact could not be fetched. That follows from the gate's claim: an artefact only
ever holds what the components would author, so losing one costs seconds and no
correctness. Refusing to open over a missing static asset would trade the thing that works
for the thing that is fast.

### The cut point is configuration, and the far half is guarded

> **Superseded, 3 September 2026 — see the amendment at the end of this record.** The
> shipped value is now all four eras. The blocker set out below was real in its conclusion
> and wrong in its cause, and the paragraph is left standing because what was believed at
> the cut point is the part worth keeping.

`snapshot_eras` on each condition says which eras its artefact carries; the shipped value
was `["archive", "nowcast"]`. Extending it to the forecast eras is a one-line edit and is
*not* yet safe, for a reason that is not size. Holding the loop back for a pre-roll means
restarting the scheduler after one, and a restarted scheduler rebuilds from configuration
with its run sequence at zero. Run identifiers are `<run>-run-<sequence>` and they are the
holding ids the analyst and the model runner publish under, so the first live cycle after
the console opens would republish under the artefact's first cycle's ids and the store
would replace them — silently, since each holding is internally consistent. A test refuses
the declaration with that explanation rather than letting the edit produce a run that
quietly loses holdings a minute after opening.

## Consequences

- Measured in a browser, address bar to a console with a clock in it: 2.1 → 1.6 s, 5.3 →
  3.6 s, 4.1 → 2.8 s and 8.3 → 4.9 s, for 1.73 MB of committed artefacts across the four.
- `pnpm snapshots` regenerates them; `check-snapshot-drift` is the twenty-first gate and
  by an order of magnitude the dearest, because it rebuilds four runs. The cheaper check
  that proves less was available and is the trade this repository has refused before.
- The gates runner now awaits `runGate`. It did not, so a gate returning a promise had
  `.length` read off the promise, found undefined, and was reported **ok** — a gate that
  ran nothing and looked like a pass, which is the one outcome the runner's own docblock
  forbids. The snapshot gate is the first that had to be asynchronous; the hazard predated
  it.
- The environment generator no longer re-provisions on restart. It consulted nothing and
  authored a second twenty-year archive every time it was restarted from the operator
  plane; it now reads the store's inventory — descriptors, never the truth-derived field,
  which `check-truth-initialisation` holds it to — and resumes.
- Two faults ADR-0040 recorded in the scheduler are still open, and one of them is now the
  thing standing between the shipped cut point and the rest of the saving.


## Amendment, 3 September 2026: the far half, and what was actually guarding it

**Feature:** 125 · **Requirements:** SRD-v2 FR-31, FR-105

The forecast eras are declared. The measurement that prompted it was a reader reporting
twenty seconds on `arriving`, against the 5.3 s this record measured for it — the same
harness on a slower machine, which is the case the byte-for-seconds trade was never run
against.

**The blocker above named the wrong mechanism.** `holdingBack` does not stop the
scheduler. It stops the components the declared eras name as their authors — the analyst
and the model runner — and the scheduler runs through the whole pre-roll untouched, so
the run sequence never reset and the collision never happened. The refusing test had never
been seen to fail, which is the second lesson in `CLAUDE.md` and is how a plausible cause
survived a year in an ADR.

**What was actually there was worse.** Holding the analyst back means the scheduler's run
request reaches *nobody*: the analyst takes a request synchronously and holds no pending
state, so the request is not declined, not failed and not remembered, and the
outstanding-run guard latched on it for the rest of the visit. A run backed by the forecast
eras did not lose one holding a minute after opening — it opened onto a loop that never
turned again, with no forecast beyond the artefact's own. And the same fault was reachable
with no artefact in sight, by stopping the analyst from the Operator tab: an FR-31
violation shipped in `main`, found by trying to do this work rather than by looking for it.

Three changes, and the order matters — the second is unsafe without the first, and the third is what the second turned out to need:

1. **The scheduler releases a run nobody is working on** when it has been outstanding
   longer than the run's declared cost plus the release margin — 39 ticks at shipped values,
   both figures already on the wire from the model runner. An earlier draft of this
   amendment described the bound as the cadence floor's whole interval, which is what the
   first implementation used; the ADR was recording the rejected alternative as the decision.
   The reason first given for preferring the tighter bound — that it gets the reader a faster
   recovery — is also wrong, and measured so: 1,809 ticks against 1,810, because releasing the
   run does not release the cadence. What it buys is that a divergence can be acted on from the
   minimum interval rather than declined as `duplicate-outstanding` until the floor comes due.
2. **Run identifiers are derived from the request tick**, `<run>-run-t<tick>`. This is the
   "run identifier that survives a restart" the paragraph above asked for, and it *narrows*
   the collision rather than closing it: the counter collided on every restart, this one
   needs the restart to land inside the very tick a run was requested at — reachable from the
   Operator tab with the clock stopped, and watched replacing four analysis holdings.
   `run-request.schema.json` is amended: `run_sequence` stays the ordinal and is no longer
   half of the identifier rule.
3. **The coverage store refuses a second set of bytes under a holding id it already holds**,
   which closes the remainder and is where it belongs — the store owns the holdings, and the
   digest check beside it cannot see a replacement, because a replacement satisfies it
   exactly. Restating identical bytes stays allowed; the snapshot source depends on it.

### The numbers, remeasured

Headless Chromium, click to console, `arriving`, three runs of each rather than the one this
line first carried: **3.8, 4.0, 3.8 s** with the ocean alone against **2.2, 2.4, 2.5 s** with
all four eras. The single reading it replaces said 4.7 s, which was the high end of a spread
this container's load moves by a second — a difference big enough to change the ratio the
paragraph below argues from, so the spread is recorded rather than a best number. The
artefacts go from 1.73 MB to 27.7 MB across the four.

That is a much worse ratio than the ocean's 45%-for-4%, and it is worth being plain that it
is a *conditional* win rather than a free one. The saving is compute and scales with how
slow the reader's machine is; the cost is bytes and does not. On the machine this was
measured on, `returning`'s 11.29 MB is roughly a wash against the seconds it saves at 25
Mbps. On the machine that reported twenty seconds it is not close. The harness is a thing
people are shown, usually on a good connection and not always on a fast laptop, so the
trade is taken — with the ratio recorded here so that a future reader who has better
numbers than a click-to-console stopwatch can re-open it.

### The cadence a replayed run opens on, measured rather than assumed

An adversarial pass read the quiet after a snapshot-backed console opens — 611 to 1,790
ticks before the first live forecast — as a stall introduced by holding the loop back. It
was answered by quiescing the scheduler alongside the era authors, and that was the wrong
fix because the reading was wrong.

A **live** run of the same four conditions, driven to the same tick with nobody held back,
publishes its next forecast after 599, 1,794, 1,080 and 639 ticks. The quiet is the
cadence. Quiescing the scheduler replaced it with a fresh instance that knows of no standing
forecast and fires its floor on the first sample after opening — a run 10 to 21 ticks after
the one the artefact had just supplied, against a 600-tick minimum interval. That is a
cadence no live run can produce, and it spends a model run for nothing. Reverted.

That left the replayed run reaching the right cadence for the wrong reason — its scheduler
counting from a request nobody answered rather than from the standing forecast's remaining
validity, because `run_published` is announced by the model runner alone and a component held
back through the pre-roll never hears it. **Replaying holdings does not replay
announcements**, and that is the cost this record did not price: four components hold nothing
but what the announcement told them, and `returning` opened with zero staged offload bundles
against a live run's five, its card promising a staged package.

So the model runner restates the standing run from the store's own descriptors when it
resumes, as it already restates its cost, and the offload packager consults the same reading
when prompted with nothing announced. The snapshot source must not do this: it would be
composing a statement no component made, which is the hazard this record exists to forbid,
whereas the runner reading back what it itself wrote is the resumption rule the environment
generator already follows. With the standing run restated, a replayed run's cadence is the
live run's cadence exactly, on all four conditions.

### What a replayed pre-roll shows the reader that a live run does not

The scheduler is not held back — the measurement above says why — so through a replayed
pre-roll it goes on deciding while the analyst it commands is replaced by the artefact. Its
requests reach nobody and the watchdog releases them, and each release is published. A
snapshot-backed `returning` therefore opens with five `abandoned` decisions and *released
unfinished: 5* on the scheduler's face where the live run has none, and with three fewer
`held-for-cost` annotations on the Forecast timeline.

Kept, because every alternative measured worse and because it is true: those runs were
requested and nothing answered them. Quiescing the scheduler removes them and was tried
twice — once before the restatement existed and once after, on the argument that the
restatement would now seed the fresh instance. It does not: the resumed scheduler fires its
cadence floor on the first sample after the console opens, before the restatement reaches it,
so both conditions turn the loop 10 ticks after opening against a 600-tick minimum interval.
The reader would be shown a cadence no live run can produce instead of a decision record that
is merely unfamiliar.

### What this does not fix

The profile says the remaining pre-roll is not one hot component. For `returning` with the
ocean replayed: `sha256Hex` 19% — every field's bytes are digested twice, once by the author
and once by the store verifying the descriptor, which is the guarantee and not waste — the
model runner 18%, the analyst kernel 13%, broker topic matching 11%, the ensemble RNG 11%,
and the analytic truth field 8% for the sensors sampling it. The digest is the largest
single item and ships no bytes, but `crypto.subtle` is async and every publication path here
is synchronous, which is a larger change than this one and belongs to whoever takes it.

Raising the operator plane's step bound from 60 to 600 ticks was measured too: 2.2 s → 1.9
s, once the eras are committed. It was not taken. Fourteen percent is not worth widening a
bound a reader can drive from the Operator tab, and the two concerns do not belong in one
change.
