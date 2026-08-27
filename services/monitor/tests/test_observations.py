"""Reading observation traffic, and staying in step with the master that defines it.

The monitor reads five things out of an observation message: which platform it came from,
which of the three properties it carries, when it was measured, what the value was, and
where. ``contracts/schemas/observation.schema.json`` belongs to feature 007, which owns the
write path; this feature consumes it.

So the last test here is a contract test rather than an assumption. The adapter reads what it
needs and ignores the rest, which is what keeps it working when the master gains a field; the
failure it cannot survive is a *renamed* field, and that is what this checks. If the master is
not in the tree yet the check says so and skips, rather than passing quietly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from harness_monitor.observations import (
    ObservationError,
    ObservedProperty,
    SoundingAssembler,
    measurement_from,
)

MASTER = Path(__file__).resolve().parents[3] / "contracts" / "schemas" / "observation.schema.json"

MESSAGE = {
    "thing_id": "platform_a",
    "datastream_id": "temperature",
    "observed_property": "temperature",
    "sim_time": "2026-08-26T00:05:00.000000Z",
    "result": 12.5,
    "location": {"latitude": 49.0, "longitude": -5.0, "depth_m": 50.0},
}


def test_a_message_becomes_a_measurement() -> None:
    measurement = measurement_from(MESSAGE, sim_micros=300_000_000)

    assert measurement.platform == "platform_a"
    assert measurement.observed_property is ObservedProperty.TEMPERATURE
    assert measurement.value == 12.5
    assert (measurement.latitude, measurement.longitude, measurement.depth_m) == (
        49.0,
        -5.0,
        50.0,
    )


def test_a_fourth_observed_property_is_refused() -> None:
    """ADR-0005: there is no sound speed datastream, so a message claiming one is a fault."""
    with pytest.raises(ObservationError) as raised:
        measurement_from({**MESSAGE, "observed_property": "sound_speed"}, sim_micros=0)

    assert "derived at the point of use" in str(raised.value)


def test_a_message_missing_its_position_is_refused_rather_than_placed_at_zero() -> None:
    payload = {key: value for key, value in MESSAGE.items() if key != "location"}

    with pytest.raises(ObservationError):
        measurement_from(payload, sim_micros=0)


def test_extra_fields_the_monitor_does_not_read_are_ignored() -> None:
    """The write path carries more than the monitor needs, and gaining a field is not a break."""
    measurement = measurement_from(
        {**MESSAGE, "sensor_id": "sensor_a", "context": {"anything": 1}}, sim_micros=0
    )

    assert measurement.platform == "platform_a"


def test_a_sounding_needs_all_three_properties() -> None:
    assembler = SoundingAssembler(maximum_pending=4)

    salinity = {**MESSAGE, "observed_property": "salinity", "result": 35.1}
    pressure = {**MESSAGE, "observed_property": "pressure", "result": 50.3}

    assert assembler.accept(measurement_from(MESSAGE, sim_micros=0)) is None
    assert assembler.accept(measurement_from(salinity, sim_micros=0)) is None
    completed = assembler.accept(measurement_from(pressure, sim_micros=0))

    assert completed is not None


def test_the_field_names_the_adapter_reads_are_the_ones_the_master_declares() -> None:
    """The coupling to feature 007, checked rather than assumed."""
    if not MASTER.is_file():
        pytest.skip("contracts/schemas/observation.schema.json has not landed yet")

    document = json.loads(MASTER.read_text(encoding="utf-8"))
    properties = set(document["properties"])
    location = set(document["$defs"]["location"]["properties"])
    observed = set(document["$defs"]["observed_property"]["enum"])

    assert {"thing_id", "observed_property", "sim_time", "result", "location"} <= properties
    assert {"latitude", "longitude", "depth_m"} <= location
    assert observed == {member.value for member in ObservedProperty}
