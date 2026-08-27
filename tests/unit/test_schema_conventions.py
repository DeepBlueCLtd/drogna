"""The schema conventions gate is handed each broken convention in turn.

A gate that has never failed is not a gate. Each case below plants exactly one violation
in an otherwise clean schema and asserts that the gate names it, and the first case asserts
that a schema obeying every convention passes — because a gate that fails correct work
teaches people to ignore it, which is the same as not having one.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
GATE = SCRIPTS / "check_schema_conventions.py"


def clean() -> dict[str, Any]:
    """A schema that obeys every convention, to be broken one rule at a time."""
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://schemas.harness.invalid/sample.schema.json",
        "title": "drogna sample message",
        "description": "A message shape used only by this test.",
        "type": "object",
        "required": ["run_id", "sim_time"],
        "additionalProperties": False,
        "properties": {
            "run_id": {"type": "string", "description": "The run this belongs to."},
            "sim_time": {"type": "string", "description": "Simulation time of this sample."},
        },
        "examples": [{"run_id": "r", "sim_time": "2026-01-01T00:00:00.000000Z"}],
    }


def run(tmp_path: Path, document: dict[str, Any], name: str = "sample.schema.json"):
    path = tmp_path / name
    path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(GATE), str(path)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_schema_obeying_every_convention_passes(tmp_path: Path) -> None:
    result = run(tmp_path, clean())

    assert result.returncode == 0, result.stdout + result.stderr


def _without(key: str) -> dict[str, Any]:
    document = clean()
    document.pop(key)
    return document


CASES: list[tuple[str, dict[str, Any], str, str]] = [
    (
        "a stale example",
        {**clean(), "examples": [{"run_id": "r"}]},
        "sample.schema.json",
        "example",
    ),
    (
        "an example with an unknown key",
        {**clean(), "examples": [{"run_id": "r", "sim_time": "t", "typo": 1}]},
        "sample.schema.json",
        "example",
    ),
    (
        "an open object",
        {key: value for key, value in clean().items() if key != "additionalProperties"},
        "sample.schema.json",
        "closure",
    ),
    (
        "an object that accepts anything",
        {**clean(), "additionalProperties": True},
        "sample.schema.json",
        "closure",
    ),
    ("no title", _without("title"), "sample.schema.json", "legibility"),
    ("no description", _without("description"), "sample.schema.json", "legibility"),
    (
        "the wrong dialect",
        {**clean(), "$schema": "http://json-schema.org/draft-07/schema#"},
        "sample.schema.json",
        "dialect",
    ),
    (
        "an identifier that does not match the file",
        {**clean(), "$id": "https://schemas.harness.invalid/other.schema.json"},
        "sample.schema.json",
        "identifier",
    ),
    (
        "an identifier on a fetchable domain",
        {**clean(), "$id": "https://example.com/sample.schema.json"},
        "sample.schema.json",
        "identifier",
    ),
    (
        "a wall-clock format",
        {
            **clean(),
            "properties": {
                **clean()["properties"],
                "sim_time": {"type": "string", "format": "date-time"},
            },
        },
        "sample.schema.json",
        "simulation-time",
    ),
    (
        "a host-clock property name",
        {
            **clean(),
            "properties": {**clean()["properties"], "timestamp": {"type": "string"}},
            "examples": [],
        },
        "sample.schema.json",
        "simulation-time",
    ),
    (
        "a reference that does not resolve",
        {
            **clean(),
            "properties": {**clean()["properties"], "extra": {"$ref": "#/$defs/absent"}},
            "examples": [],
        },
        "sample.schema.json",
        "reference",
    ),
    (
        "a reference to a document outside the repository",
        {
            **clean(),
            "properties": {
                **clean()["properties"],
                "extra": {"$ref": "https://example.com/other.schema.json"},
            },
            "examples": [],
        },
        "sample.schema.json",
        "reference",
    ),
]


@pytest.mark.parametrize(("label", "document", "name", "rule"), CASES, ids=[c[0] for c in CASES])
def test_the_gate_reports_a_planted_violation(
    label: str, document: dict[str, Any], name: str, rule: str, tmp_path: Path
) -> None:
    result = run(tmp_path, document, name)

    assert result.returncode != 0, f"{label} was accepted:\n{result.stdout}"
    assert f"[{rule}]" in result.stdout, f"{label} was reported as something else:\n{result.stdout}"


def test_a_misnamed_file_is_reported(tmp_path: Path) -> None:
    result = run(tmp_path, clean(), name="Sample_Message.json")

    assert result.returncode != 0
    assert "[naming]" in result.stdout


def test_every_master_in_the_repository_passes(tmp_path: Path) -> None:
    """The gate is run over the real masters, which is the case that has to stay true."""
    result = subprocess.run(
        [sys.executable, str(GATE)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
