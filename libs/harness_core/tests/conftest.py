"""Shared fixtures. Paths are computed from this file, never written as literals."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = REPO_ROOT / "contracts" / "schemas"


def _schema(name: str) -> dict[str, Any]:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def common_config_schema() -> dict[str, Any]:
    return _schema("config.common.schema.json")


@pytest.fixture(scope="session")
def run_manifest_schema() -> dict[str, Any]:
    return _schema("run-manifest.schema.json")
