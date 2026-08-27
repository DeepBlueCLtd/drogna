"""The packager as a process: configuration first, then time, then a cycle.

The order in :func:`main` is the order Constitution IV requires. One environment variable
names the configuration; that file is read and validated — and its two cross-field
invariants checked — before the clock is reached, before the staging area is looked at, and
before a single byte is written or sent.

The broker client is injected. A component with no broker configured does not invent one
and does not publish to a stub, so nothing lights up in the client that is not really there
(Constitution VII). The same is true of the clock: without one there is no simulation time,
and a packager with no simulation time would have to reach for a host clock to write a
ledger record, which is the one thing this component may not do.

The first cycle runs with recovery. Every subsequent cycle does not, because recovery is
about what an earlier process left behind and re-running it every cycle would re-verify
bundles this process has just verified itself.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator, Mapping
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

from harness_offload.config import load_or_exit_with
from harness_offload.main import Packager, PackagerSettings
from harness_offload.telemetry import OffloadTelemetry
from harness_offload.transfer import Destination, HttpDestination
from harness_offload.version import PACKAGER_NAME

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


def _destination_from(document: Mapping[str, Any]) -> Destination:
    section = document["offload"]["destination"]
    return HttpDestination(
        identifier=str(section["id"]),
        endpoint=str(section["endpoint"]),
        routes=section["routes"],
        timeout_seconds=float(section["timeout_seconds"]),
    )


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | None = None,
    destination: Destination | None = None,
    publisher: MessagePublisher | None = None,
    stderr: Any = None,
    cycles: int = 1,
) -> int:
    """Load, validate, then run ``cycles`` passes of the packager's cycle."""
    stream = stderr or sys.stderr
    try:
        config = load_or_exit_with(env=env, stderr=stream)
    except ConfigError as exc:  # pragma: no cover - load_or_exit_with exits first
        print(str(exc), file=stream)
        return exc.exit_code

    configure_run(int(config.document["seed"]["root"]))

    if clock is None:
        try:
            clock = _clock_from(config.document)
        except ClockError as exc:
            print(f"{PACKAGER_NAME}: no simulation clock ({exc})", file=stream)
            return _NO_CLOCK

    packager = Packager(
        PackagerSettings.from_config(config.document),
        clock=clock,
        destination=destination or _destination_from(config.document),
        telemetry=OffloadTelemetry(publisher=publisher),
    )
    for index in range(max(cycles, 1)):
        report = packager.cycle(recover=index == 0)
        for failure in report.failures:
            print(f"{PACKAGER_NAME}: {failure}", file=stream)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
