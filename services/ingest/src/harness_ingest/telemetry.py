"""What the ingest client says about itself, on ``ctl/telemetry``.

Queue depth against its bound, the rate observations are reaching the store at, how many
messages were refused as invalid, and any loss the broker reported. Published on a
simulation-time interval, because that is the time the rest of this component runs on; the
heartbeat is the one thing here measured in host time, and it is measured there by
ADR-0006.

The point of publishing rather than logging is that degradation has to be visible to
something other than a person tailing a file. The telemetry component consumes this, and
the client draws it. A backpressure indicator that only appears in a log is an indicator
nobody sees until they already knew.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import MessagePublisher
from harness_types.messages.ingest_telemetry import DrognaIngestTelemetry

from harness_ingest.backpressure import QueueState

__all__ = ["TELEMETRY_TOPIC", "IngestCounters", "TelemetryPublisher"]

TELEMETRY_TOPIC = "ctl/telemetry"
"""One of the two control topics the ingest role may publish on. The other is the heartbeat."""

_MICROS_PER_SECOND = 1_000_000


@dataclass
class IngestCounters:
    """Everything this component counts. Reset by nothing: a run's figures are cumulative."""

    received: int = 0
    stored: int = 0
    duplicates: int = 0
    batches: int = 0
    broker_lost: int = 0
    rejections: int = 0
    rejections_retained: int = 0
    rejections_discarded: int = 0
    queue: QueueState = field(
        default_factory=lambda: QueueState(
            depth=0, bound=1, accepting=True, admitted=0, high_water=0
        )
    )


class TelemetryPublisher:
    """Composes and publishes the report, on an interval measured in simulation time."""

    def __init__(
        self,
        publisher: MessagePublisher | None,
        *,
        component: str,
        interval_seconds: float,
        topic: str = TELEMETRY_TOPIC,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("a telemetry interval is a positive number of simulation seconds")
        self._publisher = publisher
        self._component = component
        self._interval_micros = round(interval_seconds * _MICROS_PER_SECOND)
        self._topic = topic
        self._last_at: SimInstant | None = None
        self._last_stored = 0
        self._last_filled = 0

    @property
    def publishing(self) -> bool:
        return self._publisher is not None

    def due(self, instant: SimInstant) -> bool:
        """Whether the simulation-time interval has passed since the last report."""
        if self._last_at is None:
            return True
        return (instant - self._last_at) >= self._interval_micros

    def compose(self, tick: Tick, counters: IngestCounters) -> dict[str, Any]:
        """The report as a message, with the write rate taken over the interval just ended."""
        elapsed = 0 if self._last_at is None else (tick.instant - self._last_at)
        written = counters.stored - self._last_stored
        rate = 0.0 if elapsed <= 0 else written * _MICROS_PER_SECOND / elapsed
        # The indicator covers the interval, not the instant. A loop that takes and writes
        # within one turn is rarely caught full by a sample, and an indicator that only
        # reported the instant would say a system under sustained backpressure was fine.
        filled = counters.queue.at_bound or counters.queue.filled > self._last_filled
        message: dict[str, Any] = {
            "component": self._component,
            "scenario_run_id": tick.run_id,
            "sim_time": tick.instant.iso(),
            "tick": tick.index,
            "queue": {
                "depth": counters.queue.depth,
                "bound": counters.queue.bound,
                "at_bound": filled,
                "high_water": counters.queue.high_water,
                "filled": counters.queue.filled,
            },
            "write": {
                "batches": counters.batches,
                "stored": counters.stored,
                "duplicates": counters.duplicates,
                "rate_per_simulation_second": rate,
            },
            "rejections": {
                "count": counters.rejections,
                "retained": counters.rejections_retained,
                "discarded": counters.rejections_discarded,
            },
            "broker": {"received": counters.received, "lost": counters.broker_lost},
        }
        validate_telemetry(message)
        return message

    def publish(self, tick: Tick, counters: IngestCounters) -> Mapping[str, Any]:
        """Publish now, whether or not a report was due."""
        message = self.compose(tick, counters)
        if self._publisher is not None:
            self._publisher.publish(
                self._topic, json.dumps(message, sort_keys=True).encode("utf-8")
            )
        self._last_at = tick.instant
        self._last_stored = counters.stored
        self._last_filled = counters.queue.filled
        return message

    def maybe_publish(self, tick: Tick, counters: IngestCounters) -> Mapping[str, Any] | None:
        """Publish if the interval has passed in simulation time."""
        if not self.due(tick.instant):
            return None
        return self.publish(tick, counters)


def validate_telemetry(message: Mapping[str, Any]) -> None:
    """Validate against the generated type before publishing. A malformed report misleads."""
    DrognaIngestTelemetry.model_validate(dict(message))
