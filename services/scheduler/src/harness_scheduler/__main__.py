"""The scheduler as a process: configuration first, then time, then the subscriptions.

The broker client is injected, as everywhere else in the harness so far. A component with
no broker configured publishes nothing and says so; it does not publish to a stub, because
a stub would light a component in the client that is not really running (Constitution VII).
"""

from __future__ import annotations

import sys
from collections.abc import Iterable, Iterator, Mapping
from typing import Any

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

from harness_scheduler.config import load_or_exit_with
from harness_scheduler.service import SchedulerService
from harness_scheduler.version import SCHEDULER_NAME

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
    publisher: MessagePublisher | None = None,
    messages: Iterable[tuple[str, bytes]] = (),
    stderr: Any = None,
) -> int:
    """Run the scheduler over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    try:
        active_clock = clock if clock is not None else _clock_from(config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{SCHEDULER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

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
    for topic, payload in messages:
        service.handle(topic, payload)
        service.advance()
        service.beat()
    return 0


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
