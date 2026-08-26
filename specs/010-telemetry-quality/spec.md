# Feature Specification: Telemetry and Forecast Quality

**Feature Branch**: `010-telemetry-quality`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD component C-16 (telemetry); SRD §5.6 FR-37 and FR-38; Constitution
principle IX.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The residuals already computed are also reported (Priority: P1)

The monitor computes a forecast-minus-measurement residual on sound speed for every
observation it scores. It uses those residuals to decide whether to trigger a run.
The telemetry component takes the same residuals and maintains running statistics of
them — count, bias, root-mean-square, extremes — per forecast run and per region, and
publishes them on the control namespace at a declared interval. Same data, two
purposes: triggering runs and reporting confidence.

**Why this priority**: This is the whole of FR-37 and the cheapest honest thing the
harness can say about itself. It requires no new measurement, no new query and no new
computation of residuals — only aggregation of a stream that already exists. It is
also the input the skill score in User Story 2 needs.

**Independent Test**: Replay a recorded stream of residual reports into the telemetry
component and assert that the published statistics match the statistics computed
offline from the same stream, that they are attributed to the correct forecast run,
and that memory does not grow with stream length.

**Acceptance Scenarios**:

1. **Given** a stream of residual reports on the control namespace, **When** the
   telemetry interval elapses, **Then** a statistics message is published carrying
   sample count, mean residual, root-mean-square residual, minimum and maximum, the
   simulation-time window covered, and the forecast run identifier they were scored
   against.
2. **Given** a scenario ten times longer than the reference scenario, **When**
   telemetry runs throughout, **Then** its memory footprint is indistinguishable from
   the reference scenario's, because the statistics are updated incrementally and
   nothing accumulates.
3. **Given** telemetry is running, **When** its behaviour is inspected, **Then** it
   has issued no query to the observation store and no request to the query layer:
   every number it reports came from a message it subscribed to.
4. **Given** a new forecast run is published, **When** residuals for the new run
   begin arriving, **Then** statistics for the superseded run are closed and retained
   as a completed record, and new statistics accumulate against the new run
   identifier rather than being merged into the old ones.

---

### User Story 2 - Skill is reported against persistence, and says when it loses (Priority: P2)

Telemetry maintains a persistence reference — the last published forecast held
constant, which is the claim that conditions stay the same — and scores arriving
measurements against both it and the current forecast. It publishes the resulting
skill score together with both mean-square errors and the sample count, so the figure
can be checked rather than believed. When the model does not beat persistence, the
message says so explicitly.

**Why this priority**: A forecast without a baseline is a number with no meaning.
Constitution IX makes this non-negotiable, and the SRD's phrasing is blunt: a model
not beating "conditions stay the same" is not earning its compute, and the display
says so. This is second only because it needs the residual machinery of User Story 1
in place.

**Independent Test**: Feed recorded measurements against a forecast field and a held
persistence field whose errors are known by construction. Assert the published skill
score equals the value recomputed by hand from the two reported mean-square errors,
and that the not-beating-persistence flag is set exactly when the model's error is
the larger.

**Acceptance Scenarios**:

1. **Given** measurements scored against both the current forecast and the
   persistence reference, **When** a skill message is published, **Then** it carries
   the model mean-square error, the persistence mean-square error, the sample count,
   and a skill score derived from them by the stated formula.
2. **Given** a run whose error exceeds the persistence reference's error, **When**
   the skill message is published, **Then** the message carries an explicit
   not-beating-persistence state and the plain-language statement that goes with it,
   rather than leaving a negative number to be interpreted downstream.
3. **Given** fewer than the configured minimum number of scored samples, **When** the
   telemetry interval elapses, **Then** the message reports `insufficient-samples`
   and carries no skill score at all. No default, no zero, no last known value.
4. **Given** a new run is published, **When** the persistence reference is updated,
   **Then** the reference becomes the field that was current immediately before the
   new publication, held constant thereafter, and the change of reference is recorded
   in the message so the comparison is never ambiguous.

---

### User Story 3 - Degradation is loud (Priority: P3)

Every statistic telemetry publishes carries the simulation time at which it was last
updated and a state saying whether it is fresh or stale. When the residual stream
stops, the statistic goes stale and says so rather than continuing to present its
last value as current. Telemetry never asserts anything about which components exist.

**Why this priority**: This component owns silent degradation. The statistics of User
Stories 1 and 2 are worth less than nothing if they keep showing a comforting number
after their input has dried up. It is third only because it is a property added to
messages that must first exist.

