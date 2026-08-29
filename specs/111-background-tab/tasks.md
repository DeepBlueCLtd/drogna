# Feature 111 — tasks

Nothing is built yet. Ticked as built, per the V1 reconciliation lesson: the reason is
written at the moment a task is declined, never reconstructed later.

Feature 101 is a hard prerequisite for everything below T001 — the shell, the panel
registration, the configuration document and the addressing all come from it.

## Record

- [ ] T001 Re-aim the FR-14 amendment at `srd.md`. Feature 101's adoption commit moves
      the SRD to the repository root and deletes `docs/v2/srd-v2.md`, which is where
      `spec.md`'s FR-001 currently writes. Whichever lands second carries the move; if
      neither does, the amendment is deleted by a merge and the tab has no requirement
      behind it. Also carry §5.10 (FR-43 to FR-45) and the V2-C19 row across.
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

- [ ] T020 `BackgroundPanel`: the sub-tab strip, the course order, the viewer's position
      in it, registered in `panelComponents` and in `config.run`'s `shell.views`.
- [ ] T021 `Slides`: step index, click and keyboard advance, per-step reveal, each step
      addressable. No dependency added (FR-006).
- [ ] T022 `ValuePanel`: the three fixed axes, same position and wording everywhere; an
      omitted axis renders its stated reason rather than an empty box (FR-008).
- [ ] T023 Explainer 1, "why a standard at all" (slides). The argument the other seven
      are judged by, so it lands with the spine rather than after it.
- [ ] T024 `sea.tsx`: the shared schematic primitives — the nameless sea, the eddy,
      front, thermocline and drifting feature, the grid (FR-011, FR-012).

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
      showing the URL that walks it. **Vocabulary hazard** — the gate forbids
      `contact` and `detection`; write around them rather than reaching for the marker.
- [ ] T051 Explainer 5, OGC API-EDR (interactive): the six query types, each drawn as
      the geometry it takes and the shape it returns.
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
