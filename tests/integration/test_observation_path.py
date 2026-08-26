"""Publish to store, end to end, against a real broker and a real Postgres.

The MVP slice of feature 007, asserted where it can actually be wrong. Sensors sample a
generated world and publish on ``obs/<thing-id>/<datastream-id>`` through Mosquitto loaded
with this feature's access control lists; the ingest client subscribes with its own
credentials, validates every message against the generated type, batches and writes in one
transaction as the only role that can.

Three claims are tested, and they are the three the specification makes.

**One row per published message.** No duplicates, no losses, counted at both ends.

**What is stored is what the world held.** Every stored value is compared against the
generator's own analytic ground truth at that observation's coordinates and simulation
time, and the difference is reported as a figure rather than asserted to be small
(Constitution IX).

**Two runs from one root seed produce the same store.** The second run's messages carry the
identifiers the first run's rows are keyed by, so every one of them is a no-op and the
store's digest is unchanged.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import observation_path as support
import psycopg
import pytest
from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_core.rng import configure_run, reset_run
from harness_env_generator.evaluator import Evaluator
from harness_env_generator.generate import generate
from harness_env_generator.manifest import serialise
from harness_ingest.backpressure import BoundedQueue
from harness_ingest.batcher import Batcher
from harness_ingest.service import IngestService
from harness_ingest.subscriber import BrokerEndpoint, PahoSubscriber
from harness_ingest.validation import RejectionLog
from harness_ingest.writer import ObservationWriter, StoreTables
from harness_sensors.__main__ import main as sensors_main

pytestmark = pytest.mark.skipif(
    not support.docker_available(),
    reason="no container runtime is reachable: the broker and the store in these tests are real",
)

ROOT_SEED = 20260826
RUN_ID = "run-0001"
EPOCH = SimInstant.from_iso("2026-09-01T00:00:00.000000Z")
SAMPLE_INTERVAL_SECONDS = 600
EVENTS = 8
DRAIN_TIMEOUT_SECONDS = 60.0


@pytest.fixture(scope="module")
def broker(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Broker]:
    yield from support.start_broker(tmp_path_factory.mktemp("broker"))


@pytest.fixture(scope="module")
def store(tmp_path_factory: pytest.TempPathFactory) -> Iterator[support.Store]:
    yield from support.start_store(tmp_path_factory.mktemp("store"))


@pytest.fixture(scope="module")
def world(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A generated world and its ground-truth manifest, written where the sensors expect."""
    directory = tmp_path_factory.mktemp("environment")
    document = support.destination_config("env_generator")
    grid = document["env_generator"]["grid"]
    for axis in ("latitude", "longitude", "depth"):
        grid[axis]["count"] = 7
    grid["time"]["count"] = 4
    configure_run(ROOT_SEED)
    generated = generate(
        document,
        run_id=RUN_ID,
        config_digest="sha256:" + hashlib.sha256(b"integration").hexdigest(),
        root_seed=ROOT_SEED,
        sim_time=EPOCH.iso(),
        tick=0,
    )
    reset_run()
    manifest = directory / document["env_generator"]["output"]["manifest_file"]
    manifest.write_bytes(serialise(generated.manifest))
    return directory


def ticks(count: int) -> list[Any]:
    clock = ManualClock(
        run_id=RUN_ID,
        epoch=EPOCH,
        tick_interval_us=SAMPLE_INTERVAL_SECONDS * 1_000_000,
        mode=ClockMode.LOCKSTEP,
    )
    return [clock.tick(), *(clock.advance() for _ in range(count - 1))]


def sensors_config(tmp_path: Path, broker: support.Broker, world: Path, *, events: int) -> Path:
    document = support.destination_config("sensors")
    document["broker"]["url"] = broker.url("drogna_sensor")
    document["sensors"]["field"]["directory"] = str(world)
    document["sensors"]["sampling"]["interval_seconds"] = float(SAMPLE_INTERVAL_SECONDS)
    document["sensors"]["sampling"]["maximum_samples"] = events
    return support.write_config(tmp_path, "sensors", document)


@dataclass
class Ingest:
    """The ingest client, assembled from the tracked configuration with a real store."""

    service: IngestService
    subscriber: PahoSubscriber
    connection: Any

    def close(self) -> None:
        self.subscriber.close()
        self.connection.close()


