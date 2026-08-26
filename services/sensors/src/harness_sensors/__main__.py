"""C-04 as a component: configuration first, then the clock, then the world, then publish.

The order in :func:`main` is the order Constitution IV requires and nothing is allowed
before it. One environment variable, ``HARNESS_CONFIG``, names the configuration file. That
file is read and validated against the packaged schema before any other I/O — before the
broker is reached, before the ground-truth manifest is opened, before a single message is
composed. An invalid configuration is a startup failure with a readable message and an exit
code a supervisor can act on.

If the broker is absent at startup the component retries with bounded backoff driven by the
simulation clock, and publishes no heartbeat until it is connected. It is then correctly
greyed out in the client rather than falsely lit (Constitution VII).
"""

from __future__ import annotations

import sys
from collections.abc import Iterator, Mapping
from typing import Any

from harness_core.clock import (
    CLOCK_TOPIC,
    ClockEndpoint,
    ClockError,
    HttpClockControl,
    RemoteClock,
    Tick,
)
from harness_core.config import ConfigError, load_or_exit
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, MessagePublisher
from harness_core.rng import configure_run

from harness_sensors.broker import BrokerEndpoint, BrokerError, PahoPublisher, PahoTickSource
from harness_sensors.field import field_from_config
from harness_sensors.publisher import ObservationPublisher
from harness_sensors.schemas import (
    COMMON_CONFIG_SCHEMA,
    CONFIG_SCHEMA,
    OBSERVATION_SCHEMA,
    schema,
)
from harness_sensors.sensor import Field, Instrument, Platform, Position, SensorArray
from harness_sensors.service import SensorRun, SensorService, backoff_seconds

__all__ = ["COMPONENT", "array_from_config", "main"]

COMPONENT = "sensors"

EXIT_NO_CLOCK = 70
EXIT_NO_BROKER = 71

_DEFAULT_HEARTBEAT_SECONDS = 5.0
_CONNECT_ATTEMPTS = 5


def array_from_config(document: Mapping[str, Any], field: Field) -> SensorArray:
    """Build the platform, its instruments and its sampling pattern from configuration."""
    section = document["sensors"]
    platform = section["platform"]
    sampling = section["sampling"]
    return SensorArray(
        platform=Platform(
            id=str(platform["id"]),
            name=str(platform["name"]),
            description=str(platform["description"]),
        ),
        instruments=[Instrument.from_config(entry) for entry in section["datastreams"]],
        positions=[
            Position(latitude=float(entry["latitude"]), longitude=float(entry["longitude"]))
            for entry in sampling["positions"]
        ],
        depths_m=[float(depth) for depth in sampling["depths_m"]],
        field=field,
        seed_stream=str(document["seed"]["stream"]),
    )


def _connect(
    publisher: PahoPublisher,
    ticks: Iterator[Tick],
    *,
    initial: float,
    maximum: float,
    report: Any,
) -> None:
    """Connect, retrying with bounded backoff spent in simulation time."""
    for attempt in range(1, _CONNECT_ATTEMPTS + 1):
        try:
            publisher.connect()
            return
        except BrokerError as failure:
            wait = backoff_seconds(attempt, initial=initial, maximum=maximum)
            print(
                f"{COMPONENT}: {failure}; waiting {wait} simulation seconds before "
                f"attempt {attempt + 1}",
                file=report,
            )
            from harness_sensors.service import wait_simulation_seconds

            if wait_simulation_seconds(ticks, wait) is None:
                raise BrokerError(
                    "the clock stopped while waiting to reconnect, so nothing can be published"
                ) from failure
    raise BrokerError(f"the broker did not answer in {_CONNECT_ATTEMPTS} attempts")


def main(
    *,
    env: Mapping[str, str] | None = None,
    ticks: Iterator[Tick] | None = None,
    publisher: MessagePublisher | None = None,
    field: Field | None = None,
    stderr: Any = None,
) -> int:
    """Run the sensors. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit(
        schema(CONFIG_SCHEMA),
        env=env,
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA), schema(OBSERVATION_SCHEMA)],
        stderr=out,
    )
    document = config.document
    section = document["sensors"]

    configure_run(int(document["seed"]["root"]))

    owned: list[Any] = []
    try:
        if ticks is None:
            endpoint = ClockEndpoint.from_config(document["clock"])
            source = PahoTickSource(
                BrokerEndpoint.from_config(document["broker"]), topic=CLOCK_TOPIC
            )
            owned.append(source)
            clock = RemoteClock(source, HttpClockControl(endpoint), endpoint)
            clock.start()
            ticks = clock.follow()
    except (BrokerError, ClockError, OSError) as failure:
        print(f"{COMPONENT}: no simulation time is available ({failure})", file=out)
        return EXIT_NO_CLOCK

    try:
        if publisher is None:
            broker = PahoPublisher(
                BrokerEndpoint.from_config(document["broker"]),
                qos=int(section["publication"]["qos"]),
                retain=bool(section["publication"].get("retain", False)),
            )
            owned.append(broker)
            _connect(
                broker,
                ticks,
                initial=float(section["reconnect"]["initial_seconds"]),
                maximum=float(section["reconnect"]["maximum_seconds"]),
                report=out,
            )
            publisher = broker

        sampled_field = field if field is not None else field_from_config(section["field"])
        array = array_from_config(document, sampled_field)
        heartbeat = HeartbeatPublisher(
            publisher,
            component=str(document["component"]["id"]),
            interval_seconds=float(
                document["component"].get("heartbeat_interval_seconds", _DEFAULT_HEARTBEAT_SECONDS)
            ),
            config_digest=config.digest,
        )
        service = SensorService(
            array=array,
            publisher=ObservationPublisher(publisher),
            interval_seconds=float(section["sampling"]["interval_seconds"]),
            heartbeat=heartbeat,
            maximum_samples=(
                int(section["sampling"]["maximum_samples"])
                if "maximum_samples" in section["sampling"]
                else None
            ),
        )
        first = next(ticks, None)
        if first is None:
            print(f"{COMPONENT}: the clock published nothing, so nothing was sampled", file=out)
            return EXIT_NO_CLOCK
        heartbeat.publish(first, status=HeartbeatStatus.STARTING)
        service.on_tick(first)
        run: SensorRun = service.run(ticks)
    except BrokerError as failure:
        print(f"{COMPONENT}: {failure}", file=out)
        return EXIT_NO_BROKER
    finally:
        for resource in owned:
            resource.close()

    print(
        f"{COMPONENT}: {run.published} observation(s) in {run.events} sampling event(s); "
        f"{run.stopped_because}",
        file=out,
    )
    return 0


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
