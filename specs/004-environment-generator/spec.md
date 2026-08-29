> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Feature Specification: Synthetic Environment Generator

**Feature Branch**: `004-environment-generator`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD C-02, FR-02, FR-03, FR-04, FR-05, FR-08; §10 delivery priority 4; §11 resolved question 2. AT-01 and AT-03 both score against this feature's manifest.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A four-dimensional world with its truth written down (Priority: P1)

The generator runs from a named config and produces a field over latitude, longitude, depth and
time carrying temperature, salinity and pressure, with sound speed derived from them. Four features
are seeded into it: a mesoscale eddy, a front, a thermocline and a feature that moves. Beside the
field it writes a manifest recording every parameter that produced it, the seed, and the generator
version.

**Why this priority**: §10 calls the ground-truth manifest what turns drogna from toy into evidence.
Without it, every later claim about recovering the environment is an assertion. The field itself is
the easy half; the manifest is the half that matters.

**Independent Test**: Run the generator with a config and a seed. A NetCDF field and a manifest
appear. The manifest names the eddy's centre, radius and strength, the front's position and
sharpness, the thermocline's depth, and the moving feature's drift velocity.

**Acceptance Scenarios**:

1. **Given** a valid config naming a grid and a seed, **When** the generator runs, **Then** it writes
   a CF-conventions NetCDF field over latitude, longitude, depth and time carrying temperature,
   salinity, pressure and sound speed.
2. **Given** the field has been written, **When** the manifest beside it is read, **Then** it records
   the parameters of all four seeded features, the grid, the variables with their units and standard
   names, the root seed and stream, the generator version and the configuration digest.
3. **Given** the manifest, **When** sound speed is recomputed from the written temperature, salinity
   and pressure by the named equation, **Then** it matches the written sound speed within the stated
   tolerance.
4. **Given** the field, **When** the moving feature's position is computed from the manifest at any
   time on the time axis, **Then** the field's anomaly is centred there within one grid cell.
5. **Given** an invalid config, **When** the generator starts, **Then** it refuses to start and writes
   no output at all.

---

### User Story 2 - The truth can be evaluated anywhere, not just read off a grid (Priority: P2)

A test, or a person scoring recovery, takes the manifest alone and asks what the truth is at an
arbitrary latitude, longitude, depth and time — a point that need not lie on the grid. It gets an
answer, computed from the manifest's analytic parameters, without loading the field and without the
generator running.

**Why this priority**: AT-01 verifies values along a four-dimensional route, whose vertices will not
land on grid points, and AT-03 reports a recovery error for the eddy. Both need truth as a function,
not as an array. Constitution IX requires the error figure, and an error needs something to subtract.

**Independent Test**: Evaluate the manifest at every grid point and compare with the stored field.
They agree within the tolerance the manifest states. Then evaluate at points between grid nodes and
confirm the answer is continuous and finite.

**Acceptance Scenarios**:

1. **Given** a manifest and no field file, **When** the evaluator is asked for temperature, salinity,
   pressure, sound speed or the decorrelation timescale at a point, **Then** it returns a value
   computed from the manifest's parameters alone.
2. **Given** the manifest and the field it describes, **When** the evaluator is run at every grid
   point, **Then** every value agrees with the stored field within the stated tolerance.
3. **Given** a point off the grid, **When** the evaluator is called, **Then** the result is finite and
   continuous with its neighbours; the evaluator does not interpolate the stored field, it evaluates
   the analytic form.
4. **Given** a recovered field or a queried route, **When** it is scored, **Then** the scoring helper
   reports an error figure with units, never a verdict on its own.

---

### User Story 3 - The decorrelation timescale is a field, not a label (Priority: P3)

Every location in the domain has a decorrelation timescale, including quiet background water. The
timescale is authored per feature over a domain-wide background value and evaluated per location:
where a feature overlaps a location, its timescale blends with the background there. The moving
feature carries its timescale with it as it drifts. Background and per-feature values are both
ground truth and both appear in the manifest.

