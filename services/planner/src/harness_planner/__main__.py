"""The planner as a process: configuration first, then time, then the subscription.

The order in :func:`main` is the order Constitution IV requires. One environment variable
names the configuration; that file is read and validated before the clock is reached, before
the coverage store is looked at, before the ground-truth manifest is opened, and before a
single message is consumed.

The broker client may be injected, and where it is not this component builds one from the
``broker`` section of its own configuration. A component whose configuration names no broker
does not invent one and does not publish to a stub: it says so on stderr and publishes
nothing, so nothing lights up in the client, which is true (Constitution VII). A named
broker that cannot be reached is reported in full on stderr and the planner carries on with
nothing to publish to.

A planner with no decorrelation timescale field is a planner that cannot score a single
cell, so that too is a startup failure rather than a cell-by-cell fallback. ADR-0002 gives
this component the right to assume a defined tau everywhere; the price of that right is that
the field has to be there.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from harness_core.broker import (
    FROM_CONFIGURATION,
    FROM_CONFIGURATION_MESSAGES,
    idle_interval,
    resolve_publisher,
    resolve_subscriber,
)
from harness_core.clock import (
    CLOCK_TOPIC,
    ClockError,
    FollowedClock,
    resolve_clock,
)
from harness_core.config import ConfigError
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import configure_run

from harness_planner.config import load_or_exit_with
from harness_planner.field import FieldSource, ManifestTimescale, StoredUncertainty, TimescaleSource
from harness_planner.service import (
    OBSERVATION_PREFIX,
    RUN_PUBLISHED_TOPIC,
    PlannerService,
)
from harness_planner.version import PLANNER_NAME

__all__ = ["main"]

_NO_CLOCK = 70
_NO_TIMESCALE = 71


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | FollowedClock | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    fields: FieldSource | None = None,
    timescales: TimescaleSource | None = None,
    messages: Iterable[tuple[str, bytes]] = FROM_CONFIGURATION_MESSAGES,
    stderr: Any = None,
) -> int:
    """Run the planner over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    # Simulation time reaches this component by subscription (ADR-0009), and its own loop is
    # what hands each sample over. `following` is None where a caller supplied a plain clock,
    # which decides its own time and has nothing here to keep current.
    try:
        active_clock, following = resolve_clock(clock, config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{PLANNER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    try:
        tau = timescales if timescales is not None else _timescales_from(settings)
    except (OSError, KeyError, ValueError) as exc:
        print(
            f"{PLANNER_NAME}: no decorrelation timescale field is available ({exc}); every "
            "planning cell needs one and this component has no constant to substitute "
            "(ADR-0002)",
            file=out,
        )
        return _NO_TIMESCALE

    source = fields if fields is not None else _fields_from(settings)
    publisher, owned = resolve_publisher(
        publisher, config.document, component=PLANNER_NAME, report=out
    )
    # Two filters, for the same reason the monitor takes two: what was measured arrives on
    # the observation branch and what was forecast on one control topic, and one filter wide
    # enough for both would ask for control topics this role does not need. Until this
    # existed the parameter defaulted to an empty tuple and no recommendation was ever made
    # in the composed stack.
    messages, subscribed = resolve_subscriber(
        messages,
        config.document,
        component=PLANNER_NAME,
        topic=(f"{OBSERVATION_PREFIX}#", RUN_PUBLISHED_TOPIC, (CLOCK_TOPIC, 0)),
        report=out,
        purpose="planner",
        idle_seconds=idle_interval(settings.component.heartbeat_interval_seconds),
    )

    try:
        if publisher is None:
            print(
                f"{PLANNER_NAME}: no publisher was supplied, so no recommendation and no "
                "heartbeat is published and nothing lights up. That is truthful, not a "
                "degradation",
                file=out,
            )

        service = PlannerService(
            settings,
            clock=active_clock,
            fields=source,
            timescales=tau,
            publisher=publisher,
            config_digest=config.digest,
        )
        service.start()
        service.beat(force=True)
        # An idle turn carries no topic and routes nowhere; it is what keeps this component
        # saying it is alive while it waits for the next observation.
        for topic, payload in messages:
            # A clock sample is a turn like any other. It carries no work for this
            # component's own handler, and it is why every other turn has a current
            # simulation time to do its work at.
            if topic == CLOCK_TOPIC:
                if following is not None:
                    following.take(payload)
            elif topic:
                service.handle(topic, payload)
            service.beat()
    finally:
        if owned is not None:
            owned.close()
        if subscribed is not None:
            subscribed.close()
    return 0


def _fields_from(settings: Any) -> FieldSource:
    coverage = settings.planner.coverage
    return StoredUncertainty(
        Path(coverage.root_directory),
        pointer=coverage.current_pointer,
        runs_dirname=coverage.runs_dirname,
        uncertainty_file=coverage.uncertainty_file,
        variable=settings.planner.uncertainty.variable.value,
    )


def _timescales_from(settings: Any) -> TimescaleSource:
    environment = settings.planner.environment
    document = json.loads(
        (Path(environment.directory) / environment.manifest_file).read_text(encoding="utf-8")
    )
    return ManifestTimescale.from_manifest_document(document)


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
