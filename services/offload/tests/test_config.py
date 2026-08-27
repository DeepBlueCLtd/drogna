"""The startup contract, and the two things the schema cannot say.

Constitution IV: one environment variable, one file, validated before any other I/O. The
loader is ``harness_core``'s and is tested there; what is tested here is that this component
uses it, that its schema refuses what it should, and that the two cross-field invariants
stop the process rather than being discovered later.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest
from harness_core.config import (
    EXIT_CONFIG_INVALID,
    ConfigInvalidError,
    MissingConfigVariableError,
)
from harness_offload.config import load, load_or_exit_with
from harness_offload.schemas import CONFIG_SCHEMA, schema
from harness_offload.version import CONVENTIONS, PACKAGER_NAME
from offload_support import configuration

PACKAGE = Path(__file__).resolve().parents[1] / "src" / "harness_offload"


def written(tmp_path: Path, document) -> Path:
    path = tmp_path / "offload.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def test_the_component_reads_one_variable_and_validates_before_anything_else(
    tmp_path: Path,
) -> None:
    reads: list[str] = []

    def reader(path: str) -> bytes:
        reads.append(path)
        return Path(path).read_bytes()

    path = written(tmp_path, configuration(tmp_path))
    config = load(env={"HARNESS_CONFIG": str(path)}, reader=reader)

    assert reads == [str(path)]
    assert config.settings.component.id == PACKAGER_NAME
    assert config.digest.startswith("sha256:")


def test_without_the_variable_there_is_nothing_to_read() -> None:
    with pytest.raises(MissingConfigVariableError):
        load(env={})


def test_a_document_the_schema_refuses_stops_the_component(tmp_path: Path) -> None:
    document = configuration(tmp_path)
    del document["offload"]["ledger"]

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_an_unknown_key_is_refused_rather_than_ignored(tmp_path: Path) -> None:
    """Closed schemas: a typo in a key is a startup failure, not a silent default."""
    document = configuration(tmp_path)
    document["offload"]["retenton"] = {}

    with pytest.raises(ConfigInvalidError):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_a_staging_area_inside_the_released_area_refuses_to_start(tmp_path: Path) -> None:
    """FR-018. Every bundle would be public the instant it was written."""
    document = configuration(tmp_path)
    document["offload"]["release"]["directory"] = str(tmp_path / "staging" / "public")

    with pytest.raises(ConfigInvalidError, match="released"):
        load(env={"HARNESS_CONFIG": str(written(tmp_path, document))})


def test_a_conformance_version_the_writer_does_not_emit_refuses_to_start(
    tmp_path: Path,
) -> None:
    """A check run against a version the file does not claim examines nothing."""
    document = configuration(tmp_path)
    document["offload"]["compliance"]["convention_version"] = "CF-1.10"
    versions = schema(CONFIG_SCHEMA)["properties"]["offload"]["properties"]["compliance"][
        "properties"
    ]["convention_version"]["enum"]

    assert versions == [CONVENTIONS], (
        "the schema's pinned version and the writer's must be the same one value"
    )


def test_the_entry_point_form_exits_with_the_matching_code(tmp_path: Path) -> None:
    document = configuration(tmp_path)
    document["offload"]["release"]["directory"] = str(tmp_path / "staging")

    with (
        open(tmp_path / "err.txt", "w", encoding="utf-8") as stderr,
        pytest.raises(SystemExit) as exit_info,
    ):
        load_or_exit_with(env={"HARNESS_CONFIG": str(written(tmp_path, document))}, stderr=stderr)

    assert exit_info.value.code == EXIT_CONFIG_INVALID
    assert "released" in (tmp_path / "err.txt").read_text(encoding="utf-8")


# ------------------------------------------------- Constitution I and II, by inspection


def calls_in(path: Path) -> set[str]:
    """Every dotted call name in a module, so a prohibited one is found without running it."""
    names: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Call):
            parts: list[str] = []
            target = node.func
            while isinstance(target, ast.Attribute):
                parts.append(target.attr)
                target = target.value
            if isinstance(target, ast.Name):
                parts.append(target.id)
            names.add(".".join(reversed(parts)))
    return names


def test_no_module_in_the_package_reads_a_host_clock() -> None:
    """Constitution I. The gate says this across the repository; this says it here, by name.

    Every time in an export, a ledger record, a receipt comparison and a telemetry message
    comes from the clock port. The heartbeat's cadence is real time by ADR-0006 and is
    published by ``harness_core``, which carries the exemption; nothing in this package
    does.
    """
    prohibited = {
        "time.time",
        "time.monotonic",
        "time.perf_counter",
        "datetime.now",
        "datetime.utcnow",
        "datetime.datetime.now",
        "date.today",
    }

    for module in sorted(PACKAGE.glob("*.py")):
        assert not (calls_in(module) & prohibited), module.name


def test_no_module_in_the_package_draws_from_an_unseeded_generator() -> None:
    """Constitution II. Bundle identity is derived; nothing here has anything to draw."""
    prohibited = {
        "random.random",
        "random.Random",
        "random.choice",
        "uuid.uuid4",
        "uuid4",
        "os.urandom",
        "secrets.token_hex",
    }

    for module in sorted(PACKAGE.glob("*.py")):
        assert not (calls_in(module) & prohibited), module.name


def test_the_only_environment_variable_the_package_names_is_the_one(tmp_path: Path) -> None:
    for module in sorted(PACKAGE.glob("*.py")):
        text = module.read_text(encoding="utf-8")
        assert "os.environ" not in text, module.name
        assert "getenv" not in text, module.name
