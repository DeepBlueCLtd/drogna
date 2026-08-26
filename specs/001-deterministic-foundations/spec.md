# Feature Specification: Deterministic Replay Foundations

**Feature Branch**: `001-deterministic-foundations`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD C-01, FR-09, FR-10, FR-11, NFR-04, AT-04; §10 delivery priority 1. Constitution principles I, II and IV.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One place that says what time it is (Priority: P1)

A component needs to know the simulation time. It asks the clock port, which is a client of the
simulation clock service running elsewhere on the network. It receives ticks; it never computes
time itself and never reads the host clock. A viewer of the browser client changes the simulation
rate from real time to fifty times real time, and every component's sense of elapsed simulation
time changes together, because they are all reading the same tick stream.

**Why this priority**: The SRD is explicit that FR-09 to FR-11 exist together to make AT-04
possible and that none of them is retrofittable at acceptable cost. Nothing else in the harness
can be built honestly until time has a single source.

**Independent Test**: Start the clock service and two throwaway participant processes that log the
tick they observe. Change the rate over HTTP. Both participants observe the same tick values in
the same order at the new pace, and neither process contains a host-clock call.

**Acceptance Scenarios**:

1. **Given** the clock service is running in `realtime` mode with a 100 ms tick interval, **When**
   a participant subscribes to the tick stream, **Then** it receives ticks whose simulation times
   are `epoch + n × 100 ms` with strictly increasing `n`, and no gaps in `n`.
2. **Given** two participants are subscribed, **When** the rate is set to 50 over HTTP, **Then**
   both observe the same subsequent tick values, only emitted faster, and no tick value changes as
   a result of the rate change.
3. **Given** the clock is in `accelerated` mode, **When** a control request sets mode `paused`,
   **Then** the published clock state reports `paused`, no further ticks are emitted, and the last
   tick remains readable through the snapshot endpoint.
4. **Given** a participant is mid-run, **When** the clock service becomes unreachable, **Then**
   the participant's clock port reports the clock as stale with the last tick it saw, and the
   participant performs no further operational work rather than falling back to host time.
5. **Given** any component in the repository, **When** its source is inspected, **Then** the only
   time source it uses is `harness_core.clock.Clock`.

---

### User Story 2 - A component starts only from a validated named config (Priority: P2)

Every component is started with one environment variable, `HARNESS_CONFIG`, naming its config
file. Before it opens a socket, touches a file or connects to a database, it validates that file
against its JSON Schema. If the config is wrong the component refuses to start and says exactly
what is wrong. No filename, hostname, port or URL appears in the component's source.

**Why this priority**: NFR-04 and Constitution IV. Every subsequent component inherits this
loader, so its shape is settled once. It is second only to the clock because the clock's own
endpoint arrives this way.

**Independent Test**: Run a stub component with a valid config, an invalid config and no
`HARNESS_CONFIG` at all. Confirm the exit codes, the diagnostics and, by strace-free means (an
injected I/O recorder), that no I/O precedes validation.

**Acceptance Scenarios**:

1. **Given** `HARNESS_CONFIG` is unset, **When** a component starts, **Then** it exits non-zero
   with a message naming the variable and the component, and opens nothing.
2. **Given** a config file whose `clock.endpoint` is missing, **When** a component starts, **Then**
   it exits non-zero with a message naming the JSON pointer `/clock/endpoint`, the schema that
   rejected it and the file that was read.
3. **Given** a valid config, **When** a component starts, **Then** the loader exposes the parsed
   config and its SHA-256 digest, and the digest appears in the component's first heartbeat.
4. **Given** a config carrying an unknown key inside a section this component owns, **When** it
   starts, **Then** startup fails, because silent acceptance of unknown keys hides typos.

---

### User Story 3 - Randomness that can be replayed, recorded in a manifest (Priority: P3)

Every stochastic choice in the harness comes from a generator built from the run's root seed and
a named stream. A run writes a manifest recording the root seed, the derivation rule, the clock
configuration, the code version and each participant's config digest. Given the manifest and the
code version it names, the run can be started again and will make the same choices.

**Why this priority**: FR-11 and Constitution II. It is separable from the clock in
implementation but worthless without it, so it follows.

**Independent Test**: Draw a fixed number of values from three named streams under a known root
seed, twice, in two processes. The sequences match. Change the root seed; the sequences differ.
Reconstruct the streams from the manifest alone and the sequences match again.

**Acceptance Scenarios**:

