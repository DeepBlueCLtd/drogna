"""Liveness: the heartbeat every component publishes, starting with the clock.

FR-52 makes the simulation clock's heartbeat the first real liveness signal in drogna,
and Constitution VII forbids any substitute: no mocked traffic, no ``enabled: true``, no
list of components that ought to exist. A component is lit in the client because a
message from it arrived within its declared liveness window, and for nothing else.

Cadence is *real time*, and this is the one thing about heartbeats that must not be got
wrong. ADR-0006: if the interval were measured in simulation time then at rate zero no
heartbeat would ever be due, every liveness window would expire, and a running system
would grey out during exactly the capture FR-53 exists to make meaningful. Liveness
answers "is this process alive?", which is a fact about the host, so the host's clock
answers it. The simulation time a heartbeat carries is payload, not schedule.

Constitution I carries a narrow named exemption for precisely this, and the marker in
this module cites ADR-0006. The exemption covers emitting a heartbeat and evaluating a
liveness window, and nothing else.

The message also carries the component's config digest, which is how a participant's
digest reaches the run manifest without the configuration itself ever leaving the
component.

The schema lives beside this module because feature 003 owns
``contracts/schemas/heartbeat.schema.json`` and has not been written yet. That feature
must adopt this shape unchanged; what is published here is validated against it.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Protocol

from harness_core.clock import Tick
from harness_core.config import validate_document
from harness_core.schemas import schema

__all__ = [
    "HEARTBEAT_TOPIC",
    "Heartbeat",
    "HeartbeatPublisher",
    "HeartbeatStatus",
    "MessagePublisher",
    "heartbeat_schema",
    "validate_heartbeat",
]

HEARTBEAT_TOPIC = "ctl/heartbeat"
"""The control-namespace topic. Sensors publish only under obs/; this is not one."""

# harness:allow-literal-path resource shipped inside this package, not a deployment location
_SCHEMA_FILE = "heartbeat.schema.json"


class HeartbeatStatus(StrEnum):
    """How a component describes itself. Going quiet is not one of the options."""

    STARTING = "starting"
    OK = "ok"
    DEGRADED = "degraded"
    STALLED = "stalled"
    STOPPING = "stopping"


def heartbeat_schema() -> Mapping[str, Any]:
    """The heartbeat schema, as published by whichever component sends one."""
    return schema(_SCHEMA_FILE)


def validate_heartbeat(message: Mapping[str, Any]) -> None:
    """Validate a heartbeat before publishing it. A malformed one is worse than none."""
    validate_document(message, heartbeat_schema(), source=HEARTBEAT_TOPIC)


@dataclass(frozen=True)
class Heartbeat:
    """One heartbeat, in simulation time."""

    component: str
    tick: Tick
    status: HeartbeatStatus = HeartbeatStatus.OK
    run_id: str | None = None
    config_digest: str | None = None
    detail: str = ""
    # Declared by the sender because only the sender knows its own cadence: the receiver
    # holds no table of expected intervals, and a component that declares neither is
    # judged against the receiver's default tolerance (ADR-0006). Both are host seconds.
    heartbeat_interval_seconds: float | None = None
    liveness_window_seconds: float | None = None

    def as_message(self) -> dict[str, Any]:
        message: dict[str, Any] = {
            "component": self.component,
            "sim_time": self.tick.instant.iso(),
            "tick": self.tick.index,
            "status": self.status.value,
            "run_id": self.run_id or self.tick.run_id,
        }
        if self.config_digest is not None:
            message["config_digest"] = self.config_digest
        if self.detail:
            message["detail"] = self.detail
        if self.heartbeat_interval_seconds is not None:
            message["heartbeat_interval_seconds"] = self.heartbeat_interval_seconds
        if self.liveness_window_seconds is not None:
            message["liveness_window_seconds"] = self.liveness_window_seconds
        return message


class MessagePublisher(Protocol):
    """The thin seam over event publication the constitution calls marginal, not a port."""

    def publish(self, topic: str, payload: bytes) -> None: ...


class HeartbeatPublisher:
    """Publishes a heartbeat every ``interval_seconds`` of *host* time (ADR-0006).

    The pattern every later component copies: hold the component id and config digest,
    take the current tick, ask whether the real-time interval has elapsed, validate,
    publish. The host counter is injectable so that a test controls cadence exactly.
    """

    def __init__(
        self,
        publisher: MessagePublisher,
        *,
        component: str,
        interval_seconds: float,
        config_digest: str | None = None,
        topic: str = HEARTBEAT_TOPIC,
        monotonic: Callable[[], float] | None = None,
        declare_interval: bool = True,
        liveness_window_seconds: float | None = None,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("a heartbeat interval is a positive number of host seconds")
        self._publisher = publisher
        self._component = component
        self._interval_seconds = interval_seconds
        self._config_digest = config_digest
        self._topic = topic
        # harness:allow-wallclock ADR-0006, heartbeat cadence and liveness are real time
        self._monotonic = monotonic or time.monotonic
        self._last_published: int | None = None
        self._last_published_at: float | None = None
        # The client reads both declarations and falls back to its own tolerance without
        # them, so a component that publishes its cadence is judged on its own terms.
        # Declaring the interval is the default because the publisher already knows it and
        # a component that heartbeats slowly should not have to be special-cased by the
        # receiver to avoid looking dead.
        self._declared_interval = interval_seconds if declare_interval else None
        if liveness_window_seconds is not None and liveness_window_seconds <= 0:
            raise ValueError("a liveness window is a positive number of host seconds")
        self._liveness_window_seconds = liveness_window_seconds

    @property
    def last_published_tick(self) -> int | None:
        return self._last_published

    def due(self) -> bool:
        """Whether the real-time interval has elapsed since the last heartbeat.

        Deliberately not keyed to ticks: a rate of zero stops simulated time and stops
        nothing else, so a pinned clock keeps its lit components lit.
        """
        if self._last_published_at is None:
            return True
        return self._monotonic() - self._last_published_at >= self._interval_seconds

    def publish(
        self,
        tick: Tick,
        *,
        status: HeartbeatStatus = HeartbeatStatus.OK,
        detail: str = "",
    ) -> Mapping[str, Any]:
        """Publish a heartbeat now, whether or not one was due."""
        heartbeat = Heartbeat(
            component=self._component,
            tick=tick,
            status=status,
            run_id=tick.run_id,
            config_digest=self._config_digest,
            detail=detail,
            heartbeat_interval_seconds=self._declared_interval,
            liveness_window_seconds=self._liveness_window_seconds,
        )
        message = heartbeat.as_message()
        validate_heartbeat(message)
        self._publisher.publish(self._topic, json.dumps(message, sort_keys=True).encode("utf-8"))
        self._last_published = tick.index
        self._last_published_at = self._monotonic()
        return message

    def maybe_publish(
        self,
        tick: Tick,
        *,
        status: HeartbeatStatus = HeartbeatStatus.OK,
        detail: str = "",
    ) -> Mapping[str, Any] | None:
        """Publish if the declared interval has elapsed in host time."""
        if not self.due():
            return None
        return self.publish(tick, status=status, detail=detail)
