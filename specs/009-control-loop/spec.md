# Feature Specification: Control Loop — Sense, Decide, Act, Publish

**Feature Branch**: `009-control-loop`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD components C-11 (monitor), C-12 (scheduler), C-13 (model runner), C-14 (publisher); SRD §5.4 FR-22 to FR-31; acceptance test AT-02.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Divergence is detected without crying wolf (Priority: P1)

The monitor listens to the observation traffic as it passes on the broker, keeps a
rolling window of recent measurements in memory, and compares each measurement's
sound speed against the sound speed the current forecast predicts for that position
and that moment. When the disagreement is large enough and stays large enough — over
neighbouring positions or over consecutive samples — it says so, once, on the control
namespace. A single anomalous sample says nothing.

**Why this priority**: This is the "sense" half of the loop and the component that
owns the harness's most likely embarrassment: over-sensitivity. Everything downstream
is triggered by it, and a monitor that fires on noise makes the rest of the loop
worthless regardless of how correct it is. It is also independently valuable: a
monitor that only ever prints residual statistics already demonstrates the read
path, the sound-speed computation, and the rolling window.

**Independent Test**: Run the monitor against a recorded observation stream and a
fixed published forecast field. Inject (a) a single large spike and (b) a sustained
bias across neighbouring positions. Assert that only (b) produces a message on
`ctl/divergence`, and that the message carries the residual magnitude, the region
and the persistence evidence that justified it.

**Acceptance Scenarios**:

1. **Given** a monitor warmed up against a published forecast, **When** one
   observation arrives whose sound-speed residual is ten times the threshold and no
   neighbouring or subsequent observation disagrees, **Then** no message is published
   on `ctl/divergence` and the sample is recorded as an outlier in the window.
2. **Given** a monitor warmed up against a published forecast, **When** successive
   observations within one spatial neighbourhood carry residuals above the threshold
   for the whole configured persistence span, **Then** exactly one divergence message
   is published on `ctl/divergence` naming the region, the mean residual, the sample
   count and the simulation time span over which persistence was established.
3. **Given** a monitor is running, **When** observations arrive, **Then** no query is
   issued to the observation store, and the in-memory window never exceeds its
   configured bound in samples or in simulation-time span.
4. **Given** the monitor process restarts mid-scenario, **When** it comes back up,
   **Then** it either issues exactly one catch-up query to the observation store or
   observes its declared warm-up span, publishes no divergence until that completes,
   and reports `warming` in its heartbeat while it does so.
5. **Given** the residual on a measurement's temperature exceeds threshold but its
   sound speed does not (because salinity compensates), **When** the monitor
   evaluates it, **Then** no divergence is raised, because the residual is defined on
   sound speed.

---

### User Story 2 - A run is scheduled at most once, and not too often (Priority: P2)

The scheduler is the only component that turns a divergence into a run request. It
refuses to start a run within the minimum interval of the last one, and refuses a
second request for a run that is already outstanding. Every divergence it receives
gets a recorded decision, including the ones it declines.

**Why this priority**: This component owns thrashing. It is small, it is where the
policy lives, and it is the difference between a control loop and an oscillator. It
is testable entirely from recorded divergence messages with no model involved.

**Independent Test**: Replay a burst of divergence messages spanning less than the
minimum interval into the scheduler and assert that at most one run request is
emitted, that each declined divergence carries a recorded reason, and that a
divergence arriving while a request is outstanding is not duplicated.

**Acceptance Scenarios**:

1. **Given** a scheduler with a minimum interval of `I` simulation minutes and a run
   started at `T`, **When** a divergence arrives at `T + I/2`, **Then** no run request
   is published and the decision is recorded with reason `minimum-interval`.
2. **Given** a run request has been published and no `ctl/run-published` has yet been
   seen for it, **When** a further divergence for the same region arrives, **Then** no
   second request is published and the decision is recorded with reason
   `duplicate-outstanding`.
3. **Given** a scheduler with no outstanding request and the minimum interval elapsed,
   **When** a divergence arrives, **Then** exactly one message is published on
   `ctl/run-request` carrying a deterministically derived run identifier and the
   divergence that justified it.
4. **Given** a run request that never completes, **When** the configured outstanding
   timeout elapses in simulation time, **Then** the request is cleared, the event is
   recorded, and a subsequent divergence is once again eligible.

---

### User Story 3 - A run produces a forecast and an honest uncertainty field (Priority: P3)