1. **Given** root seed 12345 and stream `env_generator.field`, **When** a generator is requested
   in two separate processes, **Then** both produce identical value sequences.
2. **Given** a run has started, **When** the run manifest is read, **Then** it contains the root
   seed, the seed derivation rule and version, the clock configuration, the code version and no
   configuration values, only digests.
3. **Given** an identifier must appear in a stored record or a published message, **When** it is
   produced, **Then** it is derived from seed and logical position, and repeating the run produces
   the same identifier.
4. **Given** a completed run, **When** the manifest is inspected, **Then** it records the exit
   state and the final tick, written atomically.

---

### User Story 4 - The rules are enforced by a machine, not by memory (Priority: P4)

Three lint gates run in CI and locally with one command. They fail the build on a host-clock call,
an unseeded generator or a literal path, host or URL in component source. Exemptions exist, are
inline, carry a reason, and are listed in an inventory that a reviewer reads in one place.

**Why this priority**: Principles I, II and IV degrade silently without enforcement, and the SRD
notes at PR-05 that the constitution exists so every phase is checked automatically. The gates can
follow the mechanisms they police, but not by much.

**Independent Test**: Run each gate against a fixture directory containing known violations and
known-clean equivalents. Each gate flags every violation, flags no clean file, and exits non-zero
only when it should.

**Acceptance Scenarios**:

1. **Given** a Python file calling `datetime.now()` outside a permitted zone, **When** the
   wall-clock gate runs, **Then** it exits non-zero and reports the file, line and expression.
2. **Given** a TypeScript file calling `new Date()`, **When** the gate runs, **Then** it is
   reported in the same way as the Python case.
3. **Given** a call marked `# harness:allow-wallclock clock service real-time driver`, **When**
   the gate runs, **Then** the call is permitted and the marker appears in the exemption inventory
   with its reason.
4. **Given** a module calling `numpy.random.normal` directly, **When** the seeded-RNG gate runs,
   **Then** it exits non-zero and names `harness_core.rng.rng_for` as the required route.
5. **Given** a component containing the string `"/var/lib/harness/field.nc"` or
   `"mqtt://broker:1883"`, **When** the literal-path gate runs, **Then** both are reported.
6. **Given** all gates pass, **When** they are run by the single documented command, **Then** the
   command exits zero and prints the exemption inventory.

---

### User Story 5 - A run replays byte for byte (Priority: P5)

The clock offers a lockstep mode in which it advances only when every registered participant has
acknowledged the current tick. In that mode a scenario is a pure function of its manifest and its
code version, and running it twice produces byte-identical outputs. This feature proves the
mechanism with two toy participants; the full scenario replay of AT-04 is scored later, once there
is a scenario.

**Why this priority**: It is the point of everything above, but it can only be demonstrated once
the clock, the RNG and the manifest exist. Delivering it here fixes the mechanism before any real
component depends on it.

**Independent Test**: Run a scripted scenario of at least 1,000 ticks with two participants that
each write an output file, twice, from the same manifest. Compare the files byte for byte and the
manifests field for field.

**Acceptance Scenarios**:

1. **Given** lockstep mode and two registered participants, **When** the run executes, **Then**
   tick `n+1` is emitted only after both participants have acknowledged tick `n`.
2. **Given** a participant stops acknowledging, **When** the lockstep deadline passes, **Then**
   the clock stalls, reports which participant is outstanding, and never skips a tick.
3. **Given** a completed lockstep run and its manifest, **When** the run is repeated from that
   manifest on the same code version, **Then** the output files are byte-identical and the
   manifests differ only in fields declared non-reproducible.
4. **Given** the same scenario run in `accelerated` mode instead, **When** it is repeated,
   **Then** the harness claims reproducibility of values only, and the difference in interleaving
   is documented rather than hidden.

---

### Edge Cases

- The clock service restarts mid-run. It must not resume at tick zero: run identity and the last
  emitted tick are recovered from the run manifest, and if they cannot be recovered the service
  refuses to start rather than silently rewinding time.
- A participant processes ticks more slowly than they are emitted in `accelerated` mode. It
  observes tick values with gaps. Every consumer must therefore key its behaviour to tick values
  and simulation times, never to a count of received ticks.
- The tick stream drops and reconnects with a gap. The clock port reports the gap explicitly; it
  does not fill it in.
