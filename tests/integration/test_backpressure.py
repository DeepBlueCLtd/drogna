"""A burst the store cannot absorb: bounded, reported, and drained without loss.

The failure mode the SRD assigns to the ingest client, driven rather than waited for. A
burst several times the queue's bound is published through a real broker; the client's
queue holds its bound, the backpressure indicator appears on ``ctl/telemetry`` where the
telemetry component and the client can see it, and when the burst is worked off every
message that was published is in the store exactly once.

The queue bound is set well below the broker's in-flight window here so that the bound is
what is being tested. At the deployment's own settings the broker's window is reached
first, which is the same mechanism one step earlier: what holds the flow back is that this
client acknowledges only what it has written.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

import observation_path as support
import psycopg
import pytest
from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_ingest.backpressure import BoundedQueue
from harness_ingest.batcher import Batcher
from harness_ingest.service import IngestService
from harness_ingest.subscriber import BrokerEndpoint, PahoSubscriber
from harness_ingest.telemetry import TelemetryPublisher
from harness_ingest.validation import RejectionLog
from harness_ingest.writer import ObservationWriter, StoreTables

pytestmark = pytest.mark.skipif(
    not support.docker_available(),
    reason="no container runtime is reachable: the broker and the store in these tests are real",
)

RUN_ID = "run-burst"
EPOCH = SimInstant.from_iso("2026-09-01T00:00:00.000000Z")
QUEUE_BOUND = 5
BURST = 60
BATCH_MESSAGES = 4
DRAIN_TIMEOUT_SECONDS = 90.0


@pytest.fixture(scope="module")
def broker(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Broker]:
    yield from support.start_broker(tmp_path_factory.mktemp("broker"))


@pytest.fixture(scope="module")
def store(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Store]:
    yield from support.start_store(tmp_path_factory.mktemp("store"))


def observation(ordinal: int) -> dict[str, Any]:
    """One well-formed observation. The content is beside the point here; the count is not."""
    return {
        "observation_id": f"obs-burst{ordinal:011d}",
        "scenario_run_id": RUN_ID,
        "sim_time": EPOCH.plus_micros(ordinal * 1_000_000).iso(),
        "tick": ordinal,
        "thing_id": "platform-a",
        "datastream_id": "ds-temperature",
        "sensor_id": "sensor-temperature",
        "feature_of_interest_id": "foi-burst",
        "observed_property": "temperature",
        "result": 12.0 + ordinal * 0.001,
        "location": {"latitude": 49.0, "longitude": -4.5, "depth_m": 10.0},
        "context": {
            "thing": {"name": "sampling platform A", "description": "A coordinate and a sampler."},
            "sensor": {
                "name": "simulated temperature sensor",
                "description": "Simulated temperature instrument with a seeded noise model.",
                "encoding_type": "text/plain",
                "metadata": "Gaussian noise, standard deviation 0.02 degC.",
            },
            "observed_property": {
                "id": "sea_water_temperature",
                "name": "sea water temperature",
                "definition": "sea_water_temperature",
                "description": "Temperature of sea water.",
            },
            "datastream": {
                "name": "temperature at platform A",
                "description": "Simulated temperature series.",
                "observation_type": "OM_Measurement",
                "unit_of_measurement": {
                    "name": "degree Celsius",
                    "symbol": "degC",
                    "definition": "degree_C",
                },
            },
            "feature_of_interest": {
                "name": "sampling location burst",
                "description": "Where an observation pertains to. Not a location history.",
                "encoding_type": "application/geo+json",
            },
        },
    }


def burst(broker: support.Broker, count: int) -> None:
    """Publish faster than the client can write, through the broker, as a sensor."""
    from paho.mqtt import client as mqtt

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, protocol=mqtt.MQTTv5)
    client.username_pw_set("drogna_sensor", support.ROLES["drogna_sensor"])
    client.connect("127.0.0.1", broker.port)
    client.loop_start()
    try:
        for ordinal in range(count):
            message = client.publish(
                "obs/platform-a/ds-temperature",
                json.dumps(observation(ordinal)).encode("utf-8"),
                qos=1,
            )
            message.wait_for_publish()
    finally:
        client.loop_stop()
        client.disconnect()


def ticks(count: int) -> list[Any]:
    clock = ManualClock(
        run_id=RUN_ID, epoch=EPOCH, tick_interval_us=1_000_000, mode=ClockMode.LOCKSTEP
    )
    return [clock.tick(), *(clock.advance() for _ in range(count - 1))]


@pytest.fixture(scope="module")
def outcome(broker: support.Broker, store: support.Store) -> dict[str, Any]:
    """Run the burst once and let every assertion below read what it did."""
    document = support.destination_config("ingest")
    document["broker"]["url"] = broker.url("drogna_ingest")
    section = document["ingest"]

    subscriber = PahoSubscriber(BrokerEndpoint.from_config(document["broker"]), qos=1)
    subscriber.connect()
    connection = psycopg.connect(store.dsn("drogna_ingest"))
    telemetry = TelemetryPublisher(subscriber, component="ingest", interval_seconds=1.0)
    service = IngestService(
        source=subscriber,
        writer=ObservationWriter(
            connection,
            schema=section["store"]["schema"],
            tables=StoreTables.from_config(section["store"]["tables"]),
        ),
        queue=BoundedQueue(QUEUE_BOUND),
        batcher=Batcher(maximum_messages=BATCH_MESSAGES, maximum_interval_seconds=5.0),
        rejections=RejectionLog(int(section["rejections"]["maximum_retained"])),
        telemetry=telemetry,
        poll_timeout=0.05,
    )

    reports: list[dict[str, Any]] = []
    listener = broker.background_subscriber("drogna_control", "ctl/telemetry", seconds=90)
    try:
        burst(broker, BURST)
        schedule = ticks(BURST * 6)
        # harness:allow-wallclock test harness setup; deciding when to stop waiting
        deadline = time.monotonic() + DRAIN_TIMEOUT_SECONDS
        depths: list[int] = []
        for tick in schedule:
            if time.monotonic() > deadline:
                break
            service.on_tick(tick)
            depths.append(service.counters.queue.depth)
            if service.counters.stored >= BURST:
                break
        service.flush(schedule[-1], force=True)
        telemetry.publish(schedule[-1], service.counters)
        support._run(["docker", "stop", listener], check=False)
        for line in (
            support._run(["docker", "logs", listener], check=False).stdout.decode().split("\n")
        ):
            if line.strip().startswith("{"):
                reports.append(json.loads(line))
    finally:
        support._run(["docker", "rm", "-f", listener], check=False)
        subscriber.close()
        connection.close()

    return {
        "service": service,
        "reports": reports,
        "depths": depths,
        "stored": int(store.scalar("SELECT count(*) FROM observations.observation")),
        "distinct": int(store.scalar("SELECT count(DISTINCT id) FROM observations.observation")),
    }


def test_the_queue_never_exceeds_its_bound(outcome: dict[str, Any]) -> None:
    """SC-006: the bound holds under a burst many times the batch size."""
    service: IngestService = outcome["service"]
    assert max(outcome["depths"]) <= QUEUE_BOUND
    assert service.counters.queue.high_water <= QUEUE_BOUND


def test_the_bound_was_actually_reached(outcome: dict[str, Any]) -> None:
    """Otherwise the test above would pass against a burst that never pressed on anything."""
    service: IngestService = outcome["service"]
    assert service.counters.queue.high_water == QUEUE_BOUND


def test_no_observation_is_lost_once_the_burst_has_been_worked_off(
    outcome: dict[str, Any],
) -> None:
    """SC-006's second half: the backlog drains and the counts reconcile."""
    service: IngestService = outcome["service"]
    assert service.counters.received == BURST
    assert service.counters.rejections == 0
    assert outcome["stored"] == BURST
    assert outcome["distinct"] == BURST