**Independent Test**: Start a residual stream, let statistics establish, stop the
stream, and assert that within a bounded number of publication intervals every
affected statistic reports `stale` with the simulation time of its last real update,
and that no statistic reports a stale value as fresh at any point.

**Acceptance Scenarios**:

1. **Given** established statistics, **When** the residual stream stops, **Then**
   within the configured staleness window every affected statistic is published with
   state `stale` and the simulation time of its last update.
2. **Given** a stale statistic, **When** residuals resume, **Then** the statistic
   returns to `fresh` and the message records the span for which it was stale.
3. **Given** the telemetry component itself, **When** the client renders component
   liveness, **Then** it does so from `ctl/heartbeat` alone. Telemetry publishes no
   list of components that ought to exist and no enabled flags.
4. **Given** telemetry has computed a poor skill score, **When** it publishes,
   **Then** it publishes the poor score. There is no suppression, smoothing or
   minimum-quality gate on what gets reported.

---

### Edge Cases

- **No forecast has ever been published.** There is nothing to score. Telemetry
  reports `no-forecast` explicitly, with no statistics and no skill score.
- **Residuals arrive for a run that has already been superseded.** They are attributed
  to the run they were scored against, not the current one, and are counted in that
  run's closed record.
- **Persistence reference and forecast are the same field.** Immediately after the
  first ever publication there is no prior field to hold constant. Skill is
  `insufficient-reference` until a second run has been published.
- **All residuals are identically zero.** A root-mean-square of zero is reported as
  zero and flagged as implausible for review, because in a harness with seeded noise
  it almost certainly indicates the residual stream is a constant rather than a
  measurement.
- **Extremely few samples in a region.** Region-level statistics below the minimum
  sample count are reported as `insufficient-samples` per region, not folded silently
  into the scenario-level figure.
- **Clock acceleration.** At high rates the residual arrival rate rises but the
  publication interval is in simulation time, so the number of samples per published
  statistic rises rather than the message rate. Message rate stays bounded.
- **Statistics as a leakage path.** A region-level statistic traces where sampling
  has occurred. Nothing in this feature releases statistics downstream, and any
  future release of them is subject to SRD FR-42, which feature 013 owns.
- **Telemetry restart.** Running statistics are in memory and are lost. Telemetry
  reports `warming` and publishes nothing until the configured minimum sample count
  is reached again. It does not reconstruct history from the store.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The telemetry component MUST derive its residual statistics from the
  forecast-measurement residuals the monitor has already computed, received as
  messages on the control namespace. It MUST NOT recompute those residuals, query the
  observation store, or request anything from the query layer. The persistence
  comparison of FR-006 is a different measurement against a different field, not a
  recomputation of the monitor's residual. (SRD FR-37)
- **FR-002**: Telemetry MUST maintain running statistics of those residuals — sample
  count, mean (bias), root-mean-square, minimum and maximum — at scenario level and
  at region level. (SRD FR-37)
- **FR-003**: Statistics MUST be updated incrementally in bounded memory. Memory MUST
  NOT grow with the number of samples or the length of the scenario. (SRD FR-37)
- **FR-004**: Every statistic MUST be attributed to the forecast run identifier the
  residuals were scored against. When a new run is published, the superseded run's
  statistics MUST be closed and retained as a completed record rather than merged.
  (SRD FR-37, FR-30)
- **FR-005**: Telemetry MUST publish statistics on the control namespace at a declared
  interval measured in simulation time.
- **FR-006**: Telemetry MUST maintain a persistence reference — the forecast field
  that was current immediately before the latest publication, held constant — and
  MUST score arriving measurements against both it and the current forecast.
  Where that scoring requires a sound speed, telemetry MUST obtain it by calling the
  single shared implementation in `libs/harness_core` — the same one the monitor
  (SRD FR-24) and the environment generator (SRD FR-02) call — and MUST NOT carry its
  own copy of the equation. There is no stored sound-speed datastream to read instead:
  sound speed is derived at the point of use, never published and never stored. The
  measured value comes from the monitor's residual report; the reference value is
  derived from the persistence field's temperature, salinity and pressure sampled
  through the coverage read port. (SRD FR-38, §2.2; ADR-0005)
- **FR-007**: Forecast skill MUST be published as a score derived from the model and
  persistence mean-square errors by a stated formula, accompanied by both errors and
  the sample count, so that the score is recomputable by a reader. (SRD FR-38,
  Constitution IX)
