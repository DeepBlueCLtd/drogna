"""The planner as a process: configuration first, then time, then the subscription.

The order in :func:`main` is the order Constitution IV requires. One environment variable
names the configuration; that file is read and validated before the clock is reached, before
the coverage store is looked at, before the ground-truth manifest is opened, and before a
single message is consumed.

The broker client is injected. A component with no broker configured does not invent one and
does not publish to a stub. It says so on stderr and publishes nothing, so nothing lights up
in the client, which is true (Constitution VII).

A planner with no decorrelation timescale field is a planner that cannot score a single
cell, so that too is a startup failure rather than a cell-by-cell fallback. ADR-0002 gives
this component the right to assume a defined tau everywhere; the price of that right is that
the field has to be there.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
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

from harness_planner.config import load_or_exit_with
from harness_planner.field import FieldSource, ManifestTimescale, StoredUncertainty, TimescaleSource
from harness_planner.service import PlannerService
from harness_planner.version import PLANNER_NAME

__all__ = ["main"]

_NO_CLOCK = 70
_NO_TIMESCALE = 71


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
    fields: FieldSource | None = None,
    timescales: TimescaleSource | None = None,
    messages: Iterable[tuple[str, bytes]] = (),
    stderr: Any = None,
) -> int:
    """Run the planner over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    try:
        active_clock = clock if clock is not None else _clock_from(config.document)
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
    for topic, payload in messages:
        service.handle(topic, payload)
        service.beat()
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
