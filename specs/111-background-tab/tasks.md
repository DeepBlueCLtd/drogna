# Feature 111 — tasks

The course is built. Ticked as built, per the V1 reconciliation lesson: the reason is
written at the moment a task is decided, never reconstructed later — including where a
task was done differently from how it was written, which is the case that gets lost.

Feature 101 is a hard prerequisite for everything below the record group — the shell,
the panel registration, the configuration document and the addressing all come from it,
and this branch now carries them.

## Record

- [x] T001 Re-aim the FR-14 amendment at `srd.md`. Done by merging the implementation
      branch in: git's rename detection carried the edit across, and it was verified in
      place rather than assumed. §5.10 (FR-43 to FR-45) and the V2-C19 row came with it.
      Re-reading the amended paragraph against the tree also found Holdings missing from
      the tab list and the layout library still written as an open question; both fixed,
      and the reasons are in `plan.md`.
- [x] T002 ADR amending ADR-0028: addressability below the panel —
      `docs/adr/0032-addressability-goes-below-the-panel.md`. Written after the code
      rather than before it, which is a deviation from what this task said and is
      recorded rather than glossed: the shape was already settled in `plan.md`, and
      writing the record last let it carry the watched failure verbatim instead of a
      prediction of it. ADR-0028's own bullet now says it is amended.

      *Two corrections on merging `main`.* It was written as ADR-0031 and is renumbered
      to 0032, because the site-tooling record took 0031 first; a number is a fixed
      address for the life of the project, so the record nobody has referred to yet is
      the one that moves. And writing it found `docs/adr/README.md` had stopped at 0026
      while 0027 to 0030 existed on disk — the second time that index had silently
      fallen behind — so the rows were added; `main` had meanwhile deleted the index
      outright for the same reason and generates one for the site from the records
      themselves. That is the better answer and it is the one kept: a hand-kept list
      beside the files it lists is a second copy of something nobody has to copy.
- [x] T003 Noted in `docs/v2/plan.md` §5. 110 is *not* dropped, so there is nothing to
      reconcile: 111 built explainers, not the machinery that drives the other panels.
      The note says so, and says the debt is owed by whoever drops the candidate, so it
      is visible from the plan rather than only from Q4.

- [x] T004 The counts, reconciled. Not a planned task; it arrived because the tree had to
      be checked before it could be built on. `spec.md` said "eight" in seven places and
      "nine" in one while listing eleven; `srd.md` FR-43 named and listed eight; the
      storyboard carried eleven. Eleven wins, being what was designed and reviewed. Both
      documents amended, FR-43 carrying the reason it was ever eight, and the reconciliation
      written up at the foot of `spec.md`. The count is now checked by a test that
      enumerates `registry.ts`, so the next disagreement is reported rather than noticed.

## Design

- [x] T005 Storyboard all eleven explainers — steps, prose, wireframes, value panels, and
      the panel chrome at both widths. `storyboard.html`, committed here because it leads
      implementation rather than records it.
- [x] T006 Settle what the first storyboard left open. EDR was never over budget — at
      ~10s a step, seven steps is ~70s, inside the promise; four explainers now run to
      seven and the rail shows length for all of them. The value panel stays in every
      explainer (FR-020): FR-008 already handles thinness at the axis. Interactive regions
      carry a dashed outline (FR-025). And the grey was simply wrong — it meant "truth you
      never have", when drogna holds a multi-decade archive and scores against a recorded
      ground truth; it now means the coarse prior, which is what produced explainer 4.
- [x] T007 Settle what the second storyboard left open. No curated short path — dip-in
      works and the rail shows lengths, so a second navigation surface would earn nothing.
      The frame is widened to "the standards, and what it takes to use them honestly",
      which admits explainers 4, 9 and 10 honestly rather than hiding them.
      FeatureOfInterest folds into the Thing step, where the contrast with Location makes
      the point at no cost in steps. And the boundary earns its own explainer, closing the
      course: for an evaluator in this domain it is the first question asked, and the
      course was silent on it.
