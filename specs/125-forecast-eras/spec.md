# Feature Specification: The forecast eras in the committed artefacts

**Feature Branch**: `claude/welcome-env-precalc-napzae`

**Created**: 3 September 2026

**Status**: Specified and built

**Input**: "There's a delay when we generate the selected environment on the welcome page.
Can we pre-calculate these, to get into the app quicker?" — followed, when the first
measurements disagreed with the reader's experience, by "For *arriving in the area*, I see
a delay of around 20 seconds as this panel completes".

## Context

The environment was already pre-calculated. ADR-0041 committed the `archive` and `nowcast`
eras at feature 120 and left the forecast eras declared-but-blocked, and the blocker it
recorded turned out to be a phantom. The reader's 20 seconds against the 5.3 s ADR-0041
measured for `arriving` is the whole of why this feature exists: the same harness on a
slower machine, which is the case the byte-for-seconds trade had never been run against.

The profile settles what was worth doing. For `returning` with the ocean already replayed:
`sha256Hex` 19%, the model runner 18%, the analyst kernel 13%, broker topic matching 11%,
the ensemble RNG 11%, and the analytic truth field 8% for the sensors sampling it. There is
no hot component to optimise — only work to move off the visit.

## Requirements

- **FR-125-01** Every start condition's committed artefact carries all four eras:
  `archive`, `nowcast`, `analysis` and `instance`. Which eras are committed stays
  configuration (feature 120's FR-18).
- **FR-125-02** A run whose artefact is replayed **opens holding what a live run of the same
  condition produced**, era by era, and **keeps turning afterwards**. Neither is visible in a
  snapshot's bytes, so neither is covered by `check-snapshot-drift`.
- **FR-125-03** The loop cannot be permanently becalmed by a run request that reaches no
  component (SRD-v2 FR-31). This is the fault holding the analyst back exposed, and it is
  reachable from the Operator tab with no artefact in sight.
- **FR-125-04** A run identifier is unique across every scheduler instance in a run, so no
  instance can republish over holdings another named.

## What was decided, and what was given up

**Run identifiers derive from the request tick**, `<run>-run-t<tick>`. Simulation time is the
one monotonic thing the scheduler hears rather than keeps. `run_sequence` stays the ordinal
and is no longer half of the identifier rule.

**The watchdog's bound is the run's declared cost plus the release margin**, both already on
the wire from the model runner. The first implementation used the cadence floor's whole
interval on the argument that any bound above the cost would do — true of correctness and
measured against nothing else.

**27.7 MB of committed binary, against 1.73 MB.** The honest shape of the trade: the saving
is compute and scales with how slow the reader's machine is; the cost is bytes and does not.
Ensemble noise compresses at 1.4:1, so there is no cheaper encoding to find. Every kernel,
grid, seed or leg change now rewrites the artefacts, which is the regression cover the
backlog's P0 row wanted and is also ~27 MB of git history per change.

## Deliberately not done

- **The resumed scheduler does not learn the standing forecast's validity.** A replayed run
  reaches the right cadence for the wrong reason — counting from a request nobody answered
  rather than from remaining validity. `run_published` is announced by the model runner
  alone, and a component held back through the pre-roll never hears it. The snapshot source
  must not synthesise that announcement: it carries grid bounds, collections and digests no
  holding descriptor holds, and inventing them is the fixture hazard ADR-0041 forbids. The
  fix is for the model runner to restate its publication for a late listener, as it already
  restates its cost.
- **The digest is the largest single remaining cost and is untouched.** Every field's bytes
  are hashed twice, by the author and by the store verifying the descriptor — that is the
  guarantee, not waste. Making it cheap means `crypto.subtle`, which is async, against
  publication paths that are synchronous throughout.
- **The pre-roll's burst bound stays at 60.** Raising it to 600 was measured at 2.2 s → 1.9 s
  once the eras are committed. Fourteen percent is not worth widening a bound a reader can
  drive from the Operator tab.