**Why this priority**: SRD v0.3 resolved this. Per-feature alone leaves background water with no
timescale though FR-08 requires quiet water to be left alone; a static per-region map gives the
background a timescale but cannot follow FR-03's drifting feature; and the planner needs the
timescale at every cell it scores (FR-32, FR-34), not only inside features. It is third because the
field and its manifest must exist before a derived field can be authored over them.

**Independent Test**: Evaluate the timescale across the whole domain. It is finite everywhere, equals
the background where nothing overlaps, equals a feature's timescale at that feature's centre, and its
minimum tracks the moving feature as time advances.

**Acceptance Scenarios**:

1. **Given** a manifest with a background timescale and four features, **When** the timescale is
   evaluated anywhere in the domain, **Then** a finite value is returned.
2. **Given** a location no feature overlaps, **When** the timescale is evaluated there, **Then** it
   equals the background value within tolerance.
3. **Given** the centre of a feature, **When** the timescale is evaluated there, **Then** it equals
   that feature's authored timescale within tolerance.
4. **Given** a location where two features overlap, **When** the timescale is evaluated there,
   **Then** it is produced by the documented blending rule, is continuous across both features'
   boundaries, and lies between the shortest contributing timescale and the background.
5. **Given** the moving feature and two times, **When** the timescale field is evaluated at each,
   **Then** the location of its shortest timescale has moved by the feature's drift velocity times
   the elapsed simulation time, within one grid cell.
6. **Given** the manifest, **When** it is read, **Then** it records the background timescale, each
   feature's timescale, and the blending rule by name with its parameters.

---

### User Story 4 - The same seed produces the same world (Priority: P4)

The generator is a component like any other: it reads one named config, validates it before touching
anything, takes time from the simulation clock, draws randomness only through the RNG port, and
publishes a heartbeat while it runs. Run twice with the same seed and configuration, it produces
byte-identical output.

**Why this priority**: Constitution II and AT-04. It is last among these stories because it is a
property of how the first three are built rather than a separable capability, but it is not
optional: a world that cannot be regenerated cannot score anything twice.

**Independent Test**: Run the generator twice with one config. Compare the two NetCDF files byte for
byte and the two manifests field for field.

**Acceptance Scenarios**:

1. **Given** one config and one root seed, **When** the generator runs twice, **Then** the two field
   files are byte-identical and the two manifests differ in no field.
2. **Given** a different root seed and the same config, **When** the generator runs, **Then** the
   field differs and the manifest remains valid and complete.
3. **Given** the generator is running, **When** the control namespace is observed, **Then** heartbeats
   appear on `ctl/heartbeat` with the generator's component id, the simulation time and a status, and
   they stop when it finishes.
4. **Given** the generator has finished, **When** the shell is observed, **Then** its component goes
   dark once the declared window elapses, which is truthful: it is no longer running.
5. **Given** the generator's source, **When** the gates run over it, **Then** it contains no host
   clock read, no unseeded generator and no literal path.

---

### Edge Cases

- Two features overlap: an eddy inside a front, or the moving feature drifting across the
  thermocline. Anomalies compose additively on the background and timescales compose by the blending
  rule; the composition must not drive salinity below zero or temperature outside the stated bounds,
  and the generator refuses to write a field that does.
- The moving feature drifts out of the domain during the time axis. It is allowed to leave; the
  manifest still records its drift and initial position, so its position at any time remains
  computable, and the field simply no longer contains it.
- The front's sharpness is finer than the grid spacing. The field under-resolves it. The manifest
  records the ratio of sharpness to grid spacing so a recovery error can be interpreted rather than
  merely reported.
- A feature's decorrelation timescale is shorter than the field's time step. The field cannot express
  it. The generator records the ratio and refuses if it falls below a configured floor, because a
  timescale the field cannot represent will silently mislead the revisit cadence of FR-08.
- The thermocline depth is outside the depth range, or the eddy centre is outside the horizontal
  domain. Both are configuration errors and are rejected at validation, not silently clipped.
