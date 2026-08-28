"""An idle turn is not a message, and every loop-side service still does its work on one.

The defect this is the regression test for was not that the components were wrong. It was
that their loops were written over arriving messages alone, so a component watching a quiet
branch published one heartbeat at start-up and then went silent — running perfectly, and
greyed out in the client, which is the single untruth the liveness display exists to prevent
(Constitution VII, ADR-0006). ``ctl/`` is a quiet branch: between one published run and the
next there may be nothing on it at all.

So the subscription yields ``IDLE`` when its interval elapses with nothing received, and each
loop does its own work on that turn as on any other. Two things are asserted here, because
either alone would pass against a component that had got the other wrong:

* the idle turn **is not routed** — every service routes on the topic it was handed, and no
  component's routing matches the empty topic the sentinel carries;
* the idle turn **still turns the loop** — heartbeats keep coming, and the publisher notices
  a run that finished assembling after its loop had already started.

The heartbeat interval is a real-time cadence (ADR-0006) and is set small here so the test
does not spend it. That is test harness setup measuring a real-time cadence, which is what
Constitution I permits.
"""

from __future__ import annotations

import io
import json
import time  # harness:allow-wallclock ADR-0006, this test measures a real-time cadence
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import planner_support
import pytest
import telemetry_support
from control_loop import (
    PARTIAL_SUFFIX,
    Recorder,
    manual_clock,
    model_runner_document,
    monitor_document,
    publisher_document,
    scheduler_document,
)
from harness_core.broker import IDLE
from harness_core.config import HARNESS_CONFIG_VARIABLE
from harness_model_runner.__main__ import main as run_model_runner
from harness_model_runner.service import RUN_REQUEST_TOPIC, ModelRunnerService
from harness_model_runner.staging import Staging
from harness_monitor.__main__ import main as run_monitor
from harness_monitor.service import MonitorService
from harness_planner.__main__ import main as run_planner
from harness_planner.service import PlannerService
from harness_publisher.__main__ import main as run_publisher
from harness_publisher.publish import RUN_PUBLISHED_TOPIC
from harness_scheduler.__main__ import main as run_scheduler
from harness_scheduler.service import SchedulerService
from harness_telemetry.__main__ import main as run_telemetry
from harness_telemetry.service import TelemetryService
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from runner_support import ground_truth, run_request

# Enough turns that a component beating on the interval below has had several chances, and
# few enough that the whole file is well under a second. Heartbeat cadence is real time
# (ADR-0006), so the turns are spaced in real time too: a loop that ran six turns inside one
# interval would prove nothing about whether it can beat on an idle turn.
IDLE_TURNS = 6
HEARTBEAT_SECONDS = 0.01

LOOP_TOPICS = frozenset(
    {"ctl/divergence", "ctl/run-request", "ctl/run-started", "ctl/run-published"}
)


class _NoForecast:
    """Nothing published yet, which is where every one of these components starts."""

    def current(self) -> None:
        return None


def _idle_turns(count: int = IDLE_TURNS) -> Iterator[tuple[str, bytes]]:
    """``count`` idle turns, spaced by the heartbeat interval as a real subscription spaces them."""
    for _ in range(count):
        time.sleep(HEARTBEAT_SECONDS)
        yield IDLE


def _write(tmp_path: Path, name: str, document: dict[str, Any]) -> dict[str, str]:
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {HARNESS_CONFIG_VARIABLE: str(path)}


def _beating(document: dict[str, Any]) -> dict[str, Any]:
    document["component"]["heartbeat_interval_seconds"] = HEARTBEAT_SECONDS
    return document


def _entry_points(tmp_path: Path) -> dict[str, tuple[Any, dict[str, Any], dict[str, Any]]]:
    """Each loop-side entry point, its configuration, and what it needs injected."""
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True, exist_ok=True)
    return {
        "monitor": (
            run_monitor,
            _beating(monitor_document(root_directory=str(catalogue))),
            {"forecasts": _NoForecast()},
        ),
        "scheduler": (run_scheduler, _beating(scheduler_document()), {}),
        "model_runner": (
            run_model_runner,
            _beating(model_runner_document(staging=str(tmp_path / "staging"))),
            {"ground_truth": ground_truth()},
        ),
        "publisher": (
            run_publisher,
            _beating(
                publisher_document(staging=str(tmp_path / "staging"), catalogue=str(catalogue))
            ),
            {},
        ),
        "telemetry": (
            run_telemetry,
            _beating(telemetry_support.configuration()),
            {"forecasts": _NoForecast()},
        ),
        "planner": (run_planner, _beating(planner_support.configuration()), _planner_injections()),
    }


def _planner_injections() -> dict[str, Any]:
    """The planner refuses to start without a timescale field, so one is injected."""
    return {
        "fields": planner_support.OneField(planner_support.Spread(0.8)),
        "timescales": planner_support.Timescales(),
    }


@pytest.mark.parametrize(
    "name", ["monitor", "scheduler", "model_runner", "publisher", "telemetry", "planner"]
)
def test_a_quiet_branch_still_produces_heartbeats(name: str, tmp_path: Path) -> None:
    """The defect, stated as its symptom: one beat at start-up and then nothing."""
    entry, document, injected = _entry_points(tmp_path)[name]
    recorder = Recorder()

    code = entry(
        env=_write(tmp_path, name, document),
        clock=manual_clock(),
        publisher=recorder,
        messages=_idle_turns(),
        stderr=io.StringIO(),
        **injected,
    )

    assert code == 0
    beats = recorder.on("ctl/heartbeat")
    assert len(beats) > 1, f"{name} beat once at start-up and then went silent"
    assert {beat["component"] for beat in beats} == {name}


