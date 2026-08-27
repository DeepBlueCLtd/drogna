"""The generator as a component: config first, then the clock, then one world, then stop.

The order in :func:`main` is the order Constitution IV requires and nothing is allowed
before it. One environment variable, ``HARNESS_CONFIG``, names the configuration file. That
file is read and validated against the packaged schema before any other I/O — before the
clock is reached, before the output directory is looked at, before a single byte is
written. An invalid configuration is a startup failure with a readable message and an exit
code a supervisor can act on, never a runtime surprise.

Time comes from the clock port. The generator is a batch component: it needs one instant,
not a stream, so it takes the clock's snapshot at startup and subscribes to nothing. That
instant becomes the time origin of the field's time axis and the ``generated_at`` of the
manifest, and it is simulation time. There is no host clock anywhere in this component.

The heartbeat publisher may be injected, and where it is not the generator builds one from
the ``broker`` section of its own configuration. Where the configuration names no broker it
publishes nothing and says so on stderr: a component with no broker configured does not
invent one and does not publish to a stub, because a stub would light a component in the
shell that is not really there (Constitution VII). A named broker that cannot be reached is
reported in full on stderr and the world is still generated, so the two cases are told apart
by what stderr says rather than by whether the component did its work.
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
from harness_core.config import ConfigError, load_or_exit
from harness_core.heartbeat import MessagePublisher
from harness_core.ports import Clock
from harness_core.rng import configure_run

from harness_env_generator.errors import GeneratorError
from harness_env_generator.generate import generate
from harness_env_generator.heartbeat import GeneratorHeartbeat
from harness_env_generator.manifest import serialise
from harness_env_generator.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from harness_env_generator.writer import FieldWriter

__all__ = ["main"]

COMPONENT = "env_generator"
_DEFAULT_HEARTBEAT_SECONDS = 5.0


class _NoSubscription(TickSource):
    """The generator subscribes to no ticks: it needs one instant, not a stream.

    Supplied rather than omitted so the clock port is used as every other component uses
    it, and so that a later change to a generator that follows time is a change of this
    class and not of the startup path.
    """

    def ticks(self) -> Iterator[Tick]:
        return iter(())


def _clock_from(document: Mapping[str, Any]) -> Clock:
    endpoint = ClockEndpoint.from_config(document["clock"])
    control = HttpClockControl(endpoint)
    clock = RemoteClock(_NoSubscription(), control, endpoint)
    clock.start()
    return clock


def main(
    *,
    env: Mapping[str, str] | None = None,
    clock: Clock | None = None,
    publisher: MessagePublisher | None = FROM_CONFIGURATION,
    stderr: Any = None,
) -> int:
    """Generate one world. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit(
        schema(CONFIG_SCHEMA),
        env=env,
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
        stderr=out,
    )
    document = config.document
    section = document["env_generator"]

    configure_run(int(document["seed"]["root"]))

    try:
        active_clock = clock if clock is not None else _clock_from(document)
        tick = active_clock.tick()
    except (ClockError, OSError) as exc:
        print(f"{COMPONENT}: no simulation time is available ({exc})", file=out)
        return GeneratorError.exit_code

    publisher, owned = resolve_publisher(
        publisher, config.document, component=COMPONENT, report=out
    )

    try:
        heartbeat = GeneratorHeartbeat(
            publisher,
            component=str(document["component"]["id"]),
            interval_seconds=float(
                document["component"].get("heartbeat_interval_seconds", _DEFAULT_HEARTBEAT_SECONDS)
            ),
            config_digest=config.digest,
        )
        if not heartbeat.publishing:
            print(
                f"{COMPONENT}: no heartbeat publisher was supplied, so nothing is published and "
                "nothing lights up. That is truthful, not a degradation",
                file=out,
            )
        heartbeat.starting(tick)

        try:
            world = generate(
                document,
                run_id=tick.run_id,
                config_digest=config.digest,
                root_seed=int(document["seed"]["root"]),
                sim_time=tick.instant.iso(),
                tick=tick.index,
                progress=lambda: heartbeat.working(tick, "sweeping the grid"),
            )
        except GeneratorError as exc:
            print(f"{COMPONENT}: {exc}", file=out)
            heartbeat.stopping(tick, "refused")
            return exc.exit_code

        output = section["output"]
        writer = FieldWriter(
            str(output["directory"]),
            field_name=str(output["field_file"]),
            manifest_name=str(output["manifest_file"]),
        )
        field_path, manifest_path = writer.publish(world.field_payload, serialise(world.manifest))
        print(f"{COMPONENT}: wrote {field_path} and {manifest_path}", file=out)
        heartbeat.stopping(tick, "finished")
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