- A location outside the domain is passed to the evaluator. It returns an explicit out-of-domain
  result rather than an extrapolated number.
- The sound speed equation is used outside its stated validity range in temperature, salinity or
  depth. The generator records that it happened and where; the numerics are deliberately fake, but
  the fact that they were used outside their range must not be invisible.
- The NetCDF library writes creation timestamps or library version attributes into the file, which
  would break byte-identity. These are suppressed or normalised, and the manifest declares which
  attributes are normalised.
- Floating-point width. The stored dtype is fixed by config and recorded, because byte-identity does
  not survive a silent change from single to double precision.
- The output directory already contains a field and manifest from a previous run. The generator
  neither appends nor half-overwrites: seed data is produced by scripts, never accumulated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generator MUST produce a four-dimensional field over latitude, longitude, depth and
  time carrying temperature, salinity and pressure. (SRD FR-02)
- **FR-002**: Sound speed MUST be derived from temperature, salinity and pressure by a single named,
  documented equation, and written as a variable of the field. (SRD FR-02, §2.2)
- **FR-003**: That implementation MUST be the only sound speed computation in drogna. The monitor's
  residual is computed on sound speed (SRD FR-24), and two implementations would make the residual
  meaningless. (SRD FR-24, §2.2)
- **FR-004**: The field MUST contain four seeded features with recorded ground truth: a mesoscale
  eddy of known centre, radius and strength; a front of known position and sharpness; a thermocline
  at known depth; and a moving feature of known drift velocity. (SRD FR-03)
- **FR-005**: Features MUST be composed onto a documented background stratification by a stated
  composition rule, so the field is reproducible from the manifest's parameters alone. (SRD FR-02,
  FR-04)
- **FR-006**: The moving feature MUST advect analytically, so its position at any time on the axis is
  computable from the manifest without stepping through the field. (SRD FR-03)
- **FR-007**: Pressure MUST be derived from depth by a stated relation recorded in the manifest,
  rather than generated independently of it. (SRD FR-02)
- **FR-008**: All stochastic content MUST come from `harness_core.rng.rng_for(stream)` with the
  stream named in config. (SRD FR-11, Constitution II)
- **FR-009**: The field MUST be written as NetCDF with CF conventions, with standard names, units,
  and depth positive downwards. (SRD FR-02, FR-43 vocabulary)
- **FR-010**: Output file naming MUST come from config and MUST be recorded in the manifest, so the
  coverage store's cataloguing convention can be applied without the generator knowing it. (SRD
  FR-21, NFR-04)
- **FR-011**: A manifest MUST be written alongside each generated field and MUST validate against
  `contracts/schemas/manifest.schema.json`. (SRD FR-04)
- **FR-012**: The manifest MUST record: manifest schema version; the run id of the run manifest;
  root seed, stream name and derived seed; generator version; configuration digest; the simulation
  time of generation; the grid definition for all four axes including units and the direction of the
  vertical axis; the variable definitions with units, standard names and stored dtype; the background
  stratification parameters; the sound speed method identifier; the pressure-from-depth relation;
  the four features with their kind, identifier and parameters; the decorrelation timescale
  background, per-feature values and blending rule; the output file names with their SHA-256
  digests; and the list of NetCDF attributes normalised for reproducibility. (SRD FR-04, FR-11,
  Constitution II, IX)
- **FR-013**: The manifest MUST be sufficient on its own, with the generator version it names, to
  reconstruct the analytic field at any point in the domain. Nothing that shapes the field may live
  only in the generator's internal state. (SRD FR-04, AT-01, AT-03)
- **FR-014**: The field and its manifest MUST become visible together: no reader may find a manifest
  describing a field that is not completely written, nor a field with no manifest. (SRD FR-04,
  FR-30 pattern)
- **FR-015**: Any change to the analytic form of the field MUST require a generator version bump
  recorded in the manifest, so a manifest never describes a field it could not have produced. (SRD
  FR-04)
