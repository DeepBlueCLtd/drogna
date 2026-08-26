"""C-05 as a component: configuration first, then the clock, then the store, then ingest.

The order in :func:`main` is the order Constitution IV requires. One environment variable,
``HARNESS_CONFIG``, names the configuration file; it is read and validated against the
packaged schema before the broker is reached and before a connection to the store is
opened.

The store connection is opened as the ingest role and no other. The role is named in
configuration and asserted at startup against the role actually connected as, so a client
that has been handed the wrong credentials fails at the first opportunity rather than
discovering it on its first write — or worse, succeeding with permissions it should not
have.
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
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus
from harness_core.rng import configure_run

from harness_ingest.backpressure import BoundedQueue
from harness_ingest.batcher import Batcher
from harness_ingest.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from harness_ingest.service import IngestRun, IngestService, Source
from harness_ingest.subscriber import BrokerEndpoint, BrokerError, PahoSubscriber
from harness_ingest.telemetry import TelemetryPublisher
from harness_ingest.validation import RejectionLog
from harness_ingest.writer import Connection, ObservationWriter, StoreTables

__all__ = ["COMPONENT", "connect_to_store", "main", "service_from_config"]

COMPONENT = "ingest"

EXIT_NO_CLOCK = 70
EXIT_NO_BROKER = 71
EXIT_NO_STORE = 72

_DEFAULT_HEARTBEAT_SECONDS = 5.0


class StoreError(Exception):
    """The observation store could not be reached, or answered as the wrong role."""


def connect_to_store(section: Mapping[str, Any]) -> Connection:
    """Open the store connection as the ingest role, and check that it is that role.

    ``psycopg`` is imported here rather than at module import so that the batching, the
    validation and the backpressure can be tested in a workspace with no driver and no
    database, which is most of what this component is.
    """
    try:
        import psycopg
    except ImportError as error:  # pragma: no cover - the image installs it
        raise StoreError("no database driver is installed, so nothing can be written") from error
    try:
        connection = psycopg.connect(str(section["dsn"]))
    except Exception as error:
        raise StoreError(f"the observation store is not reachable: {error}") from error
    expected = str(section["role"])
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_user")
        row = cursor.fetchone()
    actual = str(row[0]) if row else ""
    if actual != expected:
        connection.close()
        raise StoreError(
            f"connected as {actual!r} but the configuration names {expected!r}; the ingest "
            "client is the only role with insert permission and it must be that role"
        )
    return connection


def service_from_config(
    document: Mapping[str, Any],
    *,
    source: Source,
    connection: Connection,
    telemetry: TelemetryPublisher | None = None,
    heartbeat: HeartbeatPublisher | None = None,
) -> IngestService:
    """Assemble the loop from a validated configuration document."""
    section = document["ingest"]
    store = section["store"]
    return IngestService(
        source=source,
        writer=ObservationWriter(
            connection,
            schema=str(store["schema"]),
            tables=StoreTables.from_config(store["tables"]),
        ),
        queue=BoundedQueue(int(section["queue"]["maximum_depth"])),
        batcher=Batcher(
            maximum_messages=int(section["batch"]["maximum_messages"]),
            maximum_interval_seconds=float(section["batch"]["maximum_interval_seconds"]),
        ),
        rejections=RejectionLog(int(section["rejections"]["maximum_retained"])),
        telemetry=telemetry,
        heartbeat=heartbeat,
    )


def main(
    *,
    env: Mapping[str, str] | None = None,
    ticks: Iterator[Tick] | None = None,
    source: Source | None = None,
    connection: Connection | None = None,
    stderr: Any = None,
) -> int:
    """Run the ingest client. Returns the process exit code."""
    out = stderr or sys.stderr
    config = load_or_exit(
        schema(CONFIG_SCHEMA),
        env=env,
        component=COMPONENT,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
        stderr=out,
    )
    document = config.document
    section = document["ingest"]

    configure_run(int(document["seed"]["root"]))

    owned: list[Any] = []
    broker: PahoSubscriber | None = None
    try:
        if source is None:
            broker = PahoSubscriber(
                BrokerEndpoint.from_config(document["broker"]),
                qos=int(section["subscription"]["qos"]),
            )
            owned.append(broker)
            broker.connect()
            source = broker
    except BrokerError as failure:
        print(f"{COMPONENT}: {failure}", file=out)
        return EXIT_NO_BROKER

    try:
        if ticks is None:
            endpoint = ClockEndpoint.from_config(document["clock"])
            clock = RemoteClock(_TickSource(broker), HttpClockControl(endpoint), endpoint)
            clock.start()
            ticks = clock.follow()
    except (ClockError, OSError) as failure:
        print(f"{COMPONENT}: no simulation time is available ({failure})", file=out)
        for resource in owned:
            resource.close()
        return EXIT_NO_CLOCK

    try:
        if connection is None:
            connection = connect_to_store(section["store"])
    except StoreError as failure:
        print(f"{COMPONENT}: {failure}", file=out)
        for resource in owned:
            resource.close()
        return EXIT_NO_STORE

    publisher = broker
    heartbeat = (
        HeartbeatPublisher(
            publisher,
            component=str(document["component"]["id"]),
            interval_seconds=float(
                document["component"].get("heartbeat_interval_seconds", _DEFAULT_HEARTBEAT_SECONDS)
            ),
            config_digest=config.digest,
        )
        if publisher is not None
        else None
    )
    telemetry = TelemetryPublisher(
        publisher,
        component=str(document["component"]["id"]),
        interval_seconds=float(section["telemetry"]["interval_seconds"]),
    )
    service = service_from_config(
        document,
        source=source,
        connection=connection,
        telemetry=telemetry,
        heartbeat=heartbeat,
    )

    first = next(ticks, None)
    if first is None:
        print(f"{COMPONENT}: the clock published nothing, so nothing was ingested", file=out)
        for resource in owned:
            resource.close()
        return EXIT_NO_CLOCK
    if heartbeat is not None:
        heartbeat.publish(first, status=HeartbeatStatus.STARTING)
    service.on_tick(first)

    try:
        run: IngestRun = service.run(ticks)
    finally:
        for resource in owned:
            resource.close()

    print(
        f"{COMPONENT}: stored {run.stored} observation(s) in {run.batches} batch(es); "
        f"{run.duplicates} redelivered, {run.rejected} refused; queue reached "
        f"{run.high_water}; {run.stopped_because}",
        file=out,
    )
    return 0


class _TickSource:
    """Simulation time for the ingest client, over its own broker connection.

    The ingest role reads ``obs/#``; the clock sample it also needs arrives on ``ctl/clock``
    and is subscribed to separately here, with the same credentials. ADR-0009 makes time a
    subscription for every component, and the access control list gives this role that one
    control topic to read beside the observation branch.
    """

    def __init__(self, broker: PahoSubscriber | None) -> None:
        self._broker = broker
        self._source: Any | None = None

    def ticks(self) -> Iterator[Tick]:
        if self._broker is None:
            return iter(())
        if self._source is None:
            self._source = _clock_subscription(self._broker)
        return self._source


def _clock_subscription(broker: PahoSubscriber) -> Iterator[Tick]:
    """Ticks from ``ctl/clock``, over a second subscription on the same credentials."""
    import json

    clock_source = PahoSubscriber(broker.endpoint, qos=0, topic_filter=CLOCK_TOPIC)
    clock_source.connect()
    while True:
        delivery = clock_source.poll(timeout=1.0)
        if delivery is None:
            continue
        yield Tick.from_message(json.loads(delivery.payload.decode("utf-8")))


def _run() -> int:
    try:
        return main()
    except ConfigError as exc:  # pragma: no cover - load_or_exit normally exits first
        print(str(exc), file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(_run())
