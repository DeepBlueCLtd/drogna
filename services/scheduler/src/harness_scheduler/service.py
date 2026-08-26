"""The scheduler as a running component: divergence in, at most one request out.

Two subscriptions. ``ctl/divergence`` is what it decides about; ``ctl/run-published`` is how
it learns that the run it asked for exists, which is what clears the outstanding slot. It
does not watch the coverage store and does not ask the query layer whether anything has
changed (FR-025): the announcement is the notification.

The only interval this component measures in real time is the heartbeat (ADR-0006). The
minimum interval and the outstanding timeout are simulation time, from the clock port,
because they are statements about the scenario and not about the host.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatStatus, MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import RandomStreams
from harness_types.config.scheduler import DrognaSchedulerConfiguration

from harness_scheduler import publish
from harness_scheduler.outstanding import OutstandingRegister
from harness_scheduler.policy import Decision, RunPolicy, Verdict
from harness_scheduler.run_id import run_identifier

__all__ = ["DIVERGENCE_TOPIC", "RUN_PUBLISHED_TOPIC", "SchedulerService"]

DIVERGENCE_TOPIC = "ctl/divergence"
RUN_PUBLISHED_TOPIC = "ctl/run-published"


class SchedulerService:
    """One scheduler process, minus the transport."""

    def __init__(
        self,
        settings: DrognaSchedulerConfiguration,
        *,
        clock: Clock,
        publisher: MessagePublisher | None = None,
        config_digest: str | None = None,
    ) -> None:
        self._settings = settings
        self._component = settings.component.id
        self._clock = clock
        self._publisher = publisher
        self._randomness = RandomStreams(settings.seed.root)
        self._register = OutstandingRegister(
            timeout_seconds=settings.scheduler.outstanding_timeout_seconds
        )
        self._policy = RunPolicy(
            self._register,
            minimum_interval_seconds=settings.scheduler.minimum_interval_seconds,
        )
        self._heartbeat = (
            None
            if publisher is None
            else publish.heartbeat_publisher(
                publisher,
                component=self._component,
                interval_seconds=settings.component.heartbeat_interval_seconds or 5.0,
                config_digest=config_digest,
            )
        )
        self._ordinal = 0
        self._decisions: list[dict[str, Any]] = []
        self._requests: list[dict[str, Any]] = []

    # ------------------------------------------------------------------ state

    @property
    def decisions(self) -> tuple[dict[str, Any], ...]:
        """One record per divergence received, in the order they were received."""
        return tuple(self._decisions)

    @property
    def requests(self) -> tuple[dict[str, Any], ...]:
        return tuple(self._requests)

    @property
    def outstanding(self) -> str | None:
        held = self._register.current
        return None if held is None else held.identifier

    @property
    def abandoned(self) -> int:
        return self._register.abandoned

    # ------------------------------------------------------------- messages

    def handle(self, topic: str, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Route one message. Returns the run request published, if one was."""
        if topic == DIVERGENCE_TOPIC:
            return self.handle_divergence(payload)
        if topic == RUN_PUBLISHED_TOPIC:
            self.handle_run_published(payload)
        return None

    def handle_divergence(self, payload: bytes | str | Mapping[str, Any]) -> dict[str, Any] | None:
        """Decide about one divergence, record the decision, and publish if accepted."""
        divergence = _decode(payload)
        tick = self._clock.tick()
        now = tick.instant.micros

        verdict = self._policy.consider(now_micros=now)
        run_id = None
        request = None
        if verdict.accepted:
            run_id = run_identifier(self._randomness, self._ordinal)
            request = publish.run_request_message(
                divergence,
                component=self._component,
                tick=tick,
                run_id=run_id,
                ensemble_size=self._settings.scheduler.ensemble_size,
                initialisation_offset_seconds=(
                    self._settings.scheduler.initialisation_offset_seconds
                ),
            )
            self._register.open(
                run_id, at_micros=now, justified_by=str(divergence.get("divergence_id", ""))
            )
            self._policy.requested(now_micros=now)
            self._ordinal += 1
            self._requests.append(request)
            if self._publisher is not None:
                publish.publish_run_request(self._publisher, request)

        self._record(verdict, tick=tick, divergence=divergence, run_id=run_id)
        return request

    def handle_run_published(self, payload: bytes | str | Mapping[str, Any]) -> bool:
        """The run we asked for exists. Clear the slot; the loop may turn again."""
        message = _decode(payload)
        return self._register.close(str(message.get("run_id", "")))

    def advance(self) -> None:
        """Let simulation time pass. An outstanding request that has timed out is abandoned."""
        expired = self._register.expire(self._clock.now().micros)
        if expired is None:
            return
        tick = self._clock.tick()
        record = publish.decision_message(
            Verdict(
                Decision.DUPLICATE_OUTSTANDING,
                f"the request for {expired.identifier} produced no publication within the "
                "outstanding timeout and was abandoned; a divergence is eligible again",
            ),
            component=self._component,
            tick=tick,
            divergence_id=expired.justified_by,
            run_id=expired.identifier,
        )
        record["kind"] = "scheduler-abandoned"
        self._decisions.append(record)
        if self._publisher is not None:
            publish.publish_decision(self._publisher, record)

    # ----------------------------------------------------------- liveness

    def beat(self, *, force: bool = False) -> Mapping[str, Any] | None:
        """Publish a heartbeat if the real-time interval has elapsed (ADR-0006)."""
        if self._heartbeat is None:
            return None
        tick = self._clock.tick()
        held = self.outstanding
        detail = "idle" if held is None else f"awaiting {held}"
        if force:
            return self._heartbeat.publish(tick, status=HeartbeatStatus.OK, detail=detail)
        return self._heartbeat.maybe_publish(tick, status=HeartbeatStatus.OK, detail=detail)

    # ------------------------------------------------------------ internals

    def _record(
        self,
        verdict: Verdict,
        *,
        tick: Tick,
        divergence: Mapping[str, Any],
        run_id: str | None,
    ) -> None:
        record = publish.decision_message(
            verdict,
            component=self._component,
            tick=tick,
            divergence_id=str(divergence.get("divergence_id", "")),
            run_id=run_id,
        )
        self._decisions.append(record)
        if self._publisher is not None:
            publish.publish_decision(self._publisher, record)


def _decode(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return payload
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    document = json.loads(raw)
    if not isinstance(document, Mapping):
        raise ValueError("a control message is a JSON object")
    return document
