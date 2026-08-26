"""At a clock rate of zero, simulated time stops and nothing else does.

ADR-0006, and the regression test on it. If heartbeat cadence were measured in simulation
time then at rate zero no heartbeat would ever be due, every liveness window would expire,
and the client would grey out a system that is plainly running — during exactly the capture
FR-53 exists to make meaningful. So the cadence is real time and the simulation time a
heartbeat carries is payload.

The clock here never advances, which is what a rate of zero means. All four services keep
publishing, every heartbeat carries the same unchanging simulation time, and no component
goes longer than its declared liveness window without being heard from (SC-013).

This test reads the host clock. It is test harness setup measuring a real-time cadence,
which is what Constitution I permits and what ADR-0006 is about.
"""

from __future__ import annotations

import time  # harness:allow-wallclock ADR-0006, this test measures a real-time cadence
from itertools import pairwise
from pathlib import Path

from control_loop import (
    Recorder,
    manual_clock,
    model_runner_document,
    monitor_document,
    publisher_document,
    scheduler_document,
)
from harness_core.clock import ClockMode
from harness_model_runner.service import ModelRunnerService
from harness_monitor.service import MonitorService
from harness_publisher.service import PublisherService
from harness_scheduler.service import SchedulerService
from harness_types.config.model_runner import DrognaModelRunnerConfiguration
from harness_types.config.monitor import DrognaMonitorConfiguration
from harness_types.config.publisher import DrognaPublisherConfiguration
from harness_types.config.scheduler import DrognaSchedulerConfiguration
from runner_support import ground_truth

INTERVAL_SECONDS = 0.01
LIVENESS_WINDOW_SECONDS = 10 * INTERVAL_SECONDS
WANTED = 4


class NoForecast:
    def current(self):
        return None


def services(tmp_path: Path, recorder: Recorder):
    """One of each of this feature's four components, sharing a pinned clock."""
    clock = manual_clock(mode=ClockMode.PAUSED)
    clock.set_rate(0.0)
    staging = tmp_path / "staging"
    catalogue = tmp_path / "coverage"
    catalogue.mkdir(parents=True)

    monitor = MonitorService(
        DrognaMonitorConfiguration.model_validate(
            monitor_document(root_directory=str(catalogue))
            | {
                "component": {
                    "id": "monitor",
                    "heartbeat_interval_seconds": INTERVAL_SECONDS,
                }
            }
        ),
        clock=clock,
        forecasts=NoForecast(),
        publisher=recorder,
    )
    scheduler = SchedulerService(
        DrognaSchedulerConfiguration.model_validate(
            scheduler_document()
            | {
                "component": {
                    "id": "scheduler",
                    "heartbeat_interval_seconds": INTERVAL_SECONDS,
                }
            }
        ),
        clock=clock,
        publisher=recorder,
    )
    runner = ModelRunnerService(
        DrognaModelRunnerConfiguration.model_validate(
            model_runner_document(staging=str(staging))
            | {
                "component": {
                    "id": "model_runner",
                    "heartbeat_interval_seconds": INTERVAL_SECONDS,
                }
            }
        ),
        clock=clock,
        ground_truth=ground_truth(),
        publisher=recorder,
    )
    publisher = PublisherService(
        DrognaPublisherConfiguration.model_validate(
            publisher_document(staging=str(staging), catalogue=str(catalogue))
            | {
                "component": {
                    "id": "publisher",
                    "heartbeat_interval_seconds": INTERVAL_SECONDS,
                }
            }
        ),
        clock=clock,
        publisher=recorder,
    )
    return clock, (monitor, scheduler, runner, publisher)


def test_all_four_keep_beating_while_simulated_time_stands_still(tmp_path: Path) -> None:
    recorder = Recorder()
    clock, components = services(tmp_path, recorder)
    pinned = clock.now().iso()

    arrivals: dict[str, list[float]] = {}
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        for component in components:
            beat = component.beat()
            if beat is not None:
                arrivals.setdefault(beat["component"], []).append(time.monotonic())
        if all(len(times) >= WANTED for times in arrivals.values()) and len(arrivals) == 4:
            break

    assert set(arrivals) == {"monitor", "scheduler", "model_runner", "publisher"}
    assert clock.now().iso() == pinned, "simulated time moved; the clock was not pinned"

    heartbeats = recorder.on("ctl/heartbeat")
    assert {beat["sim_time"] for beat in heartbeats} == {pinned}

    for component, times in arrivals.items():
        assert len(times) >= WANTED, f"{component} beat only {len(times)} time(s)"
        gaps = [later - earlier for earlier, later in pairwise(times)]
        assert max(gaps) < LIVENESS_WINDOW_SECONDS, (
            f"{component} went {max(gaps):.3f}s without a heartbeat, which is longer than "
            "its declared liveness window; at rate zero it would grey out"
        )


def test_the_carried_simulation_time_is_payload_and_not_schedule(tmp_path: Path) -> None:
    """Advancing simulated time changes what a heartbeat says, never when it is due."""
    recorder = Recorder()
    clock, components = services(tmp_path, recorder)

    for component in components:
        component.beat(force=True)
    before = {beat["sim_time"] for beat in recorder.on("ctl/heartbeat")}

    clock.advance(30)
    for component in components:
        component.beat(force=True)
    after = {beat["sim_time"] for beat in recorder.on("ctl/heartbeat")} - before

    assert len(before) == 1 and len(after) == 1
    assert before != after
