"""The clock starts from a validated named file, or it does not start.

Constitution IV and NFR-04. The clock is the component where the order matters most,
because everything else waits on its socket: a port bound before the configuration was
checked is a port other components have already connected to.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from clock_support import loaded, written
from harness_clock.config import load, load_or_exit_with
from harness_clock.schemas import CONFIG_SCHEMA, schema
from harness_core.config import (
    EXIT_CONFIG_INVALID,
    EXIT_NO_CONFIG_VARIABLE,
    ConfigInvalidError,
    MissingConfigVariableError,
)


def test_a_valid_configuration_loads_and_carries_its_digest(tmp_path: Path) -> None:
    config = loaded(tmp_path)

    assert config.settings.component.id == "clock"
    assert config.settings.clock_service.tick_interval_us == 100_000
    assert config.digest.startswith("sha256:")


def test_no_config_variable_is_a_refusal_naming_the_variable() -> None:
    with pytest.raises(MissingConfigVariableError) as raised:
        load(env={})

    assert "HARNESS_CONFIG" in str(raised.value)
    assert raised.value.exit_code == EXIT_NO_CONFIG_VARIABLE


def test_a_missing_clock_section_names_its_pointer(tmp_path: Path) -> None:
    path = tmp_path / "clock.json"
    path.write_text(json.dumps({"component": {"id": "clock"}}), encoding="utf-8")

    with pytest.raises(ConfigInvalidError) as raised:
        load(env={"HARNESS_CONFIG": str(path)})

    assert raised.value.exit_code == EXIT_CONFIG_INVALID
    assert str(path) in str(raised.value)


def test_an_unknown_key_is_a_startup_failure_not_a_silent_default(tmp_path: Path) -> None:
    """A typo in a key is the failure a schema exists to catch."""
    env, content = written(tmp_path)
    content["clock_service"]["tick_intervel_us"] = 100
    Path(env["HARNESS_CONFIG"]).write_text(json.dumps(content), encoding="utf-8")

    with pytest.raises(ConfigInvalidError) as raised:
        load(env=env)

    assert "/clock_service" in raised.value.pointer or "tick_intervel_us" in str(raised.value)


def test_a_rate_bound_below_zero_is_refused(tmp_path: Path) -> None:
    """A negative rate would run simulation time backwards, so the schema refuses one."""
    env, content = written(tmp_path)
    content["clock_service"]["rate_bounds"]["minimum"] = -1.0
    Path(env["HARNESS_CONFIG"]).write_text(json.dumps(content), encoding="utf-8")

    with pytest.raises(ConfigInvalidError):
        load(env=env)


def test_the_entry_point_form_exits_with_the_matching_code(tmp_path: Path, capsys) -> None:
    with pytest.raises(SystemExit) as raised:
        load_or_exit_with(env={})

    assert raised.value.code == EXIT_NO_CONFIG_VARIABLE


def test_the_packaged_schema_is_the_master(tmp_path: Path) -> None:
    """The copy travels with the code because a container has no contracts directory."""
    root = Path(__file__).resolve().parents[3]
    master = json.loads(
        (root / "contracts" / "schemas" / CONFIG_SCHEMA).read_text(encoding="utf-8")
    )

    assert schema(CONFIG_SCHEMA) == master


def test_both_shipped_destinations_validate() -> None:
    """The same shape at both destinations, differing only in values (NFR-06)."""
    root = Path(__file__).resolve().parents[3]
    for destination in ("local", "droplet"):
        path = root / "config" / destination / "clock.json"
        env = {"HARNESS_CONFIG": str(path)}
        config = load(env=env)
        assert config.settings.component.id == "clock"
