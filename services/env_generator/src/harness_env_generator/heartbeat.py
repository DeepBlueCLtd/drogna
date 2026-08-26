"""Liveness for a component that finishes.

The generator runs once at scenario start and stops. While it runs it publishes on
``ctl/heartbeat`` with its component id, the simulation time and a status, and when it is
done it publishes ``stopping`` and goes quiet. The shell then shows it dark once its
declared window elapses, and that is *correct*: it is no longer running, and Constitution
VII forbids correcting for it. A component lit because a configuration file says it ought
to exist is the failure that principle exists to prevent, and a short-lived component that
kept its light on would be the same failure wearing a different hat.

The publication itself is :class:`harness_core.heartbeat.HeartbeatPublisher`, unchanged.
What this module adds is the shape of a batch component's life — starting, ok while the
sweep runs, stopping — and the decision about what to do when no publisher has been
configured, which is: nothing, loudly. A generator with no broker to publish to does not
invent one, and does not publish to a stub. Nothing lights up, which is true.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher

__all__ = ["GeneratorHeartbeat"]


class GeneratorHeartbeat:
    """Starting, ok, stopping — and silence when there is nothing to publish to."""

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
        """Whether anything is actually being published. Nobody should have to guess."""
        return self._publisher is not None

    def starting(self, tick: Tick) -> Mapping[str, Any] | None:
        return self._publish(tick, HeartbeatStatus.STARTING, "authoring the world")

    def working(self, tick: Tick, detail: str = "") -> Mapping[str, Any] | None:
        """Publish if the declared real-time interval has elapsed, and not otherwise."""
        if self._publisher is None:
            return None
        return self._publisher.maybe_publish(tick, status=HeartbeatStatus.OK, detail=detail)

    def stopping(self, tick: Tick, detail: str = "") -> Mapping[str, Any] | None:
        return self._publish(tick, HeartbeatStatus.STOPPING, detail)

    def _publish(
        self, tick: Tick, status: HeartbeatStatus, detail: str
    ) -> Mapping[str, Any] | None:
        if self._publisher is None:
            return None
        return self._publisher.publish(tick, status=status, detail=detail)
