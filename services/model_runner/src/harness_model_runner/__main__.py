"""The model runner as a process: configuration, then time, then the ground truth it advects.

The order in :func:`main` is Constitution IV's: one environment variable names the
configuration; that file is validated before the clock is reached and before the
ground-truth manifest is opened. The broker client may be injected, and where it is not this
component builds one from the ``broker`` section of its own configuration. A component whose
configuration names no broker publishes nothing and says so rather than publishing to a stub
that would light it in the client (Constitution VII); a named broker that cannot be reached
is reported in full on stderr and this component carries on with nothing to publish to.
"""

from __future__ import annotations

import json
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

from harness_model_runner.config import load_or_exit_with
from harness_model_runner.service import ModelRunnerService
from harness_model_runner.version import RUNNER_NAME

__all__ = ["main"]

_NO_CLOCK = 70
_NO_GROUND_TRUTH = 71


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
    ground_truth: Mapping[str, Any] | None = None,
    messages: Iterable[tuple[str, bytes]] = (),
    stderr: Any = None,
) -> int:
    """Run the model runner over ``messages``. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings

    configure_run(settings.seed.root)

    try:
        active_clock = clock if clock is not None else _clock_from(config.document)
        active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{RUNNER_NAME}: no simulation time is available ({exc})", file=out)
        return _NO_CLOCK

    truth = ground_truth
    if truth is None:
        section = settings.model_runner.ground_truth
        path = Path(section.directory) / section.manifest_file
        try:
            truth = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(
                f"{RUNNER_NAME}: the ground-truth manifest cannot be read ({exc}); there is "
                "nothing to advect and a run would be invention",
                file=out,
            )
            return _NO_GROUND_TRUTH

    publisher, owned = resolve_publisher(
        publisher, config.document, component=RUNNER_NAME, report=out
    )

    try:
        if publisher is None:
            print(
                f"{RUNNER_NAME}: no publisher was supplied, so nothing is announced and nothing "
                "lights up. That is truthful, not a degradation",
                file=out,
            )

        service = ModelRunnerService(
            settings,
            clock=active_clock,
            ground_truth=truth,
            publisher=publisher,
            config_digest=config.digest,
        )
        service.beat(force=True)
        for topic, payload in messages:
            service.handle(topic, payload)
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
