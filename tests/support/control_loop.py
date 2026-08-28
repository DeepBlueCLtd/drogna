"""Helpers shared by the control loop's tests: a recorder, a clock, and configurations.

Every service in feature 009 takes its transport by injection, so the tests need one fake
worth having: a publisher that records what was published, in order, with the topic. It is
not a mock of the broker and nothing in the harness is ever driven by it — Constitution VII
forbids mocked traffic driving illumination, and this records rather than emits.

The configuration builders here produce documents that are validated against the real
schemas under ``contracts/schemas/``, so a test that passes is a test whose configuration a
component would actually accept.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from harness_core.clock import ClockMode, ManualClock, SimInstant

# The coverage store's layout, in one place for the tests that span the seam. Three test
# modules had a copy each, which is the same duplication that let the publisher and the
# query layer disagree about this store in the first place (ADR-0011). The values are the
# ones both destinations configure; a test that needs to differ says so locally.
RUNS_DIRNAME = "runs"
CURRENT_POINTER = "current"
FORECAST_FILE = "forecast.nc"
PARTIAL_SUFFIX = ".partial"
# The identifier rule both destinations configure. The scheduler computes a run's name from
# it and the query layer's catalogue computes the same name from the same values, without
# either importing the other's implementation.
RUN_ID_RULE = {"rule": "drogna-coverage-run-id", "version": 1, "prefix": "run"}

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIRECTORY = REPOSITORY_ROOT / "contracts" / "schemas"

EPOCH = SimInstant.from_iso("2026-08-26T00:00:00.000000Z")
TICK_INTERVAL_US = 60 * 1_000_000
ROOT_SEED = 20260826
SCENARIO_RUN_ID = "scenario-009"


class Recorder:
    """A message publisher that keeps what it was given, so a test can read it back."""

    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, Any]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, json.loads(payload.decode("utf-8"))))

    def topics(self) -> list[str]:
        return [topic for topic, _ in self.published]

    def on(self, topic: str) -> list[dict[str, Any]]:
        return [message for name, message in self.published if name == topic]


def manual_clock(*, minutes: float = 0.0, mode: ClockMode = ClockMode.LOCKSTEP) -> ManualClock:
    """A clock at a stated simulation instant, advanced only by explicit calls."""
    return ManualClock(
        run_id=SCENARIO_RUN_ID,
        epoch=EPOCH,
        tick_interval_us=TICK_INTERVAL_US,
        mode=mode,
        index=int(minutes),
    )


def schema_document(name: str) -> Mapping[str, Any]:
    return json.loads((SCHEMA_DIRECTORY / name).read_text(encoding="utf-8"))


def common_sections(component: str, *, heartbeat_seconds: float = 5.0) -> dict[str, Any]:
    """The sections every component's configuration carries, with test values."""
    return {
        "component": {
            "id": component,
            "description": f"{component} under test",
            "heartbeat_interval_seconds": heartbeat_seconds,
        },
        "clock": {
            "endpoint": "http://clock.invalid:8090",
            "routes": {"snapshot": "/clock/snapshot", "control": "/clock/control"},
            "mode": "lockstep",
            "stale_after_gap": 2,
        },
        "seed": {"root": ROOT_SEED, "stream": component},
        "broker": {"url": "mqtt://broker.invalid:1883", "client_id": component},
        "logging": {"level": "INFO"},
    }


def monitor_document(
    *,
    threshold_m_per_s: float = 1.75,
    spatial_sample_count: int = 3,
    temporal_sample_count: int = 3,
    temporal_span_seconds: float = 600.0,
    neighbourhood_radius_m: float = 5_000.0,
    warmup_mode: str = "span",
    warmup_span_seconds: float = 300.0,
    root_directory: str = "coverage",
) -> dict[str, Any]:
    document = common_sections("monitor")
    document["monitor"] = {
        "window": {
            "span_seconds": 3600.0,
            "maximum_samples": 5000,
            "maximum_pending": 500,
        },
        "residual": {"threshold_m_per_s": threshold_m_per_s},
        "persistence": {
            "neighbourhood_radius_m": neighbourhood_radius_m,
            "spatial_sample_count": spatial_sample_count,
            "temporal_sample_count": temporal_sample_count,
            "temporal_span_seconds": temporal_span_seconds,
        },
        "warmup": {
            "mode": warmup_mode,
            "span_seconds": warmup_span_seconds,
            "catchup_sample_limit": 1000,
        },
        "coverage": {
            "root_directory": root_directory,
            "current_pointer": CURRENT_POINTER,
            "runs_dirname": RUNS_DIRNAME,
            "forecast_file": FORECAST_FILE,
        },
    }
    return document


def scheduler_document(
    *,
    minimum_interval_seconds: float = 1800.0,
    outstanding_timeout_seconds: float = 3600.0,
    ensemble_size: int = 8,
    initialisation_offset_seconds: float = 0.0,
) -> dict[str, Any]:
    document = common_sections("scheduler")
    document["scheduler"] = {
        "minimum_interval_seconds": minimum_interval_seconds,
        "outstanding_timeout_seconds": outstanding_timeout_seconds,
        "ensemble_size": ensemble_size,
        "initialisation_offset_seconds": initialisation_offset_seconds,
        "run_id": RUN_ID_RULE,
    }
    return document