- Rate is set to zero. This is `paused`, not a division by zero, and is expressed as a mode change.
  It is also the mechanism a screenshot capture uses to hold the system still (SRD FR-53), so pinning
  an already-paused clock and releasing an already-running one must both be harmless.
- A capture pins the rate to zero while components are mid-work. On release, ticks resume from the
  tick that was current, and no tick value is skipped or repeated.
- A negative or absurd rate is requested from the browser. It is rejected against the configured
  bounds with a readable error, and the current state is unchanged.
- Two call sites request the same RNG stream name. The second receives the same cached generator,
  which means their draws interleave; stream names are therefore `<component>.<purpose>` by
  convention and the manifest lists the streams a run is expected to use.
- The config file is valid JSON but not valid against the schema; and the config file is not valid
  JSON at all. Both fail before any I/O, with different messages.
- A config file contains a secret. The manifest records only its digest, never its content.
- A gate exemption marker carries no reason. The gate treats a reasonless marker as a violation.
- Generated code, test fixtures and `spikes/` contain constructs the gates would otherwise reject.
  They are excluded by an explicit allowlist held in one place, not by scattered markers.
- The clock is paused for a long period. Nothing in the harness ages, because ageing is measured in
  simulation time. Displays must show the clock state so a frozen system is not read as a healthy one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The harness MUST provide a simulation clock service (C-01) that is the single
  authority for simulation time across all components. (SRD FR-09, C-01)
- **FR-002**: Simulation time MUST be quantised: the simulation time of tick `n` is
  `epoch + n × tick_interval`, computed in exact integer microseconds. Tick indices are strictly
  increasing within a run. (SRD FR-09)
- **FR-003**: The clock service MUST expose its time over the network so that components read time
  as a service: a state snapshot request and a streamed sequence of ticks. Components MUST NOT
  compute simulation time locally between ticks. (SRD FR-09, C-01)
- **FR-004**: The clock service MUST support the modes `realtime`, `accelerated`, `paused` and
  `lockstep`, and MUST publish the current mode and rate as part of its state. (SRD FR-10)
- **FR-005**: The clock service MUST accept mode and rate control from the browser client over
  HTTP, and the change MUST be reflected in the published state and in the next emitted tick.
  (SRD FR-10, FR-49)
- **FR-006**: A rate or mode change MUST NOT alter any tick value, only the pace at which ticks are
  emitted. (SRD FR-10, AT-04)
- **FR-007**: Control endpoints MUST sit under a path prefix distinct from read endpoints, so the
  reverse proxy can apply policy to them without enumerating routes. (SRD FR-40, FR-41)
- **FR-008**: The clock service MUST publish a heartbeat on `ctl/heartbeat` carrying its component
  id, the simulation time and a status, at its declared interval. This is drogna's first liveness
  signal and the pattern every later component follows. (SRD FR-52, FR-45)
- **FR-009**: The clock service's real-time driver MUST be the only code in the repository that
  reads a host clock for an operational purpose, and MUST carry an inline
  `# harness:allow-wallclock` marker. (Constitution I; SRD FR-09)
- **FR-010**: In `lockstep` mode the clock service MUST emit tick `n+1` only after every registered
  participant has acknowledged tick `n`. (SRD AT-04)
- **FR-011**: In `lockstep` mode, if a participant fails to acknowledge within the configured
  deadline the clock MUST stall and report the outstanding participant. It MUST NOT skip, guess or
  drop the participant. (SRD AT-04)
- **FR-012**: Participants MUST register with the clock service using a deterministic participant
  id, and registrations MUST be recorded in the run manifest. (SRD FR-11)
- **FR-013**: `harness_core.clock.Clock` MUST be a port offering the current simulation instant,
  the current tick index, and the ability to wait for a given tick or simulation time. (SRD FR-09,
  Constitution VI)
- **FR-014**: Exactly three implementations of the clock port MUST exist: a network client of the
  clock service, a manual clock for tests, and the service's internal driver. Adding a fourth
  requires an ADR. (Constitution VI)
- **FR-015**: The clock port MUST report staleness — the last tick received and the size of the
  gap — when the tick stream is interrupted, and dependent components MUST NOT perform operational
  work while the clock is stale beyond the configured tolerance. (SRD FR-09)
- **FR-016**: Simulation time crossing a component boundary, in a message payload or a stored
  record, MUST be an ISO-8601 UTC timestamp with microsecond precision, accompanied by the tick
  index where the message shape allows it. (SRD FR-09, NFR-02)
