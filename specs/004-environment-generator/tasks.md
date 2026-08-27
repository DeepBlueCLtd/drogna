---

description: "Task list for 004-environment-generator"
---

# Tasks: Synthetic Environment Generator

**Input**: Design documents from `/specs/004-environment-generator/`

**Prerequisites**: `spec.md`, `plan.md`. Feature 001 supplies the config loader, the clock port, the
RNG port and the run manifest.

**Tests**: Requested. Test tasks precede the implementation they cover and are expected to fail when
written. The evaluator's agreement with the stored field is the property everything else rests on.

**Organization**: Grouped by user story so each can be implemented, tested and shown on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel — different files, no dependency
- **[Story]**: the user story the task serves

## Path Conventions

Paths are as given in `plan.md`: `services/env_generator/`, `contracts/schemas/`, `config/`.

---

## Reconciliation, 27 August 2026

This list was written before the code and has been reconciled against the tree rather than
rewritten to match it. Forty-one of the forty-six tasks are done, four are partly done and
one is not done at all; each of those five carries its reason where it stands, and none of
them has been quietly dropped.

Four kinds of drift are recorded here rather than tidied away, because what a plan turned
out to be wrong about is worth more than a plan that looks prescient.

1. **Sound speed left the generator.** T004 and T005 named
   `services/env_generator/src/harness_env_generator/soundspeed.py` and its test. ADR-0005
   settled that drogna holds one implementation of the equation and that it is not in this
   package: it is `libs/harness_core/src/harness_core/soundspeed.py`, tested in
   `libs/harness_core/tests/test_soundspeed.py`. What stayed behind is the *obligation* —
   `services/env_generator/tests/test_soundspeed.py` asserts that this package holds no
   second copy, and recomputes the written sound speed from the written measurands through
   an independent reimplementation of the equation. T005's "recorded warning" became two
   stronger things: a refusal for a scalar outside the validity range, and
   `sound_speed.outside_validity` in the manifest for a field evaluated with the check
   waived.
2. **The NetCDF encoder left the generator too.** T019 named `writer.py`. `encode_netcdf`
   is now `libs/harness_core/src/harness_core/netcdf.py`, moved there by feature 014 on the
   third-consumer rule, and the argument for writing the classic format directly moved with
   it. What stayed in `writer.py` is everything that is a decision about *fields* rather
   than about the format: `STORED_DTYPES`, `NORMALISED_ATTRIBUTES`, `tolerance_for`,
   `FieldWriter` and `digest_of`. The task is done; the file it names is now half of where
   the work lives.
3. **The blending rule is deliberately not in the ADR.** T037 asked for it to be recorded
   in the same document. ADR-0002 declines: it names both rejected alternatives —
   per-feature-only, and a static per-region map — and then says explicitly that the
   blending rule "is a modelling choice that this record does not fix", to be stated in the
   generator's documentation and recorded in the manifest. It is: in the module docstring of
   `timescale.py`, and as `timescale.blending_rule` in the manifest. The reversal is
   deliberate and the ADR carries its own reason for it.
4. **Reproducibility is proved under another name.** T038 named
   `services/env_generator/tests/test_reproducibility.py`. The proof is
   `tests/acceptance/test_at04_deterministic_replay.py`, which is AT-04 and which scores
   this generator: byte-identical field, identical manifest, a different seed producing a
   different field, and a replay unaffected by what the process drew beforehand.

### A measurement about the configured world, not about the code

AT-03 measured something worth carrying here. The local destination's depth axis puts levels
50 m apart; the thermocline that destination configures turns over in 25.3 m. The grid
therefore cannot represent the feature, and the stored field disagrees with the analytic
form by 0.0495 degree_C on the levels and 0.5196 degree_C halfway between them — an order of
magnitude larger, which is why AT-03's cast sits on the stored levels and says so, in
`test_at03_a_cast_between_the_stored_depth_levels_reads_the_grid_not_the_world`.

