"""The ingest loop: take, validate, batch, write, acknowledge — in that order, always.

The order is the whole design.

**Take** from the broker only while the queue has room. At its bound the loop stops taking
and the broker holds the rest (:mod:`harness_ingest.backpressure`).

**Validate** before batching, so nothing invalid can reach the store even by accident
(:mod:`harness_ingest.validation`). A refused message is counted and kept, and it is
acknowledged: it has been dealt with, and leaving it unacknowledged would have the broker
redeliver it for the rest of the run.

**Batch** to a count bound and a simulation-time bound (:mod:`harness_ingest.batcher`).

**Write** one batch in one transaction (:mod:`harness_ingest.writer`). If the store is not
there, the batch is retained rather than abandoned and nothing is acknowledged, so the
broker still holds every message in it.

**Acknowledge** only after the commit. That single ordering is what makes the queue bound
cost latency and not data.

Everything the loop touches is injected, so a test drives the whole path with a manual
clock, a list of deliveries and a connection that is not a database, and gets the same
behaviour the deployed component has.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol, cast

from harness_core.clock import ClockStaleError, Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus

from harness_ingest.backpressure import BoundedQueue
from harness_ingest.batcher import Batcher
from harness_ingest.subscriber import Delivery
from harness_ingest.telemetry import IngestCounters, TelemetryPublisher
from harness_ingest.validation import RejectionLog, validate
from harness_ingest.writer import ObservationWriter, WriteResult

__all__ = ["IngestRun", "IngestService", "Source"]


class Source(Protocol):
    """Where messages come from, and what can be done about them."""

    def deliveries(self, timeout: float = ...) -> Iterator[Delivery]: ...

    def acknowledge(self, deliveries: list[Delivery]) -> None: ...

    def pause(self) -> None: ...

    def resume(self) -> None: ...

    @property
    def paused(self) -> bool: ...


@dataclass(frozen=True)
class IngestRun:
    """What a run of the loop did, for a caller that wants to reconcile counts."""

    received: int
    stored: int
    duplicates: int
    rejected: int
    batches: int
    high_water: int
    stopped_because: str


class IngestService:
    """The single ingestion seam, as a loop over simulation time."""

    def __init__(
        self,
        *,
        source: Source,
        writer: ObservationWriter,
        queue: BoundedQueue,
        batcher: Batcher,
        rejections: RejectionLog,
        telemetry: TelemetryPublisher | None = None,
        heartbeat: HeartbeatPublisher | None = None,
        poll_timeout: float = 0.0,
    ) -> None:
        self._source = source
        self._writer = writer
        self._queue = queue
        self._batcher = batcher
        self._rejections = rejections
        self._telemetry = telemetry
        self._heartbeat = heartbeat
        self._poll_timeout = poll_timeout
        self._counters = IngestCounters()
        self._pending: list[Delivery] = []
        self._degraded = ""

    @property
    def counters(self) -> IngestCounters:
        return self._counters

    @property
    def degraded(self) -> str:
        """Why the component is unhappy, or empty. Carried on the heartbeat's detail."""
        return self._degraded

    # Taking -------------------------------------------------------------------------

    def take(self) -> int:
        """Move what the broker has delivered into the bounded queue. Returns how many."""
        taken = 0
        for delivery in self._source.deliveries(self._poll_timeout):
            self._counters.received += 1
            if not self._queue.offer(delivery):
                # Nothing is discarded: the message is unacknowledged, so it is still the
                # broker's, and the loop stops taking until the backlog drains.
                self._source.pause()
                break
            taken += 1
            if not self._queue.accepting:
                self._source.pause()
                break
        self._counters.queue = self._queue.state()
        return taken

    # Validating and batching ---------------------------------------------------------

    def fill_batch(self, tick: Tick) -> int:
        """Validate queued messages into the batch. Returns how many were accepted."""
        accepted = 0
        for item in self._queue.drain():
            delivery = cast(Delivery, item)
            outcome = validate(delivery.topic, delivery.payload)
            self._pending.append(delivery)
            if outcome.observation is not None:
                self._batcher.add(outcome.observation, tick.instant)
                accepted += 1
            elif outcome.rejection is not None:
                self._rejections.record(outcome.rejection)
        self._counters.rejections = self._rejections.count
        self._counters.rejections_retained = len(self._rejections)
        self._counters.rejections_discarded = self._rejections.discarded
        self._counters.queue = self._queue.state()
        if self._source.paused and self._queue.accepting:
            self._source.resume()
        return accepted

    # Writing ---------------------------------------------------------------------------

    def flush(self, tick: Tick, *, force: bool = False) -> WriteResult | None:
        """Write the batch if a bound has been reached, or if the caller insists."""
        if not force and not self._batcher.due(tick.instant):
            return None
        batch = self._batcher.take()
        if not batch:
            self._acknowledge()
            return None
        try:
            result = self._writer.write(batch)
        except Exception as failure:  # the store is not there, or refused the transaction
            # Retained, not acknowledged, written when the store returns. The whole batch
            # or none of it: the transaction was rolled back by the writer.
            self._batcher.restore(batch, tick.instant)
            self._degraded = f"the store refused a batch of {len(batch)}: {failure}"
            return None
        self._degraded = ""
        self._counters.batches += 1
        self._counters.stored += result.stored
        self._counters.duplicates += result.duplicates
        self._acknowledge()
        return result

    def _acknowledge(self) -> None:
        """Acknowledge everything whose batch has been committed, and nothing before."""
        pending, self._pending = self._pending, []
        if pending:
            self._source.acknowledge(pending)

    # The loop ---------------------------------------------------------------------------

    def on_tick(self, tick: Tick) -> None:
        """One turn: take, validate, write if due, then report."""
        self.take()
        self.fill_batch(tick)
        self.flush(tick)
        if self._telemetry is not None:
            self._telemetry.maybe_publish(tick, self._counters)
        if self._heartbeat is not None:
            status = HeartbeatStatus.DEGRADED if self._degraded else HeartbeatStatus.OK
            self._heartbeat.maybe_publish(tick, status=status, detail=self._degraded)

    def run(self, ticks: Iterable[Tick], *, flush_at_end: bool = True) -> IngestRun:
        """Follow the clock until it stops, then write whatever is still held."""
        stopped = "the clock subscription ended"
        last: Tick | None = None
        source = iter(ticks)
        while True:
            try:
                tick = next(source)
            except StopIteration:
                break
            except ClockStaleError:
                stopped = "the clock went stale"
                break
            last = tick
            self.on_tick(tick)
        if flush_at_end and last is not None:
            self.take()
            self.fill_batch(last)
            self.flush(last, force=True)
            if self._telemetry is not None:
                self._telemetry.publish(last, self._counters)
        if self._heartbeat is not None and last is not None:
            self._heartbeat.publish(last, status=HeartbeatStatus.STOPPING, detail=stopped)
        return IngestRun(
            received=self._counters.received,
            stored=self._counters.stored,
            duplicates=self._counters.duplicates,
            rejected=self._counters.rejections,
            batches=self._counters.batches,
            high_water=self._queue.high_water,
            stopped_because=stopped,
        )

    def report(self) -> dict[str, Any]:
        """The counters, for a caller that wants them without a telemetry publisher."""
        return {
            "received": self._counters.received,
            "stored": self._counters.stored,
            "duplicates": self._counters.duplicates,
            "rejected": self._counters.rejections,
            "batches": self._counters.batches,
            "queue_high_water": self._queue.high_water,
        }
