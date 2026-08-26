"""What the model runner says: that a run has begun, and that one has failed.

``ctl/run-started`` is published **before any computation** (FR-016). The order is the
requirement: a run that is announced only on success leaves a failed run invisible, and the
one thing worse than a run that fails is a run that fails silently in the middle of a loop
somebody is watching.

The message names the kernel that will do the work. The kernel is a port with more than one
implementation, and which one produced a field is not otherwise recoverable from the field.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatPublisher, MessagePublisher
from harness_types.messages.run_started import DrognaModelRunStarted

__all__ = [
    "RUN_STARTED_TOPIC",
    "TELEMETRY_TOPIC",
    "failure_message",
    "heartbeat_publisher",
    "publish_failure",
    "publish_run_started",
    "run_started_message",
]

RUN_STARTED_TOPIC = "ctl/run-started"
TELEMETRY_TOPIC = "ctl/telemetry"


def run_started_message(
    request: Mapping[str, Any],
    *,
    component: str,
    tick: Tick,
    kernel: str,
    member_count: int,
) -> dict[str, Any]:
    """Build the ``ctl/run-started`` payload from the request that caused the run."""
    started = DrognaModelRunStarted(
        component=component,
        scenario_run_id=tick.run_id,
        sim_time=tick.instant.iso(),
        tick=tick.index,
        run_id=str(request["run_id"]),
        divergence_id=str(request["divergence"]["divergence_id"]),
        member_count=member_count,
        kernel=kernel,
        initialisation_sim_time=str(request["initialisation_sim_time"]),
    )
    return started.model_dump(mode="json")


def publish_run_started(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    publisher.publish(RUN_STARTED_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))


def failure_message(*, component: str, tick: Tick, run_id: str, detail: str) -> dict[str, Any]:
    """A failed run is recorded rather than merely absent."""
    return {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "run-failed",
        "run_id": run_id,
        "detail": detail,
    }


def publish_failure(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
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