Nothing is unticked because of it. T006 builds the grid configuration asks for and T014
builds the thermocline the specification asks for; the mismatch lives in the values, not in
either implementation, and `spec.md` already anticipates the same thing horizontally for the
front. What makes it visible rather than silent is T045, which turned out to record the
resolution ratio for *every* feature and not only the front — the thermocline's ratio is
about one half, and it is in the manifest of every world this generator writes. It is
recorded here so that a reader of a thermocline recovery error knows what that figure
contains.

### What is still open

Named here as well as marked below, so that a reader who stops at the top of this file still
knows. SC-009's performance and size budget has never been measured (T044). Three checks
that the plan asked for do not exist in the form it asked for: a unit test of `scoring.py`
(T024), a startup test covering an invalid configuration and — more seriously — the
out-of-domain feature refusal in `manifest.py`, which no test has ever been seen to trigger
(T039), and the reviewer's by-hand reconstruction of a composed value from the manifest
(T046). T004's published reference values cover the middle of the equation's validity range
and not its ends.

---

## Phase 1: Setup

- [x] T001 Create `services/env_generator/pyproject.toml` and the `harness_env_generator` package
      skeleton with `py.typed`, and add it to the workspace members list.
- [x] T002 [P] Author `contracts/schemas/config.env_generator.schema.json`, referencing
      `config.common.schema.json` and adding the generator's own section: grid extents and spacing for
      all four axes, stored dtype, background stratification parameters, the four features with their
      parameters and timescales, the background timescale, the timescale floor relative to the time
      step, physical bounds, output location and file naming, and the RNG stream name. Reject unknown
      keys.
- [x] T003 [P] Write `config/local/env_generator.json` and `config/droplet/env_generator.json`: the
      same shape with different values, no literal in source.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The axes, the base state and the one piece of bespoke numerics everything else derives
from.

**Blocking**: no user story work starts until this phase is complete.

- [~] T004 Write `services/env_generator/tests/test_soundspeed.py` against published reference values
      for the named equation, including at least one case near each end of its stated validity range.
      **Partly done**: the test moved with the module to
      `libs/harness_core/tests/test_soundspeed.py` under ADR-0005, and it reproduces one
      published check value — Mackenzie's own 25 degree_C, 35 PSU, 1000 m giving 1550.744 m/s.
      That is the middle of the range. Neither end has a published value against it; what the
      ends have is a refusal test and a monotonicity test, which are worth having and are not
      what this task asked for.
- [x] T005 Implement `services/env_generator/src/harness_env_generator/soundspeed.py`: the named
      equation, with the reference, the validity range and the reason for the choice in the module
      docstring, and a recorded warning when it is evaluated outside that range.
- [x] T006 Implement `services/env_generator/src/harness_env_generator/grid.py`: the four axes built
      from config, with units, the vertical direction, and the derivation of pressure from depth by
      the stated relation.
- [x] T007 Implement `services/env_generator/src/harness_env_generator/background.py`: the documented
      background stratification of temperature and salinity over depth.
- [x] T008 [P] Implement `services/env_generator/src/harness_env_generator/features/kernels.py`: the
      spatial kernels that a feature's anomaly and its timescale membership both use, so the two
      geometries cannot drift apart.

**Checkpoint**: there is a base state, an axis system and one sound speed implementation.

---

## Phase 3: User Story 1 - A four-dimensional world with its truth written down (Priority: P1) 🎯 MVP

**Goal**: The field, the four features, and the manifest that records them.

**Independent Test**: Run the generator with a config and a seed; a CF NetCDF field and a valid
manifest appear, and the manifest names every feature's parameters.

### Tests for User Story 1

- [x] T009 [P] [US1] `services/env_generator/tests/test_features.py`: each feature's anomaly is
      centred where the manifest says, has the stated radius or sharpness, and vanishes far from it;
      the moving feature's centre at time t matches its initial centre plus drift times elapsed
      simulation time.
- [x] T010 [P] [US1] `services/env_generator/tests/test_manifest.py`: a produced manifest validates
      against its schema, contains every field FR-012 requires, and records the output digests.
- [x] T011 [P] [US1] `services/env_generator/tests/test_bounds.py`: a configuration whose composed
      features drive salinity below zero or temperature outside the stated bounds causes a refusal,
      and no output file is created.

### Implementation for User Story 1

