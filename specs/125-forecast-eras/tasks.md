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

- [x] **T047** The restatement named the **scenario** run, not the model run. A coverage
      descriptor carries both under confusable names — `descriptor.run_id` is the scenario,
      `descriptor.holding_id` is the run — and telemetry keys its skill ledger by the latter
      and looks the holding up by it. Every condition opened scoring a run id that names no
      holding, dropping 180 residual samples in the first 900 ticks while the monitor
      published them; and restarting the model runner from the Operator tab did the same to a
      live run. Both adversarial passes found it independently.
- [x] **T048** Two consumers read the restatement as news. Telemetry closed the ledger on any
      current publication (58 scored samples discarded on a restart); the offload packager
      staged on every announcement (two bundles and twice the bytes for one run, and four such
      restarts pass `staging_bound_bytes`, after which production stops for good). Both now
      compare against the run they already hold.
- [x] **T049** The test for T047/T048 took four attempts, and the first three each passed
      against a fault. Asserting the bundle count after a 4,000-tick sweep failed the *clean*
      tree, because a legitimate run stages inside it; asserting `count` alone missed the
      ledger discard, because statistics publish on a cadence and a discarded ledger re-warms
      past its old count before the next statement. `first_sim_time` is where a discard shows.
      All three faults are now planted and watched failing.
- [x] **T050** Three copies of the `(iso, seconds) → iso` helper, and they disagreed: the
      model runner truncated to whole seconds, the advisory source and the copy written for
      this feature kept milliseconds. They agree only because `tick_interval_us` is 1,000,000,
      so a sub-second tick would have made a restatement's validity differ from the
      announcement it restates. One helper in `lib/sim-time.ts`, on the BigInt microseconds
      that module exists for. The planner's `isoMicros` takes POSIX seconds and is a different
      function, not a fourth copy — a first pass at this line called it one.

- [x] **T051** The offload dedupe keyed on `lastPublished` — "the run this component has
      heard of" — where it needed "the run it has staged for". The two diverge on the path the
      feature adds, and the test covering it restarted the runner in a *live* run, where the
      announcement handler had set the field, so the guard worked and the path needing it was
      never exercised. Keyed on `stagedForRunId` now.
- [x] **T052** `run-published.schema.json` was the one master whose meaning this feature
      changed and the one left un-amended, while two others were amended at length. A message
      that may now be a restatement, and a `sim_time` that may be the instant it is being said
      at, are the contract a V3 backend generates from.
- [x] **T053** The watchdog bound's stated benefit was measured false. "A reader who stopped
      the analyst waited half an hour to find out the loop had recovered" — the tighter bound
      gives 1,809 ticks against the rejected one's 1,810, because releasing the run does not
      release the cadence. What it actually buys is a divergence acted on from the minimum
      interval instead of declined until the floor comes due. Corrected in three places.
- [x] **T054** The Intro panel asserted artefact provenance unconditionally, where a missing
      artefact is a supported path (FR-105) — and this feature doubled the surface of the
      claim from two eras to four. It now points the reader at the snapshot source's own node.
      The first attempt linked a `system` view that does not exist; `check-view-ids` caught it.

- [x] **T055** The restatement was dated at the instant it was being said at, and the master
      amended to say nothing reasoning about the forecast read that field. Two panels did, and
      a review rendered both: the Forecast timeline computes how long a run took as the
      distance from its request to that instant and drew a 9-tick run as a **510-tick** one;
      the consumers frame renders it as when the basis was published and was out by the
      distance from the run to the console opening — thousands of ticks in a replayed pre-roll.
      A restatement carries the run's own instant now, off the descriptor, which is the
      convention `CoverageStore.announce()` had already settled one file away. The test asserts
      the whole message rather than the field that was wrong.
- [x] **T056** `snapshot.test.ts`'s round-trip compared `[...bytes]` with `toEqual`, which
      built two JS number arrays per holding. Fine over 9.6 MB of artefacts; over 54.7 MB it
      took 36.6 s of a 60 s budget and **timed out at 65.9 s under load** — a CI flake this
      feature introduced by growing the artefacts. A typed-array walk is 2.8 s and still names
      the first differing byte; planted a single flipped byte in `decodeSnapshot` to check it.
