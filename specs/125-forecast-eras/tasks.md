# Feature 125 — tasks

Ticked as the work was done. Where a task was declined the reason is in the line, because
the reason is the part that cannot be reconstructed later (CLAUDE.md, lesson 1).

## Measure before deciding

- [x] **T001** Profile the pre-roll rather than reasoning about it. For `returning` with the
      ocean replayed: `sha256Hex` 19%, model runner 18%, analyst kernel 13%, broker topic
      matching 11%, ensemble RNG 11%, analytic truth field 8%. No hot component to optimise.
- [x] **T002** Size every era and time every combination. The ocean is 0.43 MB; `analysis`
      and `instance` are the rest. Declaring `analysis` without `instance` is not an option:
      the model runner is downstream of the analyst, so holding the analyst back removes the
      forecast half entirely.
- [x] **T003** Measure in a browser, not only in Node. Headless Chromium is ~2.7× Node;
      the reader's machine is ~4–5× this container. The dev server and the built site are
      within 0.5 s of each other, so the report was not a dev-mode artefact.

## The scheduler (FR-125-03, FR-125-04)

- [x] **T010** Watch the becalm happen from the Operator tab: stop the analyst, let the
      cadence floor come due, start it again — `analysis` and `instance` frozen for the rest
      of the visit.
- [x] **T011** Release a run outstanding longer than its declared cost plus the release
      margin, and publish an `abandoned` decision; amend `telemetry.schema.json`.
- [x] **T012** Regression test through the plane's own endpoints. **Its first form passed
      against the unfixed scheduler** — it compared the request count to zero rather than to
      the count before the stop, and the cadence floor is *held* while the standing forecast
      has life in it, so the latch was never set. Tightened, then watched failing.
- [x] **T013** Derive run identifiers from the request tick; amend `run-request.schema.json`.
- [x] **T014** A test for T013. **The change shipped without one**: an adversarial pass
      reverted the derivation and all 686 app tests stayed green. Now a restarted scheduler
      is driven mid-run and the store's holdings asserted neither replaced nor lost; it fails
      against the counter with three holdings overwritten.

## The artefacts (FR-125-01, FR-125-02)

- [x] **T020** Declare all four eras on every condition; regenerate. 1.73 MB → 27.7 MB.
- [x] **T021** Retire the refusing test in `start-condition.test.ts` with its reason, and
      record that its stated blocker named the wrong mechanism.
- [x] **T022** Hold the pair no drift check can see, in `preroll.test.ts`: opens with what a
      live run produced, era by era, and still turns afterwards. Watched failing.
- [x] **T023** Re-plant the 5 °C kernel shift to prove the forecast kernel now has snapshot
      cover. **The first plant went into `shift-advect-v1`** — registered by ADR-0042, not
      selected by `run.json` — and the gate reported ok, a false all-clear indistinguishable
      from the real one. In `shallow-two-layer-v1` it fails on all four conditions.

## What the adversarial passes found, and what it cost

- [x] **T040** The identifier change shipped with no check that had been seen to fail:
      reverting it left all 686 app tests green, one commit after this branch condemned the
      retired refusal for exactly that. A restart test now asserts the store's holdings are
      neither replaced nor lost, and fails against the counter with three replaced.
- [x] **T041** The quiet after a replayed open was read as a stall and answered by quiescing
      the scheduler. **Both wrong.** A live run of the same conditions reaches its next
      forecast after 599, 1,794, 1,080 and 639 ticks; the quiesce turned the loop 10–21 ticks
      after opening, against a 600-tick minimum interval, and the Intro panel had begun
      advertising it. Reverted.
- [x] **T042** Replaying holdings does not replay announcements. `run_published` is the only
      statement that a forecast stands, and four components hold nothing but what it told
      them. `returning` opened with **zero** staged bundles against a live run's five, its
      card promising a staged package. `backend/lib/standing-run.ts` reads the store's
      inventory into the announcement's shape; the model runner restates it on resume and the
      offload packager consults it when prompted with nothing announced. The replayed cadence
      is now the live cadence exactly, on all four conditions.
- [x] **T043** The cadence test's first draft checked `returning` alone and passed against
      the unfixed tree: `leaving` and `returning` agree at 599 and 639 whichever way the fix
      goes. It compares all four against their own live runs now.
- [x] **T044** Tick-derived identifiers narrow the reuse rather than closing it — a restart
      inside the requesting tick still reissues one, watched replacing four analysis holdings
      with the clock stopped. Closed at the coverage store, which refuses a second set of
      bytes under a holding id it already holds. The claim of closure had been written into
      four documents and is corrected in all of them.
- [x] **T045** The `abandoned` decision was justified by the Forecast timeline, which filters
      to `held-for-cost`. Comment corrected to name the surfaces that do draw it.
- [x] **T046** The record was corrected in the two documents that disclaim authority (the ADR
      and the backlog) and not in the two that carry it. `specs/120-start-conditions/`
      corrected; this directory written, having been named in five places with nothing behind
      it.

## Declined, with the reason

- [ ] **T030** Quiesce the scheduler through a replayed pre-roll. **Built, measured, and
      reverted.** A review read the 611–1,790 tick quiet after opening as a stall; a live run
      of the same four conditions publishes its next forecast after 599, 1,794, 1,080 and 639
      ticks, so the quiet is the cadence. Quiescing replaced it with a fresh instance firing
      its floor 10–21 ticks after the artefact's own forecast, against a 600-tick minimum —
      a cadence no live run can produce.
- [x] **T031** Have the resumed scheduler learn the standing forecast's validity. Done as
      T042: the model runner restates its publication from the store's inventory, which is
      what T030 should have been. The snapshot source still must not synthesise it.
- [ ] **T032** Replace `sha256Hex` with `crypto.subtle`. The largest single remaining cost
      (19%) and it ships no bytes, but it is async against synchronous publication paths
      throughout — a larger change, and one that helps the live run as much as the boot.
- [ ] **T033** Raise the pre-roll's burst bound. Measured at 2.2 s → 1.9 s; not worth
      widening a bound a reader can drive from the Operator tab.
- [ ] **T034** A blog entry. No new face in the shell and no new backend simulation to watch
      work (D17) — this moves existing components' output into the artefacts and fixes a
      scheduler fault.
