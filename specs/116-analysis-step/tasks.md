# Feature 116 — tasks

Dependency-ordered, and complete. Tick as you go, and write the reason at the moment a
task is declined — the reason is the part that cannot be reconstructed later (CLAUDE.md,
lesson 1).

Features 102, 105 and 106 are hard prerequisites: the coverage store, the forecast loop
and the planner.

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

- [x] T006 Settle how the provenance recursion is kept from saturating. **Both**, and
      the measurement said why: dilution alone reduces the saturation but never makes a
      share exactly zero, so the tint could say *almost nothing* and never *the boat has
      never been here*. Gaspari–Cohn rather than a cutoff radius, because a truncated
      covariance is not positive definite; a test builds both and watches the truncated
      one fail Cholesky. Off-track share fell from 0.170 to exactly 0 over 90 of 126
      cells.
- [x] T007 Settle the remaining four. Cold start reads the now-cast once, stated in the
      lineage; a negative share is drawn as an overshoot rather than clamped; an
      out-of-domain observation is clamped and the displacement recorded; the departure
      bar is kept, credited by relabelling the archive share when the platform sails,
      with the convention admitted in the explainer.

## The component

- [x] T008 Amend `contracts/schemas/coverage-holding.schema.json` to admit an `analysis`
      era, and add `contracts/schemas/config.analyst.schema.json`. Append, never rewrite.
      Run `pnpm generate`; commit `app/src/generated/`.
- [x] T009 The analyst component: subscribes to the run request, reads the observations
      since its last cycle and the current forecast as background, calls the kernel,
      publishes the analysis, its error field and its provenance field through the
      store's one write seam. Heartbeat with figures read from the cycle that happened.
- [x] T010 The model runner initialises from the current analysis, and refuses a run
      with no analysis, naming the reason (FR-006).
- [x] T011 A gate: nothing but the monitor's scoring and the display reads the
      truth-derived now-cast (FR-007). One line appended to `scripts/gates.registry`;
      plant a violation, see it caught, revert, say so in the commit.
- [x] T012 The planner scores against the published analysis error; the observation-age
      field goes, from the planner and from its configuration document (FR-010).
      Amend SRD-v2 FR-33 in the same commit. The change was larger than planned: the
      footprint block had to go too, and retiring the age proxy was only sound once the
      ensemble was perturbed from Pᵃ, because until then the spread had no spatial
      structure for the proxy to be replaced by.
- [x] T013 An end-to-end test on the real loop: a breach, an analysis, a run initialised
      from it, and the residual falling for a reason that is not a timer.

## The display

- [x] T014 The Map's provenance tint, its legend and its status line (FR-015).
- [x] T015 The twelfth explainer, fifth in the course: one cell's provenance over time.
      `app/src/panels/background/explainers/analysis.tsx`, appended to `registry.ts`.
      States that it depicts drogna's own arrangement, and that the departure bar is a
      convention (FR-012, FR-013).
- [x] T016 Amend SRD-v2 FR-21 (four eras, not three), FR-30 (the analyst in the loop)
      and FR-33 (the age term retired).

## The record

- [x] T017 ADR-0038, *measurements reach the field*: why the truth-derived now-cast
      stopped being the initial state, why optimal interpolation rather than a nudging
      scheme (the provenance identity is the argument, not the accuracy), why
      Gaspari–Cohn rather than a cutoff, and why the planner's footprint block is gone.
- [x] T018 A blog entry: `site/docs/blog/posts/the-forecast-that-was-not-listening.md`.

## What was not done, and why

- **Salinity's provenance is not published.** Both variables are analysed, because sound
  speed is derived from the pair and correcting one alone would bias every residual the
  monitor scores. But nothing reads salinity's shares — the Map tints by temperature's
  and the explainer follows one cell of it — and publishing them would add four
  full-grid fields to hash and hold every cycle to answer a question nothing asks.
- **Analysis holdings accumulate.** The store retires the previous now-cast but keeps
  every analysis, so an analysis, an error field and a provenance field are added on
  every cycle and never released: about 1.5 MB a cycle at the shipped grid, for the life
  of a run. The published run instances are the historical record and are meant to
  accumulate; a working analysis is not. Giving the analysis era the retention the
  now-cast has — keep the holdings of the most recent publication tick, release the rest
  — is the fix, and it is a change to shared store code that this feature did not make
  late in its life.

- **Cross-variable covariance.** Temperature and salinity are analysed independently,
  though they are physically correlated and a real system would exploit it. Out of scope
  in the specification and left there: it would double the system's order for no effect
  the demonstration can show.
- **A localisation argued from the world's own feature scales.** The ocean declares them
  on disk — eddy radius 60 km, front sharpness 30 km, feature depth scales 160–250 m —
  and they would be the physically right correlation lengths. The analyst may not read
  that document: it describes the truth, and the gate this feature adds forbids exactly
  that. The declared half-widths (30 km, 160 m) were chosen to sit at those scales as a
  stated modelling assumption instead, which is what a real background covariance is.
- **Reconciling the planner's grid with the analysis grid.** The planner reasons in H3
  resolution-5 cells of about 9 km; the coverage grid is 19 × 23 km. The planner's old
  footprint declared a 12 km e-folding, finer than one coverage cell, so it modelled a
  reach the field could not express. Both now use the analyst's half-widths, which
  removes the disagreement without resolving the scale mismatch itself. Worth a look if
  the grid is ever refined.
