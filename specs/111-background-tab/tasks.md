# Feature 111 — tasks

No code is built yet; the record tasks are. Ticked as built, per the V1 reconciliation
lesson: the reason is written at the moment a task is declined, never reconstructed
later.

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
- [ ] T002 ADR amending ADR-0028: addressability below the panel. The three options and
      the rejections are in `plan.md`; the record is owed before the code, because a
      shared link is what makes it hard to reverse.
- [ ] T003 Note in `docs/v2/plan.md` §5 if the walkthrough candidate 110 is dropped, so
      the numbering is reconciled openly rather than quietly.

## Addressing (US1, and the only work that can break another feature)

- [ ] T010 Extend `app/src/shell/views.ts`: parse `#/view/<id>` into a view id and an
      opaque remainder; `hashForView` composes one back. Every existing single-segment
      link must keep working, proved by the existing tests passing unchanged.
- [ ] T011 Pass the remainder to the panel through `PanelParams`, and have panels that
      do not understand one ignore it. No panel's internal vocabulary appears in shell
      source.
- [ ] T012 Fix the writeback in `Shell.tsx` so an activation preserves a sub-path.
      **Watch it fail first**: assert the sub-path survives `onDidActivePanelChange`
      against the unmodified writeback, see it erased, then fix. The test is worth
      nothing until it has been seen reporting the erasure.
- [ ] T013 An unknown or malformed remainder falls back to the explainer's first step,
      never an error and never a blank panel (spec Edge Cases, FR-003).

## The spine (US1, P1)

- [ ] T020 `registry.ts`: the eight explainers in course order. Load-bearing — the rail,
      the anchor scheme and SC-007's test all read it, which is what stops any of the
      three going stale independently. Build it before its three consumers.
- [ ] T021 `BackgroundPanel`: hosts the rail and the active explainer, registered in
      `panelComponents` and in `config.run`'s `shell.views`.
- [ ] T022 `Rail`: the numbered course rail with position, collapsing to a dropdown plus
      previous/next below the width threshold (FR-021).
- [ ] T023 `Spine`: the ordered step machine every explainer obeys (FR-016). Next always
      works and drives the mechanism itself (FR-017); free play within a step does not
      change the address (FR-018); nothing animates on arrival (FR-019). Click and
      keyboard advance, each step addressable. No dependency added (FR-006).
- [ ] T024 `ValuePanel`: the three fixed axes, same position and wording everywhere; an
      omitted axis renders its stated reason rather than an empty box (FR-008). Rendered
      as the spine's final step (FR-020).
- [ ] T025 SC-007's test, under both conditions that make introspecting a render sound:
      it enumerates from `registry.ts`, never a hand-written list; and a fixture explainer
      omitting its value panel lives permanently in the test tree. **Watch it catch that
      fixture** — an assertion over markup otherwise passes by not finding what it did not
      look for, which is how two of this repository's original gates reported a file of
      deliberate violations as clean.
- [ ] T026 `marks.tsx`: the shared category vocabulary — each category a hue *with* a
      texture and a line weight, so a colour-only distinction cannot be expressed
      (FR-011) — plus the marks for the four seeded features (FR-012). No shared scene;
      each explainer frames its own.
- [ ] T027 The narrow-width floor: below the width a diagram needs, replace it with a
      statement of the width required, keeping prose and rail usable (FR-024). Never scale
      a diagram past legibility, and never render one that has silently dropped its labels.
- [ ] T028 Explainer 1, "why a standard at all" (slides). The argument the other seven are
      judged by, so it lands with the spine rather than after it.

## Inertness (US1, and the feature's one real claim)

- [ ] T030 `scripts/gates/check-background-inert.ts` + one appended line in
      `scripts/gates.registry`. Never edit `run-gates.ts`; it names no gate.
- [ ] T031 Watch T030 failing: a deliberately-wired explainer held permanently in
      `scripts/gates/tests/fixtures/violations/`, in T031-of-101's pattern.
- [ ] T032 The runtime half: mount Background with a client whose every method throws,
      and with no component started. Both must pass (SC-001, SC-002). Watched failing
      against the same planted violation, because a gate and a test fail differently.
- [ ] T033 Greyscale and keyboard proofs (SC-005, SC-006), by capture rather than
      assertion.

## The shape of the data (US2, P2)

- [ ] T040 Explainer 2, points and fields (interactive): sample the schematic sea as
      points, then as a field; the two results differ in kind, not density.
- [ ] T041 Explainer 3, NetCDF (interactive): peel the 4D block into dimensions,
      coordinates, variables, attributes; units, CRS and time origin shown travelling
      inside the file.

## The two ways it is served (US3, P3)

- [ ] T050 Explainer 4, SensorThings (interactive): the instrument chain, each step
      showing the URL that walks it — generic to the standard, against a fictional host,
      never a path this application serves and never something that looks pasteable into
      this page (FR-022). **Vocabulary hazard** — the gate forbids
      `contact` and `detection`; write around them rather than reaching for the marker.
- [ ] T051 Explainer 5, OGC API-EDR (interactive): the six query types, each drawn as
      the geometry it takes and the shape it returns; URLs generic per FR-022, with the
      live EDR composer reached by link (FR-005) rather than imitated.
- [ ] T052 Explainer 6, pygeoapi (slides): present tense about the real deployment, and
      an unambiguous statement that this page is not serving through it (FR-013).

## The moving parts (US4, P4)

- [ ] T060 Explainer 7, MQTT (interactive): the topic tree, wildcards, publish and see
      who catches it.
- [ ] T061 Explainer 8, the control loop (interactive): step sense → decide → act →
      publish, each transition naming the message that carries it; perturb and watch it
      re-plan rather than replay.

## Deliberately not done

- [ ] T070 A gate that checks Background's drogna-specific claims still match the tree
      — *declined for now, and recorded as open question Q1 in `spec.md`. There is no
      content to check yet, and a gate written before the thing it checks is how you get
      a check that has never been seen to fail. Revisit once the explainers exist.*
- [ ] T071 Remember where a viewer got to in the course — *declined: FR-015 forbids it,
      and open question Q3 records the doubt. A per-viewer convenience can be added
      later without changing what any component does.*
- [ ] T072 Deep links into Background from the site or from blog posts — *out of scope
      by the spec. The anchors exist after T010 to T013; who uses them is another
      feature's business.*