- [x] T009 Add the read/write separation explainer at position 9, after MQTT, so both paths
      are on the table before the separation is named. Its beat is that the two loads never
      contend. Also: the closing panel becomes Consequences and may record a cost (FR-008),
      and the prose is rewritten engineer-to-engineer (FR-026) — the first draft read as a
      sales deck, which would alienate the colleagues most likely to review it.
- [x] T010b Explainer 9 asserts independent scaling with a drawn diagram, not a measurement.
      **Marked argued-not-measured**, which is the honest of the two options and the cheap
      one. Step 4 carries the note in the step, not in a footnote: "Argued from the
      topology, not measured. Nothing in this page has produced a curve to back it, and
      drawing one would be inventing a figure." Its caption says the same. Having the
      running system produce the curves is a real piece of work — instrumenting both paths
      under load — and it belongs to whoever wants the claim to be stronger than an
      argument. Renumbered T010b here: this file carried two T010s, and the addressing one
      below is the one other work referred to.
- [ ] T008 Settle what the third storyboard left open. **Still open, and the numbers in it
      were wrong**: the course is eleven explainers and sixty-nine steps, not ten and
      sixty-three. Three questions stand, and implementation has evidence for the first two
      without settling either. (a) Is sixty-nine steps defensible against a time-poor
      reader? The rail shows each explainer's length, dip-in works, and no explainer is
      longer than seven steps — so nobody is asked for sixty-nine. Whether the *course*
      still reads as one argument at that length is a judgement about readers, not code.
      (b) Is closing on the boundary right? Building it says yes: it is the question an
      evaluator in this domain asks first, and every explainer before it is about serving
      data rather than about who may have it. (c) What bar would a fourth non-standards
      explainer clear? Unanswered, and deliberately: the three that exist each closed a
      question the standards could not, and inventing the rule before the fourth candidate
      exists would be guessing at the shape of a thing nobody has proposed.

## Addressing (US1, and the only work that can break another feature)

- [x] T010 Extend `app/src/shell/views.ts`: parse `#/view/<id>` into a view id and an
      opaque remainder; `hashForView` composes one back. Every existing single-segment
      link must keep working, proved by the existing tests passing unchanged. Done: the
      four original cases in `views.test.ts` are untouched and pass, which is the proof
      rather than the intention.
- [x] T011 Pass the remainder to the panel through `PanelParams`, and have panels that
      do not understand one ignore it. No panel's internal vocabulary appears in shell
      source. Done as a small `PanelAddress` (read, write, hear about a change) rather
      than a bare string, because a panel that writes its position needs a way to write
      it. Its listener is `onChange` and not `subscribe`: `subscribe` is broker
      vocabulary, and a word that means two things makes the inertness gate choose
      between a false positive and a blind spot.
- [x] T012 Fix the writeback in `Shell.tsx` so an activation preserves a sub-path.
      **Watch it fail first**: assert the sub-path survives `onDidActivePanelChange`
      against the unmodified writeback, see it erased, then fix. The test is worth
      nothing until it has been seen reporting the erasure. **Watched**: against the
      unmodified writeback `Shell.test.tsx` reported `expected '#/view/intro' to be
      '#/view/background/why-a-standard/3'`. The decision is now `hashOnActivation` in
      `views.ts`, so it is unit-testable as well as observable through the shell.
- [x] T013 An unknown or malformed remainder falls back to the explainer's first step,
      never an error and never a blank panel (spec Edge Cases, FR-003). `address.ts`, and
      exercised for an unknown explainer, step 0, step 999, a non-numeric step and a bare
      explainer id. Watched: the clamp was removed and the fallback test reported it.

## The spine (US1, P1)

- [x] T020 `registry.ts`: the eleven explainers in course order. Load-bearing — the rail,
      the anchor scheme and SC-007's test all read it, which is what stops any of the
      three going stale independently. Build it before its three consumers.
- [x] T021 `BackgroundPanel`: hosts the rail and the active explainer, registered in
      `panelComponents` and in `config.run`'s `shell.views`.
