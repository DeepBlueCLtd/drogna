"""The health check reports unhealthy for each way it can fail, and healthy otherwise.

Each case is a way a container can be wrong that Compose would otherwise call healthy.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from harness_core.config import HARNESS_CONFIG_VARIABLE
from harness_core.healthcheck import OK, UNHEALTHY, check


def run(env: dict[str, str]) -> tuple[int, str]:
    stderr = io.StringIO()
    return check(env=env, stderr=stderr), stderr.getvalue()


def test_a_configured_component_is_healthy(tmp_path: Path) -> None:
    config = tmp_path / "widget.json"
    config.write_text(json.dumps({"component": {"id": "widget"}}), encoding="utf-8")

    code, message = run({HARNESS_CONFIG_VARIABLE: str(config)})

    assert code == OK
    assert message == ""


def test_an_unset_variable_is_unhealthy() -> None:
    code, message = run({})

    assert code == UNHEALTHY
    assert HARNESS_CONFIG_VARIABLE in message


def test_an_absent_file_is_unhealthy(tmp_path: Path) -> None:
    code, message = run({HARNESS_CONFIG_VARIABLE: str(tmp_path / "missing.json")})

    assert code == UNHEALTHY
    assert "missing.json" in message


def test_malformed_json_is_unhealthy(tmp_path: Path) -> None:
    config = tmp_path / "widget.json"
    config.write_text("{ not json", encoding="utf-8")

    code, message = run({HARNESS_CONFIG_VARIABLE: str(config)})

    assert code == UNHEALTHY
    assert "not valid JSON" in message


@pytest.mark.parametrize("document", [[], {"component": "widget"}, {"component": {}}, {}])
def test_a_document_naming_no_component_is_unhealthy(tmp_path: Path, document: object) -> None:
    """A file that parses but names nothing is the failure a bare JSON check would miss."""
    config = tmp_path / "widget.json"
    config.write_text(json.dumps(document), encoding="utf-8")

    code, message = run({HARNESS_CONFIG_VARIABLE: str(config)})

    assert code == UNHEALTHY
    assert message != ""
