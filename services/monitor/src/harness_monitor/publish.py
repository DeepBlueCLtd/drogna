"""What the monitor says, and where it says it.

Three destinations, and the difference between them is the point:

``ctl/divergence``
    The one operational output. It says the forecast disagrees with the water, in a named
    region, with the evidence that justified the claim. It does not ask for a run and
    cannot start one: the scheduler decides whether a run is warranted, and is free to
    decline (SRD FR-26).

``ctl/telemetry``
    Residual summaries, for the telemetry component to turn into reported skill. The
    monitor computes no running statistics and no skill score; it says what it saw. The
    schema for this topic belongs to feature 010, so this is a producer writing against a
    shape it does not own — recorded here rather than resolved silently, because inverting
    the repository's usual ownership rule is worth seeing.

``ctl/heartbeat``
    Liveness, on a **real-time** cadence (ADR-0006). The simulation time it carries is
    payload, not schedule, so pinning the clock rate to zero for a screenshot leaves a
    running monitor lit rather than greying out a system that is plainly alive. The
    heartbeat's three-way state — warming, scoring, no-forecast — travels in ``detail``
    beside the status the schema already defines, and the mapping is stated in
    :func:`heartbeat_status` rather than left for a reader to infer.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher
from harness_types.messages.divergence import (
    DrognaDivergenceEvent,
    Persistence,
    Region,
    Residual,
)

from harness_monitor.persistence import Evidence
from harness_monitor.residual import EQUATION

__all__ = [
    "DIVERGENCE_TOPIC",
    "TELEMETRY_TOPIC",
    "MonitorState",
    "divergence_message",
    "heartbeat_publisher",
    "heartbeat_status",
    "publish_divergence",
    "publish_residual_summary",
]

DIVERGENCE_TOPIC = "ctl/divergence"
TELEMETRY_TOPIC = "ctl/telemetry"

_MICROS_PER_SECOND = 1_000_000


class MonitorState(StrEnum):
    """What the monitor is doing, as FR-010 requires it to report."""

    WARMING = "warming"
    SCORING = "scoring"
    NO_FORECAST = "no-forecast"


def heartbeat_status(state: MonitorState) -> HeartbeatStatus:
    """The heartbeat status that goes with each monitor state.

    ``no-forecast`` is degraded rather than ok: the process is alive and is doing nothing
    useful, and saying so is the difference between a component that is working and one
    that is merely running. ``warming`` is starting for the same reason.
    """
    if state is MonitorState.WARMING:
        return HeartbeatStatus.STARTING
    if state is MonitorState.NO_FORECAST:
        return HeartbeatStatus.DEGRADED
    return HeartbeatStatus.OK


def divergence_message(
    evidence: Evidence,
    *,
    component: str,
    tick: Tick,
    divergence_id: str,
    threshold_m_per_s: float,
) -> dict[str, Any]:
    """Build the ``ctl/divergence`` payload from the evidence that justified it.

    The generated model is what validates it. There is no second definition of this shape
    in this package, and the constraints the master declares — a sample count of at least
    two among them — are enforced here by construction rather than by review.
    """
    region = evidence.region()
    event = DrognaDivergenceEvent(
        component=component,
        scenario_run_id=tick.run_id,
        sim_time=tick.instant.iso(),
        tick=tick.index,
        divergence_id=divergence_id,
        forecast_run_id=evidence.forecast_run_id,
        region=Region(
            centre_latitude=region.latitude,
            centre_longitude=region.longitude,
            radius_m=region.radius_m,
            minimum_depth_m=region.shallowest_m,
            maximum_depth_m=region.deepest_m,
        ),
        residual=Residual(
            mean_m_per_s=evidence.mean_signed_m_per_s,
            peak_m_per_s=evidence.peak_m_per_s,
            threshold_m_per_s=threshold_m_per_s,
            sample_count=len(evidence.samples),
        ),
        persistence=Persistence(
            rule=evidence.rule.value,
            sample_count=len(evidence.samples),
            span_seconds=evidence.span_micros / _MICROS_PER_SECOND,
            first_sim_time=_iso(evidence.samples[0].sim_micros),
            last_sim_time=_iso(evidence.samples[-1].sim_micros),
        ),
        sound_speed_equation=EQUATION,
    )
    return event.model_dump(mode="json")


def _iso(micros: int) -> str:
    return SimInstant(micros).iso()


def publish_divergence(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    """Publish one divergence event. Sorted keys, so two replays produce two identical bytes."""
    publisher.publish(DIVERGENCE_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))


def publish_residual_summary(
    publisher: MessagePublisher,
    *,
    component: str,
    tick: Tick,
    scored: int,
    exceeding: int,
    outside_domain: int,
    shed: int,
    mean_absolute_m_per_s: float,
) -> dict[str, Any]:
    """Publish what the monitor has seen since the last summary, for feature 010 to score.

    Counted rather than averaged over the scenario: a running statistic computed here would
    be a second producer of the telemetry component's own primary input.
    """
    message = {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "residual-summary",
        "scored": scored,
        "exceeding": exceeding,
        "outside_domain": outside_domain,
        "shed": shed,
        "mean_absolute_m_per_s": mean_absolute_m_per_s,
        "sound_speed_equation": EQUATION,
    }
    publisher.publish(TELEMETRY_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8"))
    return message


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
