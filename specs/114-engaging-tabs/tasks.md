# Feature 114 — tasks

Dependency-ordered. Only the specification tasks are done; nothing below the record
group is built. Tick as you go, and write the reason at the moment a task is declined —
the reason is the part that cannot be reconstructed later (CLAUDE.md, lesson 1).

Features 101 to 113 are hard prerequisites: the shell and its addressing, the seam, the
broker, the coverage store and its EDR service, telemetry, the walkthrough machinery and
the Operator flow chart all come from them.

## Specification

- [x] T001 Interview the author and write `spec.md`: scope (System, Holdings, Messages,
      map parity, the walkthrough), the three yardsticks, and the table-replacement
      reversal against 113's table-beside rule.
- [x] T002 Establish that the shell may derive the comparison without an exemption.
      `map-data.ts` has transformed served coverages into cells, ranges and interpolated
      positions since feature 109; the boundary that holds is *transform what crossed the
      seam, invent nothing*. Recorded in the spec rather than left to be re-argued.
- [x] T003 Catch what the interview did not raise: Principle IX admits no forecast-skill
      claim without a persistence reference, so a picture of forecast error alone is such
      a claim. The comparison gained a third coverage before it was specified rather than
      after it was built.
- [ ] T004 Decide whether this stays one feature or splits — the tab displays in one, the
      walkthrough relocation and map parity in another. Written as one because the four
      strands share the design language and the walkthrough touches every tab in scope;
      the author has not ruled on it. *(Open. Record the ruling here.)*

## Record — owed before the code

- [ ] T005 ADR: *the shell may derive, and says so*. The fourth kind of figure beside
      113's three; why a derived difference is not a Constitution VII violation and what
      would make one; why the request URLs are constitutive of the display rather than a
      convenience; why telemetry keeps skill. Owed before the comparison is built, because
      a display that computes is exactly what ADR-0035's three kinds were drawn to prevent
      and the next reader must find the argument, not infer it.
- [ ] T006 ADR: *the help control belongs to the panel*. Why the header button goes rather
      than staying as a fallback; what the absence of a button now means; how the
      completeness rule generalises from the declared component list to a per-surface list
      on disk. Amends ADR's record of feature 110 rather than replacing it.
- [ ] T007 Amend `srd.md`: new §5.14 with FR-63 to FR-70; FR-14, FR-16, FR-23, FR-24,
      FR-40, FR-46 and FR-61 amended in place. FR-16's obligation is named as discharged
      by the Operator flow chart — the amendment must say that, not merely delete System.
- [ ] T008 Note feature 114 in `docs/v2/plan.md` §5, beside the notes 111, 112 and 113
      left, so the numbering stays reconciled openly.
- [ ] T009 Design the three displays before any of them is built: the traffic display, the
      holdings timeline, the comparison. A committed mockup that leads implementation
      rather than records it, as 113's `mockup.html` did — at both densities, with the
      four kinds of figure annotated, the empty and refused states drawn, and the keyboard
      order shown. The table-replacement decision stands or falls here.

## System folds away — the two facts first

- [ ] T010 Add **declared beat** and **liveness window** to the Operator list view, as
      declared figures, typographically distinct from reported and observed per FR-58.
      Nothing else in this group may land before this does.
- [ ] T011 Move the System footnote's claim — that grey cannot distinguish *never ran*
      from *stopped* — onto the Operator legend, where the six node states are named.
- [ ] T012 A gate: no view id may be named in `app/src` that `config.run`'s shell document
      does not declare. Append one line to `scripts/gates.registry`; never edit the runner.
      **Plant a link to `#/view/system`, watch it fail, revert, and say so in the commit
      message** (CLAUDE.md, lesson 2) — SC-06.
- [ ] T013 Rewrite every reference to the System view: `IntroPanel.tsx` (two links, in the
      101 and 105 sections), the arc's prose in 104, the walkthrough's component steps
      that name `system` as a panel, and any spec or blog text that links it. The gate from
      T012 is what proves this complete, not a search by hand.
