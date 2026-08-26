"""A destination is validated before any container starts, and says what is wrong.

An invalid configuration must be a startup failure with a readable message naming the file
and the key, never a runtime surprise (Constitution IV).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import validate_config  # noqa: E402
from destination import destination_names  # noqa: E402

SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": ["component", "interval_ticks"],
    "properties": {
        "component": {
            "type": "object",
            "required": ["id"],
            "properties": {"id": {"type": "string"}},
        },
        "interval_ticks": {"type": "integer", "minimum": 1},
    },
}


def _destination(root: Path, name: str, document: dict) -> None:
    directory = root / "config" / name
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "widget.json").write_text(json.dumps(document), encoding="utf-8")
    schemas = root / "contracts" / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    (schemas / "config.widget.schema.json").write_text(json.dumps(SCHEMA), encoding="utf-8")


def test_a_valid_destination_passes(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": 4})

    failures, gaps = validate_config.validate_destination("here", tmp_path)

    assert failures == []
    assert gaps == []


def test_a_wrong_typed_key_fails_and_names_the_key(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": "often"})

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1
    assert "interval_ticks" in failures[0]
    assert "widget.json" in failures[0]


def test_a_missing_required_key_fails_and_names_the_file(tmp_path: Path) -> None:
    _destination(tmp_path, "here", {"component": {"id": "widget"}})

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert len(failures) == 1
    assert "widget.json" in failures[0]
    assert "interval_ticks" in failures[0]


def test_a_key_the_schema_does_not_admit_fails(tmp_path: Path) -> None:
    """A typo in a key must be a startup failure, not a silently ignored default."""
    _destination(
        tmp_path,
        "here",
        {"component": {"id": "widget"}, "interval_ticks": 4, "intervel_ticks": 5},
    )

    failures, _ = validate_config.validate_destination("here", tmp_path)

    assert any("intervel_ticks" in failure for failure in failures)


def test_a_missing_schema_is_a_named_gap_and_a_failure_under_strict(tmp_path: Path) -> None:
    """Components are still arriving. A gap that is named is honest; a silent pass is not."""
    _destination(tmp_path, "here", {"component": {"id": "widget"}, "interval_ticks": 4})
    (tmp_path / "config" / "here" / "later.json").write_text("{}", encoding="utf-8")

    failures, gaps = validate_config.validate_destination("here", tmp_path)
    assert failures == []
    assert len(gaps) == 1 and "later.json" in gaps[0]

    strict_failures, strict_gaps = validate_config.validate_destination(
        "here", tmp_path, strict=True
    )
    assert strict_gaps == []
    assert len(strict_failures) == 1 and "later.json" in strict_failures[0]


def test_the_shipped_destinations_validate() -> None:
    for name in destination_names(REPOSITORY_ROOT):
        failures, _ = validate_config.validate_destination(name, REPOSITORY_ROOT)
        assert failures == [], f"destination {name} does not validate: {failures}"
