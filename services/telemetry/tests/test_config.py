"""Configuration is read once, from one variable, and validated before anything else.

Constitution IV. The component reads exactly one environment variable, ``HARNESS_CONFIG``;
the file it names is validated against the packaged schema before any other I/O; and an
invalid file is a startup failure with a readable message rather than a runtime surprise
three hours into a scenario.

The packaged copies are also checked against their masters here. They are an output of the
generation chain and the drift gate would catch a divergence first, but a component whose
runtime validation used a stale schema would be validating against a contract nobody else
held, and that is worth a second assertion.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from harness_core.config import ConfigError
from harness_telemetry import config as telemetry_config
from harness_telemetry.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA
from harness_telemetry.version import TELEMETRY_NAME
from telemetry_support import configuration

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
MASTERS = REPOSITORY_ROOT / "contracts" / "schemas"
PACKAGED = Path(telemetry_config.__file__).resolve().parent / "schemas"


def write(tmp_path: Path, document: object) -> dict[str, str]:
    path = tmp_path / "telemetry.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return {"HARNESS_CONFIG": str(path)}


def test_a_valid_configuration_parses_into_the_generated_model(tmp_path: Path) -> None:
    loaded = telemetry_config.load(env=write(tmp_path, configuration()))

    assert loaded.settings.component.id == TELEMETRY_NAME
    assert loaded.settings.telemetry.minimum_sample_count >= 1
    assert loaded.digest


def test_an_unknown_key_is_a_startup_failure(tmp_path: Path) -> None:
    document = configuration()
    document["telemetry"]["smoothing"] = 0.5

    with pytest.raises(ConfigError):
        telemetry_config.load(env=write(tmp_path, document))


def test_a_minimum_sample_count_of_zero_is_refused(tmp_path: Path) -> None:
    """Zero would mean a score published on no evidence, which is the point of FR-009."""
    document = configuration()
    document["telemetry"]["minimum_sample_count"] = 0

    with pytest.raises(ConfigError):
        telemetry_config.load(env=write(tmp_path, document))


def test_a_publication_interval_of_zero_is_refused(tmp_path: Path) -> None:
    document = configuration()
    document["telemetry"]["publication_interval_seconds"] = 0

    with pytest.raises(ConfigError):
        telemetry_config.load(env=write(tmp_path, document))


def test_a_missing_variable_is_a_startup_failure() -> None:
    with pytest.raises(ConfigError):
        telemetry_config.load(env={})


@pytest.mark.parametrize("name", [CONFIG_SCHEMA, COMMON_CONFIG_SCHEMA])
def test_each_packaged_schema_is_its_master_byte_for_byte(name: str) -> None:
    assert (PACKAGED / name).read_bytes() == (MASTERS / name).read_bytes()


def test_the_package_ships_no_copy_of_the_message_contract() -> None:
    """Messages are validated through the generated model, which is the one definition."""
    assert not (PACKAGED / "telemetry.schema.json").exists()
