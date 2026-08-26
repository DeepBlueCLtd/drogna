"""The startup contract: one variable, one file, validated before anything else."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from harness_core.config import (
    EXIT_CONFIG_INVALID,
    EXIT_CONFIG_MALFORMED,
    EXIT_CONFIG_UNREADABLE,
    EXIT_NO_CONFIG_VARIABLE,
    HARNESS_CONFIG_VARIABLE,
    ConfigInvalidError,
    ConfigMalformedError,
    ConfigUnreadableError,
    MissingConfigVariableError,
    load_config,
    load_or_exit,
)


def valid_document() -> dict[str, Any]:
    return {
        "component": {"id": "clock", "heartbeat_interval_seconds": 2.0},
        "clock": {
            "endpoint": "https://clock.invalid/",
            "routes": {"snapshot": "clock/state", "control": "control/clock"},
            "mode": "lockstep",
        },
        "seed": {"root": 12345, "stream": "clock"},
        "logging": {"level": "INFO"},
    }


def write(tmp_path: Path, document: Any) -> str:
    path = tmp_path / "component.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return str(path)


def test_a_valid_config_is_parsed_and_digested(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    path = write(tmp_path, valid_document())
    loaded = load_config(
        common_config_schema, env={HARNESS_CONFIG_VARIABLE: path}, component="clock"
    )

    assert loaded.source == path
    assert loaded.document["component"]["id"] == "clock"
    assert loaded.digest.startswith("sha256:")
    assert len(loaded.digest) == len("sha256:") + 64
    assert loaded.section("seed")["root"] == 12345


def test_the_digest_is_of_the_file_as_read(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    import hashlib

    path = write(tmp_path, valid_document())
    raw = Path(path).read_bytes()
    loaded = load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path})

    assert loaded.digest == "sha256:" + hashlib.sha256(raw).hexdigest()


def test_an_unset_variable_names_the_variable_and_the_component(
    common_config_schema: dict[str, Any],
) -> None:
    with pytest.raises(MissingConfigVariableError) as raised:
        load_config(common_config_schema, env={}, component="env_generator")

    assert HARNESS_CONFIG_VARIABLE in str(raised.value)
    assert "env_generator" in str(raised.value)
    assert raised.value.exit_code == EXIT_NO_CONFIG_VARIABLE


def test_an_unreadable_file_names_the_file(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    missing = str(tmp_path / "absent.json")
    with pytest.raises(ConfigUnreadableError) as raised:
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: missing})

    assert missing in str(raised.value)
    assert raised.value.exit_code == EXIT_CONFIG_UNREADABLE


def test_a_document_that_is_not_json_is_distinguished_from_one_that_is_invalid(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    path = tmp_path / "component.json"
    path.write_text("{ not json at all", encoding="utf-8")

    with pytest.raises(ConfigMalformedError) as raised:
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: str(path)})

    assert str(path) in str(raised.value)
    assert raised.value.exit_code == EXIT_CONFIG_MALFORMED
    assert raised.value.exit_code != EXIT_CONFIG_INVALID


def test_a_missing_clock_endpoint_names_the_json_pointer_the_schema_and_the_file(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    document = valid_document()
    del document["clock"]["endpoint"]
    path = write(tmp_path, document)

    with pytest.raises(ConfigInvalidError) as raised:
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path})

    assert raised.value.pointer == "/clock"
    assert "endpoint" in str(raised.value)
    assert raised.value.schema_id.endswith("config.common.schema.json")
    assert raised.value.source == path
    assert raised.value.exit_code == EXIT_CONFIG_INVALID


def test_an_unknown_key_inside_a_section_fails_startup(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    """Silent acceptance of unknown keys hides typos, which is worse than refusing."""
    document = valid_document()
    document["clock"]["endpiont"] = "https://clock.invalid/"
    path = write(tmp_path, document)

    with pytest.raises(ConfigInvalidError) as raised:
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path})

    assert raised.value.pointer == "/clock"
    assert "endpiont" in str(raised.value)


def test_an_unknown_top_level_section_fails_startup(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    document = valid_document()
    document["clcok"] = {}
    path = write(tmp_path, document)

    with pytest.raises(ConfigInvalidError):
        load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path})


def test_a_rate_of_zero_is_expressible_in_configuration(
    tmp_path: Path, common_config_schema: dict[str, Any]
) -> None:
    """FR-53: a capture pins the rate to zero, so zero must be a legitimate value."""
    document = valid_document()
    document["clock"]["mode"] = "paused"
    path = write(tmp_path, document)

    loaded = load_config(common_config_schema, env={HARNESS_CONFIG_VARIABLE: path})
    assert loaded.section("clock")["mode"] == "paused"


def test_the_entry_point_form_exits_with_the_matching_code(
    tmp_path: Path, common_config_schema: dict[str, Any], capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as raised:
        load_or_exit(common_config_schema, env={}, component="clock")

    assert raised.value.code == EXIT_NO_CONFIG_VARIABLE
    assert HARNESS_CONFIG_VARIABLE in capsys.readouterr().err