The model runner takes an initialisation state, advects the seeded features forward
analytically, adds seeded noise, and does this for a small ensemble of members whose
initial conditions are perturbed. It emits the ensemble mean as the forecast field
and the ensemble spread as the uncertainty field, on the same grid. It does this
behind the model kernel port, so it can be replaced without anything else changing.

**Why this priority**: This component owns being irreplaceable. Its numerics are
deliberately fake and its value is entirely in the shape of its interface and in the
fact that it produces a spread rather than a single deterministic field, since the
planner and the client both need the spread.

**Independent Test**: Call the model kernel directly with a fixed initialisation
state and seed. Assert the returned forecast and uncertainty fields have identical
grids, that the uncertainty field is the per-cell spread of the members, and that a
substitute kernel implementation satisfies the same port and can be swapped in
without editing any file outside `services/model_runner/`.

**Acceptance Scenarios**:

1. **Given** a run request naming an initialisation time and region, **When** the
   model runner begins work, **Then** `ctl/run-started` is published before any
   computation, carrying the run identifier and the request that caused it.
2. **Given** a seeded feature with a recorded drift velocity, **When** the runner
   advects it forward by `Δt` of simulation time, **Then** the feature centre in the
   output field is displaced by drift velocity times `Δt` within the field's grid
   resolution.
3. **Given** an ensemble size of `N` and a root seed, **When** the run executes twice
   from the same manifest, **Then** both runs produce byte-identical forecast and
   uncertainty fields.
4. **Given** a completed ensemble, **When** the uncertainty field is inspected,
   **Then** each cell holds the spread across the `N` members at that cell, and the
   forecast field holds their mean.
5. **Given** the runner is executing, **When** it writes output, **Then** it writes
   only into the staging location and never into the location a reader can see.

---

### User Story 4 - A run becomes visible all at once, and announces itself (Priority: P4)

The publisher takes a completed staged run and makes it visible in a single
indivisible step, marks it as current, and announces it on the control namespace.
No reader ever observes a half-written field, and no consumer discovers the run by
asking the query layer repeatedly whether anything has changed.

**Why this priority**: This component owns partial visibility. It is the seam between
the control loop and the read path, and getting it wrong produces intermittent,
maddening failures in every downstream consumer.

**Independent Test**: With a reader looping over the current field, publish a run and
assert that every read returns either the complete previous field or the complete new
one, never a mixture and never an error. Assert `ctl/run-published` is emitted and
that no consumer issues a polling request to the query layer.

**Acceptance Scenarios**:

1. **Given** a reader continuously reading the current forecast, **When** a run is
   published, **Then** every read returns a complete, self-consistent field and its
   checksum matches one of the two known runs.
2. **Given** a staged run that failed part-way, **When** the publisher inspects it,
   **Then** it is not marked current, the staging is discarded, and a failure is
   recorded rather than a partial publication.
3. **Given** a run is published, **When** the publication completes, **Then** exactly
   one message appears on `ctl/run-published` carrying the run identifier, the valid
   time range, the grid bounds and the collection identifiers under which the run is
   servable.
4. **Given** a new run is published, **When** a consumer that subscribed to
   `ctl/run-published` reacts, **Then** it did so without having polled the query
   layer, and the run is servable through the query layer without any configuration
   file having been edited.

---

### User Story 5 - The loop closes, visibly (Priority: P5)

A threshold breach in the observation stream results in a model run and a published
forecast, and each step of that chain is observable as a message on the control
namespace in the order the loop dictates. This is AT-02.

**Why this priority**: This is the point of the feature, but it can only be
demonstrated once the four preceding stories exist. It is listed last because it is
integration, not new capability.

**Independent Test**: Drive a scenario in which a sustained divergence is guaranteed,
and assert the ordered sequence `ctl/divergence` → `ctl/run-request` →
`ctl/run-started` → `ctl/run-published` occurs, with matching identifiers throughout,
within a bounded span of simulation time.

**Acceptance Scenarios**:

1. **Given** a running scenario with a forecast that has gone stale, **When**
   observations establish a sustained sound-speed residual above threshold, **Then**
   the four control messages appear in order, each carrying the same run identifier
   from `ctl/run-request` onward, within the configured end-to-end budget in
   simulation time.
2. **Given** the whole scenario is replayed from its manifest, **When** the control
   messages are compared, **Then** the sequence, the identifiers and the payloads are
   identical to the first run.

---

### Edge Cases

