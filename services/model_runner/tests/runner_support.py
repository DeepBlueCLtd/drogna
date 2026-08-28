"""Helpers for the model runner's tests: a small world and a small manifest to advect.

The manifest here is shaped as feature 004's ground-truth manifest is, but with a grid small
enough that a test runs in milliseconds. What is being tested is the runner, and a runner
that is right on nine columns is right on nine hundred.
"""

from __future__ import annotations

from typing import Any

MINUTE_MICROS = 60 * 1_000_000
HOUR_MICROS = 60 * MINUTE_MICROS


def ground_truth(
    *,
    drift_east_km_per_day: float = 24.0,
    drift_north_km_per_day: float = 0.0,
    latitude_count: int = 5,
    longitude_count: int = 9,
    depth_count: int = 3,
) -> dict[str, Any]:
    """A manifest with four features, one of which drifts."""
    return {
        "grid": {
            "latitude": {
                "minimum": 48.5,
                "maximum": 49.5,
                "count": latitude_count,
                "spacing": 1.0 / (latitude_count - 1),
                "units": "degrees_north",
                "direction": "north",
            },
            "longitude": {
                "minimum": -5.5,
                "maximum": -4.5,
                "count": longitude_count,
                "spacing": 1.0 / (longitude_count - 1),
                "units": "degrees_east",
                "direction": "east",
            },
            "depth": {
                "minimum": 0.0,
                "maximum": 200.0,
                "count": depth_count,
                "spacing": 200.0 / (depth_count - 1),
                "units": "m",
                "direction": "down",
            },
        },
        "background": {
            "rule": "exponential-relaxation",
            "description": "surface to deep, exponentially with depth",
            "parameters": {
                "surface_temperature_c": 15.5,
                "deep_temperature_c": 9.0,
                "temperature_scale_depth_m": 250.0,
                "surface_salinity_psu": 35.2,
                "deep_salinity_psu": 35.6,
                "salinity_scale_depth_m": 400.0,
            },
        },
        "features": [
            {
                "id": "eddy_a",
                "kind": "eddy",
                "parameters": {
                    "centre_latitude": 49.0,
                    "centre_longitude": -5.2,
                    "radius_km": 30.0,
                    "strength_c": 1.5,
                    "salinity_strength_psu": 0.1,
                    "sign": -1,
                    "depth_centre_m": 100.0,
                    "depth_half_thickness_m": 80.0,
                },
            },
            {
                "id": "front_a",
                "kind": "front",
                "parameters": {
                    "anchor_latitude": 48.8,
                    "anchor_longitude": -5.0,
                    "bearing_degrees": 45.0,
                    "sharpness_km": 20.0,
                    "amplitude_c": 0.8,
                    "salinity_amplitude_psu": 0.05,
                    "depth_scale_m": 150.0,
                },
            },
            {
                "id": "thermocline_a",
                "kind": "thermocline",
                "parameters": {
                    "depth_m": 90.0,
                    "thickness_m": 40.0,
                    "temperature_drop_c": 3.0,
                    "salinity_rise_psu": 0.2,
                },
            },
            {
                "id": "moving_a",
                "kind": "moving",
                "parameters": {
                    "centre_latitude": 49.0,
                    "centre_longitude": -5.0,
                    "radius_km": 25.0,
                    "strength_c": 2.0,
                    "salinity_strength_psu": 0.12,
                    "sign": 1,
                    "depth_centre_m": 60.0,
                    "depth_half_thickness_m": 50.0,
                    "drift_east_km_per_day": drift_east_km_per_day,
                    "drift_north_km_per_day": drift_north_km_per_day,
                    "reference_latitude": 49.0,
                },
            },
        ],
    }


def run_request(
    *,
    run_id: str = "run-abc",
    run_sequence: int = 0,
    ensemble_size: int = 4,
    initialisation_sim_time: str = "2026-08-26T00:00:00.000000Z",
    divergence_id: str = "divergence-1",
) -> dict[str, Any]:
    """A run request as the scheduler publishes it, trimmed to what the runner reads."""
    from control_loop import divergence_payload

    return {
        "component": "scheduler",
        "scenario_run_id": "scenario-009",
        "sim_time": initialisation_sim_time,
        "tick": 0,
        "run_id": run_id,
        "run_sequence": run_sequence,
        "initialisation_sim_time": initialisation_sim_time,
        "ensemble_size": ensemble_size,
        "region": divergence_payload()["region"],
        "divergence": divergence_payload(divergence_id=divergence_id),
    }
