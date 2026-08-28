# The observation path

Written 28 August 2026 for `specs/007-observation-path` T045, which asked for the path end
to end, the two failure modes and how each is bounded, in one place.

It is a synthesis rather than a fifth source. Three READMEs are the authority and this note
carries no fact they do not:

| Source | What it owns |
|---|---|
| `deploy/broker/README.md` | the namespace split, the roles, the two-broker fallback |
| `services/ingest/README.md` | the take-validate-batch-write order, and the measured figures |
| `stores/observations/README.md` | the data model, and what it deliberately will not hold |

Where this note and one of those disagree, the README is right and this file is stale.

## The path, end to end

A measurement makes five hops between the thing that invents it and the thing that answers
a query about it. Each hop is one component, each hop has one job, and the design is mostly
in the order rather than in any of the parts.

```text
  C-04 sensors ──publish──▶ C-03 broker ──deliver──▶ C-05 ingest ──commit──▶ C-06 store
        │                    obs/#                        │                       │
        └─subscribe ctl/clock─┘                           └─ctl/heartbeat,        └─SELECT──▶ C-09 query
                                                            ctl/telemetry                    C-16 telemetry
```

**A sensor invents a number and publishes it.** Simulated instruments sample the synthetic
ocean and publish on the observation namespace. A sensor holds no host clock: it paces
itself on the simulation time it receives on `ctl/clock`, which is the one control topic it
may read and the only reason it is allowed onto that branch at all.

**The broker carries it, on one of two namespaces that never mix.** Observations travel
under `obs/`, internal control events under `ctl/`. The separation is an access control
list rather than a convention — Mosquitto denies by default, so an omitted rule is a
denial and not a hole.

**The ingest client takes it, and does five things in an order that is the whole design.**
Take from the broker only while the queue has room; validate against the generated
observation type before batching, so nothing invalid can reach the store even by accident;
batch to a count bound and a simulation-time bound; write one batch in one transaction; and
acknowledge only after the commit. That last clause is what makes the queue's bound cost
latency and never data.

**The store holds it, and cannot be persuaded to hold anything else.** One Postgres
instance with PostGIS carries an `observations` schema of six tables — the six SensorThings
Part 1 entity sets this harness serves. Exactly one role holds `INSERT` on it. Nobody holds
`UPDATE` or `DELETE`, because a measurement is not amended after the fact and a store whose
history can be rewritten cannot be replayed against.

**The read side arrives by a different door.** The query layer and telemetry read the
schema through select-only roles. The monitor does not read it at all: it subscribes to
`obs/#` directly. Nothing on the read side takes part in the write path.

### Two properties the path holds that are easy to miss

**There is one time in the schema, and it is simulation time.** No arrival time, no
insertion time, no column with a default — the migration says so in its own comment block
so that nobody adds one out of habit. An observation that arrives late is stored on its own
time rather than at the end of the file.

**Every primary key is derived, not generated.** The publisher derives each identifier from
the run's root seed and the record's logical position. That is what makes two runs from one
root seed produce the same store, and it is the same property that makes redelivery a
no-op: under at-least-once delivery the broker will eventually send a message twice, and
the second copy finds its row already there. The duplicate is counted rather than absorbed
in silence, because a rising count is how you learn the broker is redelivering.

## The first failure mode: backpressure, and what bounds it

The SRD assigns ingest backpressure to the ingest client as its owned failure mode, so the
figures are measured rather than estimated — a burst through a real Mosquitto into a real
PostGIS, from the images `deploy/compose.yaml` pins, on the local destination.

| Figure | Measured |
|---|---|
| Sustained rate, 3 000 observations | 1 880 observations per second |
| Sustained rate, 20 000 observations | 2 303 observations per second |
| Batches for 20 000 observations | 11 |
| Broker absorbs the 20 000-message burst | 0.52 s |
| Drains into the store | 8.7 s |
| Queue depth reached, against a bound of 5 000 | 2 000 |
| Observations lost | 0 |

The plan asked for five hundred a second locally. It is roughly four times that, and the
reason is that a batch is one transaction: eleven commits for twenty thousand rows.

Three bounds sit in the flow, and they bind in this order.

1. **The broker's in-flight window binds first.** The client acknowledges a message only
   once the batch containing it has committed, so the broker will not send more than
   `max_inflight_messages` unacknowledged messages. The measured high-water mark of 2 000
   is exactly that window, and the queue's bound of 5 000 was never reached.

   This is worth knowing before choosing a batch size, because it is how a configured value
   becomes decorative. At Mosquitto's default window of twenty, a batch bound of five
   hundred messages can never be reached by count: every batch flushes on its simulation-time
   bound instead, and the configured batch size decides nothing. Watching that happen is
   what put an explicit `max_inflight_messages` in `deploy/broker/mosquitto.conf` with a
   comment saying what it decides.

2. **The client's own queue binds second.** When it fills, the client stops taking. It does
   not discard and it does not grow, and what it has not taken it has not acknowledged — so
   the broker still holds it.

3. **The broker's queue for a client that is not taking is the store of last resort.**
   Beyond `max_queued_messages` the broker drops, and the drop is counted and published on
   `ctl/telemetry` rather than found later as a hole in the data.

**The indicator reports the interval, not the instant.** A loop that takes and writes within
one turn is almost never sampled while its queue is full, so an instantaneous indicator
would report a system under sustained backpressure as comfortable — which is the failure
that publishing it at all was meant to prevent. `queue.filled` counts how many times the
bound was reached, and the indicator is derived from that count.

