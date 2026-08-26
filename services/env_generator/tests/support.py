"""Shared helpers for this package's tests.

These are plain functions rather than fixtures because the tests call them with
arguments, so they live here rather than in ``conftest.py``. Importing from a
``conftest`` module is not supported by pytest — it happened to work under the default
import mode, which put each test directory on ``sys.path``, and stopped working the
moment that mode changed. A named module is importable on purpose rather than by
accident.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path
from typing import Any

_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:  # pragma: no cover - import plumbing
    sys.path.insert(0, str(_SRC))

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = REPO_ROOT / "contracts" / "schemas"
CONFIG_DIR = REPO_ROOT / "config"

from harness_core.clock import ClockMode, ManualClock, SimInstant  # noqa: E402
from harness_core.rng import configure_run  # noqa: E402
from harness_env_generator.generate import generate  # noqa: E402

RUN_ID = "run_test"
CONFIG_DIGEST = "sha256:" + "ab" * 32
SMALL_GRID = {
    "latitude": {"minimum": 48.0, "maximum": 50.0, "count": 9},
    "longitude": {"minimum": -6.0, "maximum": -3.0, "count": 9},
    "depth": {"minimum": 0.0, "maximum": 1000.0, "count": 6},
    "time": {"start_offset_seconds": 0.0, "step_seconds": 3600.0, "count": 4},
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def manual_clock() -> ManualClock:
    """A clock that moves only when told to, so simulation time in a test is a constant."""
    return ManualClock(
        run_id=RUN_ID,
        epoch=SimInstant.from_iso("2026-01-01T00:00:00Z"),
        tick_interval_us=1_000_000,
        mode=ClockMode.LOCKSTEP,
        index=7,
    )


def small_config() -> dict[str, Any]:
    """The local destination's configuration, on a grid small enough to sweep in a test."""
    document = copy.deepcopy(read_json(CONFIG_DIR / "local" / "env_generator.json"))
    document["env_generator"]["grid"] = copy.deepcopy(SMALL_GRID)
    return document


def build(document: dict[str, Any], *, root_seed: int | None = None) -> Any:
    """Author and generate one world from a configuration document."""
    seed = int(document["seed"]["root"]) if root_seed is None else root_seed
    configure_run(seed)
    clock = manual_clock()
    tick = clock.tick()
    return generate(
        document,
        run_id=tick.run_id,
        config_digest=CONFIG_DIGEST,
        root_seed=seed,
        sim_time=tick.instant.iso(),
        tick=tick.index,
    )


def write_config(
    tmp_path: Path, document: dict[str, Any], *, name: str = "config"
) -> tuple[Path, Path]:
    """Write a configuration file and point its output at a directory under ``tmp_path``."""
    prepared = copy.deepcopy(document)
    directory = tmp_path / f"{name}_out"
    prepared["env_generator"]["output"]["directory"] = str(directory)
    path = tmp_path / f"{name}.json"
    path.write_text(json.dumps(prepared, indent=2, sort_keys=True), encoding="utf-8")
    return path, directory
