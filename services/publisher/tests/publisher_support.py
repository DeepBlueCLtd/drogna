"""Helpers for the publisher's tests: staged runs, built by hand and on purpose.

Built by hand rather than by running the model runner, so that these tests are about the
publisher's contract with staging — a descriptor, two fields and their digests — and not
about whether the runner happens to satisfy it today. That the runner does satisfy it is a
separate assertion, and it lives in the integration test where the two meet.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

FORECAST_FILE = "forecast.nc"
UNCERTAINTY_FILE = "uncertainty.nc"
MANIFEST_FILE = "run.json"

# The store side of the layout, mirroring what `publisher_document` configures. Named here
# so a test asserts against the convention rather than against a path it spelled out.
RUNS_DIRNAME = "runs"
CURRENT_POINTER = "current"
RUN_MANIFEST_FILE = "run-manifest.json"


def digest_of(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def descriptor_for(
    run_id: str,
    forecast: bytes,
    uncertainty: bytes,
    *,
    status: str = "complete",
    member_count: int = 8,
    run_sequence: int | None = 0,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "run_sequence": run_sequence,
        "scenario_run_id": "scenario-009",
        "status": status,
        "kernel": "analytic",
        "format": "netcdf-classic-cdf1",
        "member_count": member_count,
        "initialisation_sim_time": "2026-08-26T00:00:00.000000Z",
        "valid_time": {
            "start_sim_time": "2026-08-26T00:00:00.000000Z",
            "end_sim_time": "2026-08-26T06:00:00.000000Z",
        },
        "grid_bounds": {
            "minimum_latitude": 48.5,
            "maximum_latitude": 49.5,
            "minimum_longitude": -5.5,
            "maximum_longitude": -4.5,
            "minimum_depth_m": 0.0,
            "maximum_depth_m": 200.0,
        },
        "files": {"forecast": FORECAST_FILE, "uncertainty": UNCERTAINTY_FILE},
        "digests": {"forecast": digest_of(forecast), "uncertainty": digest_of(uncertainty)},
        "seed": {"root": 20260826},
        "config_digest": None,
        "stored_dtype": "float32",
        "generator": {"name": "model_runner", "version": "0.1.0", "analytic_form_version": 1},
    }


def stage_run(
    staging: Path,
    run_id: str = "run-abc",
    *,
    body: bytes = b"a complete forecast field",
    status: str = "complete",
    member_count: int = 8,
    omit_uncertainty: bool = False,
    truncate_forecast: bool = False,
    run_sequence: int | None = 0,
) -> Path:
    """Write one staged run, optionally in one of the ways a run can be wrong."""
    directory = staging / run_id
    directory.mkdir(parents=True)
    forecast = body
    uncertainty = body + b" (spread)"
    descriptor = descriptor_for(
        run_id,
        forecast,
        uncertainty,
        status=status,
        member_count=member_count,
        run_sequence=run_sequence,
    )
    (directory / FORECAST_FILE).write_bytes(forecast[:5] if truncate_forecast else forecast)
    if not omit_uncertainty:
        (directory / UNCERTAINTY_FILE).write_bytes(uncertainty)
    (directory / MANIFEST_FILE).write_text(
        json.dumps(descriptor, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return directory


def run_directory(root: Path, run_id: str) -> Path:
    """Where a published run lives: under the runs directory, named by its identifier."""
    return root / RUNS_DIRNAME / run_id


def current_run_id(root: Path) -> str | None:
    """Read the pointer the way the query layer reads it: as text, one identifier a line."""
    try:
        raw = (root / CURRENT_POINTER).read_text(encoding="utf-8")
    except OSError:
        return None
    named = [line.strip() for line in raw.splitlines() if line.strip()]
    return named[0] if len(named) == 1 else None


def current_field(root: Path, name: str = FORECAST_FILE) -> bytes:
    """The current run's field, resolved through the pointer as a reader must resolve it."""
    run_id = current_run_id(root)
    if run_id is None:
        raise AssertionError(f"no run is current in the store at {root}")
    return (run_directory(root, run_id) / name).read_bytes()
