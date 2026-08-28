"""What the scheduler says: one run request, and a decision record for every divergence.

``ctl/run-request`` is the only topic this component publishes operationally, and it is the
only component that publishes on it (FR-011). ``ctl/telemetry`` carries the decisions, so
that a declined divergence is visible rather than merely absent — the telemetry component
(feature 010) owns that schema, and this is a producer against a shape it does not own.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import HeartbeatPublisher, MessagePublisher
from harness_types.messages.divergence import DrognaDivergenceEvent
from harness_types.messages.run_request import DrognaModelRunRequest

from harness_scheduler.policy import Verdict

__all__ = [
    "RUN_REQUEST_TOPIC",
    "TELEMETRY_TOPIC",
    "decision_message",
    "heartbeat_publisher",
    "publish_decision",
    "publish_run_request",
    "run_request_message",
]

RUN_REQUEST_TOPIC = "ctl/run-request"
TELEMETRY_TOPIC = "ctl/telemetry"


def run_request_message(
    divergence: Mapping[str, Any],
    *,
    component: str,
    tick: Tick,
    run_id: str,
    run_sequence: int,
    ensemble_size: int,
    initialisation_offset_seconds: float,
) -> dict[str, Any]:
    """Build the ``ctl/run-request`` payload around the divergence that justified it.

    The divergence travels whole rather than by reference. A request that names a message
    somebody else has to still be holding is a request that becomes unreadable the moment
    the broker forgets, and the reason a run was spent is the thing most worth keeping.
    """
    event = DrognaDivergenceEvent.model_validate(dict(divergence))
    initialisation = SimInstant.from_iso(event.sim_time).plus_micros(
        round(initialisation_offset_seconds * 1_000_000)
    )
    request = DrognaModelRunRequest(
        component=component,
        scenario_run_id=tick.run_id,
        sim_time=tick.instant.iso(),
        tick=tick.index,
        run_id=run_id,
        run_sequence=run_sequence,
        initialisation_sim_time=initialisation.iso(),
        ensemble_size=ensemble_size,
        region=event.region,
        divergence=event,
    )
    return request.model_dump(mode="json")


def publish_run_request(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    publisher.publish(RUN_REQUEST_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))


def decision_message(
    verdict: Verdict,
    *,
    component: str,
    tick: Tick,
    divergence_id: str,
    run_id: str | None,
) -> dict[str, Any]:
    """The record kept for every divergence, accepted or declined."""
    return {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "scheduler-decision",
        "divergence_id": divergence_id,
        "decision": verdict.decision.value,
        "detail": verdict.detail,
        "run_id": run_id,
    }


def publish_decision(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    publisher.publish(TELEMETRY_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))


def heartbeat_publisher(
    publisher: MessagePublisher,
    *,
    component: str,
    interval_seconds: float,
    config_digest: str | None,
) -> HeartbeatPublisher:
    """The shared heartbeat publisher, with this component's identity attached."""
    return HeartbeatPublisher(
        publisher,
        component=component,
        interval_seconds=interval_seconds,
        config_digest=config_digest,
    )