- [x] **T057** `standingRunFromStore` handed the offload packager a whole announcement it never
      publishes, so the packager filled `component` with its own id — a packager claiming to
      have published a forecast. Split: `standingRunFacts` is the store reading, and only the
      component that publishes builds the envelope.
- [x] **T058** The snapshot source's own heartbeat still said "the ocean was authored live"
      after the tour and the Intro panel were changed to send the reader there for a statement
      about the forecasts too.

- [x] **T059** Restarting the snapshot source rewound the store's era pointers to the
      artefact and deleted a live holding. Watched on `returning` through the plane's own
      verbs — and by pressing restart on the very node T054 had just pointed readers at: the
      `instance` pointer went from `…-run-t9930` back to `…-run-t9171` and
      `nowcast.….t9900` was deleted. The monitor then scored live soundings against a
      759-tick-stale forecast and telemetry dropped every residual it published. The now-cast
      half predates this feature; the `instance` half arrived with it, an artefact having
      carried no instance holdings before. An era pointer cannot move backwards in publication
      time now — identical bytes are still accepted, which is what the snapshot source needs.
- [x] **T060** A review subagent left an untracked `probe125.test.ts` in the working tree; it
      failed lint and vitest would have collected it. Deleted, and the committed file list
      audited against the branch — no stray artefact was ever staged. This is what CLAUDE.md's
      first working practice is about, and `git add -A` is how it would have got in.

- [x] **T061** The rewind guard's first version was half right and made things worse: it held
      the pointer back and left the insert unconditional, resurrecting the superseded now-cast
      into the inventory where no pointer named it and nothing would free it. Three readers
      resolve the now-cast by scanning the inventory rather than asking the pointer, and they
      disagree once there is more than one — the EDR collection takes the last and served a
      field 900 ticks stale, the map's axis lookup takes the first, and the environment
      generator read its cadence from whichever it found and authored off-cadence. Measured on
      `returning`: five now-casts where there should be one, 5.9 MB retained. A rewinding
      publication now writes nothing at all, and the test asserts the inventory as well as the
      pointer — it catches both the original fault and my own first fix for it.

- [x] **T062** Telemetry scored against a run it had never been told about, and threw the
      evidence away. `forecastRunId` is set from `run_published` alone, and the model runner is
      held back for the whole of a replayed pre-roll. On `loitering`, 52 residuals scored and
      52 discarded; on `leaving`, whose sensors are stopped throughout, the node read "no
      forecast to score" over a store holding two forecasts — `no-forecast` where the honest
      state is `warming`. The ledger now reads the standing run from the store at the two
      points it is *used*: absorbing a sample, and publishing statistics. A first version
      filled a null only and went stale on `arriving`, whose artefact replays three cycles; a
      second called it from the sample path alone and left `leaving` reading `no-forecast`,
      which is how the second harm was found.

- [x] **T063** The snapshot source counted a superseded publication as replayed, and drew
      "N of N holding(s)" on the node the Intro panel sends a reader to. `publish()` now
      reports `superseded` alongside `published`, and the source counts only what the store
      wrote. A rewinding publication is not a refusal — the bytes were accounted for — so
      neither counter was right for it before.

- [x] **T064** `standingRunFromStore` was a one-caller wrapper that added the two addressing
      fields; inlined into the model runner, where the addressing belongs. `standingRunFacts`
      now has two callers that share only the facts, which is what it is for.

- [x] **T065** The replayed-cadence test takes its readings in the order the faults are
      visible in: absorbed and staged at the instant the console opens, cadence last, because
      driving the clock to the next forecast closes the ledger and opens a staging window. The
      offload reading spends one clock sample first — the restatement rides the runner's first
      sample after the pre-roll, so `loitering` reads 0 staged at the instant the pre-roll
      returns and 1 a tick later — and the cadence adds that tick back rather than moving the
      settle. Planted against it: disabling the resume leaves `leaving` and `returning`
      agreeing by coincidence (599 and 639) and `arriving` and `loitering` failing (1,794 →
      1,329 and 1,080 → 219), which is why a case that checked one condition proved nothing.

