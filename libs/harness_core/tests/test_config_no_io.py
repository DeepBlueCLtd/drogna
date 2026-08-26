"""Nothing happens before validation: an injected recorder is the evidence."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from harness_core.config import (
    HARNESS_CONFIG_VARIABLE,
    ConfigInvalidError,
    ConfigUnreadableError,
    load_config,
)


class IoRecorder:
    """Stands in for every file, socket and database the loader might touch."""

    def __init__(self, contents: dict[str, bytes]) -> None:
        self._contents = contents
        self.reads: list[str] = []

    def __call__(self, path: str) -> bytes:
        self.reads.append(path)
        try:
            return self._contents[path]
        except KeyError:
            raise FileNotFoundError(2, "No such file or directory", path) from None


def document() -> dict[str, Any]:
    return {
        "component": {"id": "clock"},
        "clock": {
            "endpoint": "https://clock.invalid/",
            "routes": {"snapshot": "clock/state", "control": "control/clock"},
            "mode": "realtime",
        },
        "seed": {"root": 1, "stream": "clock"},
        "logging": {"level": "INFO"},
    }


def test_exactly_one_read_happens_and_it_is_the_config(
    common_config_schema: dict[str, Any],
) -> None:
    path = "/injected/component.json"
    recorder = IoRecorder({path: json.dumps(document()).encode("utf-8")})

    loaded = load_config(
        common_config_schema, env={HARNESS_CONFIG_VARIABLE: path}, reader=recorder
    )

    assert recorder.reads == [path]
    assert loaded.source == path


def test_no_read_at_all_happens_when_the_variable_is_unset(
    common_config_schema: dict[str, Any],
) -> None:
    recorder = IoRecorder({})

    with pytest.raises(Exception, match=HARNESS_CONFIG_VARIABLE):
        load_config(common_config_schema, env={}, reader=recorder)

    assert recorder.reads == []


def test_validation_failure_costs_one_read_and_no_more(
    common_config_schema: dict[str, Any],
) -> None:
    path = "/injected/component.json"
    invalid = document()
    del invalid["seed"]
    recorder = IoRecorder({path: json.dumps(invalid).encode("utf-8")})

    with pytest.raises(ConfigInvalidError):
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path}, reader=recorder)

    assert recorder.reads == [path]


def test_the_schema_is_supplied_in_memory_so_no_second_file_is_needed(
    common_config_schema: dict[str, Any], tmp_path: Path
) -> None:
    """A component holds its schema; it does not go looking for one at startup."""
    recorder = IoRecorder({})

    with pytest.raises(ConfigUnreadableError):
        load_config(
            common_config_schema,
            env={HARNESS_CONFIG_VARIABLE: str(tmp_path / "absent.json")},
            reader=recorder,
        )

    assert len(recorder.reads) == 1