- **FR-017**: `harness_core.rng.rng_for(stream)` MUST return a generator derived deterministically
  from the run's root seed and the stream name, by a documented and versioned derivation rule, so
  that the same root seed and stream always produce the same sequence. (SRD FR-11)
- **FR-018**: Generators MUST be cached per stream within a process, so a stream name identifies
  one sequence rather than several. (SRD FR-11)
- **FR-019**: Identifiers appearing in stored data or published messages MUST be derived from seed
  and logical position, never from entropy or from a host clock. (Constitution II)
- **FR-020**: Every run MUST write a run manifest, validated against
  `contracts/schemas/run-manifest.schema.json`, recording: run id, root seed, seed derivation rule
  and version, clock configuration, code version, and the config digest of each participant.
  (SRD FR-11, Constitution II)
- **FR-021**: The run manifest MUST record digests of configuration, never configuration values, so
  that a manifest can be published without leaking a secret. (SRD FR-11, FR-39)
- **FR-022**: The run manifest MUST be sufficient, together with the code version it names, to
  start the run again with no other input. (SRD AT-04)
- **FR-023**: The run manifest MUST record the run's exit state and final tick, written atomically
  so no reader observes a partially written manifest. (SRD FR-30 pattern, AT-04)
- **FR-024**: Fields of the manifest that cannot be reproducible MUST be declared as such in the
  schema, so a replay comparison knows what to exclude. (SRD AT-04)
- **FR-025**: Every component MUST read exactly one environment variable, `HARNESS_CONFIG`, naming
  its config file. No other environment variable may carry operational meaning. (SRD NFR-04)
- **FR-026**: A component MUST validate its config against its JSON Schema as its first operation,
  before any file, socket or database access, and MUST exit non-zero on failure with a message
  naming the failing JSON pointer, the constraint and the file. (SRD NFR-04)
- **FR-027**: `contracts/schemas/config.common.schema.json` MUST define the `component`, `clock`,
  `seed`, `broker` and `logging` shapes once, with `$id`
  `https://schemas.harness.invalid/config.common.schema.json`, to be referenced by every
  component config schema. (SRD NFR-04, repo layout)
- **FR-028**: Component config schemas MUST reject unknown keys within the sections they define.
  (SRD NFR-04)
- **FR-029**: The config loader MUST expose the configuration's SHA-256 digest for the manifest and
  the heartbeat. (SRD FR-11)
- **FR-030**: `scripts/check_no_wallclock.py` MUST detect prohibited time sources in Python by
  syntax tree analysis and in TypeScript and SQL by pattern, honour inline
  `# harness:allow-wallclock <reason>` markers, and exit non-zero on any unmarked occurrence.
  (Constitution I; SRD FR-09)
- **FR-031**: `scripts/check_seeded_rng.py` MUST detect use of module-level or global generators
  and of entropy-derived identifiers outside `harness_core.rng`, and exit non-zero. (Constitution
  II; SRD FR-11)
- **FR-032**: `scripts/check_no_literal_paths.py` MUST detect path-like, host-like, URL-like and
  port-like literals in component source, and any read of an environment variable other than
  `HARNESS_CONFIG`, and exit non-zero. (Constitution IV; SRD NFR-04, NFR-05)
- **FR-033**: Each gate MUST support an exemption marker carrying a reason; a marker without a
  reason MUST be treated as a violation. (Constitution I, IV)
- **FR-034**: The gates MUST print a single exemption inventory listing every marker in the
  repository with file, line and reason. (Constitution I)
- **FR-035**: Excluded paths — generated code, test fixtures, `spikes/` — MUST be declared in one
  place shared by all three gates, not scattered through the tree. (Constitution III, IV)
- **FR-036**: The gates MUST be runnable locally by a single documented command, and MUST be
  written so that later features can add gates to the same runner without editing the existing
  ones. (Constitution quality gates)
- **FR-037**: Each gate MUST have tests using fixture files containing known violations and known
  clean equivalents; a gate that passes a known violation is a defect. (Constitution quality gates)
- **FR-038**: The control surface MUST allow the rate to be pinned to zero and released again, so
  that a screenshot capture can hold the whole system still and a before-and-after pair differs only
  where the change under evidence differs. Pinning and releasing MUST be idempotent, and the tick
  sequence MUST resume unbroken. (SRD FR-53, PR-10)

### Key Entities

- **Simulation instant**: A point in simulation time. Integer microseconds since the run's
  simulation epoch, rendered as ISO-8601 UTC when it crosses a boundary.