`tests/integration/test_backpressure.py` is what holds this: it drives a burst twelve times
the queue's bound, with the bound set low enough to be the binding constraint, and asserts
that the queue never exceeds it, that the indicator appears on `ctl/telemetry` and then
clears, and that every published observation is in the store exactly once once the backlog
has drained.

### The neighbouring case: when the store is not there

Not a third bound, but the same discipline. The batch is retained, nothing in it is
acknowledged, and it is written when the store returns. The transaction was rolled back, so
the store holds the whole batch or none of it; the broker still holds every message in it;
nothing is lost and nothing is written twice. The component reports itself degraded on its
heartbeat while that lasts.

## The second failure mode: cross-contamination, and what bounds it

The broker owns this one. Two namespaces on one broker is a claim that needs holding up,
and what holds it is a list of rules rather than a habit.

| Role | May publish | May subscribe |
|---|---|---|
| `drogna_sensor` | `obs/#`, `ctl/heartbeat` | `ctl/clock` only |
| `drogna_ingest` | `ctl/heartbeat`, `ctl/telemetry` | `obs/#`, `ctl/clock` |
| `drogna_control` | `ctl/#` | `ctl/#`, `obs/#` |
| `drogna_viewer` | nothing at all | `ctl/#` |
| `drogna_query` | `ctl/heartbeat` only | nothing at all |

Credentials are per role rather than per client instance, so ten sensors share one role:
adding a sensor needs no rule and gains no permission.

**Two exceptions had to be argued for, and each has a record.** A sensor may read
`ctl/clock`, which the requirement's wording would refuse it — but a component with no clock
sample can only pace itself on the host clock, which the constitution forbids outright, and
that conflict is ADR-0012. A sensor may also write `ctl/heartbeat`: without it the heartbeat
is denied at the broker *silently*, the client's local return code being zero for a message
it accepted and never delivered, so the sensor announces itself to nobody and can never
light its box in the shell. That is ADR-0015.

What follows from the exceptions is what the tests must assert. The property is not that a
sensor's subscription to `ctl/#` is refused; it is that subscribing to `ctl/#` delivers the
clock **and nothing else**. On the write side it is not that the sensor role is refused
`ctl/`; it is that it is granted exactly `ctl/heartbeat` and refused every other control
topic by name.

**A mechanical detail decides how any of this can be tested at all.** Mosquitto grants every
subscription and enforces read rules *at delivery*, so a denied subscription is not a failed
SUBACK — it is nothing arriving. Every subscription assertion in
`tests/integration/test_topic_isolation.py` is therefore a delivery assertion: an authorised
publisher sends, and the subscriber under test either receives it or does not. A test that
checked the SUBACK would pass against a broker enforcing nothing, which is the shape of
check this repository has been caught by before.

### The path enforces the namespace at both ends

The broker is not the only guard. A control-shaped message published on an `obs/` topic is
refused at the ingest client as failing the observation schema, so namespace discipline is
enforced at the far end too rather than resting on the access control list alone.

### The fallback, if one broker is not enough

Physical separation onto two brokers is documented and demonstrated: `deploy/broker/two-broker/`
holds a control broker's configuration and a Compose overlay that adds the service without
editing `deploy/compose.yaml`. Taking it is a change to four values — a second config
directory, the overlay in the invocation, each component's `broker.url`, and the proxy's
upgrade target — and no source file.

It has one consequence that is not free, and it is recorded rather than smuggled in: the
sensors and the ingest client each need both namespaces, which is one connection today and
two under the fallback. A component's configuration carries one broker endpoint, so the
fallback needs the shared configuration schema to gain an optional second. That schema
belongs to feature 001, so feature 007 did not amend it.

## What the store will not hold, and why that is load-bearing

This is the place in the harness where the constitution's vocabulary rule is easiest to
lose, because a store of positions over time is what an entity's history looks like if the
words slip. The safeguard is not the vocabulary gate — that stops one being added by habit.
The safeguard is that the model would not support one, and the argument is by what is
missing rather than by what is present:

- **Nothing associates two observations into a sequence.** No column joins one to the next,
  no identifier persists across positions, and there is no notion of order beyond phenomenon
  time, which is a property of the world rather than of anything in it.
- **Nothing carries motion.** No heading, speed, course, bearing or range. A position is
  where a measurement was taken.
- **Nothing carries identity across positions.** A `thing` is the platform doing the
  sampling, not something being observed. The harness never observes anything; it measures
  temperature, salinity and pressure and stores the numbers.

Two absences are decisions rather than omissions. **Sound speed is never stored** — derived
at the point of use by the single implementation in `libs/harness_core`, because a derived
value stored beside its inputs is a second source of truth that can disagree with them after
a change to the equation, with no way to tell which was right (ADR-0005). The observed-property
enumeration is closed at three, so a fourth datastream cannot arrive without amending that
decision. And **no host-clock value is stored**, as above: one time, and it is simulation
time.

## How the schema is applied, and what stops two instances disagreeing

`stores/observations/apply.py` writes the whole provisioning run — migrations in order, then
grants — to standard output, and the seeding path pipes it into `psql`. It is one
transaction: a run either leaves the schema as the directory describes it or leaves it as it
found it.

Each migration carries a digest guard. The run records every migration's name and digest and
refuses to proceed if a recorded digest no longer matches the file, which is what makes "a
fresh instance and a migrated one agree" a check rather than a hope. The grants are asserted
after they are made, so a drifted grant fails the provisioning run rather than being
discovered later by a component that could write something it should not have been able to.