def model_runner_document(
    *,
    kernel: str = "analytic",
    maximum_size: int = 8,
    step_count: int = 3,
    step_seconds: float = 3600.0,
    staging: str = "staging",
    ground_truth: str = "truth",
) -> dict[str, Any]:
    document = common_sections("model_runner")
    document["model_runner"] = {
        "kernel": {
            "name": kernel,
            "noise_temperature_c": 0.05,
            "noise_salinity_psu": 0.01,
        },
        "ensemble": {
            "maximum_size": maximum_size,
            "perturbation_temperature_c": 0.2,
            "perturbation_salinity_psu": 0.05,
            "perturbation_drift_fraction": 0.2,
        },
        "forecast": {"step_seconds": step_seconds, "step_count": step_count},
        "ground_truth": {"directory": ground_truth, "manifest_file": "manifest.json"},
        "staging": {
            "directory": staging,
            "partial_suffix": PARTIAL_SUFFIX,
            "forecast_file": "forecast.nc",
            "uncertainty_file": "uncertainty.nc",
            "manifest_file": "run.json",
        },
        # The scenario's first forecast, which no message asks for: `deploy/seed.d/` does,
        # because nothing can diverge from nothing.
        "initial_run": {"run_id": "run-initial", "ensemble_size": 3},
        "stored_dtype": "float32",
    }
    return document


def publisher_document(*, staging: str = "staging", catalogue: str = "coverage") -> dict[str, Any]:
    document = common_sections("publisher")
    document["publisher"] = {
        "staging": {
            "directory": staging,
            "forecast_file": "forecast.nc",
            "uncertainty_file": "uncertainty.nc",
            "manifest_file": "run.json",
        },
        # The coverage store's layout, which feature 008 owns and this component writes
        # into: runs under `runs/`, each directory named by the run identifier alone, and
        # the current run named by a text pointer at the root.
        "catalogue": {
            "root_directory": catalogue,
            "runs_dirname": RUNS_DIRNAME,
            "current_pointer": CURRENT_POINTER,
            "partial_suffix": PARTIAL_SUFFIX,
            "forecast_file": "forecast.nc",
            "uncertainty_file": "uncertainty.nc",
            "manifest_file": "run-manifest.json",
        },
        "collections": {
            "forecast_prefix": "forecast-",
            "uncertainty_prefix": "uncertainty-",
        },
    }
    return document


def divergence_payload(
    *,
    divergence_id: str = "divergence-1",
    minutes: float = 0.0,
    forecast_run_id: str = "run-a",
    latitude: float = 49.0,
    longitude: float = -5.0,
    mean_m_per_s: float = 2.4,
) -> dict[str, Any]:
    """A divergence event, shaped as the master declares it."""
    instant = EPOCH.plus_micros(int(minutes * 60 * 1_000_000))
    return {
        "component": "monitor",
        "scenario_run_id": SCENARIO_RUN_ID,
        "sim_time": instant.iso(),
        "tick": int(minutes),
        "divergence_id": divergence_id,
        "forecast_run_id": forecast_run_id,
        "region": {
            "centre_latitude": latitude,
            "centre_longitude": longitude,
            "radius_m": 2_500.0,
            "minimum_depth_m": 0.0,
            "maximum_depth_m": 100.0,
        },
        "residual": {
            "mean_m_per_s": mean_m_per_s,
            "peak_m_per_s": abs(mean_m_per_s) + 0.4,
            "threshold_m_per_s": 1.75,
            "sample_count": 3,
        },
        "persistence": {
            "rule": "spatial",
            "sample_count": 3,
            "span_seconds": 600.0,
            "first_sim_time": instant.iso(),
            "last_sim_time": instant.plus_micros(600 * 1_000_000).iso(),
        },
        "sound_speed_equation": "mackenzie-1981",
    }


def observation_messages(
    *,
    platform: str,
    minutes: float,
    latitude: float,
    longitude: float,
    depth_m: float,
    temperature_c: float,
    salinity_psu: float,
    pressure_dbar: float | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """The three messages one sounding arrives as, on their own topics.

    Sensors publish temperature, salinity and pressure as three datastreams (ADR-0005), so a
    sounding is three messages and the monitor is what pairs them. The shape here is this
    feature's reading of feature 007's specification; ``contracts/schemas/observation.schema.json``
    is that feature's to author and does not exist yet.
    """
    instant = EPOCH.plus_micros(int(minutes * 60 * 1_000_000))
    values = {
        "temperature": temperature_c,
        "salinity": salinity_psu,
        "pressure": depth_m * 1.0051 if pressure_dbar is None else pressure_dbar,
    }
    return [
        (
            f"obs/{platform}/{observed}",
            {
                "thing_id": platform,
                "datastream_id": observed,
                "observed_property": observed,
                "sim_time": instant.iso(),
                "tick": int(minutes),
                "result": value,
                "location": {
                    "latitude": latitude,
                    "longitude": longitude,
                    "depth_m": depth_m,
                },
            },
        )
        for observed, value in values.items()
    ]


def temperature_for_bias(
    field: Any,
    *,
    latitude: float,
    longitude: float,
    depth_m: float,
    when_micros: int,
    bias_m_per_s: float,
    salinity_psu: float = 35.0,
) -> float:
    """The temperature whose sound speed sits ``bias_m_per_s`` above the forecast's.

    Found by bisection against the shared implementation rather than by a sensitivity
    constant, so a test carries no second model of the equation.
    """
    from harness_core.soundspeed import sound_speed

    predicted = field.sound_speed_at(latitude, longitude, depth_m, when_micros)
    if predicted is None:
        raise ValueError("that position is outside the forecast's domain")
    target = predicted + bias_m_per_s
    low, high = -2.0, 34.0
    for _ in range(200):
        middle = (low + high) / 2
        if sound_speed(middle, salinity_psu, depth_m, check_range=False) < target:
            low = middle
        else:
            high = middle
    return (low + high) / 2