def start_ingest(broker: support.Broker, store: support.Store, **overrides: Any) -> Ingest:
    document = support.destination_config("ingest")
    document["broker"]["url"] = broker.url("drogna_ingest")
    section = document["ingest"]
    subscriber = PahoSubscriber(
        BrokerEndpoint.from_config(document["broker"]),
        qos=int(section["subscription"]["qos"]),
    )
    subscriber.connect()
    connection = psycopg.connect(store.dsn("drogna_ingest"))
    service = IngestService(
        source=subscriber,
        writer=ObservationWriter(
            connection,
            schema=section["store"]["schema"],
            tables=StoreTables.from_config(section["store"]["tables"]),
        ),
        queue=BoundedQueue(int(overrides.get("queue_depth", section["queue"]["maximum_depth"]))),
        batcher=Batcher(
            maximum_messages=int(
                overrides.get("batch_messages", section["batch"]["maximum_messages"])
            ),
            maximum_interval_seconds=float(section["batch"]["maximum_interval_seconds"]),
        ),
        rejections=RejectionLog(int(section["rejections"]["maximum_retained"])),
        poll_timeout=0.05,
    )
    return Ingest(service=service, subscriber=subscriber, connection=connection)


def drain(ingest: Ingest, expected: int, schedule: list[Any]) -> None:
    """Pump the loop until everything published has been written, or give up loudly."""
    # harness:allow-wallclock test harness setup; deciding when to stop waiting for a broker
    deadline = time.monotonic() + DRAIN_TIMEOUT_SECONDS
    index = 0
    while time.monotonic() < deadline:
        tick = schedule[min(index, len(schedule) - 1)]
        ingest.service.on_tick(tick)
        if ingest.service.counters.received >= expected:
            break
        index += 1
    ingest.service.flush(schedule[-1], force=True)


def run_scenario(
    tmp_path: Path,
    broker: support.Broker,
    store: support.Store,
    world: Path,
    *,
    events: int = EVENTS,
) -> tuple[int, IngestService]:
    """One scenario: subscribe, publish, drain. Returns what was published and the loop."""
    ingest = start_ingest(broker, store)
    try:
        config = sensors_config(tmp_path, broker, world, events=events)
        schedule = ticks(events)
        code = sensors_main(env={"HARNESS_CONFIG": str(config)}, ticks=iter(schedule))
        assert code == 0
        document = support.destination_config("sensors")
        expected = (
            events
            * len(document["sensors"]["sampling"]["depths_m"])
            * len(document["sensors"]["datastreams"])
        )
        drain(ingest, expected, ticks(events * 4))
        return expected, ingest.service
    finally:
        ingest.close()


def store_digest(store: support.Store) -> str:
    """A digest over every stored observation, in simulation-time order."""
    rows = store.scalar(
        "SELECT string_agg(line, E'\\n') FROM (SELECT id || '|' || "
        "to_char(phenomenon_time AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '|' || "
        "result || '|' || datastream_id || '|' || feature_id AS line "
        "FROM observations.observation ORDER BY phenomenon_time, id) ordered"
    )
    return hashlib.sha256(rows.encode("utf-8")).hexdigest()


def test_every_published_observation_is_stored_exactly_once(
    tmp_path: Path, broker: support.Broker, store: support.Store, world: Path
) -> None:
    """SC-001: the counts reconcile, with zero duplicates and zero losses."""
    published, service = run_scenario(tmp_path, broker, store, world)
    assert service.counters.received == published
    assert service.counters.stored == published
    assert service.counters.duplicates == 0
    assert service.counters.rejections == 0
    assert int(store.scalar("SELECT count(*) FROM observations.observation")) == published
    assert int(store.scalar("SELECT count(DISTINCT id) FROM observations.observation")) == published


def test_the_entities_the_observations_refer_to_are_stored_once_each(
    store: support.Store,
) -> None:
    """The store is a function of the traffic: what the sensors published is what is here."""
    assert int(store.scalar("SELECT count(*) FROM observations.thing")) == 1
    assert int(store.scalar("SELECT count(*) FROM observations.datastream")) == 3
    assert int(store.scalar("SELECT count(*) FROM observations.observed_property")) == 3
    assert int(store.scalar("SELECT count(*) FROM observations.sensor")) == 3