- [x] T022 `Rail`: the numbered course rail with position, collapsing to a dropdown plus
      previous/next below the width threshold (FR-021).
- [x] T023 `Spine`: the ordered step machine every explainer obeys (FR-016). Next always
      works and drives the mechanism itself (FR-017); free play within a step does not
      change the address (FR-018); nothing animates on arrival (FR-019). Click and
      keyboard advance, each step addressable. No dependency added (FR-006).
- [x] T024 `ValuePanel`: the three fixed axes, same position and wording everywhere; an
      omitted axis renders its stated reason rather than an empty box (FR-008). Rendered
      as the spine's final step (FR-020).
- [x] T025 SC-007's test, under both conditions that make introspecting a render sound:
      it enumerates from `registry.ts`, never a hand-written list; and a fixture explainer
      omitting its value panel lives permanently in the test tree. **Watch it catch that
      fixture** — an assertion over markup otherwise passes by not finding what it did not
      look for, which is how two of this repository's original gates reported a file of
      deliberate violations as clean. **Watched**, twice: `fixtures/planted.tsx` holds an
      explainer with no Consequences panel and one omitting an axis in silence, and the
      audit reports both on every run. A third check was added to the same file — every
      through-life-cost claim carries FR-009's mark — because that claim is the one this
      specification says must never look measured.
- [x] T026 `marks.tsx`: the shared category vocabulary — each category a hue *with* a
      texture and a line weight, so a colour-only distinction cannot be expressed
      (FR-011) — plus the marks for the four seeded features (FR-012). No shared scene;
      each explainer frames its own. The vocabulary alone makes the fault *unlikely*, not
      unwritable, so `check-background-marks.ts` was added: no colour literal and no paint
      literal under `explainers/`, watched failing against a planted explainer that draws
      two shapes apart by hue alone. That is a second registry line, where T030 named one;
      FR-011 asks for a structural guarantee and explicitly refuses a promise kept by
      review, and the runner still names no gate.
- [x] T027 The narrow-width floor: below the width a diagram needs, replace it with a
      statement of the width required, keeping prose and rail usable (FR-024). Never scale
      a diagram past legibility, and never render one that has silently dropped its labels.
- [x] T028 Explainer 1, "why a standard at all" (slides). The argument the other seven are
      judged by, so it lands with the spine rather than after it.

## Inertness (US1, and the feature's one real claim)

- [x] T030 `scripts/gates/check-background-inert.ts` + one appended line in
      `scripts/gates.registry`. Never edit `run-gates.ts`; it names no gate. Five rules:
      no `seam` import, no `fetch(`, no transport call, no network connection, and no
      read of `params.client`/`validator`/`manifest`/`config`. `run-gates.ts` untouched.
- [x] T031 Watch T030 failing: a deliberately-wired explainer held permanently in
      `scripts/gates/tests/fixtures/violations/`, in T031-of-101's pattern. Each of the
      five rules is asserted by name, because a gate seen catching one rule has four
      nobody has watched. Its paths and topics are arguments rather than literals: the
      first draft planted this gate's violation and the literal-paths gate's at once, and
      broke that gate's own count.
- [x] T032 The runtime half: mount Background with a client whose every method throws,
      and with no component started. Both must pass (SC-001, SC-002). Watched failing
      against the same planted violation, because a gate and a test fail differently.
      All 69 steps are walked under the traps. The violation is *not* the same file —
      `WiredPanel` in `fixtures/planted.tsx` reaches by a call rather than an import,
      which is precisely what the gate cannot see, and the traps report it. The gate now
      skips that directory by name, which is why the two checks are two.
- [x] T033 Greyscale and keyboard proofs (SC-005, SC-006), by capture rather than
      assertion. `pnpm capture:background`: every explainer shot in colour and in
      greyscale, and every explainer completed from step 1 to its Consequences panel using
      nothing but Tab and Enter. All 69 steps walked.
      A third proof rode along and earned its place: every text node measured against its
      frame, because FR-024's "never renders having silently dropped its labels" is
      invisible to a reader of the source and nearly invisible to a reader of the picture.
      It found 27 (see T027). The measurement was wrong first — `getBBox()` ignores the
      transforms a mark is placed by, so it called three correct labels clipped — and
      after being rewritten to rendered coordinates it was watched failing against a
      planted over-long sentence before being trusted.

