# Feature Specification: The Observation Path

**Feature Branch**: `007-observation-path`

**Created**: 2026-08-26

**Status**: Draft

**Input**: The write path end to end: simulated sensors publishing observations in SensorThings vocabulary on a namespaced MQTT branch, an ingest client that validates and batch-writes as the single ingestion seam, and an observation store sharing one Postgres instance with a read-only feature store. Covers the two failure modes the SRD assigns to this path: cross-contamination of flows, and ingest backpressure. (SRD C-03 to C-07, FR-12 to FR-18.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Observations reach the store, end to end (Priority: P1)

A scenario starts. Simulated sensors sample the generated environment at the vessel's
position, publish observations in SensorThings vocabulary on the observation branch of the
broker, and the ingest client validates each one and writes it to the observation store in
batches. Someone can then query the store directly and see the observations that were
published, with the simulation times they were published for.

**Why this priority**: Nothing downstream exists without stored observations. The monitor,
the telemetry component, the SensorThings collections and the eddy-recovery acceptance test
all read what this story writes. It is the smallest slice that is worth anything.

**Independent Test**: Run a short scenario against a seeded environment, then count rows in
the observation store and compare against the count of published messages, and compare a
sample of stored values against the values the generator would produce at those coordinates.

**Acceptance Scenarios**:

1. **Given** a seeded environment and a running broker and store, **When** the sensors run for a fixed number of simulation steps, **Then** the observation store contains exactly one row per published observation, with no duplicates and no losses.
2. **Given** a stored observation, **When** its coordinates and simulation time are used to sample the generated field directly, **Then** the stored value equals the sampled value within the declared sensor noise model.
3. **Given** the same scenario run twice from the same root seed, **When** the two stores are compared, **Then** they are identical, including observation identifiers.
4. **Given** a running scenario, **When** the ingest client's heartbeat is observed on `ctl/heartbeat`, **Then** it carries the component identifier and the simulation time, so the client can light the component from liveness alone.

---

### User Story 2 - Flows cannot contaminate one another (Priority: P2)

Observation traffic and control events live on separate topic namespaces. Sensors can publish
only under `obs/`. A sensor that attempts to publish a control event is refused by the broker,
not by convention. Separating the two onto physically distinct brokers later is a change of
configuration values and nothing else.

**Why this priority**: The SRD assigns cross-contamination of flows to the broker as its owned
failure mode, and this is the harness's chance to find out what that actually feels like. It
is second because it constrains the shape of story one's implementation and is cheapest to
establish before there is much traffic to re-route.

**Independent Test**: Attempt, from a sensor's credentials, to publish on `ctl/` and to
subscribe to `ctl/`; both must be refused. Then run the whole system against a two-broker
configuration produced by editing configuration values only, and confirm it behaves the same.

**Acceptance Scenarios**:

1. **Given** a sensor's broker credentials, **When** it attempts to publish on any topic outside `obs/`, **Then** the broker refuses and the attempt is recorded.
2. **Given** a sensor's broker credentials, **When** it attempts to subscribe to `ctl/#`, **Then** the broker refuses.
3. **Given** the ingest client's credentials, **When** it subscribes to `obs/#` and publishes its heartbeat on `ctl/heartbeat`, **Then** both are permitted and nothing else is.
4. **Given** the documented two-broker fallback configuration, **When** the system is brought up with observation traffic on one broker and control traffic on another, **Then** no source file changes and every component behaves as before.
5. **Given** the running system, **When** the topic names in use are enumerated, **Then** they match the naming convention exactly: `obs/<thing-id>/<datastream-id>` for observations and the declared `ctl/` topics for control.

---

### User Story 3 - Nothing invalid reaches the store (Priority: P3)

Every message is validated against the observation message schema before it is written. A
message that fails validation is never written, is counted, and is retained where it can be
inspected. The ingest client is the only writer: no other component, and no operator's
convenience script, has permission to insert.

**Why this priority**: The single ingestion seam is one of the two things this path exists to
demonstrate. A seam that can be bypassed is not a seam, and a store that accepts anything
cannot be reasoned about downstream.

**Independent Test**: Publish a malformed observation and a well-formed one in the same batch;
confirm the well-formed one is stored, the malformed one is not, the rejection is counted and
retained, and that attempting to insert as any other database role is refused.

**Acceptance Scenarios**:

1. **Given** a message that violates the observation schema, **When** the ingest client receives it, **Then** it is not written, the rejection counter increases, and the message is retained with the reason for its rejection.
2. **Given** a batch containing both valid and invalid messages, **When** the batch is written, **Then** the valid messages are stored and the invalid ones are not, and the batch is not abandoned wholesale.
3. **Given** any database role other than the ingest role, **When** it attempts to insert into the observations schema, **Then** the database refuses.
4. **Given** the rejection counter, **When** its value is published on `ctl/telemetry`, **Then** a rejection is visible to the telemetry component without anyone reading a log file.

---

### User Story 4 - Backpressure is bounded and visible, never silent (Priority: P4)

Sensors are told to publish faster than the store can absorb. The ingest client's queue is
bounded, and when it fills, the client stops taking new messages from the broker rather than
discarding them or growing without limit. The condition is reported. When the burst passes,
the backlog drains and no observation is lost.

**Why this priority**: The SRD assigns ingest backpressure to the ingest client as its owned
failure mode. Under an accelerated simulation clock the harness can produce a burst easily, so
this is a failure the author will meet whether or not it is specified; specifying it makes it
a demonstration rather than an incident.

**Independent Test**: Run the clock at high acceleration or raise the sensor rate until the
queue fills; confirm the queue does not exceed its bound, that the condition is published,
that no message is lost, and that the backlog drains when the rate returns to normal.

**Acceptance Scenarios**:

1. **Given** a publication rate above the store's write rate, **When** the ingest queue reaches its bound, **Then** the client ceases to acknowledge new messages rather than discarding any, and the broker holds them.
2. **Given** the queue at its bound, **When** the condition persists, **Then** a backpressure indicator is published on `ctl/telemetry` with the queue depth and the current write rate.
3. **Given** a burst that has ended, **When** the backlog drains, **Then** the total count of stored observations equals the total count published, and the indicator clears.
4. **Given** a burst large enough to exceed the broker's own retention for the in-flight window, **When** messages are dropped by the broker, **Then** the loss is counted and reported rather than being discovered later as a hole in the data.

---

### User Story 5 - The feature store is provisioned by script and read-only during a run (Priority: P5)

Static spatial reference — bathymetry and coastlines — is loaded into the feature store by a
script before a scenario starts, from synthetic sources produced by that script. Once the
scenario is running, nothing can write to it: the run-time roles hold select permission only.

**Why this priority**: The harness analogue of pre-sail loading, and the simpler half of
FR-12. It is last because nothing in the write path depends on it, but it must exist before
the planner or the client draws anything against a coastline.

**Independent Test**: Run the provisioning script into an empty database, confirm the feature
schema is populated and the digests match the seeding record, then attempt a write as each
run-time role and confirm every attempt is refused.

**Acceptance Scenarios**:

1. **Given** an empty Postgres instance, **When** the provisioning script runs, **Then** the `features` schema is created and populated, and the content digests match those recorded by the seeding record for that root seed.
2. **Given** a running scenario, **When** any run-time role attempts to insert, update or delete in the `features` schema, **Then** the database refuses.
3. **Given** the two schemas, **When** the instance is inspected, **Then** `observations` and `features` are two schemas in one Postgres instance, not two instances.
4. **Given** a reset instance, **When** the provisioning script runs again with the same root seed, **Then** the feature store's content digests are unchanged.

---

### Edge Cases

- The broker is unavailable when a sensor or the ingest client starts. Both retry with bounded backoff driven by the simulation clock, publish no heartbeat until connected, and appear correctly greyed out in the client rather than falsely lit.
- The observation store is unavailable when the ingest client has a full batch. The batch is retained, not acknowledged to the broker, and written when the store returns. Nothing is lost and nothing is written twice.
- The same observation is delivered twice by the broker under at-least-once delivery. The store's key is the deterministic observation identifier, so the second write is a no-op rather than a duplicate row.
- A batch is partially written and the process dies. Either the whole batch is present or none of it is; the batch is one transaction.
- A message arrives whose simulation time precedes the last written observation, because a sensor reconnected and replayed. It is stored on its own time, not on arrival order, and the store's ordering is by simulation time.
- Sensor credentials are shared or reused across sensors. The access control list is written per role rather than per client identifier, so a new sensor requires no new rule but also gains no new permission.
- The retained rejections grow without limit during a long run. They are bounded and the bound is documented; exceeding it is itself reported.
- A control message is published on an `obs/` topic by a component that legitimately holds observation permissions. The ingest client rejects it as failing the observation schema, so namespace discipline is enforced at both ends.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Simulated sensors MUST publish observations using the SensorThings vocabulary, as the shape and vocabulary of the messages only. SensorThings is not the write engine and no SensorThings server participates in the write path. (SRD FR-16, C-04)
- **FR-002**: Observation messages MUST validate against `contracts/schemas/observation.schema.json`, which is authored by this feature and obeys the schema conventions of the generated-types feature. (SRD FR-17; Constitution III)
- **FR-003**: Observations MUST be published on `obs/<thing-id>/<datastream-id>` and control events on the declared `ctl/` topics, with no other namespaces in use. (repo-layout naming; SRD FR-14)
- **FR-004**: Observation traffic and control events MUST use separate topic namespaces on a single broker, with access control lists confining sensors to the observation branch — publish only, under `obs/` only, with no subscription to `ctl/`. (SRD FR-14, C-03)
- **FR-005**: Physical separation onto a second broker MUST be achievable by configuration change alone, and MUST be documented and demonstrated once. No component may hold more than one broker endpoint in source. (SRD FR-15)
- **FR-006**: The ingest client MUST validate each observation before writing, and MUST write in batches bounded by both a message count and a simulation-time interval. (SRD FR-17, C-05)
- **FR-007**: Each batch MUST be written in one transaction, so a failure leaves the store with either the whole batch or none of it. (SRD FR-17)
- **FR-008**: The ingest client MUST be the sole writer to the observation store, enforced by database permissions rather than by convention: only the ingest role holds insert permission on the `observations` schema. (SRD FR-18)
- **FR-009**: A message failing validation MUST NOT be written, MUST increment a rejection counter, and MUST be retained with its rejection reason up to a documented bound. (SRD FR-17)
- **FR-010**: The ingest client's queue MUST be bounded. On reaching the bound it MUST cease acknowledging new messages rather than discarding them or growing without limit. (SRD C-05, ingest backpressure)
- **FR-011**: Queue depth, write rate, rejection count and any broker-side loss MUST be published on `ctl/telemetry`, so degradation is visible without reading logs. (SRD C-05, C-16)
- **FR-012**: Every long-lived component in this path MUST publish a heartbeat on `ctl/heartbeat` at its declared interval, carrying its component identifier, the simulation time and a status. (repo-layout liveness; Constitution VII)
- **FR-013**: The observation store and the feature store MUST be two schemas, `observations` and `features`, in one Postgres instance with PostGIS. (SRD FR-12)
- **FR-014**: The feature store MUST be provisioned by script at scenario start and MUST be read-only during a run: run-time roles hold select permission only. (SRD FR-13)
- **FR-015**: All observation times MUST come from the simulation clock. No broker-assigned timestamp, database default or host clock value may be stored or used as truth. (Constitution I; SRD FR-09)
- **FR-016**: Observation identifiers MUST be derived deterministically from the root seed and the observation's logical position, never from entropy, arrival order or a database sequence, so that a replay reproduces them exactly. (Constitution II; SRD FR-11)
- **FR-017**: Redelivery of an already-stored observation MUST be a no-op, by keying on the deterministic identifier. (SRD FR-17)
- **FR-018**: Sensor noise MUST be drawn from a seeded generator obtained through the RNG port for the sensor's stream, and the resulting observations MUST be reproducible from the run manifest. (Constitution II; SRD FR-11)
- **FR-019**: No component in this path may contain a literal hostname, port, path or topic string beyond the namespace prefixes fixed by convention; broker endpoint, credentials, batch bounds, queue bound and rates all arrive via the component's configuration file. (Constitution IV; SRD NFR-04)
- **FR-020**: The stored data model MUST admit environmental measurements only. No entity, contact, detection or track, and no field that would serve as one. The simulated vessel appears as a sampling platform and a coordinate. (Constitution V; SRD §1.1)
- **FR-021**: Observations MUST be ordered and queried by simulation time, not by arrival order or insertion order, and out-of-order arrival MUST be stored on its own time. (Constitution I)
- **FR-022**: Store schema changes MUST be expressed as migrations under `stores/observations/`, applied by script, so a fresh instance and a migrated one agree. (SRD NFR-07)

### Key Entities

- **Thing**: A sampling platform in SensorThings vocabulary. Here, the simulated vessel or a fixed sampling point. It carries a location and an identifier and nothing that would make it a track.
- **Datastream**: The pairing of a Thing, a Sensor and an ObservedProperty with a unit of measurement. The unit of the topic path's second segment.
- **ObservedProperty**: What is measured — temperature, salinity or pressure.
- **Sensor**: The simulated instrument, carrying its noise characteristics.
- **Observation**: One measured value with its phenomenon time taken from the simulation clock, its result, its location, its depth, and its deterministic identifier. The atom of the write path.
- **FeatureOfInterest**: The location the observation pertains to, in SensorThings terms.
- **Observation batch**: The unit of writing — a bounded set of validated observations written in one transaction.
- **Rejection record**: A message that failed validation, retained with its reason up to a documented bound.
- **Feature store content**: Synthetic bathymetry and coastline reference data, produced by a script, loaded before a run, read-only during one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a scenario of fixed length, the count of stored observations equals the count published, with zero duplicates and zero losses.
- **SC-002**: Two runs from the same root seed produce byte-identical observation stores, including identifiers.
- **SC-003**: The number of database roles able to write to the `observations` schema is exactly one.
- **SC-004**: Every attempt by a sensor's credentials to publish outside `obs/` or subscribe to `ctl/` is refused; the success count is zero.
- **SC-005**: Switching to the two-broker configuration requires zero source-file changes, demonstrated by the diff of the configuration-only change.
- **SC-006**: Under a burst at least five times the sustainable write rate, the ingest queue never exceeds its declared bound and no observation is lost once the burst ends.
- **SC-007**: The backpressure indicator appears on `ctl/telemetry` within one declared telemetry interval of the queue reaching its bound.
- **SC-008**: Every invalid message is rejected and retained; the count written to the store is zero.
- **SC-009**: The wall-clock gate reports zero host-clock reads in `services/sensors/`, `services/ingest/` and the store's migration and provisioning scripts.
- **SC-010**: Every attempt to write to the `features` schema during a run is refused; the success count is zero.
- **SC-011**: Sampling stored observations against the generator's field at their own coordinates and simulation times yields differences within the declared sensor noise model, reported as a figure rather than asserted.

## Assumptions

- The broker is Mosquitto, since the constitution fixes MQTT but not the implementation, and
  Mosquitto's file-based access control lists make FR-004 straightforwardly testable. The
  configuration lives under `deploy/broker/` and is owned by this feature.
- Sound speed is derived, not published. Sensors publish temperature, salinity and pressure;
  the sound speed computation named in SRD §2.2 as bespoke core logic belongs to the control
  loop feature, which derives it from the observations it hears. The observation store
  therefore holds measured quantities only. This is an interpretation of SRD FR-02 and FR-24
  read together, and if the control loop feature concludes otherwise, the change is a fourth
  datastream and a derivation step at ingest.
- Messages are published at quality of service level 1, at-least-once, with duplicate
  suppression resting on the deterministic observation identifier rather than on the broker.
  Level 2 is available if level 1 proves troublesome, and is a configuration value.
- The batch's time bound is expressed in simulation time, not host time, because a host-time
  flush interval would be a wall-clock read in the operational path. Under an accelerated
  clock a simulation-time bound flushes more often in real terms, which is the correct
  behaviour for a harness whose point is to compress time.
- Bathymetry and coastline content in the feature store is synthetic, produced by the
  provisioning script from the seeded environment's domain, and represents no real place. The
  SRD calls it static spatial reference and does not require realism.
- Broker credentials are per role — sensor, ingest, control consumer — rather than per client
  instance, so adding a sensor requires no access control change. Credentials arrive via
  configuration produced from a template at deploy time and appear in no tracked file.
- The retained-rejection bound is a count rather than a size, defaulting to a few thousand
  records, tunable per scenario in configuration. The SRD does not fix it.
- The sensors' sampling pattern during the arrive-cold-then-loiter scenario, and the
  decorrelation-driven revisit cadence, belong to the scenario and planner features. This
  feature provides sensors that sample where and when they are told to, at a rate from
  configuration.