- **No forecast yet published.** The monitor has nothing to compute a residual
  against on a cold start. It reports `warming`, accumulates observations, and raises
  nothing until a `ctl/run-published` has been seen.
- **Observations outside the published field's bounds.** Samples whose position or
  time falls outside the current forecast's domain contribute to the window but not
  to residuals, and are counted separately so the count is visible rather than
  silently absorbed.
- **Persistence window straddles a publication.** Residuals computed against a
  superseded forecast are discarded from the persistence evidence when a new run is
  published, so a divergence is never justified by disagreement with a field that no
  longer exists.
- **Broker reconnection.** A dropped subscription is a gap in the window, not a
  quiet zero. The monitor treats a reconnection as a warm-up boundary.
- **Clock acceleration.** At high simulation rates, observation arrival outruns
  residual computation. The monitor sheds by dropping the oldest unprocessed samples
  and records the drop count rather than falling behind unboundedly.
- **Two divergences in genuinely different regions.** The scheduler's duplicate rule
  is per outstanding run, not per region: a second region does not get its own
  concurrent run, it is folded into the next scheduled one and recorded as such.
- **Ensemble member failure.** A member that fails to complete invalidates the run.
  A spread computed over a subset is not published.
- **Storage exhaustion during staging.** The run fails in staging; the previous
  current run remains current and complete.
- **`ctl/run-published` lost.** Consumers stay on the previous field. The harness
  does not add polling to compensate; the loss is visible as a stalled loop in the
  client, which is the honest outcome.

## Requirements *(mandatory)*

### Functional Requirements

#### Monitor (C-11)

- **FR-001**: The monitor MUST subscribe directly to the observation topic branch
  `obs/#` on the broker and maintain a rolling window of recent observations in
  process memory. It MUST NOT query the observation store during normal operation.
  (SRD FR-22)
- **FR-002**: The rolling window MUST be bounded by both a simulation-time span and a
  maximum sample count, both supplied by configuration, and MUST evict by
  simulation time. (SRD FR-22)
- **FR-003**: The monitor MUST compute the residual between measured and forecast
  **sound speed**, deriving measured sound speed from the observed temperature,
  salinity and pressure. It MUST NOT define the residual on temperature. (SRD FR-24)
- **FR-004**: The forecast term of the residual MUST be sampled from the currently
  published forecast field at the observation's latitude, longitude, depth and time,
  through the coverage read port. (SRD FR-24, FR-30)
- **FR-005**: The monitor MUST raise a divergence only when the residual exceeds the
  threshold **and** persistence is established, where persistence is satisfied by
  either a configured number of distinct observations exceeding threshold within a
  configured spatial neighbourhood, or a configured number of consecutive samples
  exceeding threshold over a configured simulation-time span. A single sample MUST
  never be sufficient. (SRD FR-24)
- **FR-006**: The default residual threshold MUST be of the order of 1.5 to 2 m/s of
  sound speed, corresponding to roughly half a degree Celsius, and MUST be tunable
  per scenario through configuration. (SRD FR-25)
- **FR-007**: The monitor MUST publish divergence events on `ctl/divergence` and MUST
  NOT invoke the model runner, publish a run request, or write to the coverage store.
  (SRD FR-26)
- **FR-008**: On start or restart, the monitor MUST either issue exactly one catch-up
  query against the observation store or observe a declared warm-up span in
  simulation time, selected by configuration, and MUST publish no divergence event
  until that completes. (SRD FR-23)
- **FR-009**: The monitor MUST treat a broker reconnection and a
  `ctl/run-published` for a field replacing the one it was scoring as boundaries that
  invalidate accumulated persistence evidence. (SRD FR-23, FR-24)
- **FR-010**: The monitor MUST report its state — `warming`, `scoring`, or
  `no-forecast` — on `ctl/heartbeat` at its declared interval.

#### Scheduler (C-12)

- **FR-011**: The scheduler MUST subscribe to `ctl/divergence` and MUST be the only
  component that publishes on `ctl/run-request`. (SRD FR-26, FR-27)
- **FR-012**: The scheduler MUST enforce a minimum interval, measured in simulation
  time and supplied by configuration, between successive run requests. (SRD FR-27)
- **FR-013**: The scheduler MUST reject a divergence while a previously requested run
  is outstanding, where outstanding means a `ctl/run-request` has been published and
  neither `ctl/run-published` nor the outstanding timeout has been observed for it.
  (SRD FR-27)
