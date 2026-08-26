"""Liveness: the heartbeat every component publishes, starting with the clock.

FR-52 makes the simulation clock's heartbeat the first real liveness signal in drogna,
and Constitution VII forbids any substitute: no mocked traffic, no ``enabled: true``, no
list of components that ought to exist. A component is lit in the client because a
message from it arrived within its declared liveness window, and for nothing else.

Two consequences shape this module. The interval is declared in *ticks*, not host
seconds, so liveness is judged in simulation time: a pinned clock ages nothing, and a
rate change does not make a working component look dead. And the message carries the
component's config digest, which is the route by which a participant's digest reaches
the run manifest without the configuration itself ever leaving the component.

The schema lives beside this module because feature 003 owns
``contracts/schemas/heartbeat.schema.json`` and has not been written yet. That feature
must adopt this shape unchanged; what is published here is validated against it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from importlib import resources
from typing import Any, Protocol

from harness_core.clock import Tick
from harness_core.config import validate_document

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

_SCHEMA_FILE = "heartbeat.schema.json"


class HeartbeatStatus(StrEnum):
    """How a component describes itself. Going quiet is not one of the options."""

    STARTING = "starting"
    OK = "ok"
    DEGRADED = "degraded"
    STALLED = "stalled"
    STOPPING = "stopping"


@lru_cache(maxsize=1)
def heartbeat_schema() -> Mapping[str, Any]:
    """The heartbeat schema, as published by whichever component sends one."""
    package = resources.files("harness_core.schemas")
    return json.loads(package.joinpath(_SCHEMA_FILE).read_text(encoding="utf-8"))


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
        return message


class MessagePublisher(Protocol):
    """The thin seam over event publication the constitution calls marginal, not a port."""

    def publish(self, topic: str, payload: bytes) -> None: ...


class HeartbeatPublisher:
    """Publishes a heartbeat every ``interval_ticks`` of simulation time.

    The pattern every later component copies: hold the component id and config digest,
    take a tick, decide by tick arithmetic whether one is due, validate, publish.
    """

    def __init__(
        self,
        publisher: MessagePublisher,
        *,
        component: str,
        interval_ticks: int,
        config_digest: str | None = None,
        topic: str = HEARTBEAT_TOPIC,
    ) -> None:
        if interval_ticks < 1:
            raise ValueError("a heartbeat interval is at least one tick")
        self._publisher = publisher
        self._component = component
        self._interval_ticks = interval_ticks
        self._config_digest = config_digest
        self._topic = topic
        self._last_published: int | None = None

    @property
    def last_published_tick(self) -> int | None:
        return self._last_published

    def due(self, tick: Tick) -> bool:
        """Whether a heartbeat is due at this tick.

        Keyed to tick values rather than to a count of received ticks, because in
        accelerated mode a consumer sees gaps and a count would drift.
        """
        if self._last_published is None:
            return True
        return tick.index - self._last_published >= self._interval_ticks

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
        )
        message = heartbeat.as_message()
        validate_heartbeat(message)
        self._publisher.publish(self._topic, json.dumps(message, sort_keys=True).encode("utf-8"))
        self._last_published = tick.index
        return message

    def maybe_publish(
        self,
        tick: Tick,
        *,
        status: HeartbeatStatus = HeartbeatStatus.OK,
        detail: str = "",
    ) -> Mapping[str, Any] | None:
        """Publish if the declared interval has elapsed in simulation time."""
        if not self.due(tick):
            return None
        return self.publish(tick, status=status, detail=detail)
