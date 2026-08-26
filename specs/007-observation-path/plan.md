# Implementation Plan: The Observation Path

**Branch**: `007-observation-path` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-observation-path/spec.md`

## Summary

The write path, built as one slice: simulated sensors that sample the generated environment
and publish observations in SensorThings vocabulary on `obs/<thing-id>/<datastream-id>`; a
broker whose access control lists confine those sensors to the observation branch; an ingest
client that validates every message against the observation schema, batches, and writes in a
single transaction as the sole writer; and one Postgres instance with PostGIS carrying two
schemas, `observations` for the punishing write path and `features` for read-mostly reference
data provisioned by script and read-only during a run.

Two failure modes are treated as features rather than accidents. Cross-contamination of flows
is prevented by broker access control and by the ingest client rejecting anything that is not
a valid observation, so the discipline is enforced at both ends. Ingest backpressure is bounded
and reported: the queue has a limit, reaching it stops acknowledgement rather than causing
loss, and the condition appears on `ctl/telemetry` where the telemetry component and the
client can see it.

## Technical Context

**Language/Version**: Python 3.11 for the sensors, the ingest client and the store tooling;
SQL for schema and migrations.

**Primary Dependencies**: `paho-mqtt` for broker access behind the thin event-publication
wrapper the constitution calls marginal; `psycopg` for Postgres; `pydantic` models generated
into `libs/harness_types/` from the observation schema; `libs/harness_core` for the clock port,
the RNG port, the configuration loader and the manifest.

**Storage**: One Postgres 16 instance with PostGIS, two schemas. `observations` holds point
observations keyed by a deterministic identifier, with a geography point, a depth and a
phenomenon time taken from the simulation clock. `features` holds synthetic bathymetry and
coastlines, provisioned by script.

**Testing**: `pytest` for unit tests beside each package; `tests/integration/` for the
end-to-end publish-to-store path, the access control assertions, the backpressure burst and
the redelivery case, run against the Compose stack in the local destination.

**Target Platform**: Linux containers under the single Compose configuration, on both
destinations.

**Project Type**: Two Python services plus two database schemas and broker configuration.

**Performance Goals**: A sustained ingest rate of at least five hundred observations per
second on the local destination, with batches of at most five hundred messages or one
simulation-minute, whichever comes first. Backpressure demonstrated at five times the
sustainable rate.

**Constraints**: No host-clock reads anywhere in the operational path, including the batch
flush interval. The single exception is heartbeat emission, which is on a real-time cadence
with the simulation time carried as payload (ADR-0006) and is marked as such. No entropy in identifiers. No literal hostname, port or path. The ingest
client is the only role with insert permission, enforced by grants. Queue bounded in memory,
with the broker holding the excess.

**Scale/Scope**: Order of ten sensors, three observed properties, one broker, one Postgres
instance, two schemas, and a scenario of hours in simulation time compressed into minutes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. No Wall-Clock Time** — The path's most exposed principle, because every ordinary
  implementation of ingest reaches for the host clock in three places: the observation
  timestamp, the batch flush interval, and the reconnection backoff. All three take the
  simulation clock instead. Heartbeat emission is the one permitted host-clock read, on a
  real-time cadence with the simulation time carried as payload (ADR-0006), marked
  `# harness:allow-wallclock` with that ADR as its reason; the exemption covers emitting a
  heartbeat and nothing else here. Database defaults such as `now()` and `current_timestamp` are
  prohibited in the schema, which is stated in the migration files themselves so nobody adds
  one later out of habit. Broker-assigned timestamps are never used as truth.
- **II. Seeded Randomness and Deterministic Replay** — Sensor noise comes from
  `harness_core.rng.rng_for(stream)` for the sensor's declared stream. Observation identifiers
  are derived from the root seed and the observation's logical position — thing, datastream,
  sequence — so a replay reproduces them exactly and redelivery is idempotent for free. No
  database sequence, no random identifier, no arrival-order key.
- **III. Generated Types Only** — `contracts/schemas/observation.schema.json` is authored here
  as the single definition of the message, and both the sensors and the ingest client use the
  types generated from it. Neither hand-writes the payload shape. The schema obeys the
  conventions owned by the generated-types feature.