def test_the_store_holds_the_three_measured_quantities_and_no_fourth(
    store: support.Store,
) -> None:
    """SC-012: no sound speed anywhere in the store, because it is derived at the point of use."""
    properties = store.scalar(
        "SELECT string_agg(id, ',' ORDER BY id) FROM observations.observed_property"
    )
    assert properties == ("sea_water_practical_salinity,sea_water_pressure,sea_water_temperature")
    assert (
        int(
            store.scalar(
                "SELECT count(*) FROM observations.observed_property WHERE id LIKE '%sound%'"
            )
        )
        == 0
    )


def test_observations_are_ordered_by_simulation_time_and_carry_no_other(
    store: support.Store,
) -> None:
    """FR-021: the store orders on the time the sample was taken, and holds no arrival time."""
    columns = store.scalar(
        "SELECT string_agg(column_name, ',' ORDER BY column_name) "
        "FROM information_schema.columns WHERE table_schema = 'observations' "
        "AND table_name = 'observation'"
    ).split(",")
    assert "phenomenon_time" in columns
    assert not [name for name in columns if name in {"received_at", "created_at", "inserted_at"}]
    defaults = store.scalar(
        "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'observations' "
        "AND column_default IS NOT NULL"
    )
    assert int(defaults) == 0


def test_a_stored_value_matches_the_generated_field_within_the_declared_noise(
    store: support.Store, world: Path
) -> None:
    """SC-011, reported as a figure: the difference is the sensor's noise and nothing else."""
    document = support.destination_config("sensors")
    manifest = json.loads(
        (world / document["sensors"]["field"]["manifest_file"]).read_text(encoding="utf-8")
    )
    evaluator = Evaluator.from_manifest(manifest)
    origin = SimInstant.from_iso(evaluator.grid.time.origin_sim_time)
    deviations = {
        entry["observed_property"]["measured"]: entry["noise"]["standard_deviation"]
        for entry in document["sensors"]["datastreams"]
    }
    quantity = {
        "sea_water_temperature": ("temperature_c", "temperature"),
        "sea_water_practical_salinity": ("salinity_psu", "salinity"),
        "sea_water_pressure": ("pressure_dbar", "pressure"),
    }

    rows = store.scalar(
        "SELECT string_agg(line, E'\\n') FROM (SELECT "
        "to_char(phenomenon_time AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US') || '|' || "
        "ST_Y(location::geometry) || '|' || ST_X(location::geometry) || '|' || depth_m || '|' || "
        "result || '|' || d.observed_property_id AS line "
        "FROM observations.observation o JOIN observations.datastream d "
        "ON d.id = o.datastream_id ORDER BY o.id) ordered"
    ).splitlines()
    assert rows

    worst: dict[str, float] = {}
    for line in rows:
        stamp, latitude, longitude, depth, result, observed = line.split("|")
        instant = SimInstant.from_iso(stamp + "Z")
        seconds = (instant - origin) / 1_000_000
        truth = evaluator.at(float(latitude), float(longitude), float(depth), seconds)
        attribute, measured = quantity[observed]
        difference = abs(float(result) - getattr(truth, attribute))
        worst[measured] = max(worst.get(measured, 0.0), difference)

    report = ", ".join(f"{name}: {value:.6g}" for name, value in sorted(worst.items()))
    for measured, difference in worst.items():
        limit = 6 * deviations[measured]
        assert difference <= limit, (
            f"largest difference from the generator's field, by quantity — {report}; "
            f"{measured} exceeded six standard deviations of its declared noise ({limit})"
        )
    assert any(value > 0 for value in worst.values()), (
        f"every stored value matched the field exactly ({report}); the seeded noise is "
        "not reaching the store"
    )


def test_two_runs_from_the_same_root_seed_produce_the_same_store(
    tmp_path: Path, broker: support.Broker, store: support.Store, world: Path
) -> None:
    """SC-002, and FR-017 at the same time: redelivery of a stored identifier is a no-op."""
    before = store_digest(store)
    published, service = run_scenario(tmp_path, broker, store, world)
    assert service.counters.received == published
    assert service.counters.stored == 0
    assert service.counters.duplicates == published
    assert store_digest(store) == before
