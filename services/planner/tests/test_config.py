"""The planner starts from a validated named file, or it does not start.

Constitution IV and NFR-04. The order matters here for a reason particular to this
component: it reads a field, a ground-truth manifest and two subscriptions, and every one of
those locations is in the configuration. A planner that opened any of them before validating
would be one typo away from planning against the wrong domain and saying nothing about it.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from harness_core.config import (
    EXIT_CONFIG_INVALID,
    EXIT_NO_CONFIG_VARIABLE,
    ConfigInvalidError,
    MissingConfigVariableError,
)
from harness_planner.config import load
from harness_planner.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema
from planner_support import configuration

REPO_ROOT = Path(__file__).resolve().parents[3]


def written(tmp_path: Path, document: dict) -> Path:
    path = tmp_path / "planner.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def test_a_valid_configuration_loads_and_carries_its_digest(tmp_path: Path) -> None:
    config = load(env={"HARNESS_CONFIG": str(written(tmp_path, configuration()))})

    assert config.settings.component.id == "planner"
    assert config.settings.planner.indexing.h3_resolution == 6
    assert config.settings.planner.uncertainty.variable.value == "temperature_spread"
    assert config.digest.startswith("sha256:")


def test_no_config_variable_is_a_refusal_naming_the_variable() -> None:
    with pytest.raises(MissingConfigVariableError) as raised:
        load(env={})

    assert "HARNESS_CONFIG" in str(raised.value)
    assert raised.value.exit_code == EXIT_NO_CONFIG_VARIABLE


def test_a_missing_planner_section_names_its_pointer(tmp_path: Path) -> None:
    path = written(tmp_path, {"component": {"id": "planner"}})

    with pytest.raises(ConfigInvalidError) as raised:
        load(env={"HARNESS_CONFIG": str(path)})

    assert raised.value.exit_code == EXIT_CONFIG_INVALID
    assert str(path) in str(raised.value)


def test_an_unknown_key_is_a_startup_failure_rather_than_a_silent_default(
    tmp_path: Path,
) -> None:
    document = configuration()
    document["planner"]["hoirzon"] = {"span_seconds": 1.0}

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_a_peak_reduction_outside_its_interval_is_refused_by_the_schema(
    tmp_path: Path,
) -> None:
    document = configuration(sensing={"peak_reduction": 1.5})

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_a_resolution_that_is_not_an_h3_resolution_is_refused_by_the_schema(
    tmp_path: Path,
) -> None:
    document = configuration(indexing={"h3_resolution": 42})

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_a_restart_count_below_one_is_refused_by_the_schema(tmp_path: Path) -> None:
    document = configuration(search={"restarts": 0})

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


@pytest.mark.parametrize("name", [CONFIG_SCHEMA, COMMON_CONFIG_SCHEMA])
def test_the_packaged_schema_is_byte_identical_to_its_master(name: str) -> None:
    """The copies are an output of the generator chain, so this cannot fail on its own."""
    packaged = json.dumps(schema(name), sort_keys=True)
    master = json.dumps(
        json.loads((REPO_ROOT / "contracts" / "schemas" / name).read_text(encoding="utf-8")),
        sort_keys=True,
    )

    assert packaged == master


@pytest.mark.parametrize("destination", ["local", "droplet"])
def test_both_destinations_carry_a_configuration_this_component_accepts(
    destination: str,
) -> None:
    """NFR-04: one shape, two destinations, and neither is checked only on the day it runs."""
    path = REPO_ROOT / "config" / destination / "planner.json"

    config = load(env={"HARNESS_CONFIG": str(path)})

    assert config.settings.component.id == "planner"
    assert config.settings.planner.horizon.span_seconds > 0.0