- [x] T012 [P] [US1] Implement the mesoscale eddy in `features/eddy.py`: centre, radius, strength,
      sign and depth extent.
- [x] T013 [P] [US1] Implement the front in `features/front.py`: anchor, bearing, sharpness and
      amplitude.
- [x] T014 [P] [US1] Implement the thermocline in `features/thermocline.py`: depth, thickness and
      gradient.
- [x] T015 [P] [US1] Implement the moving feature in `features/moving.py`: initial centre, radius,
      amplitude and drift velocity, with analytic advection.
- [x] T016 [US1] Implement `compose.py`: background plus features by the stated composition rule,
      with physical bounds checking and refusal on breach.
- [x] T017 [US1] Author `contracts/schemas/manifest.schema.json` with `$id`
      `https://schemas.harness.invalid/manifest.schema.json`, covering every field FR-012 requires,
      including the timescale sections added in User Story 3 and the list of normalised NetCDF
      attributes. Reject unknown keys.
- [x] T018 [US1] Implement `manifest.py`: build the manifest from config, seed, generator version and
      composed feature parameters, and validate it before writing.
- [x] T019 [US1] Implement `writer.py`: CF-conventions NetCDF output with standard names, units,
      depth positive downwards, a synthetic-data attribute, the fixed stored dtype, suppression or
      normalisation of attributes that would otherwise carry a creation timestamp or library version,
      and SHA-256 digests of what was written.
- [x] T020 [US1] Make the field and manifest visible together: write both to temporary names, then
      rename, so no reader sees a manifest describing an incomplete field or a field with no manifest.
- [x] T021 [US1] Implement `__main__.py`: read `HARNESS_CONFIG`, validate, obtain the clock and the
      RNG stream, generate, write, and exit.

**Checkpoint**: there is a world, and its truth is written down beside it.

---

## Phase 4: User Story 2 - The truth can be evaluated anywhere (Priority: P2)

**Goal**: Truth as a function of the manifest, so AT-01 and AT-03 have something to subtract.

**Independent Test**: Evaluate the manifest at every grid point and compare with the stored field;
then evaluate between grid nodes and confirm the result is finite and continuous.

### Tests for User Story 2

- [x] T022 [P] [US2] `services/env_generator/tests/test_evaluator.py`: evaluation at every grid point
      agrees with the stored field for every variable within the manifest's stated tolerance.
- [x] T023 [P] [US2] `services/env_generator/tests/test_evaluator_offgrid.py`: evaluation between
      grid nodes is finite and continuous, an out-of-domain point returns an explicit out-of-domain
      result, and the evaluator opens no field file at any point.
- [~] T024 [P] [US2] `services/env_generator/tests/test_scoring.py`: given a deliberately perturbed
      field, the scoring helper reports eddy centre, radius and strength errors with units, and
      returns no verdict. **Partly done**: `services/env_generator/tests/test_scoring.py`
      does not exist. `scoring.py` is exercised only through
      `tests/acceptance/test_at03_eddy_recovery.py`, which does put centre, radius and strength
      errors with their units through `score_eddy_recovery` against a deliberately blind survey,
      a deliberately thinned one and another run's manifest, and puts a field difference through
      `score_point_recovery`. What has no check anywhere is the half of this task that is a
      constitutional property rather than an arithmetic one: that a report carries no verdict —
      no boolean, no threshold, no grade. Today that holds because nobody has added one.

### Implementation for User Story 2

- [x] T025 [US2] Implement `evaluator.py`: manifest plus a point in latitude, longitude, depth and
      time to temperature, salinity, pressure and sound speed, computed from the manifest's analytic
      parameters alone.
- [x] T026 [US2] Record the evaluator's agreement tolerance in the manifest, derived from the stored
      dtype, so a comparison has a stated threshold rather than a chosen one.
- [x] T027 [US2] Implement `scoring.py`: recovery error against the evaluator for the eddy's centre,
      radius and strength, reported with units, plus a general field-difference report for AT-01.
- [x] T028 [US2] Document the evaluator as the scoring interface for AT-01 and AT-03 in the module
      docstring, so a later feature does not score against the stored grid by accident.

**Checkpoint**: recovery can be scored, and the figure can be quoted.