def test_the_indicator_appears_on_the_telemetry_topic_and_then_clears(
    outcome: dict[str, Any],
) -> None:
    """SC-007: the condition is visible to something other than a person tailing a log."""
    reports = [report for report in outcome["reports"] if report.get("component") == "ingest"]
    assert reports, "the ingest client published no telemetry at all"
    assert any(report["queue"]["at_bound"] for report in reports), (
        "the backpressure indicator never appeared, though the queue reached its bound"
    )
    assert reports[-1]["queue"]["at_bound"] is False
    assert reports[-1]["queue"]["depth"] == 0


def test_the_telemetry_carries_the_write_rate_and_the_refusals(outcome: dict[str, Any]) -> None:
    reports = [report for report in outcome["reports"] if report.get("component") == "ingest"]
    last = reports[-1]
    assert last["write"]["stored"] == BURST
    assert last["write"]["rate_per_simulation_second"] >= 0
    assert last["rejections"]["count"] == 0
    assert last["broker"]["lost"] == 0


def test_nothing_was_acknowledged_that_was_not_written(outcome: dict[str, Any]) -> None:
    """The ordering the whole design rests on, seen from the counts it produces."""
    service: IngestService = outcome["service"]
    assert service.counters.stored + service.counters.duplicates == service.counters.received
