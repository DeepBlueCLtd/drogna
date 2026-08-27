"""The monitor as a process: configuration first, then time, then the subscription.

The order in :func:`main` is the order Constitution IV requires. One environment variable
names the configuration; that file is read and validated before the clock is reached,
before the coverage store is looked at, and before a single message is consumed.

The broker client may be injected, and where it is not this component builds one from the
``broker`` section of its own configuration — ``harness_core.broker`` is the wrapping, and
the endpoint and credentials appear in no literal here. A component whose configuration
names no broker does not invent one and does not publish to a stub: it says so on stderr
and publishes nothing, so nothing lights up in the client, which is true (Constitution
VII). A named broker that cannot be reached is reported in full on stderr and the monitor
carries on with nothing to publish to, so silence never has two possible causes: stderr
says which one this is.
"""

from __future__ import annotations

import sys
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
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

from harness_monitor.catchup import CatchupQuery
from harness_monitor.config import load_or_exit_with
from harness_monitor.coverage import ForecastSource, StoredForecasts
from harness_monitor.service import MonitorService
from harness_monitor.version import MONITOR_NAME

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
    forecasts: ForecastSource | None = None,
    catchup: CatchupQuery | None = None,
    messages: Iterable[tuple[str, bytes]] = (),
    stderr: Any = None,
) -> int:
    """Run the monitor over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    try:
        active_clock = clock if clock is not None else _clock_from(config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{MONITOR_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    source = forecasts if forecasts is not None else _forecasts_from(settings)
    publisher, owned = resolve_publisher(
        publisher, config.document, component=MONITOR_NAME, report=out
    )

    try:
        if publisher is None:
            print(
                f"{MONITOR_NAME}: no publisher was supplied, so no divergence and no heartbeat "
                "is published and nothing lights up. That is truthful, not a degradation",
                file=out,
            )

        service = MonitorService(
            settings,
            clock=active_clock,
            forecasts=source,
            publisher=publisher,
            config_digest=config.digest,
            catchup=catchup,
        )
        service.start()
        service.beat(force=True)
        for topic, payload in messages:
            service.handle(topic, payload)
            service.beat()
        service.report()
    finally:
        if owned is not None:
            owned.close()
    return 0


def _forecasts_from(settings: Any) -> ForecastSource:
    coverage = settings.monitor.coverage
    return StoredForecasts(
        Path(coverage.root_directory),
        pointer=coverage.current_pointer,
        runs_dirname=coverage.runs_dirname,
        forecast_file=coverage.forecast_file,
    )


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
