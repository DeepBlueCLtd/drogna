"""Helpers for the ingest client's tests: messages, and a connection that is not a database.

The recording connection is deliberately dumb. What the writer's tests are about is the
order of statements, the transaction boundary and the counting of duplicates; a real
database is the integration tests' business and it is exercised there against a real
Postgres.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_ingest.subscriber import Delivery

EPOCH = SimInstant.from_iso("2026-09-01T00:00:00.000000Z")
ROOT_SEED = 20260826


def clock(tick_interval_us: int = 60_000_000) -> ManualClock:
    return ManualClock(
        run_id="run-0001",
        epoch=EPOCH,
        tick_interval_us=tick_interval_us,
        mode=ClockMode.LOCKSTEP,
    )


def observation(
    ordinal: int = 0,
    *,
    measured: str = "temperature",
    sim_time: str = "2026-09-01T00:00:00.000000Z",
    identifier: str | None = None,
) -> dict[str, Any]:
    """One well-formed observation, in the shape the master defines."""
    units = {
        "temperature": ("degree Celsius", "degC", "degree_C", "sea_water_temperature"),
        "salinity": ("practical salinity unit", "psu", "1e-3", "sea_water_practical_salinity"),
        "pressure": ("decibar", "dbar", "dbar", "sea_water_pressure"),
    }
    unit_name, symbol, definition, cf_name = units[measured]
    return {
        "observation_id": identifier or f"obs-{ordinal:016x}",
        "scenario_run_id": "run-0001",
        "sim_time": sim_time,
        "tick": ordinal,
        "thing_id": "platform-a",
        "datastream_id": f"ds-{measured}",
        "sensor_id": f"sensor-{measured}",
        "feature_of_interest_id": "foi-000000000001",
        "observed_property": measured,
        "result": 12.5 + ordinal * 0.1,
        "location": {"latitude": 49.0, "longitude": -4.5, "depth_m": 25.0},
        "context": {
            "thing": {
                "name": "sampling platform A",
                "description": "A simulated sampling platform. A coordinate and a sampler.",
            },
            "sensor": {
                "name": f"simulated {measured} sensor",
                "description": f"Simulated {measured} instrument with a seeded noise model.",
                "encoding_type": "text/plain",
                "metadata": "Gaussian noise, standard deviation 0.02 degC.",
            },
            "observed_property": {
                "id": cf_name,
                "name": cf_name.replace("_", " "),
                "definition": cf_name,
                "description": f"{measured.capitalize()} of sea water.",
            },
            "datastream": {
                "name": f"{measured} at platform A",
                "description": f"Simulated {measured} series.",
                "observation_type": "OM_Measurement",
                "unit_of_measurement": {
                    "name": unit_name,
                    "symbol": symbol,
                    "definition": definition,
                },
            },
            "feature_of_interest": {
                "name": "sampling location 000000000001",
                "description": "Where an observation pertains to. Not a location history.",
                "encoding_type": "application/geo+json",
            },
        },
    }


def delivery(payload: Any, *, mid: int = 1, topic: str | None = None, qos: int = 1) -> Delivery:
    """One received message, as the subscriber hands it over."""
    if isinstance(payload, bytes):
        raw = payload
        subject = topic or "obs/platform-a/ds-temperature"
    else:
        raw = json.dumps(payload).encode("utf-8")
        thing = payload.get("thing_id", "platform-a")
        datastream = payload.get("datastream_id", "ds-temperature")
        subject = topic or f"obs/{thing}/{datastream}"
    return Delivery(topic=subject, payload=raw, mid=mid, qos=qos)


@dataclass
class RecordingCursor:
    """Records every statement, and says whether a row was inserted or already there."""

    statements: list[tuple[str, list[Any]]] = field(default_factory=list)
    seen: set[str] = field(default_factory=set)
    rowcount: int = 0
    fail_on: str | None = None

    def execute(self, statement: str, parameters: list[Any] | None = None) -> None:
        values = list(parameters or [])
        if self.fail_on is not None and self.fail_on in statement:
            raise RuntimeError("the store is not there")
        self.statements.append((statement, values))
        key = f"{statement.split()[2]}:{values[0] if values else ''}"
        self.rowcount = 0 if key in self.seen else 1
        self.seen.add(key)

    def close(self) -> None:
        return None


@dataclass
class RecordingConnection:
    """A connection that remembers whether it was committed or rolled back."""

    cursor_object: RecordingCursor = field(default_factory=RecordingCursor)
    commits: int = 0
    rollbacks: int = 0

    def cursor(self) -> RecordingCursor:
        return self.cursor_object

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


class RecordingSource:
    """A message source with no broker behind it, which records pause and acknowledgement."""

    def __init__(self, deliveries: list[Delivery] | None = None) -> None:
        self.queued = list(deliveries or [])
        self.acknowledged: list[Delivery] = []
        self.paused = False
        self.pauses = 0
        self.resumes = 0

    def offer(self, delivery_: Delivery) -> None:
        self.queued.append(delivery_)

    def deliveries(self, timeout: float = 0.0) -> Any:
        while self.queued and not self.paused:
            yield self.queued.pop(0)

    def acknowledge(self, deliveries: list[Delivery]) -> None:
        self.acknowledged.extend(deliveries)

    def pause(self) -> None:
        if not self.paused:
            self.pauses += 1
        self.paused = True

    def resume(self) -> None:
        if self.paused:
            self.resumes += 1
        self.paused = False
