"""The clock as a process: configuration first, then the run, then the socket.

The order in :func:`main` is the order Constitution IV requires, and the clock is where it
matters most. One environment variable, ``HARNESS_CONFIG``, names the configuration file.
That file is read and validated against the packaged schema before the run manifest is
looked at and before a socket is bound. A clock that bound a port and then discovered its
epoch was missing would already have components connecting to it.

After validation the manifest is opened, because it — not the config file — is what a
resumed run is defined by. A clock service restarting mid-run recovers its run identity,
its root seed, its clock configuration and the tick it had reached from the manifest, and
refuses to start if a manifest is present but cannot be read. Refusing is right: a clock
that silently rewound time would corrupt every consumer that had keyed work to a tick.

The broker client may be injected, and where it is not this component builds one from its
own configuration: ``harness_core.broker`` is the wrapping, and the endpoint and the
credentials come from the ``broker`` section and appear in no literal here. A configuration
that names no broker is the one case that publishes nothing — it says so on stderr rather
than inventing a client or publishing to a stub, so nothing lights up in the client, which
is true (Constitution VII).

A named broker that cannot be reached is reported in full on stderr and the clock carries
on: the snapshot and control routes still answer, so a stack whose broker arrives late is
not one whose clock refused to start. What it does not do is pretend — nothing is published
and nothing lights up until there is somewhere real to publish to.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Mapping
from typing import Any

from harness_core.broker import (
    FROM_CONFIGURATION,
    resolve_publisher,
)
from harness_core.clock_service import ClockEngine
from harness_core.config import ConfigError
from harness_core.heartbeat import MessagePublisher
from harness_core.manifest import ExitState
from harness_core.rng import configure_run

from harness_clock.config import load_or_exit_with
from harness_clock.http import serve
from harness_clock.service import ClockService, open_run
from harness_clock.version import CLOCK_NAME

__all__ = ["main"]

_DEFAULT_HEARTBEAT_SECONDS = 5.0


def main(
    *,
    env: Mapping[str, str] | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    ticks: int | None = None,
    stderr: Any = None,
) -> int:
    """Run the clock. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit_with(env=env, stderr=out)
    settings = config.settings
    section = settings.clock_service

    opened = open_run(section, root_seed=settings.seed.root, streams=[settings.seed.stream])
    configure_run(opened.root_seed)

    publisher, owned = resolve_publisher(
        publisher, config.document, component=CLOCK_NAME, report=out
    )

    service = ClockService(
        ClockEngine(opened.settings, index=opened.index),
        component=settings.component.id,
        publisher=publisher,
        heartbeat_interval_seconds=(
            settings.component.heartbeat_interval_seconds or _DEFAULT_HEARTBEAT_SECONDS
        ),
        liveness_window_seconds=section.liveness_window_seconds,
        idle_poll_seconds=section.idle_poll_seconds,
        config_digest=config.digest,
        manifest=opened.writer,
    )
    if not service.publishing:
        print(
            f"{CLOCK_NAME}: no publisher was supplied, so no clock sample and no heartbeat "
            "is published and nothing lights up. That is truthful, not a degradation",
            file=out,
        )
    if opened.resumed:
        print(
            f"{CLOCK_NAME}: resumed run {opened.settings.run_id} at tick {opened.index}",
            file=out,
        )

    server = serve(
        service,
        host=section.bind.host,
        port=section.bind.port,
        snapshot_route=settings.clock.routes.snapshot,
        control_route=settings.clock.routes.control,
        log_stream=out,
    )
    listener = threading.Thread(target=server.serve_forever, name=CLOCK_NAME, daemon=True)
    listener.start()

    state, detail = ExitState.COMPLETED, "stopped"
    try:
        service.run(ticks=ticks)
    except KeyboardInterrupt:  # pragma: no cover - a signal, not a branch a test takes
        detail = "interrupted"
    except Exception as exc:
        state, detail = ExitState.FAILED, str(exc)
        raise
    finally:
        server.shutdown()
        server.server_close()
        service.close(state, detail=detail)
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
