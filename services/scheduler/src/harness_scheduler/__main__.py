"""The scheduler as a process: configuration first, then time, then the subscriptions.

The broker client may be injected, and where it is not this component builds one from the
``broker`` section of its own configuration, as everywhere else in the harness. A component
whose configuration names no broker publishes nothing and says so; it does not publish to a
stub, because a stub would light a component in the client that is not really running
(Constitution VII). A named broker that cannot be reached is reported in full on stderr and
the scheduler carries on with nothing to publish to.
"""

from __future__ import annotations

import sys
from collections.abc import Iterable, Mapping
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

from harness_scheduler.config import load_or_exit_with
from harness_scheduler.service import (
    DIVERGENCE_TOPIC,
    RUN_PUBLISHED_TOPIC,
    SchedulerService,
)
from harness_scheduler.version import SCHEDULER_NAME

__all__ = ["main"]

_NO_CLOCK = 70


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | FollowedClock | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    messages: Iterable[tuple[str, bytes]] = FROM_CONFIGURATION_MESSAGES,
    stderr: Any = None,
) -> int:
    """Run the scheduler over ``messages``. Returns the process exit code."""
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
        print(f"{SCHEDULER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    publisher, owned = resolve_publisher(
        publisher, config.document, component=SCHEDULER_NAME, report=out
    )
    # What it decides about, and how it learns the run it asked for exists. Until this
    # existed the parameter defaulted to an empty tuple, so the container ran its loop over
    # nothing and exited 0 — indistinguishable from a caller who had asked for silence, and
    # the reason no divergence ever became a run in the composed stack.
    messages, subscribed = resolve_subscriber(
        messages,
        config.document,
        component=SCHEDULER_NAME,
        topic=(DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC, (CLOCK_TOPIC, 0)),
        report=out,
        purpose="scheduler",
        idle_seconds=idle_interval(settings.component.heartbeat_interval_seconds),
    )

    try:
        if publisher is None:
            print(
                f"{SCHEDULER_NAME}: no publisher was supplied, so no run request and no "
                "heartbeat is published and nothing lights up. That is truthful",
                file=out,
            )

        service = SchedulerService(
            settings, clock=active_clock, publisher=publisher, config_digest=config.digest
        )
        service.beat(force=True)
        # An idle turn carries no topic and routes nowhere; what follows it is the work this
        # component owes whether or not anything arrived — expiring an outstanding request
        # whose timeout has passed, and saying it is alive.
        for topic, payload in messages:
            # A clock sample is a turn like any other. It carries no work for this
            # component's own handler, and it is why every other turn has a current
            # simulation time to do its work at.
            if topic == CLOCK_TOPIC:
                if following is not None:
                    following.take(payload)
            elif topic:
                service.handle(topic, payload)
            service.advance()
            service.beat()
    finally:
        if owned is not None:
            owned.close()
        if subscribed is not None:
            subscribed.close()
    return 0


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
