"""C-01 as a running component: the first thing in drogna that can light a box.

The client's shell has drawn eighteen components since feature 003 landed and has never
lit one, because nothing had ever published a heartbeat. This is the test that says the
clock does — not against a stub of the message shape, but against the neutral master in
``contracts/schemas/``, which is what the client reads and what every later component must
publish too (Constitution VII, FR-52).

Three things are checked end to end, through :func:`harness_clock.__main__.main` rather
than through the pieces:

1. Running the component publishes simulation time on ``ctl/clock`` and its own liveness on
   ``ctl/heartbeat``, and both validate against their masters.
2. At rate zero it publishes no simulation time and keeps publishing liveness (ADR-0006).
   This is FR-53's screenshot case: pausing the simulated world must not grey out the
   processes simulating it.
3. The clock serves the routes its clients are configured to call, at both destinations.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_clock.__main__ import main
from harness_clock.service import manifest_path
from harness_core.clock import CLOCK_TOPIC
from harness_core.config import validate_document
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_core.rng import reset_run

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = REPOSITORY_ROOT / "contracts" / "schemas"
CONFIGS = REPOSITORY_ROOT / "config"
DESTINATIONS = ("local", "droplet")


def schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


class Recorder:
    def __init__(self) -> None:
        self.messages: list[tuple[str, dict[str, Any]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.messages.append((topic, json.loads(payload.decode("utf-8"))))

    def on(self, topic: str) -> list[dict[str, Any]]:
        return [message for name, message in self.messages if name == topic]


def _free_port() -> int:
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _configured(tmp_path: Path, **service: Any) -> dict[str, str]:
    """The shipped local configuration, redirected at a scratch directory and a free port."""
    document = json.loads((CONFIGS / "local" / "clock.json").read_text(encoding="utf-8"))
    document["clock_service"]["bind"] = {"host": "127.0.0.1", "port": _free_port()}
    document["clock_service"]["manifest"] = {
        "directory": str(tmp_path / "run"),
        "file": "run-manifest.json",
    }
    document["clock_service"].update(service)
    path = tmp_path / "clock.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {"HARNESS_CONFIG": str(path)}


@pytest.fixture(autouse=True)
def _fresh_run() -> Any:
    reset_run()
    yield
    reset_run()


def test_running_the_clock_publishes_time_and_liveness(tmp_path: Path, capsys) -> None:
    recorder = Recorder()

    assert main(env=_configured(tmp_path), publisher=recorder, ticks=4) == 0

    samples = recorder.on(CLOCK_TOPIC)
    assert [sample["tick"] for sample in samples] == [0, 1, 2, 3]
    for sample in samples:
        validate_document(sample, schema("clock.schema.json"), source=CLOCK_TOPIC)

    heartbeats = recorder.on(HEARTBEAT_TOPIC)
    assert heartbeats, "nothing has ever lit a component in the shell; this is the first"
    for beat in heartbeats:
        validate_document(beat, schema("heartbeat.schema.json"), source=HEARTBEAT_TOPIC)
        assert beat["component"] == "clock"
        assert beat["run_id"] == "local-001"
        assert beat["config_digest"].startswith("sha256:")
        assert beat["liveness_window_seconds"] > beat["heartbeat_interval_seconds"]


def test_the_run_manifest_is_written_and_validates(tmp_path: Path) -> None:
    env = _configured(tmp_path)
    main(env=env, publisher=Recorder(), ticks=2)

    document = json.loads(Path(env["HARNESS_CONFIG"]).read_text(encoding="utf-8"))
    path = tmp_path / "run" / "run-manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))

    validate_document(manifest, schema("run-manifest.schema.json"), source=str(path))
    assert manifest["run_id"] == document["clock_service"]["run"]["id"]
    assert manifest["exit_state"]["state"] == "completed"
    assert manifest["exit_state"]["final_tick"] == 1
    assert manifest["clock"]["tick_interval_us"] == 100_000


def test_at_rate_zero_time_stops_and_liveness_does_not(tmp_path: Path) -> None:
    """FR-53's capture: pin the whole system still and it must not read as dead."""
    recorder = Recorder()
    env = _configured(tmp_path, default_mode="paused", default_rate=0.0)

    assert main(env=env, publisher=recorder, ticks=0) == 0

    assert recorder.on(CLOCK_TOPIC) == []
    heartbeats = recorder.on(HEARTBEAT_TOPIC)
    assert heartbeats
    for beat in heartbeats:
        validate_document(beat, schema("heartbeat.schema.json"), source=HEARTBEAT_TOPIC)
        assert beat["status"] in {"starting", "ok", "stopping"}
        assert beat["sim_time"] == "2026-01-01T00:00:00.000000Z"


def test_a_component_with_no_broker_publishes_nothing_and_says_so(tmp_path: Path, capsys) -> None:
    """Constitution VII: no stub, no demo mode. Nothing lights up, which is true."""
    assert main(env=_configured(tmp_path), publisher=None, ticks=1) == 0

    assert "nothing lights up" in capsys.readouterr().err


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_clock_serves_the_routes_its_clients_call(destination: str) -> None:
    """A clock listening on routes nobody calls would be a component nobody could reach."""
    directory = CONFIGS / destination
    served = json.loads((directory / "clock.json").read_text(encoding="utf-8"))["clock"]["routes"]

    for path in sorted(directory.glob("*.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        routes = document.get("clock", {}).get("routes")
        if routes is None:
            continue
        assert routes == served, f"{path.name} calls routes the clock does not serve"


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_manifest_directory_is_named_and_not_assumed(destination: str) -> None:
    """Constitution IV: the clock writes where configuration says, and nowhere else."""
    from harness_clock.config import load

    path = CONFIGS / destination / "clock.json"
    settings = load(env={"HARNESS_CONFIG": str(path)}).settings

    assert manifest_path(settings.clock_service).name.endswith(".json")
    assert str(manifest_path(settings.clock_service)).startswith("/")
