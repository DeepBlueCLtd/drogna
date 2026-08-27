"""Liveness for the component that owns time — and is not governed by it.

This is drogna's first heartbeat (FR-52). Nothing has ever lit a box in the client's
shell, because nothing has ever published one, so what happens here is the pattern every
later component copies. It is therefore deliberately thin: the publication itself is
:class:`harness_core.heartbeat.HeartbeatPublisher`, unchanged, and what this module adds is
the two things the clock knows that the shared helper does not.

**Cadence is real time, and here that is not a detail.** ADR-0006: if the interval were
measured in simulation time, then at rate zero no heartbeat would ever be due, every
liveness window would expire, and a running system would grey out during exactly the
capture FR-53 exists to make meaningful. The clock is the component that can make that
mistake most easily, since it is holding the simulation time that is not advancing. It
does not: a rate of zero stops simulated time and stops nothing else, and the heartbeat
carries the pinned simulation time as payload rather than taking a schedule from it. The
host-clock read this needs lives in ``HeartbeatPublisher`` under Constitution I's named
exemption; there is no second one here.

**The two declarations.** The heartbeat master gained ``heartbeat_interval_seconds`` and
``liveness_window_seconds`` for ADR-0006, and the client already reads both: a sender
declares its own cadence because only the sender knows it, and the receiver holds no table
of expected intervals — which would be a list of components that ought to exist, and so
exactly what Constitution VII forbids. ``HeartbeatPublisher`` does not yet carry them, so
they are added here, in a publisher that decorates the one the helper writes to and
revalidates the result. Decorating rather than reimplementing is the point: what later
components copy stays the shared helper, and the gap is filled in one visible place until
the helper closes it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import (
    HeartbeatPublisher,
    HeartbeatStatus,
    MessagePublisher,
    validate_heartbeat,
)

__all__ = ["ClockHeartbeat"]


class _Declaring:
    """Adds the sender's two liveness declarations to each heartbeat on its way out.

    Validation happens again after the additions, and must: the master closes the message
    with ``additionalProperties: false``, so a key added after the helper validated is a
    key nothing has checked.
    """

    def __init__(
        self,
        publisher: MessagePublisher,
        *,
        interval_seconds: float,
        window_seconds: float,
    ) -> None:
        self._publisher = publisher
        self._interval_seconds = interval_seconds
        self._window_seconds = window_seconds

    def publish(self, topic: str, payload: bytes) -> None:
        message: dict[str, Any] = json.loads(payload.decode("utf-8"))
        message["heartbeat_interval_seconds"] = self._interval_seconds
        message["liveness_window_seconds"] = self._window_seconds
        validate_heartbeat(message)
        self._publisher.publish(topic, json.dumps(message, sort_keys=True).encode("utf-8"))


class ClockHeartbeat:
    """Starting, ok, stalled, stopping — and silence when there is nothing to publish to."""

    def __init__(
        self,
        publisher: MessagePublisher | None,
        *,
        component: str,
        interval_seconds: float,
        window_seconds: float,
        config_digest: str | None = None,
        monotonic: Any = None,
    ) -> None:
        self._publisher: HeartbeatPublisher | None = None
        if publisher is not None:
            self._publisher = HeartbeatPublisher(
                _Declaring(
                    publisher,
                    interval_seconds=interval_seconds,
                    window_seconds=window_seconds,
                ),
                component=component,
                interval_seconds=interval_seconds,
                config_digest=config_digest,
                monotonic=monotonic,
            )

    @property
    def publishing(self) -> bool:
        """Whether anything is actually being published. Nobody should have to guess."""
        return self._publisher is not None

    @property
    def last_published_tick(self) -> int | None:
        return None if self._publisher is None else self._publisher.last_published_tick

    def due(self) -> bool:
        """Whether the declared real-time interval has elapsed."""
        return self._publisher is not None and self._publisher.due()

    def beat(
        self,
        tick: Tick,
        *,
        status: HeartbeatStatus = HeartbeatStatus.OK,
        detail: str = "",
    ) -> Mapping[str, Any] | None:
        """Publish now, whether or not one was due."""
        if self._publisher is None:
            return None
        return self._publisher.publish(tick, status=status, detail=detail)

    def maybe_beat(
        self,
        tick: Tick,
        *,
        status: HeartbeatStatus = HeartbeatStatus.OK,
        detail: str = "",
    ) -> Mapping[str, Any] | None:
        """Publish if the declared real-time interval has elapsed, and not otherwise.

        Not keyed to ticks, and that is the whole of ADR-0006: a pinned clock emits no
        ticks and keeps its lit components lit.
        """
        if self._publisher is None:
            return None
        return self._publisher.maybe_publish(tick, status=status, detail=detail)