- **FR-014**: The scheduler MUST record a decision for every divergence it receives,
  carrying one of `accepted`, `minimum-interval`, `duplicate-outstanding`, and MUST
  make those decisions observable on `ctl/telemetry` for the telemetry component to
  consume.
- **FR-015**: Run identifiers MUST be derived deterministically from the root seed and
  the logical run ordinal, never from entropy or wall-clock time.
  (Constitution II)

#### Model runner (C-13)

- **FR-016**: The model runner MUST subscribe to `ctl/run-request` and MUST publish
  `ctl/run-started` before beginning computation. (SRD FR-28, FR-31)
- **FR-017**: The model runner MUST sit behind the model kernel port, whose contract
  is initialisation state in, gridded field out, and no component outside
  `services/model_runner/` may depend on the kernel implementation.
  (SRD FR-28, Constitution VI)
- **FR-018**: The kernel MUST advect the seeded features forward analytically using
  the drift parameters recorded in the environment generator's ground-truth manifest,
  and add noise drawn from a seeded generator. It MUST NOT implement real numerics.
  (SRD FR-28)
- **FR-019**: The model runner MUST execute a small ensemble of members whose initial
  conditions are perturbed from seeded generators, one derived stream per member.
  (SRD FR-29)
- **FR-020**: The model runner MUST emit the per-cell ensemble spread as an
  uncertainty field alongside the forecast field, on the same grid, in the same run.
  (SRD FR-29)
- **FR-021**: The model runner MUST write only into a staging location and MUST NOT
  write into any location a reader can reach. A run in which any member fails MUST be
  marked failed and MUST NOT be offered for publication. (SRD FR-30)

#### Publisher (C-14)

- **FR-022**: The publisher MUST make a completed staged run visible in a single
  indivisible operation, such that no reader observes a partially written field.
  (SRD FR-30)
- **FR-023**: The publisher MUST mark the newly visible run as current, using the
  coverage store's naming and cataloguing convention, so the run becomes servable
  without any collection configuration being edited. (SRD FR-30, FR-21)
- **FR-024**: The publisher MUST announce each published run on `ctl/run-published`,
  carrying the run identifier, the valid time range, the grid bounds, and the
  collection identifiers under which the forecast and uncertainty fields are
  servable. (SRD FR-31)
- **FR-025**: No component of this feature may poll the query layer to discover
  freshness. Consumers subscribe to `ctl/run-published`. (SRD FR-31)
- **FR-026**: A run that fails validation at publication time MUST leave the previous
  current run untouched, MUST discard its staging, and MUST record the failure.
  (SRD FR-30)

#### Cross-cutting

- **FR-027**: Each of the four services MUST read exactly one configuration file
  whose path arrives in `HARNESS_CONFIG`, and MUST validate it against its schema
  before any other I/O. (Constitution IV)
- **FR-028**: All time used for windows, intervals, persistence spans, timeouts and
  message timestamps MUST come from the simulation clock port. (Constitution I)
- **FR-029**: The four control-namespace message shapes — divergence, run request,
  run started, run published — MUST be defined once as JSON Schema under
  `contracts/schemas/`, and the Python and TypeScript types MUST be generated from
  them. (Constitution III)
- **FR-030**: Each of the four services MUST publish a heartbeat on `ctl/heartbeat`
  at its declared interval so the client lights it from liveness alone.
  (Constitution VII)
- **FR-031**: No message, field or log emitted by this feature may carry a tracked
  entity, contact, detection or track. The sampling platform appears, if at all, as a
  coordinate. (Constitution V)

### Key Entities

- **Windowed observation**: a measurement held in the monitor's memory, carrying
  position, depth, simulation time, the measured quantities, and the derived measured
  sound speed. Evicted by age or count, never persisted by this feature.
- **Residual sample**: the signed difference between measured and forecast sound
  speed at one observation's four-dimensional position, together with the identifier
  of the forecast run it was scored against.
- **Persistence evidence**: the set of residual samples that jointly satisfy the
  spatial or temporal persistence rule, retained only long enough to justify or
  fail to justify a divergence.
- **Divergence event**: a statement that the forecast disagrees with reality in a
  named region, carrying mean and peak residual, sample count, region description,
  the simulation-time span, and the forecast run identifier scored against.
- **Run request**: a scheduler decision to run, carrying a deterministically derived
  run identifier, the initialisation time, the region, and the divergence that
  justified it.
- **Scheduler decision**: the recorded outcome for a divergence, accepted or declined
  with a reason.
