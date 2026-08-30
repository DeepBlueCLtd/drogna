# Feature 118 — tasks

Ticked as they were done, with the reasons written at the moment they were taken
(CLAUDE.md, lesson 1).

Features 101 (addressable views), 113/114 (the operator plane's controls, and the events
it declares) and 116 (the analysis step) are hard prerequisites: the pre-roll is nothing
but those controls, driven from a script.

## The contract

- [x] T001 `contracts/schemas/config.start-conditions.schema.json`: a new master. A
      condition is an id, a label, a situation, what the run will hold, the platform's
      initial vector, and an ordered list of legs; a leg is a note, a tick count, the
      components stopped during it, a demand and prompts.
- [x] T002 `config.run.schema.json` gains `start_conditions`, required. Amended, not
      rewritten (CLAUDE.md).
- [x] T003 `run-manifest.schema.json` gains `start_condition`, **required**. Required for
      the same reason the root seed is: a manifest that did not name one would replay a
      different world under the same run id, silently, since everything downstream of the
      pre-roll would still derive correctly from the seed.
- [x] T004 `pnpm generate`; the drift gate holds the committed output to it.

## The configuration

- [x] T005 Four conditions in `app/config/run.json`, in the order of a passage, defaulting
      to `arriving`.
- [x] T006 A `quay-approaches` reference area in the feature store, so the two quayside
      situations name a place rather than a figure of speech. `reference_area` was already
      a declared kind; nothing in the store changed.
- [x] T007 Leg scripts tuned against measurement, not against taste — see T017.

## The machinery

- [x] T008 `bootstrap/start-condition.ts`: resolving a condition from the address, the
      configuration a condition runs under (a copy, never a mutation — a manifest import
      re-boots, and the second boot must not inherit the first boot's choice), and the
      query-string seam. The choice travels in `?start=`, beside the hash rather than
      inside it, so `views.ts` needs no second grammar and a link can name both a
      situation and a tab.
- [x] T009 `bootstrap/preroll.ts`: the scripted operator. Pin the clock, then per leg —
      the crew as a difference from the last leg, the demand, the prompts, the ticks in
      the bursts the plane declares a bound for, yielding to the host between them.
- [x] T010 `deriveRunId` takes the condition; the manifest records it; `importManifest`
      resolves it and refuses a manifest naming one this build does not offer.
- [x] T011 `main.tsx`: welcome, or straight in when the address names a view or a
      condition. The shell is mounted only when the pre-roll has finished — a console
      opening onto a run still being wound forward would show a clock racing and figures
      no reader can read.
- [x] T012 `shell/Welcome.tsx` and its styles. Cards are `<button>`s; the page introduces
      no colour, painting on the two surfaces the shell's chrome already declares, so
      `contrast.test.ts` holds it to the same bounds as every panel.

## Watching the checks fail (CLAUDE.md, lesson 2)

- [x] T013 Moved `arriving`'s platform to the work area's centre: 792 measurements
      reported inside a region whose card says it holds none. Reverted.
- [x] T014 Stopped `advisory-source` through `loitering`'s legs. **The check passed** — an
      artefact, not a pass: the source was restarted at the end of the pre-roll, heard the
      acknowledgement sample a rate change republishes, found the tick a multiple of its
      cadence and authored one advisory. Two changes followed, and both are the point of
      having planted it: the driver now restores the rate *before* bringing the crew back,
      so nothing is restarted into that sample; and the check is held to the cadence over
      the period rather than to "more than none". Re-planted: 0 where 3 are warranted.
- [x] T015 Deleted the `run-now` prompt from `leaving`'s second leg. **Nothing changed** —
      the cadence floor warrants that run at tick 1,800 whether it is asked for or not. The
      prompt was removed rather than the check strengthened: a line whose removal no test
      notices is a line doing no work.
- [x] T016 A leg prompting an event the plane does not offer: the pre-roll is refused, the
      refusal names `sail-home`, and the clock is unpinned on the way out. Asserted.

## What measurement decided

- [x] T017 The first script stopped the scheduler, analyst and model runner through the
      quiet legs. Measured leg by leg, that was the wrong component: a tick inside the work
      area cost about 3 ms with the **planner** running, and `loitering` reached 25 s. With
      the planner alone held back and the whole loop live, the four conditions cost 1.1,
      3.0, 3.0 and 5.2 seconds. The script now holds back the planner and nothing else.
- [x] T018 Stopping the scheduler was found to be worse than dear. It holds one request in
      flight and clears it only on a published run, so stopping the analyst underneath it
      strands it for the rest of the run; and restarting it resets the sequence its run
      identifiers are built from, so holdings from an earlier cycle are silently replaced.
      Both are reachable from the Operator tab's own restart control and neither is fixed
      here — recorded in the spec, and avoided by never stopping the scheduler.
- [x] T019 A component just started has heard no clock sample, and the harness's rule is
      that no component claims a time it has not heard. Prompted in that state the
      scheduler published a run request dated at the empty instant, the analyst dated its
      holding the same way, and the packager staged a window ending before the run began
      and declined it for holding no measurements. All three were watched. A leg that
      brings anyone back now gives the crew one of its **own** ticks to hear the time —
      out of the leg's budget, because the number in the configuration is how far the run
      advances.

## Held to the promises

- [x] T020 `bootstrap/preroll.test.ts`: every condition, driven exactly as the composition
      root drives it, read out of the stores. The table of promises is checked for
      completeness against the configuration, so a fifth condition fails the suite until
      somebody says what it promises.
- [x] T021 The replay proof extends to the pre-roll: one seed and one condition, the same
      holdings, observations and advisories twice. Operator commands are ordinarily outside
      AT-04, and a demanded run replays identically only when the same demands are issued
      at the same ticks — which a condition's configuration meets by construction.
- [x] T022 `bootstrap/start-condition.test.ts`: a leg may only stop a component the plane
      will stop and only prompt an event it offers, every condition starts inside the
      generated domain and within the platform's own limits, and no two start in the same
      place. Caught here rather than mid-pre-roll with the page already showing progress.
- [x] T023 `shell/welcome.test.tsx`: the cards are drawn from the configuration document,
      the default is marked exactly once, an unknown request is stated rather than
      corrected, a pre-roll in flight disables every card, and the synthetic-data statement
      is present.
- [x] T024 Existing assertions that had typed out what the configuration declares — the
      run id, the feature-store kinds, the reference feature ids — now read them off the
      document. Three of them broke on this feature's config change, which is what a
      literal is for.

## Around the edges

- [x] T025 `capture/glance.ts` and `capture/motion.ts` name the situation they open in, so
      a picture is of a stated run; `DROGNA_START` overrides it. The other captures deep-link
      a view and were unaffected.
- [x] T026 `replay-proof.ts`'s preamble says the pre-roll is inside the claim, and why.
- [x] T027 The blog entry, and a capture of the welcome page beside it.

## Deliberately not done

- [ ] NetCDF export. The input names it; SRD-v2 FR-39 holds offload to announcement-only in
      V2, and this feature makes that path reachable — `returning` arrives with a package
      staged and its measurement geometry beside it — rather than widening FR-39. Reasoned
      in the spec.
- [ ] A plan waiting on the Operator tab the instant the console opens. The planner is held
      back through every pre-roll and replans within 600 ticks of the shell mounting. It
      recommends and changes nothing a card promises, so the cost is a plan that arrives a
      moment later, live, where a reader can watch it happen.