- **FR-008**: When the model's error is not smaller than the persistence reference's,
  the published message MUST carry an explicit not-beating-persistence state and the
  plain-language statement of it. The interpretation MUST NOT be left to the display.
  (SRD FR-38, Constitution IX)
- **FR-009**: Below a configured minimum sample count, telemetry MUST report
  `insufficient-samples` and MUST publish no skill score. No default value, no zero
  and no carried-forward previous value is permitted. (Constitution IX)
- **FR-010**: Every published statistic MUST carry the simulation time of its last
  real update and a freshness state of `fresh` or `stale`, and MUST transition to
  `stale` within the configured staleness window when its inputs stop arriving.
- **FR-011**: Telemetry MUST NOT suppress, smooth or gate any figure on the grounds
  that it is unflattering. A poor score is published as computed.
- **FR-012**: Telemetry MUST NOT publish any list of components that ought to exist,
  any enabled flag, or any other configuration-derived claim about what is running.
  Component liveness is rendered from `ctl/heartbeat` alone. (Constitution VII)
- **FR-013**: Telemetry MUST NOT influence the control loop. It publishes no
  divergence, no run request, and nothing the scheduler consumes. (SRD FR-26, FR-27)
- **FR-014**: All telemetry payloads MUST be defined once in
  `contracts/schemas/telemetry.schema.json` as a set discriminated by a `kind` field
  covering, at minimum, residual sample reports, scheduler decision records, residual
  statistics and forecast skill. Every producer validates against it, and Python and
  TypeScript types are generated from it. (Constitution III)
- **FR-015**: Telemetry MUST read exactly one configuration file whose path arrives in
  `HARNESS_CONFIG` and MUST validate it against
  `contracts/schemas/config.telemetry.schema.json` before any other I/O.
  (Constitution IV)
- **FR-016**: All intervals, windows and message timestamps MUST come from the
  simulation clock port — the publication interval and the staleness window included,
  so message rate stays bounded under clock acceleration. The one exception is
  heartbeat cadence, which is real time under FR-017. (Constitution I, ADR-0006)
- **FR-017**: Telemetry MUST publish a heartbeat on `ctl/heartbeat` carrying its
  component identifier, the simulation time and one of `warming`, `reporting` or
  `no-forecast`. The cadence MUST be **real time**, and the simulation time the
  heartbeat carries is payload, not schedule: liveness answers "is this process
  alive?", which is a fact about the host, so a rate of zero stops simulated time and
  leaves telemetry lit. The emission carries the `# harness:allow-wallclock` marker
  with ADR-0006 as its reason, and the exemption covers nothing else in this
  component. (Constitution VII, Constitution I, ADR-0006; SRD FR-45, FR-52, FR-53)
- **FR-018**: No telemetry message may carry a tracked entity, contact, detection or
  track. Regions are described geographically or by grid index. (Constitution V)

### Key Entities

- **Residual report**: a message carrying one residual or a short batch of residuals
  computed by the monitor, with position, simulation time, magnitude in m/s and the
  forecast run identifier scored against. Produced by feature 009, consumed here.
- **Running statistic**: the incrementally maintained aggregate for one scope — a
  scenario or a region — carrying count, mean, root-mean-square, extremes, the
  covered simulation-time window, the last-update time and a freshness state.
- **Persistence reference**: the forecast field that was current immediately before
  the latest publication, held constant, used as the baseline every skill score is
  measured against.
- **Skill report**: model mean-square error, persistence mean-square error, sample
  count, derived skill score, the identifiers of the run and of the reference, and an
  explicit state of `beating-persistence`, `not-beating-persistence`,
  `insufficient-samples` or `insufficient-reference`.
- **Scheduler decision record**: the accepted-or-declined outcome the scheduler
  records for each divergence, carried on the same telemetry contract so the client
  can show why a run did not happen. Produced by feature 009, consumed here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Published residual statistics match the values computed offline from the
  same recorded stream, to within floating-point tolerance, for 100% of published
  messages.
- **SC-002**: Telemetry's memory footprint over a scenario ten times the reference
  length is within 10% of its footprint over the reference scenario.
- **SC-003**: Telemetry issues zero queries to the observation store and zero requests
  to the query layer over a full scenario run.
- **SC-004**: Every published skill score is recomputable by hand from the two
  mean-square errors and sample count carried in the same message, for 100% of
  messages.