- **IV. No Literal Paths or Hosts** — Each service reads one configuration file named by
  `HARNESS_CONFIG` and validates it before any I/O. Broker endpoint, credentials, database
  connection, batch bounds, queue bound, sampling rate and heartbeat interval all come from
  it. The topic namespace prefixes `obs/` and `ctl/` are conventions fixed in the repository
  layout, not configurable, and are the only string constants of that kind permitted.
- **V. No Tracked Entities** — The most sensitive feature in the project for this principle,
  because a store of positions over time is exactly what a track looks like if the vocabulary
  slips. The data model admits environmental measurements only; the vessel is a sampling
  platform and a coordinate. The forbidden-vocabulary gate covers the schema, the migrations
  and both services.
- **VI. Honest Ports** — Neither the observation store nor observation intake is a port, and
  neither is dressed as one. There is no repository interface over Postgres and no pluggable
  intake abstraction. Event publication is wrapped thinly, and documented as marginal, which
  is exactly what makes the two-broker fallback a configuration change.
- **VII. Liveness, Not Configuration** — Both services publish heartbeats on `ctl/heartbeat`
  carrying component identifier, simulation time and status. A service that cannot reach the
  broker publishes nothing and is correctly greyed out rather than falsely lit.

ADR-0005 constrains the message definition this feature owns and is recorded here so the
constraint is not rediscovered downstream. The store holds measured quantities only:
temperature, salinity and pressure, as three Datastreams. Sound speed is derived at the point
of use by the single implementation in `libs/harness_core` and is never published or stored, so
the observed-property enumeration in `contracts/schemas/observation.schema.json` is closed at
three. A derived value stored beside its inputs is a second source of truth that can disagree
with them after a change to the equation, and there would be no way to tell which was right.

No violations. Complexity Tracking is therefore empty and omitted.

## Project Structure

### Documentation (this feature)

```text
specs/007-observation-path/
├── plan.md
├── spec.md
└── tasks.md
```

### Source Code (repository root)

```text
contracts/schemas/
└── observation.schema.json         the single definition of an observation message

services/sensors/                   C-04
├── harness_sensors/
│   ├── __init__.py
│   ├── sensor.py                   sampling, noise from the RNG port
│   ├── publisher.py                thin wrapper over the broker client
│   └── main.py                     config load, validate, run
└── tests/

services/ingest/                    C-05
├── harness_ingest/
│   ├── __init__.py
│   ├── subscriber.py               obs/# subscription, acknowledgement policy
│   ├── validation.py               schema validation and rejection retention
│   ├── batcher.py                  count and simulation-time bounds
│   ├── writer.py                   one transaction per batch
│   ├── backpressure.py             bounded queue, telemetry publication
│   └── main.py
└── tests/

stores/observations/                C-06
├── migrations/                     numbered SQL migrations
├── roles.sql                       ingest role writes, everything else reads
└── README.md                       the data model and why it holds no entities

stores/features/                    C-07
├── provision.py                    synthetic bathymetry and coastlines from the root seed
├── roles.sql                       select only for run-time roles
└── README.md

deploy/broker/
├── mosquitto.conf                  listeners and persistence, values from the env file
├── acl                             sensors publish under obs/ only
└── two-broker/                     the documented physical-separation fallback

tests/integration/
├── test_observation_path.py        publish to store, end to end
├── test_topic_isolation.py         access control refusals
├── test_backpressure.py            burst, bound, drain
└── test_feature_store_readonly.py
```

**Structure Decision**: This feature owns `services/sensors/`, `services/ingest/`,
`stores/observations/`, `stores/features/`, `deploy/broker/` and
`contracts/schemas/observation.schema.json`. It adds one service entry per component to
`deploy/compose.yaml` and one configuration file per component to each of `config/local/` and
`config/droplet/`, following the conventions the Compose deployment feature owns; it does not
otherwise touch `deploy/` or `config/`.

`deploy/broker/` sits inside the Compose feature's territory and is explicitly excluded from
it, because the broker's access control lists are the substance of FR-14 and belong beside the
components they constrain. The Compose feature declares the broker service and supplies its
configuration path; this feature authors the contents.

Two consumers are named here so their boundaries are not disputed later. The monitor
subscribes to `obs/#` directly and does not query the store during normal operation, which is
the control loop feature's business; nothing in this feature provides a query interface for it.
The query layer reads the `observations` schema with a select-only role, which is the query
layer feature's business; this feature provides the role and the schema, not the collection
configuration.
