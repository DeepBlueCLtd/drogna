"""Each of the four services reads one file, validates it first, and dies readably if it cannot.

Constitution IV as behaviour rather than as intention. Every service is started with exactly
one environment variable; the file it names is validated against the packaged schema before
any other I/O; and each of the four ways that can fail has its own exit code so a supervisor
can tell them apart without parsing text.

The four entry points are exercised together because the requirement is on all four equally,
and because a component that quietly grew a second environment variable would pass its own
tests and fail this one.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from control_loop import (
    Recorder,
    manual_clock,
    model_runner_document,
    monitor_document,
    publisher_document,
    scheduler_document,
)
from harness_core.config import (
    EXIT_CONFIG_INVALID,
    EXIT_NO_CONFIG_VARIABLE,
    HARNESS_CONFIG_VARIABLE,
)
from harness_model_runner.__main__ import main as run_model_runner
from harness_monitor.__main__ import main as run_monitor
from harness_publisher.__main__ import main as run_publisher
from harness_scheduler.__main__ import main as run_scheduler
from runner_support import ground_truth

ENTRY_POINTS = {
    "monitor": (run_monitor, monitor_document),
    "scheduler": (run_scheduler, scheduler_document),
    "model_runner": (run_model_runner, model_runner_document),
    "publisher": (run_publisher, publisher_document),
}


def write(tmp_path: Path, name: str, document: dict) -> dict[str, str]:
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {HARNESS_CONFIG_VARIABLE: str(path)}


class NoForecast:
    def current(self):
        return None


def extras(name: str, tmp_path: Path) -> dict:
    """What each entry point needs beyond configuration, injected rather than reached for."""
    if name == "monitor":
        return {"forecasts": NoForecast()}
    if name == "model_runner":
        return {"ground_truth": ground_truth()}
    return {}


@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_a_service_with_no_configuration_variable_refuses_to_start(name: str) -> None:
    entry, _ = ENTRY_POINTS[name]

    with pytest.raises(SystemExit) as raised:
        entry(env={}, clock=manual_clock(), stderr=io.StringIO())

    assert raised.value.code == EXIT_NO_CONFIG_VARIABLE


@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_a_service_with_an_invalid_configuration_refuses_to_start(
    name: str, tmp_path: Path
) -> None:
    entry, document = ENTRY_POINTS[name]
    broken = document()
    broken["component"] = {"id": "not a valid id"}
    env = write(tmp_path, name, broken)

    with pytest.raises(SystemExit) as raised:
        entry(env=env, clock=manual_clock(), stderr=io.StringIO())

    assert raised.value.code == EXIT_CONFIG_INVALID


@pytest.mark.parametrize("name", sorted(ENTRY_POINTS))
def test_a_service_with_a_valid_configuration_starts_and_heartbeats(
    name: str, tmp_path: Path
) -> None:
    entry, document = ENTRY_POINTS[name]
    settings = document()
    env = write(tmp_path, name, settings)
    recorder = Recorder()

    code = entry(
        env=env,
        clock=manual_clock(),
        publisher=recorder,
        stderr=io.StringIO(),
        **extras(name, tmp_path),
    )

    assert code == 0
    assert [beat["component"] for beat in recorder.on("ctl/heartbeat")] == [name]
