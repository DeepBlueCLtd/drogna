"""The publisher as a process: configuration, then time, then whatever is waiting in staging.

Constitution IV's order, as everywhere: one environment variable names the configuration and
that file is validated before the staging directory is looked at. The broker client may be
injected, and where it is not this component builds one from the ``broker`` section of its
own configuration; where the configuration names none, nothing is announced and the
component says so, because a component that published to a stub would light itself in the
client without being real. A named broker that cannot be reached is reported in full on
stderr and the staged runs are still taken, which is work that does not need a broker.

What this component's loop turns on is a directory rather than a message, and that is the
one place it differs from its neighbours. It stays up, takes whatever staging holds, and
looks again — woken by ``ctl/run-started``, which says a run is coming, and by its own idle
interval, which is what catches the run arriving, since a run is announced started before
its ensemble has been computed.
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

from harness_publisher.config import load_or_exit_with
from harness_publisher.service import RUN_STARTED_TOPIC, PublisherService
from harness_publisher.version import PUBLISHER_NAME

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
    """Publish everything waiting in staging, and go on doing so. Returns the exit code."""
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
        print(f"{PUBLISHER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    publisher, owned = resolve_publisher(
        publisher, config.document, component=PUBLISHER_NAME, report=out
    )
    # Why this component subscribes at all, when its input is a directory. It had no message
    # loop, so the container published whatever staging happened to hold at start-up — which
    # is nothing, on a stack that has just come up — and exited 0. What it needs is to stay
    # up and keep looking; ``ctl/run-started`` is the wake-up that says a run is coming, and
    # the idle turn is what catches the moment the run finishes assembling, because a run is
    # announced started before its ensemble is computed.
    messages, subscribed = resolve_subscriber(
        messages,
        config.document,
        component=PUBLISHER_NAME,
        topic=(RUN_STARTED_TOPIC, (CLOCK_TOPIC, 0)),
        report=out,
        purpose="publisher",
        idle_seconds=idle_interval(settings.component.heartbeat_interval_seconds),
    )

    try:
        if publisher is None:
            print(
                f"{PUBLISHER_NAME}: no publisher was supplied, so no run is announced and "
                "nothing lights up. That is truthful, not a degradation",
                file=out,
            )

        service = PublisherService(
            settings, clock=active_clock, publisher=publisher, config_digest=config.digest
        )
        service.beat(force=True)
        _take_whatever_is_waiting(service)
        # A clock sample is taken so this component's announcements carry a current
        # simulation time. Otherwise neither the topic nor the payload is read: what a
        # message means here is only "look again", and so does an idle turn, so the loop
        # treats them identically rather than pretending to route something it does not act
        # on.
        for topic, payload in messages:
            if topic == CLOCK_TOPIC and following is not None:
                following.take(payload)
            _take_whatever_is_waiting(service)
            service.beat()
    finally:
        if owned is not None:
            owned.close()
        if subscribed is not None:
            subscribed.close()
    return 0


def _take_whatever_is_waiting(service: PublisherService) -> None:
    """Publish every finished run staging holds, oldest name first.

    Refusal is a publication outcome and not an error: ``take`` records it, discards the
    staging and leaves the current run untouched, so a run that cannot be published never
    stops the ones behind it.
    """
    for run_id in service.waiting():
        service.take(run_id)


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
