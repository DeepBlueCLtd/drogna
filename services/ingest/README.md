# The ingest client (C-05)

The single seam through which an observation reaches the store. It subscribes to `obs/#`,
validates every message against the type generated from
`contracts/schemas/observation.schema.json`, batches, and writes each batch in one
transaction as the only database role that holds `INSERT` on the `observations` schema.

The order it does those things in is the whole design:

**Take** from the broker only while the queue has room. **Validate** before batching, so
nothing invalid can reach the store even by accident. **Batch** to a count bound and a
simulation-time bound. **Write** one batch in one transaction. **Acknowledge** only after
the commit — which is what makes the queue's bound cost latency and never data.

---

## Backpressure, measured

The SRD assigns ingest backpressure to this component as its owned failure mode, so the
numbers below are measured rather than estimated. They come from a burst published through
a real Mosquitto into a real PostGIS, both from the images `deploy/compose.yaml` pins, on
the local destination.

| Figure | Measured |
|---|---|
| Sustained rate, 3 000 observations | 1 880 observations per second |
| Sustained rate, 20 000 observations | 2 303 observations per second |
| Batches for 20 000 observations | 11 |
| Time for the broker to absorb the 20 000-message burst | 0.52 s |
| Time to drain it into the store | 8.7 s |
| Queue depth reached, against a bound of 5 000 | 2 000 |
| Observations lost | 0 |

The plan asked for at least five hundred a second on the local destination. It is roughly
four times that, and the figure is what it is because a batch is one transaction: eleven
commits for twenty thousand rows.

### What actually bounds the flow, in order

1. **The broker's in-flight window.** The client acknowledges a message only once the batch
   containing it has been committed, so the broker will not send more than
   `max_inflight_messages` unacknowledged messages. That number, not the queue's bound, is
   the first ceiling the flow meets — the measured high-water mark of 2 000 above is
   exactly the window, with the queue's bound of 5 000 never reached.

   This is worth knowing before setting a batch size. At Mosquitto's default window of 20,
   a batch bound of 500 messages can never be reached by count: every batch flushes on its
   simulation-time bound instead, and the configured batch size means nothing. Watching that
   happen is what put an explicit `max_inflight_messages` in `deploy/broker/mosquitto.conf`
   with a comment saying what it decides.

2. **The queue's bound.** When the client's own queue fills, it stops taking messages. It
   does not discard them and it does not grow; what it has not taken it has not
   acknowledged, so the broker still holds it.

3. **The broker's queue for a client that is not taking.** `max_queued_messages` is the
   store of last resort. Beyond it the broker drops, and the drop is counted and published
   on `ctl/telemetry` rather than found later as a hole in the data.

`tests/integration/test_backpressure.py` drives a burst twelve times the queue's bound with
the bound set low enough to be the binding constraint, and asserts the queue never exceeds
it, that the indicator appears on `ctl/telemetry` and then clears, and that every published
observation is in the store exactly once when the backlog has drained.

---

## What it publishes

Two topics, and its access control list allows exactly those two:

- `ctl/heartbeat` — component id, simulation time and status, at the interval from
  configuration. Real time by ADR-0006, with the simulation time carried as payload; a clock
  rate of zero stops simulated time and stops nothing else.
- `ctl/telemetry` — queue depth against its bound, the write rate, the rejection count and
  any broker-side loss, on a **simulation**-time interval like every other interval in this
  component.

The backpressure indicator on `ctl/telemetry` reports the interval rather than the instant.
A loop that takes and writes within one turn is almost never sampled while its queue is
full, so an instantaneous indicator would report a system under sustained backpressure as
comfortable — which is the failure that publishing it at all was meant to prevent.

---

## What it refuses

A message that fails validation is never written, is counted, and is kept with the reason it
was refused, up to the bound in configuration. Reaching that bound is itself reported: the
count of discarded rejections rises, rather than the oldest record quietly vanishing.

A rejected message is still acknowledged. It has been dealt with, and leaving it
unacknowledged would have the broker redeliver it for the rest of the run.

Two cases are worth naming because they are the ones the specification cares about. A batch
containing both valid and invalid messages stores the valid ones — it is not abandoned
wholesale. And a control-shaped message published on an `obs/` topic is refused here as
failing the observation schema, so namespace discipline is enforced at both ends of the
path rather than at the broker alone.

---

## When the store is not there

The batch is retained, nothing in it is acknowledged, and it is written when the store
returns. The transaction was rolled back, so the store holds either the whole batch or none
of it; the broker still holds every message in it; nothing is lost and nothing is written
twice. The component reports itself degraded on its heartbeat while that lasts.

---

## Redelivery

Under at-least-once delivery the broker will sometimes deliver a message twice. Every row is
keyed by the deterministic identifier the publisher derived from the run's root seed and the
observation's logical position, so the second copy finds its row already there and changes
nothing. The duplicate is counted rather than absorbed in silence: a rising count is how you
learn the broker is redelivering.