def test_no_component_routes_the_idle_turn_to_a_handler() -> None:
    """The property that makes the sentinel safe, asserted where it lives: in the routing.

    Every service routes on the topic it was handed, and MQTT forbids a zero-length topic
    name, so the idle turn matches no filter any of them tests for. That is what lets the
    loops treat an idle turn as a turn rather than as a message, and it is asserted here
    rather than inferred: each ``handle`` is called with the sentinel and must do nothing at
    all with it — return nothing, publish nothing, and, the part that catches a routing
    predicate written the wrong way round, *not* count it as a payload it could not read. A
    component that routed the idle turn would reach a decoder, fail to decode an empty
    payload, and record the failure; silence alone would not distinguish the two.

    The publisher is absent because it routes nothing. Its input is a directory and its loop
    reads neither the topic nor the payload, which the test below is about.
    """
    for name, service, recorder, counts_unreadable in _routing_services():
        assert service.handle(*IDLE) is None, f"{name} routed the idle turn to a handler"
        assert recorder.published == [], f"{name} published in response to the idle turn"
        if counts_unreadable:
            assert service.unreadable == 0, (
                f"{name} counted the idle turn as a message it could not read"
            )


def _routing_services() -> Iterator[tuple[str, Any, Recorder, bool]]:
    """One of each service that routes on a topic, with a recorder watching what it says.

    The flag is whether the component counts a payload it could not read. The monitor,
    telemetry and the planner do, and that counter is what a mis-routed idle turn would move.
    The scheduler and the model runner do not: their handlers decode eagerly, so a mis-routed
    idle turn raises out of ``handle`` and the first assertion is what catches it.
    """
    for name, build, counts_unreadable in (
        ("monitor", _monitor_service, True),
        ("scheduler", _scheduler_service, False),
        ("model_runner", _model_runner_service, False),
        ("telemetry", _telemetry_service, True),
        ("planner", _planner_service, True),
    ):
        recorder = Recorder()
        yield name, build(recorder), recorder, counts_unreadable


def _monitor_service(recorder: Recorder) -> Any:
    return MonitorService(
        DrognaMonitorConfiguration.model_validate(monitor_document()),
        clock=manual_clock(),
        forecasts=_NoForecast(),
        publisher=recorder,
    )


def _scheduler_service(recorder: Recorder) -> Any:
    return SchedulerService(
        DrognaSchedulerConfiguration.model_validate(scheduler_document()),
        clock=manual_clock(),
        publisher=recorder,
    )


def _model_runner_service(recorder: Recorder) -> Any:
    return ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(model_runner_document()),
        clock=manual_clock(),
        ground_truth=ground_truth(),
        publisher=recorder,
    )


def _telemetry_service(recorder: Recorder) -> Any:
    return TelemetryService(
        telemetry_support.settings(),
        clock=manual_clock(),
        forecasts=_NoForecast(),
        publisher=recorder,
    )


def _planner_service(recorder: Recorder) -> Any:
    return PlannerService(
        planner_support.settings(),
        clock=manual_clock(),
        fields=planner_support.OneField(planner_support.Spread(0.8)),
        timescales=planner_support.Timescales(),
        publisher=recorder,
    )


def test_the_publisher_takes_a_run_that_finishes_after_its_loop_has_started(
    tmp_path: Path,
) -> None:
    """The reason the publisher has an idle turn at all.

    A run is announced started before its ensemble is computed, so ``ctl/run-started`` cannot
    be the moment the publisher acts on: staging is still empty when it arrives. What tells
    the publisher a run is finished is the directory appearing, and the idle turn is when it
    looks.
    """
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)
    recorder = Recorder()

    def source() -> Iterator[tuple[str, bytes]]:
        yield IDLE  # staging is empty; the publisher has nothing to take
        _stage_a_run(staging)
        yield IDLE  # and now it has

    code = run_publisher(
        env=_write(
            tmp_path,
            "publisher",
            _beating(publisher_document(staging=str(staging), catalogue=str(catalogue))),
        ),
        clock=manual_clock(),
        publisher=recorder,
        messages=source(),
        stderr=io.StringIO(),
    )

    assert code == 0
    announced = recorder.on(RUN_PUBLISHED_TOPIC)
    assert [message["run_id"] for message in announced] == ["run-idle-turn"]
    assert (catalogue / "current").read_text(encoding="utf-8").strip() == "run-idle-turn"


def _stage_a_run(staging: Path) -> None:
    """One real run, written by the real runner into the directory the publisher watches."""
    runner = ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(model_runner_document(step_count=2)),
        clock=manual_clock(),
        ground_truth=ground_truth(),
        staging=Staging(
            staging,
            forecast_file="forecast.nc",
            uncertainty_file="uncertainty.nc",
            manifest_file="run.json",
            partial_suffix=PARTIAL_SUFFIX,
        ),
    )
    runner.handle(RUN_REQUEST_TOPIC, run_request(run_id="run-idle-turn", ensemble_size=3))
