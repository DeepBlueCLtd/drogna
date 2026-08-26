"""Starting up: configuration first, and an absent broker is a refusal rather than a pretence.

The edge case the specification names first. A sensor whose broker is not there retries with
bounded backoff driven by the simulation clock, publishes no heartbeat, and exits with a
code a supervisor can act on. What it must not do is publish to a stub or report itself
alive: a component that lights up in the client without being connected is exactly the
failure Constitution VII exists to prevent.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

import pytest
import sensors_support as support
from harness_core.clock import ClockMode, ManualClock
from harness_sensors.__main__ import EXIT_NO_BROKER, main
from harness_sensors.publisher import topic_for


class CollectingPublisher:
    """Whatever the component publishes, kept for the test to read."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, bytes]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.messages.append((topic, payload))


def configuration(tmp_path: Path, **overrides: Any) -> Path:
    """The tracked local configuration, with whatever this test needs changed."""
    root = Path(__file__).resolve().parents[3]
    document = json.loads((root / "config" / "local" / "sensors.json").read_text(encoding="utf-8"))
    document["sensors"]["sampling"]["maximum_samples"] = 2
    for key, value in overrides.items():
        if key == "broker_url":
            document["broker"]["url"] = value
    return _write(tmp_path, document)


def _write(tmp_path: Path, document: dict[str, Any]) -> Path:
    path = tmp_path / "sensors.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def ticks(count: int) -> list[Any]:
    clock = ManualClock(
        run_id="run-0001",
        epoch=support.EPOCH,
        tick_interval_us=600_000_000,
        mode=ClockMode.LOCKSTEP,
    )
    return [clock.tick(), *(clock.advance() for _ in range(count - 1))]


def test_a_broker_that_is_not_there_is_reported_and_nothing_is_published(
    tmp_path: Path,
) -> None:
    """The port is one nothing is listening on, so the connection fails as it would live."""
    config = configuration(tmp_path, broker_url="mqtt://drogna_sensor@127.0.0.1:1")
    stderr = io.StringIO()
    code = main(
        env={"HARNESS_CONFIG": str(config)},
        ticks=iter(ticks(40)),
        field=support.LinearField(),
        stderr=stderr,
    )
    assert code == EXIT_NO_BROKER
    report = stderr.getvalue()
    assert "the broker is not reachable" in report
    assert "simulation seconds before attempt" in report


def test_the_backoff_is_spent_in_simulation_time_and_gives_up_when_the_clock_stops(
    tmp_path: Path,
) -> None:
    """Too few ticks to wait through the backoff: the component says so rather than spinning."""
    config = configuration(tmp_path, broker_url="mqtt://drogna_sensor@127.0.0.1:1")
    stderr = io.StringIO()
    code = main(
        env={"HARNESS_CONFIG": str(config)},
        ticks=iter(ticks(2)),
        field=support.LinearField(),
        stderr=stderr,
    )
    assert code == EXIT_NO_BROKER
    assert "the clock stopped while waiting to reconnect" in stderr.getvalue()


def test_an_invalid_configuration_stops_the_component_before_any_other_work(
    tmp_path: Path,
) -> None:
    path = tmp_path / "sensors.json"
    path.write_text(json.dumps({"component": {"id": "sensors"}}), encoding="utf-8")
    with pytest.raises(SystemExit) as stopped:
        main(
            env={"HARNESS_CONFIG": str(path)},
            ticks=iter(ticks(2)),
            field=support.LinearField(),
            stderr=io.StringIO(),
        )
    assert stopped.value.code == 81


def test_every_topic_published_matches_the_naming_convention(tmp_path: Path) -> None:
    """FR-003 and US2 scenario 5: obs/<thing-id>/<datastream-id>, and nothing else in use."""
    config = configuration(tmp_path)
    publisher = CollectingPublisher()
    code = main(
        env={"HARNESS_CONFIG": str(config)},
        ticks=iter(ticks(3)),
        publisher=publisher,
        field=support.LinearField(),
        stderr=io.StringIO(),
    )
    assert code == 0

    document = json.loads(config.read_text(encoding="utf-8"))
    thing = document["sensors"]["platform"]["id"]
    datastreams = {entry["id"] for entry in document["sensors"]["datastreams"]}
    expected = {topic_for(thing, datastream) for datastream in datastreams}

    observations = [topic for topic, _ in publisher.messages if topic.startswith("obs/")]
    control = {topic for topic, _ in publisher.messages if not topic.startswith("obs/")}
    assert set(observations) == expected
    assert control == {"ctl/heartbeat"}
    for topic in observations:
        assert len(topic.split("/")) == 3


def test_the_heartbeat_carries_the_component_and_the_simulation_time(tmp_path: Path) -> None:
    """US1 scenario 4: the client lights a component from liveness alone."""
    publisher = CollectingPublisher()
    main(
        env={"HARNESS_CONFIG": str(configuration(tmp_path))},
        ticks=iter(ticks(3)),
        publisher=publisher,
        field=support.LinearField(),
        stderr=io.StringIO(),
    )
    heartbeats = [
        json.loads(payload) for topic, payload in publisher.messages if topic == "ctl/heartbeat"
    ]
    assert heartbeats
    first = heartbeats[0]
    assert first["component"] == "sensors"
    assert first["sim_time"].endswith("Z")
    assert first["status"] == "starting"
    assert heartbeats[-1]["status"] == "stopping"


def test_a_topic_cannot_be_composed_from_an_identifier_carrying_a_separator() -> None:
    with pytest.raises(ValueError, match="identifiers carry no separator"):
        topic_for("platform-a", "ds/temperature")
