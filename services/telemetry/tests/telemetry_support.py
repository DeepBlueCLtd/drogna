"""Helpers for the telemetry component's tests: fields to score against, and residuals.

The fields here are the real :class:`~harness_monitor.coverage.ForecastField`, which is the
read side of the coverage output port and the same object the running component holds. A
hand-rolled double would test the double; this tests the port.

Two of them are built in most tests, because everything this component says about skill is
a comparison of two fields against one measurement. Where the two differ is stated by the
test that builds them, not hidden in a default.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_core.soundspeed import EQUATION, sound_speed
from harness_monitor.coverage import ForecastField
from harness_types.config.telemetry import DrognaTelemetryConfiguration

TRUE_TEMPERATURE_C = 12.0
TRUE_SALINITY_PSU = 35.0
MINUTE_MICROS = 60 * 1_000_000
SCENARIO_RUN = "run-test-a"

LATITUDES = (48.0, 49.0, 50.0)
LONGITUDES = (-6.0, -5.0, -4.0)
DEPTHS_M = (0.0, 50.0, 100.0)


def uniform_field(
    run_id: str,
    *,
    temperature_c: float = TRUE_TEMPERATURE_C,
    salinity_psu: float = TRUE_SALINITY_PSU,
    hours: int = 6,
) -> ForecastField:
    """A field with the same water everywhere, over a domain the samples sit inside."""
    times = (0, hours * 60 * MINUTE_MICROS)
    size = len(LATITUDES) * len(LONGITUDES) * len(DEPTHS_M) * len(times)
    return ForecastField(
        run_id=run_id,
        latitudes=LATITUDES,
        longitudes=LONGITUDES,
        depths_m=DEPTHS_M,
        sim_micros=times,
        temperature_c=[temperature_c] * size,
        salinity_psu=[salinity_psu] * size,
    )


def measured_sound_speed(depth_m: float = 50.0) -> float:
    """The sound speed of the water the tests treat as true."""
    return sound_speed(TRUE_TEMPERATURE_C, TRUE_SALINITY_PSU, depth_m)


class StubForecasts:
    """A forecast source whose current field is set by the test, not by a file."""

    def __init__(self, field: ForecastField | None = None) -> None:
        self._field = field
        self.reads = 0

    def set(self, field: ForecastField | None) -> None:
        self._field = field

    def current(self) -> ForecastField | None:
        self.reads += 1
        return self._field

    def refresh(self) -> ForecastField | None:
        return self.current()


class RecordingPublisher:
    """Every message published, in order, with its topic."""

    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, json.loads(payload.decode("utf-8"))))

    def of_kind(self, kind: str) -> list[dict[str, Any]]:
        return [message for _, message in self.published if message.get("kind") == kind]

    def heartbeats(self) -> list[dict[str, Any]]:
        return [message for topic, message in self.published if topic == "ctl/heartbeat"]


def manual_clock(*, mode: ClockMode = ClockMode.LOCKSTEP, rate: float = 1.0) -> ManualClock:
    """A clock that moves only when a test moves it, one second to the tick."""
    return ManualClock(
        run_id=SCENARIO_RUN,
        epoch=SimInstant(0),
        tick_interval_us=1_000_000,
        mode=mode,
        rate=rate,
    )


def residual_point(
    *,
    minutes: float,
    residual_m_per_s: float,
    measured_m_per_s: float | None = None,
    latitude: float = 49.0,
    longitude: float = -5.0,
    depth_m: float = 50.0,
    platform: str = "platform_a",
) -> dict[str, Any]:
    """One scored residual, as the wire carries it."""
    return {
        "sim_time": SimInstant(round(minutes * MINUTE_MICROS)).iso(),
        "latitude": latitude,
        "longitude": longitude,
        "depth_m": depth_m,
        "residual_m_per_s": residual_m_per_s,
        "measured_m_per_s": (
            measured_sound_speed(depth_m) if measured_m_per_s is None else measured_m_per_s
        ),
        "platform": platform,
    }


def sample_report(
    points: Sequence[Mapping[str, Any]],
    *,
    forecast_run_id: str,
    minutes: float = 0.0,
    tick: int = 0,
    component: str = "monitor",
) -> dict[str, Any]:
    """A ``residual-sample`` report, as feature 009's monitor would publish one."""
    return {
        "component": component,
        "scenario_run_id": SCENARIO_RUN,
        "sim_time": SimInstant(round(minutes * MINUTE_MICROS)).iso(),
        "tick": tick,
        "kind": "residual-sample",
        "forecast_run_id": forecast_run_id,
        "samples": [dict(point) for point in points],
        "sound_speed_equation": EQUATION,
    }


def summary_report(
    *,
    scored: int,
    mean_absolute_m_per_s: float,
    minutes: float = 0.0,
    tick: int = 0,
    component: str = "monitor",
) -> dict[str, Any]:
    """A ``residual-summary``, which is the shape the monitor publishes today."""
    return {
        "component": component,
        "scenario_run_id": SCENARIO_RUN,
        "sim_time": SimInstant(round(minutes * MINUTE_MICROS)).iso(),
        "tick": tick,
        "kind": "residual-summary",
        "scored": scored,
        "exceeding": 0,
        "outside_domain": 0,
        "shed": 0,
        "mean_absolute_m_per_s": mean_absolute_m_per_s,
        "sound_speed_equation": EQUATION,
    }


def run_published(run_id: str, *, minutes: float = 0.0, tick: int = 0) -> dict[str, Any]:
    """The announcement telemetry treats as a publication boundary."""
    return {
        "component": "publisher",
        "scenario_run_id": SCENARIO_RUN,
        "sim_time": SimInstant(round(minutes * MINUTE_MICROS)).iso(),
        "tick": tick,
        "run_id": run_id,
        "current": True,
    }


def configuration(
    *,
    publication_interval_seconds: float = 300.0,
    minimum_sample_count: int = 4,
    staleness_window_seconds: float = 600.0,
) -> dict[str, Any]:
    """A valid telemetry configuration document, as ``HARNESS_CONFIG`` would name one."""
    return {
        "component": {
            "id": "telemetry",
            "description": "C-16 under test.",
            "heartbeat_interval_seconds": 5.0,
        },
        "clock": {
            "endpoint": "http://clock:8090",
            "routes": {"snapshot": "/clock/snapshot", "control": "/clock/control"},
            "mode": "lockstep",
            "stale_after_gap": 4,
            "timeout_seconds": 5.0,
        },
        "seed": {"root": 20260826, "stream": "telemetry"},
        "broker": {"url": "mqtt://broker:1883", "client_id": "telemetry"},
        "logging": {"level": "INFO"},
        "telemetry": {
            "publication_interval_seconds": publication_interval_seconds,
            "minimum_sample_count": minimum_sample_count,
            "staleness_window_seconds": staleness_window_seconds,
            "regions": {
                "origin_latitude": 48.0,
                "origin_longitude": -6.0,
                "cell_latitude_degrees": 1.0,
                "cell_longitude_degrees": 1.0,
                "rows": 2,
                "columns": 2,
            },
            "coverage": {
                "root_directory": "/data/coverage",
                "current_pointer": "current",
                "runs_dirname": "runs",
                "forecast_file": "forecast.nc",
            },
        },
    }


def settings(**overrides: Any) -> DrognaTelemetryConfiguration:
    """The configuration as the generated model, which is what the service takes."""
    return DrognaTelemetryConfiguration.model_validate(configuration(**overrides))
