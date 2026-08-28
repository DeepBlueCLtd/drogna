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
import re
from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatStatus, MessagePublisher
from harness_core.ports import Clock
from harness_types.config.scheduler import DrognaSchedulerConfiguration

from harness_scheduler import publish
from harness_scheduler.outstanding import OutstandingRegister
from harness_scheduler.policy import Decision, RunPolicy, Verdict
from harness_scheduler.run_id import run_identifier

__all__ = ["DIVERGENCE_TOPIC", "RUN_PUBLISHED_TOPIC", "SchedulerService"]

DIVERGENCE_TOPIC = "ctl/divergence"
RUN_PUBLISHED_TOPIC = "ctl/run-published"

# The shape the store's identifier rule produces: a prefix, the run sequence padded to six
# digits, and twelve hex digits of a digest. Stated here to read a sequence back out of an
# announcement, which is the only thing a run publication tells this component.
_LAYOUT_IDENTIFIER = re.compile(r"^[A-Za-z0-9]+-(\d{6})-[0-9a-f]{12}$")


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
        self._run_id = settings.scheduler.run_id
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
        self._sequence = 0
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
            sequence = self._sequence
            run_id = self._identifier(sequence)
            request = publish.run_request_message(
                divergence,
                component=self._component,
                tick=tick,
                run_id=run_id,
                run_sequence=sequence,
                ensemble_size=self._settings.scheduler.ensemble_size,
                initialisation_offset_seconds=(
                    self._settings.scheduler.initialisation_offset_seconds
                ),
            )
            self._register.open(
                run_id, at_micros=now, justified_by=str(divergence.get("divergence_id", ""))
            )
            self._policy.requested(now_micros=now)
            self._sequence += 1
            self._requests.append(request)
            if self._publisher is not None:
                publish.publish_run_request(self._publisher, request)

        self._record(verdict, tick=tick, divergence=divergence, run_id=run_id)
        return request

    def handle_run_published(self, payload: bytes | str | Mapping[str, Any]) -> bool:
        """The run we asked for exists. Clear the slot; the loop may turn again.

        The sequence is advanced past whatever has been published, which is what stops this
        component naming a run the store already holds. A run identifier is a pure function
        of the root seed and the sequence, so a scheduler that started counting from zero
        against a store with runs in it would compute a name that is already taken — and the
        publisher would refuse it, correctly and unhelpfully, on every run of the scenario
        this process had not itself requested. The number is read out of the announced name
        rather than tracked, because the name is the only thing this component is told.
        """
        message = _decode(payload)
        announced = str(message.get("run_id", ""))
        published = _sequence_in(announced)
        if published is not None and published >= self._sequence:
            self._sequence = published + 1
        return self._register.close(announced)

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

    def _identifier(self, sequence: int) -> str:
        rule = self._run_id
        return run_identifier(
            root_seed=self._settings.seed.root,
            sequence=sequence,
            rule=rule.rule,
            version=rule.version,
            prefix=rule.prefix,
        )

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


def _sequence_in(run_id: str) -> int | None:
    """The run sequence a store-rule identifier carries, or nothing if it carries none.

    Only the shape is read. Recomputing the digest would prove the name as well as parse it,
    and would refuse a run published under a different rule — which is a judgement about
    another component's configuration that this one is not in a position to make.
    """
    found = _LAYOUT_IDENTIFIER.match(run_id)
    return int(found.group(1)) if found else None


def _decode(payload: bytes | str | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(payload, Mapping):
        return payload
    raw = payload.decode("utf-8") if isinstance(payload, bytes) else payload
    document = json.loads(raw)
    if not isinstance(document, Mapping):
        raise ValueError("a control message is a JSON object")
    return document