- **FR-016**: A pure evaluator MUST be provided that takes a manifest and a point in latitude,
  longitude, depth and time and returns temperature, salinity, pressure, sound speed and the
  decorrelation timescale at that point. (SRD FR-04, AT-01, AT-03)
- **FR-017**: The evaluator MUST NOT read the field file. It evaluates the analytic form the manifest
  describes. (SRD FR-04, AT-01)
- **FR-018**: The evaluator MUST agree with the stored field at every grid point within a tolerance
  the manifest states. (SRD FR-04, AT-03)
- **FR-019**: A scoring helper MUST compute and report recovery error against the evaluator with
  units, and MUST NOT return a verdict of its own. "The eddy is recoverable" without the error figure
  beside it is meaningless. (SRD AT-03, Constitution IX)
- **FR-020**: The decorrelation timescale MUST be a field over latitude, longitude, depth and time,
  authored per feature over a domain-wide background value and evaluated per location. (SRD FR-05)
- **FR-021**: The evaluated timescale at a location MUST be the background blended with the
  contribution of any feature overlapping it, by a rule that is documented and named in the manifest,
  is continuous across feature boundaries, reduces to the background where no feature overlaps, and
  reduces to a feature's authored timescale at that feature's centre. (SRD FR-05)
- **FR-022**: The timescale of the moving feature MUST advect with that feature, so its contribution
  is evaluated at the feature's position at the time asked for. (SRD FR-05, FR-03)
- **FR-023**: The background timescale and every per-feature timescale MUST be recorded in the
  manifest as ground truth. (SRD FR-05, FR-04)
- **FR-024**: The timescale MUST be evaluable at every location in the domain, not only inside
  features, because quiet water must be left alone (SRD FR-08) and the planner scores every cell
  (SRD FR-32, FR-34).
- **FR-025**: The timescale MUST also be written as a variable of the generated field, so a consumer
  can obtain it without reading a ground-truth manifest. The manifest remains the authority; the
  written variable is a convenience derived from it. (SRD FR-05, FR-08)
- **FR-026**: The generator MUST read exactly one environment variable, `HARNESS_CONFIG`, and MUST
  validate its config against `contracts/schemas/config.env_generator.schema.json` before any other
  I/O. (SRD NFR-04, Constitution IV)
- **FR-027**: The generator MUST take time from the clock port and MUST NOT read a host clock. The
  simulation time of generation recorded in the manifest is simulation time. (SRD FR-09,
  Constitution I)
- **FR-028**: The generator MUST publish a heartbeat on `ctl/heartbeat` while it runs, carrying its
  component id, the simulation time and a status, and MUST stop when it finishes. It is a short-lived
  component, and a shell that shows it dark afterwards is telling the truth. (SRD FR-52, FR-45)
- **FR-029**: Two runs with the same configuration and root seed MUST produce byte-identical field
  files and identical manifests. (SRD FR-11, AT-04, Constitution II)
- **FR-030**: The generator MUST refuse to write a field whose composed values fall outside the
  stated physical bounds for temperature, salinity or pressure, rather than writing an unphysical
  world quietly. (SRD FR-02)
- **FR-031**: The generator MUST refuse to run where a feature's decorrelation timescale is shorter
  than the configured floor relative to the time step, and MUST record the ratio in either case.
  (SRD FR-05, FR-08)
- **FR-032**: Output MUST be produced by running the generator, never accumulated: a fresh instance
  is equivalent to a long-running one. (SRD NFR-07)

### Key Entities

- **Field**: The four-dimensional simulated world: temperature, salinity, pressure, derived sound
  speed and the decorrelation timescale, over latitude, longitude, depth and time.
- **Grid**: The four axes with their extents, spacing, units, and the direction of the vertical axis.
- **Background stratification**: The documented base state on which features are composed.
- **Seeded feature**: One of four kinds — mesoscale eddy, front, thermocline, moving feature — with a
  stable identifier, a spatial kernel, its own parameters, and its own decorrelation timescale.