---

## Phase 5: User Story 3 - The decorrelation timescale is a field (Priority: P3)

**Goal**: tau everywhere in the domain, authored per feature over a background, advecting with the
feature that moves.

**Independent Test**: Evaluate tau across the whole domain; it is finite everywhere, equals the
background where nothing overlaps, equals a feature's timescale at its centre, and its minimum tracks
the moving feature.

### Tests for User Story 3

- [x] T029 [P] [US3] `services/env_generator/tests/test_timescale.py`: tau is finite at every domain
      point; equals the background where no feature overlaps; equals a feature's authored timescale at
      its centre; is continuous across feature boundaries; and where two features overlap lies
      between the shortest contributing timescale and the background.
- [x] T030 [P] [US3] `services/env_generator/tests/test_timescale_advection.py`: between two times,
      the location of the shortest timescale attributable to the moving feature moves by its drift
      velocity times the elapsed simulation time, within one grid cell.
- [x] T031 [P] [US3] `services/env_generator/tests/test_timescale_floor.py`: a feature timescale
      shorter than the configured floor relative to the time step causes a refusal, and the ratio is
      recorded either way.

### Implementation for User Story 3

- [x] T032 [US3] Implement `timescale.py`: the background value, per-feature authoring, the named
      blending rule over inverse timescales, and evaluation at an arbitrary point.
- [x] T033 [US3] Make the moving feature's timescale advect with it by evaluating its membership at
      the feature's position at the time asked for.
- [x] T034 [US3] Extend the manifest with the background timescale, each feature's timescale, the
      blending rule by name with its parameters, and the timescale-to-time-step ratios, and extend
      `manifest.schema.json` to match.
- [x] T035 [US3] Extend `evaluator.py` to return the timescale at a point, from the manifest alone.
- [x] T036 [US3] Write the timescale as a variable of the generated field, so a consumer can obtain it
      without reading the ground-truth manifest, with the manifest remaining the authority.
- [x] T037 [US3] Write the ADR in `docs/adr/` (next free number): the timescale is a field, authored
      per feature over a background and evaluated per location, with per-feature-only and static
      per-region maps as the rejected alternatives and the blending rule recorded in the same
      document.

**Checkpoint**: quiet water has a timescale, and the drifting feature carries its own.

---

## Phase 6: User Story 4 - The same seed produces the same world (Priority: P4)

**Goal**: The generator behaves like a component of drogna, and its output is reproducible.

**Independent Test**: Run it twice with one config and compare the outputs byte for byte.

### Tests for User Story 4

- [x] T038 [P] [US4] `services/env_generator/tests/test_reproducibility.py`: two runs with the same
      config and seed produce byte-identical field files and identical manifests; a different seed
      produces a different field and a valid manifest.
- [~] T039 [P] [US4] `services/env_generator/tests/test_startup.py`: an invalid config, an
      out-of-domain feature and a missing background timescale each cause a refusal to start with a
      readable message and no output. **Partly done**: two of the three refusals are
      covered, and both are driven through `main()` so the readable message and the absent
      output are checked as well as the exit code — a composition outside the physical
      bounds in `test_bounds.py`, and a timescale below the floor in
      `test_timescale_floor.py`. Neither of the other two exists.
      An invalid configuration is not exercised through *this* component's startup at all. More
      seriously, `_refuse_features_outside_domain` in `manifest.py` — an eddy centred outside
      the horizontal extent, a thermocline below the deepest level — has no test of any kind:
      it is a refusal nobody has watched fire, which by this repository's own standard is worth
      nothing until somebody has.

### Implementation for User Story 4

- [x] T040 [US4] Draw every random value through `rng_for(stream)` in a fixed, documented order, and
      record the stream name and derived seed in the manifest.
- [x] T041 [US4] Take the simulation time of generation from the clock port and record it in the
      manifest as simulation time.
- [x] T042 [US4] Implement `heartbeat.py`: publish on `ctl/heartbeat` while running, with starting,
      ok and stopping statuses, and stop when the run finishes.
- [x] T043 [US4] Run the gates over `services/env_generator/` and clear every finding: no host clock,
      no free generator, no literal path.