- **Ensemble member**: one perturbed realisation of a run, identified by its ordinal
  and its derived seed stream.
- **Forecast field**: the gridded ensemble mean over the run's domain.
- **Uncertainty field**: the gridded per-cell ensemble spread, on the forecast
  field's grid, valid for the same times.
- **Run announcement**: the published record that a run is current and servable,
  carrying identifiers, valid time range, grid bounds and collection identifiers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across 100 seeded replays containing injected single-sample residual
  spikes of ten times the threshold, the number of divergence events raised from
  those spikes is zero.
- **SC-002**: A sustained bias of 2 m/s applied across a spatial neighbourhood raises
  exactly one divergence event, within one persistence span of simulation time of the
  bias becoming established.
- **SC-003**: The monitor issues zero queries to the observation store after warm-up
  completes, measured over a full scenario run.
- **SC-004**: The monitor's memory footprint stays within its configured window bound
  across a scenario run at maximum clock acceleration, and any shed samples are
  reported as a non-zero counter rather than silently discarded.
- **SC-005**: A burst of 50 divergence events spanning less than the minimum interval
  produces at most one run request.
- **SC-006**: Every divergence received by the scheduler has exactly one recorded
  decision; the count of divergences received equals the count of decisions recorded.
- **SC-007**: Ten thousand reads of the current forecast issued across a publication
  return a complete field whose checksum matches one of the two known runs, with zero
  partial or failed reads.
- **SC-008**: A newly published run is servable through the query layer with zero
  edits to collection configuration.
- **SC-009**: The end-to-end sequence `ctl/divergence` → `ctl/run-request` →
  `ctl/run-started` → `ctl/run-published` completes within the configured
  simulation-time budget and is observable in the client, satisfying AT-02.
- **SC-010**: The same scenario replayed from its manifest yields byte-identical
  forecast and uncertainty fields and an identical ordered sequence of control
  messages.
- **SC-011**: A substitute model kernel satisfying the port can be selected by
  configuration with zero source edits outside `services/model_runner/`.

## Assumptions

- The monitor reads the current forecast through the coverage read port rather than
  through the query layer. The query layer is the external read path; the monitor is
  internal to the control loop, and routing it through pygeoapi would add a
  dependency the SRD does not require. Recorded here because the SRD does not state
  which side of that boundary the monitor sits on.
- The default threshold is taken as 1.75 m/s of sound speed, the midpoint of the
  SRD's stated order of 1.5 to 2 m/s, on a sensitivity of roughly 3.5 m/s per degree
  Celsius at the scenario's nominal temperature, salinity and depth.
- Default persistence is three observations above threshold within one spatial
  neighbourhood, or three consecutive samples above threshold spanning at least the
  configured minimum span. Both counts and the span are configuration, not constants.
- The spatial neighbourhood for persistence is expressed as a radius in metres in
  configuration. H3 indexing belongs to the planner (SRD FR-35) and is not adopted
  here to avoid coupling the monitor to the planner's spatial index.
- The default ensemble size is eight members. The SRD says "small" and does not fix a
  number; eight gives a usable spread while keeping a run cheap enough to demonstrate
  live.
- The minimum interval between runs and the outstanding-request timeout are scenario
  configuration with no SRD-mandated default. The scenario used for AT-02 sets them
  short enough that the loop is watchable.
- Atomic visibility is achieved by writing to staging and performing a single
  filesystem-level rename or link into the catalogued location on the same volume.
  The SRD requires the property, not the mechanism; a coverage store that later moves
  to Zarr would satisfy the same property differently, which is why the mechanism
  sits behind the coverage output port.
- The environment generator (feature 004) supplies the seeded feature parameters and
  drift velocities the kernel advects, via the ground-truth manifest. This feature
  consumes that manifest and does not define it.
- The observation message shape and the observation store are owned by feature 007;
  this feature consumes both, and the single restart catch-up query uses the same
  store client rather than introducing an abstraction over it (Constitution VI).
- Feature 010 consumes the residuals this feature computes. The monitor emits residual
  summaries and the scheduler emits its decisions on `ctl/telemetry`; neither computes
  running statistics or skill scores. The message schema for that topic
  (`contracts/schemas/telemetry.schema.json`) is owned by feature 010, so this feature
  is a producer against a schema it does not own. That inverts the repository's
  usual "earlier feature owns the shared file" rule, and is recorded here rather than
  resolved silently: the alternative — 009 defining a telemetry shape that 010 then
  has to widen — is worse.
