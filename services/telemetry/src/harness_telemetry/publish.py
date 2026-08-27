"""What telemetry says, where it says it, and the one thing it refuses to say.

Two destinations.

``ctl/telemetry/<component-id>``
    Residual statistics and forecast skill. The subtopic mirrors the
    ``obs/<thing-id>/<datastream-id>`` convention so that a subscriber can take one
    component's telemetry or all of it. MQTT's multi-level wildcard matches the parent
    level as well as its children, so ``ctl/telemetry/#`` receives both this component's
    subtopic messages and the flat ``ctl/telemetry`` the control-loop services publish on:
    the convention is added without stranding the producers that predate it.

``ctl/heartbeat``
    Liveness, on a **real-time** cadence (ADR-0006), carrying ``warming``, ``reporting`` or
    ``no-forecast`` in ``detail``. The simulation time it carries is payload, not schedule,
    so a rate of zero stops the statistics — which are on simulation time — and leaves the
    process visibly alive, which it is.

Every message is validated through the model generated from
``contracts/schemas/telemetry.schema.json`` before it is published (Constitution III). The
root model is the whole discriminated set, so validating against it checks the payload the
way a subscriber would: including the split that refuses a ``forecast-skill`` carrying a
score without both mean-square errors and a sample count.

The one thing this module refuses to say is what components ought to exist. There is no
list, no enabled flag and no configuration-derived claim about what is running here
(FR-012, Constitution VII); a component is lit in the client because its own heartbeat
arrived, and for nothing else.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from harness_core.clock import SimInstant, Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher
from harness_core.soundspeed import EQUATION
from harness_types.messages.telemetry import DrognaTelemetry

from harness_telemetry.freshness import Freshness, FreshnessTracker
from harness_telemetry.scopes import ScopeStatistic
from harness_telemetry.skill import FORMULA, SkillReport, SkillState

__all__ = [
    "TELEMETRY_BRANCH",
    "ScopeState",
    "TelemetryState",
    "heartbeat_publisher",
    "heartbeat_status",
    "publish_message",
    "skill_message",
    "statistics_message",
    "topic_for",
    "validate",
]

TELEMETRY_BRANCH = "ctl/telemetry"


def topic_for(component: str) -> str:
    """This component's subtopic of the telemetry branch."""
    return f"{TELEMETRY_BRANCH}/{component}"


class TelemetryState(StrEnum):
    """What the component is doing, as FR-017 requires the heartbeat to report."""

    WARMING = "warming"
    REPORTING = "reporting"
    NO_FORECAST = "no-forecast"


class ScopeState(StrEnum):
    """What one published statistic is: a report, or a named reason it is not one yet."""

    REPORTING = "reporting"
    INSUFFICIENT_SAMPLES = "insufficient-samples"
    WARMING = "warming"
    NO_FORECAST = "no-forecast"


def heartbeat_status(state: TelemetryState) -> HeartbeatStatus:
    """The heartbeat status that goes with each state.

    ``no-forecast`` is degraded rather than ok, for the reason the monitor gives: a process
    that is alive and doing nothing useful is not the same as one that is working, and the
    difference is what liveness is for.
    """
    if state is TelemetryState.WARMING:
        return HeartbeatStatus.STARTING
    if state is TelemetryState.NO_FORECAST:
        return HeartbeatStatus.DEGRADED
    return HeartbeatStatus.OK


def validate(message: Mapping[str, Any]) -> None:
    """Refuse to publish a payload the contract would refuse to accept."""
    DrognaTelemetry.model_validate(dict(message))


def statistics_message(
    scope: ScopeStatistic,
    *,
    component: str,
    tick: Tick,
    forecast_run_id: str | None,
    state: ScopeState,
    closed: bool,
    now_micros: int,
) -> dict[str, Any]:
    """One scope's running statistics, with everything needed to weigh them.

    The figures are published as computed in every state in which any residual has been
    folded in. They are aggregates and not scores: withholding an aggregate because its
    sample count is low would be the suppression FR-011 forbids, and the count travels in
    the same message so a reader can weigh it. What is withheld below the minimum count is
    the *skill score*, in :func:`skill_message`, which is what FR-009 is about.
    """
    statistic = scope.statistic
    reason = statistic.implausible_reason
    message: dict[str, Any] = {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "residual-statistics",
        "forecast_run_id": forecast_run_id,
        "state": state.value,
        "closed": closed,
        "scope": {
            "level": scope.level.value,
            "region_id": scope.region_id,
            "bounds": _bounds(scope),
        },
        "basis": statistic.basis.value,
        "count": statistic.count,
        "mean_m_per_s": statistic.mean_m_per_s,
        "mean_absolute_m_per_s": statistic.mean_absolute_m_per_s,
        "root_mean_square_m_per_s": statistic.root_mean_square_m_per_s,
        "minimum_m_per_s": statistic.minimum_m_per_s,
        "maximum_m_per_s": statistic.maximum_m_per_s,
        "first_sim_time": _instant(scope.first_sim_micros),
        "last_sim_time": _instant(scope.last_sim_micros),
        "last_updated_sim_time": _instant(scope.freshness.last_update_micros),
        "freshness": scope.freshness.state(now_micros).value,
        "stale_span_seconds": scope.freshness.stale_span_seconds,
        "implausible": reason is not None,
        "implausible_reason": reason,
    }
    validate(message)
    return message


def skill_message(
    report: SkillReport,
    *,
    component: str,
    tick: Tick,
    forecast_run_id: str | None,
    reference_run_id: str | None,
    reference_changed: bool,
    freshness: FreshnessTracker,
    now_micros: int,
) -> dict[str, Any]:
    """The skill report, carrying the evidence that makes it checkable.

    Both mean-square errors, the sample count and the formula travel with the score, and
    the plain-language statement travels with the state. A model that is not beating
    persistence says so here, in words, rather than leaving a negative number for a display
    to interpret (FR-008).
    """
    scored = report.state in (SkillState.BEATING_PERSISTENCE, SkillState.NOT_BEATING_PERSISTENCE)
    message: dict[str, Any] = {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "forecast-skill",
        "forecast_run_id": forecast_run_id,
        "reference_run_id": reference_run_id,
        "reference_changed": reference_changed,
        "sample_count": report.sample_count,
        "minimum_sample_count": report.minimum_sample_count,
        "model_mean_square_error": report.model_mean_square_error,
        "persistence_mean_square_error": report.persistence_mean_square_error,
        "skill_score": report.skill_score,
        "formula": FORMULA,
        "state": report.state.value,
        "statement": report.statement,
        "last_updated_sim_time": _instant(freshness.last_update_micros),
        "freshness": (
            Freshness.STALE.value
            if not scored and freshness.last_update_micros is None
            else freshness.state(now_micros).value
        ),
        "sound_speed_equation": EQUATION,
    }
    validate(message)
    return message


def publish_message(
    publisher: MessagePublisher, component: str, message: Mapping[str, Any]
) -> None:
    """Publish on this component's subtopic. Sorted keys, so two replays are two same bytes."""
    payload = json.dumps(dict(message), sort_keys=True).encode("utf-8")
    publisher.publish(topic_for(component), payload)


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


def _bounds(scope: ScopeStatistic) -> dict[str, float] | None:
    cell = scope.cell
    if cell is None:
        return None
    return {
        "minimum_latitude": cell.minimum_latitude,
        "maximum_latitude": cell.maximum_latitude,
        "minimum_longitude": cell.minimum_longitude,
        "maximum_longitude": cell.maximum_longitude,
    }


def _instant(micros: int | None) -> str | None:
    return None if micros is None else SimInstant(micros).iso()