**Checkpoint**: the world is reproducible and the component is honest about when it is running.

---

## Phase 7: Polish and cross-cutting

- [ ] T044 [P] Measure generation of the default configured domain on the smallest destination and
      record the time and output size against the five-minute and 200 MB criteria.
      **Not done**: no measurement of generation time or output size exists anywhere in the
      repository, for either destination. SC-009 is therefore an unevidenced claim. The
      generator is fast on the small grids the tests use and AT-03 notes three seconds for
      the local domain, but neither is the smallest destination and neither is a
      recorded figure against the five-minute and 200 MB criteria.
- [x] T045 [P] Record in the manifest the ratio of the front's sharpness to the grid spacing, so an
      under-resolved feature's recovery error can be interpreted rather than merely reported.
- [~] T046 Confirm the manifest is sufficient on its own: reconstruct a value by hand from the
      manifest's documented forms and check it against the evaluator, as a reviewer would.
      **Partly done**: pieces of it exist and the whole of it does not.
      `test_soundspeed.py` reconstructs sound speed from an independent copy of the equation;
      `test_features.py` reconstructs the eddy's value at its stated radius, the thermocline's
      half-drop at its stated depth and the drifter's centre at a later time, each by hand from
      manifest parameters; AT-03 reconstructs the eddy's anomaly at the top of a blind cast the
      same way. No check reconstructs a *composed* value — background plus four anomalies, plus
      pressure, plus sound speed — from the manifest's documented forms and compares it with the
      evaluator, which is the reviewer's exercise this task describes.

---

## Dependencies & Execution Order

### Phase dependencies

- Setup (Phase 1) has no dependencies beyond feature 001's config loader existing.
- Foundational (Phase 2) depends on Setup and blocks every user story.
- User Story 1 (Phase 3) depends on Phase 2.
- User Story 2 (Phase 4) depends on User Story 1, since the evaluator is checked against a stored
  field and reads a manifest that must exist.
- User Story 3 (Phase 5) depends on Phase 2 for the kernels and on User Story 1 for the manifest it
  extends; T035 additionally depends on the evaluator (T025).
- User Story 4 (Phase 6) depends on User Story 1; its reproducibility test is stronger once Stories 2
  and 3 have added the manifest's remaining sections.
- Polish (Phase 7) depends on the stories it measures.

### Within each story

- Tests are written first and must fail before the implementation lands.
- Kernels before features, features before composition, composition before writing.
- The manifest schema before the manifest builder.
- The manifest before the evaluator, since the evaluator reads nothing else.

### Parallel opportunities

- T002 and T003 in Setup.
- The four feature implementations T012 to T015, once the kernels exist.
- The three test tasks of User Story 1 (T009 to T011), of User Story 2 (T022 to T024) and of User
  Story 3 (T029 to T031).
- T044 and T045 in Polish.

---

## Parallel Example: the four seeded features

```bash
# Once features/kernels.py exists, the four features are independent files:
Task: "features/eddy.py — centre, radius, strength, sign, depth extent"
Task: "features/front.py — anchor, bearing, sharpness, amplitude"
Task: "features/thermocline.py — depth, thickness, gradient"
Task: "features/moving.py — initial centre, radius, amplitude, drift"
```

---

## Implementation Strategy

1. Phases 1 and 2, then User Story 1. At that point drogna has a synthetic world and a written
   ground truth, which is the thing §10 ranks fourth and which AT-01 and AT-03 both need.
2. Add User Story 2, and the ground truth becomes computable at arbitrary points, which is what makes
   it usable by a trajectory query's vertices and by an eddy recovery error.
3. Add User Story 3, and quiet water acquires a timescale, which is what FR-08's revisit cadence
   rests on.
4. Add User Story 4, and the world becomes reproducible, which is what lets any of the above be
   scored twice and compared.

## Notes

- The manifest is the product. If a parameter shapes the field and is not in the manifest, the field
  is not evidence of anything.
- Byte-identity is fragile in NetCDF: the stored dtype, the attribute normalisation and the order of
  random draws are all load-bearing, and T038 is where that is proved rather than hoped.
- Commit after each task or coherent group. Tasks are sized to be one commit each.