- [x] **T066** T063 fixed one miscount and made another. Excluding a superseded publication
      from `published` left it falling into the `else`, so a restarted snapshot source
      reported it as a *store refusal* — with no reason, because a superseded verdict carries
      none — turned its node `degraded`, and drew a `refused` figure FR-58 permits only once
      something has gone wrong. On the shipped artefacts that is 4 on `arriving`, 2 on
      `loitering` and 6 on `returning`, against a store that refused nothing, on the exact
      node the Intro copy in this feature sends a reader to. Both adversarial passes found it
      independently. Watched failing twice, once per fault: the original miscount fails the
      superseded count, my correction fails the refusals.

- [x] **T067** The shape underneath T063 and T066, which both passes named: `published: true`
      meaning "nothing was written" is a boolean whose name lies, and three other callers read
      it — `env-generator` incremented its own published count on it. `PublicationVerdict` is
      now `{ outcome: 'written' | 'superseded' | 'refused' }`, so a caller must say which of
      the three it means and the compiler asks. The three live authors throw on `superseded`
      rather than folding it into success: it is unreachable while a component publishes at
      its own tick, and an unreachable case swept into the success branch is exactly what
      produced two faults here.

- [x] **T068** The restatement test asserted three fields of ten under a comment claiming "the
      whole message", and `run-published.schema.json` states the equality as contract. It now
      compares the restatement to the original announcement, captured live — `valid_time` in
      particular is computed by one formula in `emit` and another in `standingRunFacts`, and
      they agreed by construction rather than by assertion. Planted: an off-by-one step in the
      reconstruction's `valid_time`; the three spot checks pass it, the whole-message
      comparison fails on `end_sim_time`.

- [x] **T069** `release_margin_ticks` acquired a second meaning — the watchdog's slack — and
      its master was not amended, which is T052's lesson repeated. Amended, including the
      residue a pass found: a restarted scheduler has heard no cost for up to
      `restate_every_ticks`, so its bound is the margin alone, 30 ticks against a 9-tick cost
      at shipped values. Safe by 3× and not derived from anything; said in the master rather
      than left to be discovered by tuning.

- [x] **T070** The `-spread` suffix was written out in both the component that names the pair
      and the reconstruction that reads it. One definition now, `spreadHoldingIdFor`, carrying
      the reason it is load-bearing: both members share an era and a tick, so the pointer
      settles on whichever is published second, and a reversed order would leave every
      consumer of the standing run silently reverting to pre-125 behaviour.

- [x] **T071** The stale boot figure, again, in the two documents that carry authority.
      `a5a414e` corrected the ADR and the backlog and left `specs/120-start-conditions/`
      quoting 4.7 s — the exact reading the ADR now names as an outlier — which is T046's
      lesson repeated in the commit that was fixing the record. Both passes found it. Every
      occurrence in the tree is now the three-run spread.

- [x] **T072** Telemetry asked `standingRunFacts` for one field on every absorbed residual
      sample, and that helper parses two instants into BigInt microseconds and assembles a
      grid, a collection set and a digest pair to answer. `standingRunId` is the two map
      lookups the question actually is, and holds the same rule — a forecast without its
      spread names no run. A feature whose subject is compute at the boundary should not put
      an announcement's worth of work on a per-sample path.

## Declined, with the reason

- [ ] **T030** Quiesce the scheduler through a replayed pre-roll. **Built, measured and
      reverted twice** — the second time on the argument that the standing-run restatement
      (T042) would now seed the fresh instance. It does not: the resumed scheduler fires its
      cadence floor on the first sample after the console opens, before the restatement
      reaches it, so `loitering` and `returning` both turn the loop 10 ticks after opening
      against a 600-tick minimum. The cost of not quiescing is that a replayed `returning`
      opens showing five `abandoned` decisions where a live run has none — kept, because it is
      true, and because the alternative shows a cadence no live run can produce. A review read the 611–1,790 tick quiet after opening as a stall; a live run
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