- **SC-005**: In a scenario where the forecast is deliberately degraded below the
  persistence reference, the not-beating-persistence state appears in the published
  message within one telemetry interval, in 100% of trials.
- **SC-006**: No skill score is ever published below the configured minimum sample
  count: the count of such messages is zero across a full scenario.
- **SC-007**: After the residual stream stops, every affected statistic reports
  `stale` within the configured staleness window, and the count of statistics
  reporting a value older than that window as `fresh` is zero.
- **SC-008**: The same scenario replayed from its manifest produces an identical
  ordered sequence of telemetry messages with identical payloads.
- **SC-009**: Telemetry message rate stays bounded across the full range of clock
  acceleration, varying by no more than the ratio of configured intervals.
- **SC-010**: The number of sound-speed implementations reachable from
  `services/telemetry/` is exactly one, and it is in `libs/harness_core`.
- **SC-011**: With the clock rate pinned to zero for longer than the declared liveness
  window, telemetry's heartbeat continues on its real-time cadence and the count of
  intervals in which it falls out of that window is zero. Statistics publication,
  which is on simulation time, correctly stops.

## Assumptions

- **Settled: telemetry reads the persistence reference through the coverage read
  port, not through the query layer** — the same reading feature 009's monitor takes
  for the current forecast, and feature 011's planner takes for the announced
  uncertainty field. The query layer is the external read path; these three components
  are inside the boundary SRD §2.2 draws, and the coverage output is a genuine port
  under Constitution VI while the query layer is plumbing on the far side of the seam.
  Routing an internal consumer out through pygeoapi and back would add a dependency
  the SRD does not require and claim a seam that is not there. FR-001 and SC-003 hold
  telemetry to zero requests to the query layer, which is the same statement seen from
  the other side.
- **Settled: telemetry does not combine ensemble spread with observation age.** That
  combination — the uncertainty field the planner scores, per SRD FR-07 and FR-08 —
  belongs to feature 011's planner, which is the only consumer that needs it and the
  only component already subscribed to observation arrivals for the purpose. Feature
  009's model runner publishes ensemble spread alone. Telemetry reports on forecast
  quality and produces no uncertainty field at all; giving the planner a second
  producer of its primary input would be worse than either alternative. The same
  settlement is recorded in features 009 and 011.
- Sound speed is derived at the point of use and never stored, per ADR-0005. Telemetry
  calls the shared implementation in `libs/harness_core` for the persistence
  comparison and holds no copy of the equation; nothing in this specification assumes
  a stored sound-speed datastream.
- The residual reports and scheduler decision records that telemetry consumes are
  produced by feature 009's monitor and scheduler. This feature owns the shape they
  are published in — `contracts/schemas/telemetry.schema.json` — even though feature
  009 is the first producer against it. That inverts the repository's usual
  "earlier feature owns the shared file" rule and is recorded here rather than
  resolved silently: the alternative is 009 defining a telemetry shape that this
  feature would immediately have to widen.
- Telemetry messages are published on subtopics of the form
  `ctl/telemetry/<component-id>`, mirroring the `obs/<thing-id>/<datastream-id>`
  convention, so a subscriber can take one component's telemetry or all of it. The
  repository layout names `ctl/telemetry` as the branch; the subtopic level is this
  feature's choice.
- The skill score is taken as `1 − MSE_model / MSE_persistence`, the conventional
  form, with the not-beating-persistence state set when the score is not positive.
  The SRD requires a persistence reference and does not fix the formula, so the
  formula is carried in the documentation and the score is published alongside the
  two errors that produced it.
- The persistence reference is the previous published forecast field held constant.
  The alternative reading — the last measurement held constant at each location — is
  a different baseline and would need its own requirement; it is not adopted here.
- Quality flagging of individual observations belongs to the ingestion path
  (SRD FR-17, feature 007), which validates each observation against the message
  schema. This feature does not duplicate it. The word "quality" in this feature's
  name refers to forecast quality: residual statistics and skill.
- Scoring the recovery of seeded features against the ground-truth manifest (AT-03)
  belongs to the environment generator feature, which owns the manifest. Telemetry
  reports forecast skill against persistence, which is a different measurement, and
  the two are not conflated.
- The minimum sample count, the telemetry publication interval and the staleness
  window are scenario configuration. The SRD fixes no values for them.
- Rendering any of this — including the plain-language statement that a model is not
  beating persistence — is the client's work, in features 003 and 012. This feature
  emits the state and the words; it draws nothing.