- **Decorrelation timescale field**: tau over latitude, longitude, depth and time. Authored per
  feature over a background; evaluated per location; advects with a moving feature.
- **Ground-truth manifest**: The document that makes recovery scoreable: every parameter that
  produced the field, the seed, the generator version, the digests, and the tolerances.
- **Evaluator**: The pure function from manifest and point to truth. The interface AT-01 and AT-03
  score against.
- **Scoring helper**: Computes recovery error against the evaluator and reports it with units.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The evaluator agrees with the stored field at every grid point, for every variable,
  within the tolerance the manifest states.
- **SC-002**: Two runs with the same configuration and seed produce byte-identical NetCDF files and
  identical manifests, with no attribute excluded from the comparison beyond those the manifest
  declares normalised.
- **SC-003**: A reviewer holding only the manifest can compute the field's value at a stated point and
  obtain the same number the evaluator returns, using the manifest's documented forms.
- **SC-004**: The decorrelation timescale is finite at every point of the domain, equals the
  background where no feature overlaps within tolerance, and equals a feature's authored timescale at
  that feature's centre within tolerance.
- **SC-005**: Between any two times, the location of the shortest timescale attributable to the
  moving feature moves by that feature's drift velocity times the elapsed simulation time, to within
  one grid cell.
- **SC-006**: Sound speed recomputed from the written temperature, salinity and pressure by an
  independent implementation of the named equation matches the written sound speed within tolerance.
- **SC-007**: The scoring helper, given a field recovered from stored observations, reports an eddy
  centre error in kilometres, a radius error in kilometres and a strength error in the strength's
  units, so AT-03 can quote figures rather than adjectives.
- **SC-008**: An invalid configuration, an out-of-domain feature or a timescale below the floor each
  cause a refusal to start with a readable message, and no output file is created.
- **SC-009**: The generator produces the default configured domain within five minutes and under
  200 MB on the deployment's smallest destination.

## Assumptions

- Sound speed is computed by the Mackenzie (1981) nine-term equation, with depth in metres. It is
  chosen because it is simple, widely cited and adequate for a harness whose numerics are
  deliberately fake. The choice is recorded here and named in every manifest, so a later change is a
  generator version bump rather than a silent difference.
- The timescale blending rule adds rates: the inverse timescale at a location is the background's
  inverse plus, for each feature, its membership weight there times the difference between that
  feature's inverse timescale and the background's. This is continuous, reduces to the background
  outside every feature, reduces to a feature's own timescale at its centre, and composes sensibly
  where features overlap. The rule is named and parameterised in the manifest so an alternative can
  replace it without a schema change.
- A feature's membership weight uses the same spatial kernel as its anomaly, so the timescale and the
  anomaly share one geometry and cannot drift apart.
- The decision that the timescale is a field rather than a property of a feature or a region is SRD
  FR-05 as resolved in v0.3, and earns an ADR under PR-03. This feature writes that ADR.
- The ground-truth manifest is `contracts/schemas/manifest.schema.json`. The run manifest of feature
  001 is `run-manifest.schema.json`; they are different documents with different lifetimes, and the
  ground-truth manifest references the run id.
- Sound speed lives in `services/env_generator/` for now, as the single implementation. When the
  monitor needs it (feature 009), promoting it to a shared library is an additive change owned by the
  consuming feature; what is not permitted is a second implementation.
- Pressure is derived from depth by a stated hydrostatic relation rather than generated as an
  independent field, because an independently generated pressure would be unphysical and would make
  the sound speed derivation meaningless.
- The generated field is the simulated world that the sensors sample and that recovery is scored
  against. It is not the coverage store, which holds forecasts and uncertainty, and it is not served
  through the query layer. Whether the model runner initialises from it is settled by the control
  loop feature.
- The stored dtype, the grid, the domain, the feature parameters, the background timescale and the
  output location all come from config; no default is embedded in source.
- Whether the planner consumes the written timescale variable directly or an estimate of it is
  settled by the planner feature. The generator provides the field and the manifest; it takes no view
  on who is entitled to read which.
