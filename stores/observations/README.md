# The observation store (C-06)

One Postgres instance with PostGIS carries two schemas: `observations`, described here, and
`features`, described in `stores/features/README.md`. Two schemas rather than two instances,
because the split is conceptual and doubling the operational surface would buy nothing
(SRD FR-12).

Everything in this directory is applied by script. `apply.py` writes the whole provisioning
run — the migrations in order, then the grants — to standard output, and the seeding path
pipes it into `psql`:

```sh
python stores/observations/apply.py | psql "$DSN"
```

It is one transaction. A provisioning run either leaves the schema as this directory
describes it or leaves it as it found it, and each migration carries a digest guard, so a
migration edited after it was applied stops the run instead of letting a fresh instance and
a migrated one quietly disagree (SRD NFR-07).

---

## What the data model admits

Six tables, and they are the six entity sets of SensorThings Part 1 that this harness
serves: `thing`, `sensor`, `observed_property`, `datastream`, `feature_of_interest` and
`observation`. SensorThings is the vocabulary and the shape of the data, and nothing more —
no SensorThings server takes part in the write path, and the read path's own subset is the
query layer's business (FR-16, ADR-0004).

| Table | What it holds |
|---|---|
| `thing` | A sampling platform: the simulated vessel, or a fixed sampling point. |
| `sensor` | A simulated instrument and its declared noise model. |
| `observed_property` | Temperature, salinity or pressure. There is no fourth. |
| `datastream` | A Thing, a Sensor and an ObservedProperty with a unit of measurement. |
| `feature_of_interest` | The place an observation pertains to, as GeoJSON. |
| `observation` | One measured value: an identifier, a phenomenon time, a result, a position and a depth. |

### Why none of this is an entity of any other kind

This is the place in drogna where Constitution V is easiest to lose, and it is worth being
explicit rather than reassuring. A store of positions over time is what an entity's history
looks like if the vocabulary slips, so the question is not whether the word is used but
whether the model would support one.

It would not, and here is what is missing rather than what is present.

- **Nothing associates two observations into a sequence.** An observation carries its own
  position and its own simulation time. There is no column joining one to the next, no
  identifier that persists across positions and no notion of order beyond phenomenon time,
  which is a property of the world rather than of anything in it.
- **Nothing carries motion.** No heading, no speed, no course, no bearing, no range. A
  position is where a measurement was taken.
- **Nothing carries identity across positions.** A `thing` is the platform doing the
  sampling, not something being observed. The harness never observes anything; it measures
  temperature, salinity and pressure and stores the numbers.
- **The vessel is a coordinate and a sampler.** Its positions are where samples were taken.
  A route through them is a sampling track and is not a track of anything else — which is
  the only sense in which the word applies here, and it is the sense the SRD uses (§1.1).

The forbidden-vocabulary gate covers this schema, the migrations and both services in the
path. It is not the safeguard, though: the safeguard is that no column here would let one
be reconstructed, and the gate is what stops one being added by habit.

### What is deliberately absent

- **Sound speed.** Derived at the point of use by the single implementation in
  `libs/harness_core`, and never stored (ADR-0005). A derived value stored beside its
  inputs is a second source of truth that can disagree with them after a change to the
  equation, and there would be no way to tell which was right. The observed-property
  enumeration in `contracts/schemas/observation.schema.json` is closed at three, so a
  fourth datastream cannot arrive without that decision being amended.
- **Arrival time, insertion time, and any other host-clock value.** There is exactly one
  time in this schema and it is `phenomenon_time`, the simulation instant the sensor
  measured at. No column takes a default, which the migration says in its own comment
  block so that nobody adds one out of habit (Constitution I). Ordering and querying are by
  simulation time, so an observation that arrives late is stored on its own time rather
  than at the end.
- **A sequence or a generated identity.** Every primary key is derived by the publisher
  from the run's root seed and the record's logical position. That is what makes two runs
  from one root seed produce the same store, and it is also what makes redelivery under
  at-least-once delivery a no-op rather than a duplicate row.

---

## Who may write

Exactly one role: the ingest client's. `roles.sql` grants `INSERT` to `drogna_ingest` and
to nobody else, grants `SELECT` to the query layer's and telemetry's roles, and then asserts
the result — a provisioning run fails if a grant has drifted rather than leaving it to be
discovered by a component that could write something it should not have been able to
(FR-18, SC-003).

There is no `UPDATE` and no `DELETE` for anybody. A measurement is not amended after the
fact, and a store whose history can be rewritten cannot be replayed against.

Roles are created without passwords. The deploy-time render assigns each role's password
from the destination's generated secrets, and no password value appears in a tracked file.

---

## Migrations

Numbered SQL files in `migrations/`, applied in that order and never edited afterwards. A
change is a new migration. `apply.py` records each one's name and digest in
`observations.migration`, and refuses to proceed if a recorded digest no longer matches the
file, which is what makes "a fresh instance and a migrated one agree" a check rather than a
hope.

---

## What reads this schema

- **The query layer (C-09)** serves a stated subset of SensorThings Part 1 over these
  tables, through a select-only role. The table names it uses come from its own
  configuration and match the ones here; this feature provides the schema and the role, and
  the collection configuration is feature 008's.
- **Telemetry (C-16)** reads through its own select-only role.
- **The monitor (C-11) does not.** It subscribes to `obs/#` directly and derives sound speed
  at the point of use, and does not query this store during normal operation.
