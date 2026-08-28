"""A service that starts before the store is seeded says so, keeps going, and invents nothing.

009 T059, as the delivery plan's 28 August decision leaves it. The credential half of that
task is dissolved — the observation store moves to trust authentication, so nothing waits on
a password a seeding step assigns — and what remains for the loop's services is the state
they genuinely start in: a coverage store with nothing in it. Every one of them is brought up
before the store is seeded, every time, because seeding runs after the bring-up.

The requirement is that this is a normal start and not a degradation. A component must not
exit, must not invent a field to score against, and must not report itself doing work it is
not doing. What it must do is keep beating and say what is true, which is what these tests
assert: the store is read through the real reader against a real empty directory, not through
an injected stub that could not tell the difference.

The two components that depend on the *environment* store rather than the coverage store —
the model runner's ground truth and the planner's decorrelation timescale — are deliberately
not covered here. That store is written by a one-shot component and Compose orders it with
`service_completed_successfully`, so there is no window in which a container starts before
it; a retry there would duplicate an ordering the platform already guarantees and would hide
a genuinely broken generator behind a spinner. `specs/009-control-loop/tasks.md` T059 records
that reasoning where the decision is.
"""

from __future__ import annotations

import io
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import planner_support
import pytest
import telemetry_support
from control_loop import (
    Recorder,
    manual_clock,
    monitor_document,
    publisher_document,
)
from harness_core.broker import IDLE
from harness_core.config import HARNESS_CONFIG_VARIABLE
from harness_monitor.__main__ import main as run_monitor
from harness_planner.__main__ import main as run_planner
from harness_publisher.__main__ import main as run_publisher
from harness_telemetry.__main__ import main as run_telemetry

HEARTBEAT_TOPIC = "ctl/heartbeat"
# What a component must never say about an empty store: that something is current.
IDLE_TURNS = 2


def _write(tmp_path: Path, name: str, document: dict[str, Any]) -> dict[str, str]:
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {HARNESS_CONFIG_VARIABLE: str(path)}


def _turns() -> Iterator[tuple[str, bytes]]:
    yield from [IDLE] * IDLE_TURNS


def _empty_store(tmp_path: Path) -> Path:
    """A coverage store as `scripts/up.sh` leaves one: the volume exists and holds nothing."""
    root = tmp_path / "coverage"
    root.mkdir(parents=True)
    return root


def _entry_points(tmp_path: Path) -> dict[str, tuple[Any, dict[str, Any], dict[str, Any]]]:
    root = _empty_store(tmp_path)
    coverage = {
        "root_directory": str(root),
        "current_pointer": "current",
        "runs_dirname": "runs",
        "forecast_file": "forecast.nc",
    }
    telemetry = telemetry_support.configuration()
    telemetry["telemetry"]["coverage"] = coverage
    planner = planner_support.configuration()
    planner["planner"]["coverage"] = {
        **planner["planner"]["coverage"],
        "root_directory": str(root),
    }
    return {
        # No `forecasts`, no `fields`: the real reader, against the real empty directory.
        "monitor": (run_monitor, monitor_document(root_directory=str(root)), {}),
        "telemetry": (run_telemetry, telemetry, {}),
        "planner": (run_planner, planner, {"timescales": planner_support.Timescales()}),
        "publisher": (
            run_publisher,
            publisher_document(staging=str(root / "staging"), catalogue=str(root)),
            {},
        ),
    }


@pytest.mark.parametrize("name", ["monitor", "telemetry", "planner", "publisher"])
def test_a_component_that_starts_against_an_empty_store_stays_up_and_beats(
    name: str, tmp_path: Path
) -> None:
    """Not an error, not a degraded mode: the state every bring-up begins in."""
    entry, document, injected = _entry_points(tmp_path)[name]
    recorder = Recorder()

    code = entry(
        env=_write(tmp_path, name, document),
        clock=manual_clock(),
        publisher=recorder,
        messages=_turns(),
        stderr=io.StringIO(),
        **injected,
    )

    assert code == 0
    assert [beat["component"] for beat in recorder.on(HEARTBEAT_TOPIC)] != []


@pytest.mark.parametrize("name", ["monitor", "telemetry", "planner", "publisher"])
def test_nothing_claims_a_current_run_against_a_store_that_holds_none(
    name: str, tmp_path: Path
) -> None:
    """Constitution VII: a component reports what is, and an empty store is a thing that is."""
    entry, document, injected = _entry_points(tmp_path)[name]
    recorder = Recorder()

    entry(
        env=_write(tmp_path, name, document),
        clock=manual_clock(),
        publisher=recorder,
        messages=_turns(),
        stderr=io.StringIO(),
        **injected,
    )

    for beat in recorder.on(HEARTBEAT_TOPIC):
        assert beat["status"] in {"starting", "ok", "degraded"}
        assert "run-" not in beat.get("detail", ""), (
            f"{name} named a run in its heartbeat against a store that holds none"
        )


def test_the_publisher_takes_nothing_from_a_staging_directory_that_does_not_exist(
    tmp_path: Path,
) -> None:
    """The state a first bring-up is in: the volume is empty and staging has not been made."""
    root = _empty_store(tmp_path)
    recorder = Recorder()

    code = run_publisher(
        env=_write(
            tmp_path,
            "publisher",
            publisher_document(staging=str(root / "staging"), catalogue=str(root)),
        ),
        clock=manual_clock(),
        publisher=recorder,
        messages=_turns(),
        stderr=io.StringIO(),
    )

    assert code == 0
    assert recorder.on("ctl/run-published") == []
    assert not (root / "current").exists()