- [ ] T014 Remove `SystemPanel.tsx`, its registry entry and its view in `config/run.json`.
      Last in this group: the panel is the thing every earlier task is making removable.

## Holdings — the timeline

- [ ] T015 Read a holding's coverage interval from its own manifest: `grid.time` gives
      origin, start offset, step and count. A pure function with tests, no panel.
- [ ] T016 The timeline: three era lanes, holdings drawn at their intervals, an axis that
      carries twenty years and six hours without either vanishing, and a stated scale.
      Grows on the store's publication topic; never polls.
- [ ] T017 Keyboard and screen-reader parity — SC-03. Every column the table carried is
      announced; holdings are focusable in publication order. **If this cannot be reached,
      keep the table and record why here**: the interview's replacement licence was
      conditional on exactly this.
- [ ] T018 Keep the manifest view whole (FR-46) and the refusal path intact: a refused or
      unparseable inventory states its refusal; an empty timeline is never drawn as an
      empty store.

## Holdings — truth against forecast

- [ ] T019 Choose the counterpart: given an instance, find the nowcast holding whose time
      axis covers the instance's valid instant. Pure, tested, and refusing by name when
      there is none — including the in-validity case, which is the common one (SC-05).
- [ ] T020 Three area queries — instance, truth, persistence — at the chosen instant and
      depth, through the seam and the release gate, with the three URLs shown and copyable
      (SC-04).
- [ ] T021 The difference display: both differences on one shared scale, which is closer
      stated plainly, and *the model is not earning its compute* said in those terms when
      it is not (Principle IX).
- [ ] T022 Label every derived figure as derived, distinctly from declared, reported and
      observed. Show telemetry's reported skill beside the picture, unrecomputed, with the
      sentence that says which question each answers.

## Messages

- [ ] T023 The traffic display: lanes from the topology artefact's top-level namespaces,
      marks as messages arrive, refusals visibly refused, an undeclared topic drawn as an
      undeclared lane.
- [ ] T024 Silence is still. **Plant it**: a run with publication stopped must show a
      still display, and the check must fail if anything animates — SC-02. An idling
      animation is the display asserting traffic that is not there.
- [ ] T025 Promote the topic tree out of its disclosure to a primary region; selecting a
      node filters the traffic display and the list.
- [ ] T026 The schema-aware inspector: fields named and united from the master the topic
      declares, refusals marked on the offending field, the raw wire document always
      reachable, an undeclared topic named as such.
- [ ] T027 Hold the counters: everything received is validated and counted, suppressed
      kinds included, and the "N refused by their schema" claim keeps its full coverage
      (FR-23).

## The map

- [ ] T028 Draw the ownship track and demanded course in the cube, in the frame's own
      cartesian space, at the depths the platform reported — not at the surface (FR-69).
- [ ] T029 Extend the capture proof to all three projections — SC-07.

## The walkthrough

- [ ] T030 Move the help control from the shell header into the panel, top right; a view
      without a tour shows nothing. Check both presentations (FR-50, ADR-0033): the
      control must reach the same place narrow as wide.
- [ ] T031 Tours for Map, Holdings and Messages; the component tour moved into Operator.
- [ ] T032 Generalise the completeness rule: each tour held to a list on disk — the map's
      layer registry, the panels' declared regions. **Plant an unstepped layer, watch the
      check name it, revert, say so** — SC-08.
- [ ] T033 Extend the teaches-and-does-not-report test to all four tours (FR-62, SC-09).

## Showing the work

- [ ] T034 Link the hosted instance from the pull request, opened at each changed view —
      `#/view/messages`, `#/view/holdings`, `#/view/map` — not at the shell's front door
      (CLAUDE.md; D16).
- [ ] T035 Blog entries for the two new faces: the traffic display and the holdings
      timeline. One per new face in the shell, not one per feature (D17). The map parity
      and the button move are not new faces and get none — the reason recorded here.
- [ ] T036 Watch the acceptance happen and capture it: SC-01 end to end, generator to
      pixel, never inferred from green tests (Constitution IX, PR-06).
