"""Liveness for the query layer: lit because it is heard from, and for nothing else.

The client draws C-09 grey until a heartbeat from it arrives within its declared window
(Constitution VII). There is no ``enabled: true`` for this component, no list of what ought
to be running, and no synthesised traffic standing in for a service that is not up.

The cadence is real time and the simulation time the heartbeat carries is payload, not
schedule (ADR-0006). A clock rate of zero stops simulated time and stops nothing else, so a
pinned clock leaves the query layer lit — which is the point, because FR-053's capture is
taken at rate zero and a system that greyed itself out during it would be reporting a
falsehood about itself.

Nothing here reads a host clock: :class:`harness_core.heartbeat.HeartbeatPublisher` owns that
exemption and carries the marker for it.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher

__all__ = ["QueryLayerHeartbeat"]


class QueryLayerHeartbeat:
    """Starting, ok while it serves, stopping — and silence when there is nothing to publish to.

    A query layer with no broker configured publishes nothing and says so through
    :attr:`publishing`, rather than publishing to a stub. Nothing lights up, which is true.
    """

    def __init__(
        self,
        publisher: MessagePublisher | None,
        *,
        component: str,
        interval_seconds: float,
        config_digest: str | None = None,
    ) -> None:
        self._publisher = (
            None
            if publisher is None
            else HeartbeatPublisher(
                publisher,
                component=component,
                interval_seconds=interval_seconds,
                config_digest=config_digest,
            )
        )

    @property
    def publishing(self) -> bool:
        return self._publisher is not None

    def starting(self, tick: Tick) -> Mapping[str, Any] | None:
        return self._publish(tick, HeartbeatStatus.STARTING, "opening the coverage store")

    def serving(self, tick: Tick, detail: str = "") -> Mapping[str, Any] | None:
        """Publish if the declared real-time interval has elapsed, and not otherwise."""
        if self._publisher is None:
            return None
        return self._publisher.maybe_publish(tick, status=HeartbeatStatus.OK, detail=detail)

    def degraded(self, tick: Tick, detail: str) -> Mapping[str, Any] | None:
        """Serving, but not everything it should be — an unresolvable current pointer, say."""
        return self._publish(tick, HeartbeatStatus.DEGRADED, detail)

    def stopping(self, tick: Tick, detail: str = "") -> Mapping[str, Any] | None:
        return self._publish(tick, HeartbeatStatus.STOPPING, detail)

    def _publish(
        self, tick: Tick, status: HeartbeatStatus, detail: str
    ) -> Mapping[str, Any] | None:
        if self._publisher is None:
            return None
        return self._publisher.publish(tick, status=status, detail=detail)