## The shape of the data (US2, P2)

- [x] T040 Explainer 2, points and fields (interactive): sample the schematic sea as
      points over the archive prior, then as a field; the results differ in kind, not
      density. Step 4 is the beat — one question, two honest answers.
- [x] T042 Explainer 4, what a holding is (interactive): the three eras under one
      collection name; step 4 is the beat — instances accumulate, each carrying the
      manifest that reconstructs it; step 5, the extent stated truthfully and verified
      against the store by test.
- [x] T041 Explainer 3, NetCDF (interactive): peel the 4D block into dimensions,
      coordinates, variables, attributes; units, CRS and time origin shown travelling
      inside the file.

## The two ways it is served (US3, P3)

- [x] T053 Explainer 11, what is allowed to leave (interactive): default deny with
      indistinguishable refusals so the boundary cannot be probed; withholding by absence
      rather than by filtering; the published denial; and step 5, the beat — leakage scored
      per released variable with the worst one deciding, because an average over four
      variables will hide one that is leaking, which this repository has watched happen.
      Then step 6: the tests exercise an allowed request too, since a boundary never
      entered is untested from the inside.
- [x] T050 Explainer 5, SensorThings (interactive): the instrument chain, each step
      showing the URL that walks it — generic to the standard, against a fictional host,
      never a path this application serves and never something that looks pasteable into
      this page (FR-022). **Vocabulary hazard** — the gate forbids
      `contact` and `detection`; write around them rather than reaching for the marker.
- [x] T051 Explainer 6, OGC API-EDR (interactive): the six query types, each drawn as
      the geometry it takes and the shape it returns; URLs generic per FR-022, with the
      live EDR composer reached by link (FR-005) rather than imitated.
- [x] T052 Explainer 7, pygeoapi (slides): present tense about the real deployment, and
      an unambiguous statement that this page is not serving through it (FR-013).

## The moving parts (US4, P4)

- [x] T060 Explainer 8, MQTT (interactive): the topic tree, wildcards, publish and see
      who catches it.
- [x] T061 Explainer 10, the control loop (interactive): step sense → decide → act →
      publish, each transition naming the message that carries it; perturb and watch it
      re-plan rather than replay.

## Deliberately not done

- [ ] T070 A gate that checks Background's drogna-specific claims still match the tree
      — *still declined, and the reason has changed now the content exists, so it is
      rewritten rather than left standing. Q1 in `spec.md` remains open.*

      *The explainers now exist, so "nothing to check yet" no longer holds. What holds is
      that the claims are not in a shape a gate can read. FR-005 confines a drogna-specific
      claim to prose and a link, and the honest checks available are weak ones: that every
      `liveView` names a view the shell serves (worth having, and cheap), and that a
      sentence about the running system still describes it (not mechanisable — the
      sentences say things like "the loop adds rather than overwrites", which no artefact
      states in a form a gate could compare against).*

      *Two narrower checks were built instead, both real and both watched. The FR-022 test
      asserts no drawn URL contains a path this application serves, so an explainer cannot
      start looking pasteable. And every `liveView` must name a view `config.run` actually
      serves — watched reporting `expected 'mqtt/6 → no-such-view' to be 'mqtt/6 → a view
      the shell serves'` — so FR-005's evidence cannot become a dead end when a view is
      renamed. That is the checkable part of Q1. The unmechanisable part stays open.*
- [ ] T071 Remember where a viewer got to in the course — *declined: FR-015 forbids it,
      and open question Q3 records the doubt. A per-viewer convenience can be added
      later without changing what any component does.*
- [ ] T072 Deep links into Background from the site or from blog posts — *out of scope
      by the spec. The anchors exist after T010 to T013; who uses them is another
      feature's business.*
