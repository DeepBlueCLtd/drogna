"""The announcement: one message, once, carrying everything a consumer needs.

FR-024 and FR-025 are one decision seen from two sides. The publisher says on
``ctl/run-published`` that a run is current, and nothing in the harness asks the query layer
whether anything has changed. So the message has to be sufficient: the run's identifier, the
span it is valid for, the grid it covers, the collection identifiers under which its two
fields are servable, and the digests by which a reader can say which run it read.

If the message is lost, consumers stay on the previous field. That is the honest outcome and
the harness does not add polling to soften it: a stalled loop is visible in the client, and a
poll would make it invisible.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from harness_core.broker import publish_retained
from harness_core.clock import Tick
from harness_core.heartbeat import HeartbeatPublisher, MessagePublisher
from harness_types.messages.run_published import (
    Collections,
    Digests,
    DrognaModelRunPublished,
    GridBounds,
    ValidTime,
)

__all__ = [
    "RUN_PUBLISHED_TOPIC",
    "TELEMETRY_TOPIC",
    "announcement",
    "failure_message",
    "heartbeat_publisher",
    "publish_announcement",
    "publish_failure",
]

RUN_PUBLISHED_TOPIC = "ctl/run-published"
TELEMETRY_TOPIC = "ctl/telemetry"


def announcement(
    descriptor: Mapping[str, Any],
    *,
    component: str,
    tick: Tick,
    collection: str,
    current: bool = True,
) -> dict[str, Any]:
    """Build the ``ctl/run-published`` payload from the run's own descriptor.

    The collection identifier is the fixed one the query layer serves — the run itself is
    named by ``run_id``, which the payload already carries, and a specific run is an EDR
    instance of that collection (decided 28 August 2026, issue #34).
    """
    bounds = descriptor["grid_bounds"]
    valid = descriptor["valid_time"]
    digests = descriptor["digests"]
    message = DrognaModelRunPublished(
        component=component,
        scenario_run_id=tick.run_id,
        sim_time=tick.instant.iso(),
        tick=tick.index,
        run_id=str(descriptor["run_id"]),
        current=current,
        valid_time=ValidTime(
            start_sim_time=str(valid["start_sim_time"]),
            end_sim_time=str(valid["end_sim_time"]),
        ),
        grid_bounds=GridBounds(**{key: float(value) for key, value in bounds.items()}),
        collections=Collections(forecast=collection),
        digests=Digests(forecast=str(digests["forecast"]), uncertainty=str(digests["uncertainty"])),
    )
    return message.model_dump(mode="json")


def publish_announcement(publisher: MessagePublisher, message: Mapping[str, Any]) -> None:
    """Announce a published run, and have the broker hold the announcement.

    Which run is current is state rather than an event: a component that connects after the
    announcement still needs to know, and every component connects after it at least once,
    because every component restarts. ``harness_core.broker.publish_retained`` says what that
    cost before the announcement was retained — a scheduler starting its sequence at zero
    against a store that already holds run zero, and a loop stalled until the request timed
    out. A publisher with no way to retain publishes as it did before.
    """
    publish_retained(
        publisher, RUN_PUBLISHED_TOPIC, json.dumps(message, sort_keys=True).encode("utf-8")
    )


def failure_message(
    *, component: str, tick: Tick, run_id: str, refusals: tuple[str, ...]
) -> dict[str, Any]:
    """A run that was not published is recorded as such, with every reason it was not."""
    return {
        "component": component,
        "scenario_run_id": tick.run_id,
        "sim_time": tick.instant.iso(),
        "tick": tick.index,
        "kind": "publication-refused",
        "run_id": run_id,
        "refusals": list(refusals),
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
