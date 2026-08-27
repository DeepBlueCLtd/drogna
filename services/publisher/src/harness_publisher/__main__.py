"""The publisher as a process: configuration, then time, then whatever is waiting in staging.

Constitution IV's order, as everywhere: one environment variable names the configuration and
that file is validated before the staging directory is looked at. The broker client may be
injected, and where it is not this component builds one from the ``broker`` section of its
own configuration; where the configuration names none, nothing is announced and the
component says so, because a component that published to a stub would light itself in the
client without being real. A named broker that cannot be reached is reported in full on
stderr and the staged runs are still taken, which is work that does not need a broker.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator, Mapping
from typing import Any

from harness_core.broker import (
    FROM_CONFIGURATION,
    resolve_publisher,
)
from harness_core.clock import (
    ClockEndpoint,
    ClockError,
    HttpClockControl,
    RemoteClock,
    Tick,
    TickSource,
)
from harness_core.config import ConfigError
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import configure_run

from harness_publisher.config import load_or_exit_with
from harness_publisher.service import PublisherService
from harness_publisher.version import PUBLISHER_NAME

__all__ = ["main"]

_NO_CLOCK = 70


class _NoSubscription(TickSource):
    """No ticks, for a process whose transport has not been supplied."""

    def ticks(self) -> Iterator[Tick]:
        return iter(())


def _clock_from(document: Mapping[str, Any]) -> Clock:
    endpoint = ClockEndpoint.from_config(document["clock"])
    clock = RemoteClock(_NoSubscription(), HttpClockControl(endpoint), endpoint)
    clock.start()
    return clock


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    stderr: Any = None,
) -> int:
    """Publish everything waiting in staging. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    try:
        active_clock = clock if clock is not None else _clock_from(config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{PUBLISHER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    publisher, owned = resolve_publisher(
        publisher, config.document, component=PUBLISHER_NAME, report=out
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
        for run_id in service.waiting():
            service.take(run_id)
            service.beat()
    finally:
        if owned is not None:
            owned.close()
    return 0


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
