# Feature 115 — tasks

Dependency-ordered. Only the maths group is built. Tick as you go, and write the reason
at the moment a task is declined — the reason is the part that cannot be reconstructed
later (CLAUDE.md, lesson 1).

Features 102, 105 and 106 are hard prerequisites: the coverage store, the forecast loop
and the planner. Open Question 1 blocks the whole display group.

## The maths

- [x] T001 The analysis kernel port and `optimal-interpolation-v1`.
      `app/src/backend/analyst/kernel.ts`. B from the published spread times a Gaussian
      correlation, R from each instrument's declared `noise_std`, H nearest-neighbour
      selection. Reports values, the diagonal of `Pᵃ = (I − KH)B`, the provenance shares
      and ω unclamped.
- [x] T002 The dense solve. `app/src/backend/analyst/linalg.ts`. Cholesky factor, solve
      and explicit inverse; the inverse is formed deliberately because the analysis
      needs it against one right-hand side per cell. Refuses a non-positive pivot,
      naming which.
- [x] T003 Fifteen tests, with the bound derived from the declared instrument error on
      disk rather than typed in, and a negative control that reverses the gain's sign
      and asserts the same bound rejects it. `app/src/backend/analyst/kernel.test.ts`.
- [x] T004 Prove the tests can fail. Four faults planted in the kernel — R dropped from
      the gain, the increment's sign reversed, the prior shares left unscaled, the error
      reduction dropped — caught by three or four tests each, and reverted. Recorded in
      the commit message.
- [x] T005 Characterise the saturation. Four cycles over one short track leave every
      cell at least 0.449 measurement and one cell above 1.0. Pinned by test so a fix
      fails there and is noticed rather than quietly improving a number nobody watched.

## The open question that blocks the rest

- [ ] T006 Settle how the provenance recursion is kept from saturating (spec Open
      Question 1). Candidate: dilute every share by `σ²ₐ/σ²_f` at the forecast step and
      credit the remainder to a fourth *model* share, which also decays measurement
      share as a forecast ages. Alternative or complement: a localisation radius,
      argued physically — at this observation count it buys no speed, so a compute
      argument would be dishonest. Blocks T012, T014 and User Story 3.
- [ ] T007 Settle what seeds the first analysis (Open Question 3), and what the figure
      draws for a negative share (Open Question 2).

## The component

- [ ] T008 Amend `contracts/schemas/coverage-holding.schema.json` to admit an `analysis`
      era, and add `contracts/schemas/config.analyst.schema.json`. Append, never rewrite.
      Run `pnpm generate`; commit `app/src/generated/`.
- [ ] T009 The analyst component: subscribes to the run request, reads the observations
      since its last cycle and the current forecast as background, calls the kernel,
      publishes the analysis, its error field and its provenance field through the
      store's one write seam. Heartbeat with figures read from the cycle that happened.
- [ ] T010 The model runner initialises from the current analysis, and refuses a run
      with no analysis, naming the reason (FR-006).
- [ ] T011 A gate: nothing but the monitor's scoring and the display reads the
      truth-derived now-cast (FR-007). One line appended to `scripts/gates.registry`;
      plant a violation, see it caught, revert, say so in the commit.
- [ ] T012 The planner scores against the published analysis error; the observation-age
      field goes, from the planner and from its configuration document (FR-010).
      Amend SRD-v2 FR-33 in the same commit.
- [ ] T013 An end-to-end test on the real loop: a breach, an analysis, a run initialised
      from it, and the residual falling for a reason that is not a timer.

## The display

- [ ] T014 The Map's provenance tint, its legend and its status line (FR-015).
- [ ] T015 The twelfth explainer, fifth in the course: one cell's provenance over time.
      `app/src/panels/background/explainers/analysis.tsx`, appended to `registry.ts`.
      States that it depicts drogna's own arrangement, and that the departure bar is a
      convention (FR-012, FR-013).
- [ ] T016 Amend SRD-v2 FR-21: four eras, not three.

## The record

- [ ] T017 An ADR for the analysis step: why the truth-derived now-cast stopped being
      the initial state, and why optimal interpolation rather than a nudging scheme —
      the provenance identity is the argument, not the accuracy.
- [ ] T018 A blog entry. This is a new piece of backend simulation worth watching work
      (D17), so it owes one. `site/docs/blog/posts/`.
