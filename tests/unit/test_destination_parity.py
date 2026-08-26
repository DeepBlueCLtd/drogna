"""The destinations may differ in values, and in nothing else.

Drift between destinations starts on the day the second one is added, so the check that
catches it is tested here rather than trusted.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import destination_parity  # noqa: E402
from destination import destination_names  # noqa: E402


def _write(root: Path, name: str, filename: str, document: dict) -> None:
    directory = root / "config" / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / filename).write_text(json.dumps(document, indent=2), encoding="utf-8")


def test_matching_destinations_agree(tmp_path: Path) -> None:
    _write(tmp_path, "left", "common.json", {"logging": {"level": "INFO"}})
    _write(tmp_path, "right", "common.json", {"logging": {"level": "INFO"}})

    assert destination_parity.compare_destinations("left", "right", tmp_path) == []


def test_differing_values_are_not_drift(tmp_path: Path) -> None:
    """A destination is its values. Differing values are the point, not a fault."""
    _write(tmp_path, "left", "common.json", {"logging": {"level": "INFO"}, "port": 1})
    _write(tmp_path, "right", "common.json", {"logging": {"level": "WARNING"}, "port": 2})

    assert destination_parity.compare_destinations("left", "right", tmp_path) == []


def test_an_added_key_is_reported_and_names_the_key(tmp_path: Path) -> None:
    _write(tmp_path, "left", "common.json", {"logging": {"level": "INFO", "sink": "stdout"}})
    _write(tmp_path, "right", "common.json", {"logging": {"level": "INFO"}})

    differences = destination_parity.compare_destinations("left", "right", tmp_path)

    assert len(differences) == 1
    assert "logging.sink" in differences[0]
    assert "left" in differences[0] and "right" in differences[0]


def test_a_missing_file_is_reported_and_names_the_file(tmp_path: Path) -> None:
    _write(tmp_path, "left", "common.json", {"logging": {"level": "INFO"}})
    _write(tmp_path, "left", "telemetry.json", {"interval": 1})
    _write(tmp_path, "right", "common.json", {"logging": {"level": "INFO"}})

    differences = destination_parity.compare_destinations("left", "right", tmp_path)

    assert len(differences) == 1
    assert "telemetry.json" in differences[0]


def test_every_difference_is_reported_not_only_the_first(tmp_path: Path) -> None:
    _write(tmp_path, "left", "common.json", {"a": 1, "b": 2, "c": 3})
    _write(tmp_path, "right", "common.json", {"a": 1})

    differences = destination_parity.compare_destinations("left", "right", tmp_path)

    assert len(differences) == 2


def test_the_shipped_destinations_agree_in_shape() -> None:
    """The real check, over the real directories. This is what fails in CI on drift."""
    assert len(destination_names(REPOSITORY_ROOT)) >= 2, "there should be at least two destinations"
    assert destination_parity.compare_all(REPOSITORY_ROOT) == []