- **Tick**: An indexed advance of the simulation clock. Carries the tick index, the simulation
  instant, the clock mode and rate, and the run id. The unit of causality in the harness.
- **Clock state**: Mode, rate, current tick, simulation epoch, tick interval, and in lockstep mode
  the set of registered participants and their acknowledged ticks.
- **Clock participant**: A component known to the clock service by a deterministic id, with a
  declared role — observer or lockstep participant.
- **Seed stream**: A named channel of randomness, `<component>.<purpose>`, resolving to one
  generator per run.
- **Run manifest**: The record from which a run can be reproduced: run id, root seed, derivation
  rule and version, clock configuration, code version, participant config digests, exit state and
  final tick.
- **Component configuration**: The single named file a component reads, validated before any other
  operation, comprising the common sections and this component's own section.
- **Exemption marker**: An inline annotation permitting a specific gate violation on a specific
  line, with a reason, and appearing in the inventory.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A scripted lockstep scenario of at least 1,000 ticks with two participants, run twice
  from the same manifest on the same code version, produces byte-identical output files and
  manifests that differ only in fields the schema declares non-reproducible.
- **SC-002**: Every gate completes over the whole repository in under 15 seconds, exits non-zero on
  each of its violation fixtures and zero on each of its clean fixtures.
- **SC-003**: Not one unmarked prohibited time call, unseeded generator or literal path, host or
  URL exists in tracked component source, as demonstrated by the gates passing on a clean tree.
- **SC-004**: A rate change requested over HTTP is reflected in the published clock state within one
  tick interval, and no tick value differs from what it would have been at the previous rate.
- **SC-005**: With the clock service stopped, every dependent process reports the clock as stale and
  performs no operational work; none falls back to host time.
- **SC-006**: A deliberately invalid config produces a diagnostic naming the failing JSON pointer,
  and an I/O recorder confirms no file, socket or database access occurred before validation.
- **SC-007**: A reviewer given only a run manifest and the code version it names can start an
  equivalent run with one command and no further input.
- **SC-008**: Pinning the rate to zero and releasing it leaves the tick sequence unbroken: the tick
  observed after release is the successor of the tick observed before pinning.
- **SC-009**: The exemption inventory contains no entry outside the four permitted zones — clock
  service driver, log line decoration, process-level metrics, test setup — and every entry carries
  a reason.

## Assumptions

- The clock is exposed over HTTP: a snapshot endpoint, a streamed tick endpoint using
  server-sent events, and a control endpoint. The alternative, a new MQTT control topic, is not
  taken because the control topic list in `docs/architecture/repo-layout.md` is closed and because
  the browser client consumes server-sent events without an MQTT client. This choice is
  contested enough to earn an ADR.
- The `lockstep` mode is an addition of this feature. The SRD names only real-time and accelerated
  modes (FR-10). Lockstep is how AT-04 is made achievable rather than aspirational, and it is
  recorded here as a design choice rather than an SRD requirement.
- Byte-identical replay is claimed for lockstep mode, one code version and one set of container
  images. In `accelerated` mode the harness claims reproducibility of drawn values but not of
  interleaving, and says so rather than overclaiming.
- The default tick interval is 100 ms of simulation time; the default simulation epoch and rate
  bounds come from config. No default is embedded in source.
- The clock service source lives in `services/clock/`. The service list in
  `docs/architecture/repo-layout.md` does not name it, but it is a subdirectory of an existing
  top-level directory rather than a new top-level directory. That document gains a line when this
  feature lands.
- The run manifest schema is named `run-manifest.schema.json` to avoid collision with the
  environment generator's ground-truth `manifest.schema.json` (feature 004). The two are different
  documents with different lifetimes; the ground-truth manifest references the run id.
- The clock service writes the run manifest, because it is the component that must exist before any
  other and it holds the run's identity. Participants' config digests reach it through the
  `config_digest` and `run_id` fields of the heartbeat message, whose schema is owned by feature
  003.
- Per-stream derived seeds are recomputable from the root seed and the stream name, so the manifest
  records the derivation rule and version rather than an exhaustive table of seeds.
- Continuous integration workflow files are owned by the deployment feature (005). This feature
  supplies gate scripts with stable exit codes and a single entry point for that feature to call.
- Config value files for the clock service are provided for both destinations under `config/local/`
  and `config/droplet/`; the overlay mechanism that selects between them belongs to feature 005.
