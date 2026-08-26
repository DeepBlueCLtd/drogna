"""The loop end to end, without a broker and without a database.

What is asserted here is the ordering the whole design rests on: nothing is acknowledged
before its batch is committed, a mixed batch stores its valid messages rather than being
abandoned, and a store that is not there costs a delay rather than data.
"""

from __future__ import annotations

import ingest_support as support
from harness_core.clock import Tick
from harness_ingest.backpressure import BoundedQueue
from harness_ingest.batcher import Batcher
from harness_ingest.service import IngestService
from harness_ingest.telemetry import TelemetryPublisher
from harness_ingest.validation import RejectionLog
from harness_ingest.writer import ObservationWriter, StoreTables

TABLES = StoreTables(
    things="thing",
    sensors="sensor",
    observed_properties="observed_property",
    datastreams="datastream",
    observations="observation",
    features_of_interest="feature_of_interest",
)


class CollectingPublisher:
    """Whatever the component publishes, kept for the test to read."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, bytes]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.messages.append((topic, payload))


def service(
    source: support.RecordingSource,
    connection: support.RecordingConnection,
    *,
    maximum_messages: int = 2,
    queue_depth: int = 100,
    telemetry: TelemetryPublisher | None = None,
) -> IngestService:
    return IngestService(
        source=source,
        writer=ObservationWriter(connection, schema="observations", tables=TABLES),
        queue=BoundedQueue(queue_depth),
        batcher=Batcher(maximum_messages=maximum_messages, maximum_interval_seconds=3600.0),
        rejections=RejectionLog(10),
        telemetry=telemetry,
    )


def ticks(count: int) -> list[Tick]:
    clock = support.clock()
    return [clock.tick()] + [clock.advance() for _ in range(count - 1)]


def test_what_was_published_is_what_is_stored() -> None:
    deliveries = [support.delivery(support.observation(index), mid=index) for index in range(4)]
    source = support.RecordingSource(deliveries)
    connection = support.RecordingConnection()
    run = service(source, connection).run(ticks(3))
    assert run.received == 4
    assert run.stored == 4
    assert run.rejected == 0


def test_nothing_is_acknowledged_before_its_batch_is_committed() -> None:
    source = support.RecordingSource([support.delivery(support.observation(0), mid=7)])
    connection = support.RecordingConnection()
    loop = service(source, connection, maximum_messages=500)
    loop.on_tick(ticks(1)[0])
    assert source.acknowledged == []
    assert connection.commits == 0


def test_a_mixed_batch_stores_the_valid_messages_and_refuses_the_rest() -> None:
    deliveries = [
        support.delivery(support.observation(0), mid=1),
        support.delivery(b"{not json", mid=2),
        support.delivery(support.observation(2), mid=3),
    ]
    source = support.RecordingSource(deliveries)
    connection = support.RecordingConnection()
    run = service(source, connection).run(ticks(2))
    assert run.stored == 2
    assert run.rejected == 1
    assert len(source.acknowledged) == 3


def test_a_store_that_is_not_there_costs_a_delay_and_not_data() -> None:
    cursor = support.RecordingCursor(fail_on="observations.observation ")
    connection = support.RecordingConnection(cursor_object=cursor)
    source = support.RecordingSource(
        [support.delivery(support.observation(index), mid=index) for index in range(2)]
    )
    loop = service(source, connection)
    schedule = ticks(2)
    loop.on_tick(schedule[0])
    assert source.acknowledged == []
    assert "the store refused a batch" in loop.degraded

    cursor.fail_on = None
    loop.flush(schedule[1], force=True)
    assert len(source.acknowledged) == 2
    assert loop.counters.stored == 2
    assert loop.degraded == ""


def test_redelivery_is_counted_rather_than_stored_twice() -> None:
    message = support.observation(0)
    source = support.RecordingSource(
        [support.delivery(message, mid=1), support.delivery(message, mid=2)]
    )
    connection = support.RecordingConnection()
    run = service(source, connection).run(ticks(2))
    assert run.stored == 1
    assert run.duplicates == 1


def test_the_queue_bound_stops_the_source_and_releases_it_again() -> None:
    source = support.RecordingSource(
        [support.delivery(support.observation(index), mid=index) for index in range(6)]
    )
    connection = support.RecordingConnection()
    loop = service(source, connection, queue_depth=2)
    schedule = ticks(6)
    loop.take()
    assert source.paused
    assert loop.counters.queue.depth == 2
    loop.fill_batch(schedule[0])
    assert not source.paused


def test_telemetry_reports_the_queue_the_rate_and_the_refusals() -> None:
    publisher = CollectingPublisher()
    telemetry = TelemetryPublisher(publisher, component="ingest", interval_seconds=60.0)
    source = support.RecordingSource(
        [
            support.delivery(support.observation(0), mid=1),
            support.delivery(b"{not json", mid=2),
        ]
    )
    connection = support.RecordingConnection()
    run = service(source, connection, telemetry=telemetry).run(ticks(2))
    assert run.stored == 1
    topics = {topic for topic, _ in publisher.messages}
    assert topics == {"ctl/telemetry"}
    last = publisher.messages[-1][1].decode("utf-8")
    assert '"rejections"' in last
    assert '"at_bound": false' in last


def test_the_backpressure_indicator_appears_while_the_queue_is_full() -> None:
    publisher = CollectingPublisher()
    telemetry = TelemetryPublisher(publisher, component="ingest", interval_seconds=60.0)
    source = support.RecordingSource(
        [support.delivery(support.observation(index), mid=index) for index in range(6)]
    )
    connection = support.RecordingConnection()
    loop = service(source, connection, queue_depth=2, telemetry=telemetry)
    loop.take()
    message = telemetry.publish(ticks(1)[0], loop.counters)
    assert message["queue"]["at_bound"] is True
    assert message["queue"]["depth"] == 2
