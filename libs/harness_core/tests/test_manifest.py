"""The run manifest: sufficient for a replay, digests only, finalised atomically."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from harness_core.clock import ClockMode, ParticipantRole, SimInstant
from harness_core.clock_service import ClockEngine, ClockSettings
from harness_core.config import ConfigInvalidError
from harness_core.manifest import (
    ExitState,
    ManifestParticipant,
    ManifestWriter,
    RunManifest,
    compare_manifests,
    read_manifest,
    write_manifest,
)
from harness_core.rng import DERIVATION_RULE, DERIVATION_VERSION, RandomStreams

EPOCH_ISO = "2026-01-01T00:00:00.000000Z"
DIGEST = "sha256:" + "a" * 64


def manifest(**overrides: Any) -> RunManifest:
    base: dict[str, Any] = {
        "run_id": "run-0001",
        "root_seed": 12345,
        "seed_rule": DERIVATION_RULE,
        "seed_rule_version": DERIVATION_VERSION,
        "clock": {
            "epoch": EPOCH_ISO,
            "tick_interval_us": 100_000,
            "mode": "lockstep",
            "rate": 1.0,
            "min_rate": 0.0,
            "max_rate": 100.0,
        },
        "code_revision": "0" * 40,
        "participants": (
            ManifestParticipant("alpha", ParticipantRole.LOCKSTEP, DIGEST, registered_tick=0),
        ),
        "streams": ("alpha.draw", "beta.draw"),
    }
    base.update(overrides)
    return RunManifest(**base)


def test_a_manifest_validates_against_its_schema(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    write_manifest(path, manifest(), schema=run_manifest_schema)
    restored = read_manifest(path, schema=run_manifest_schema)
    assert restored == manifest()


def test_it_records_digests_and_no_configuration_values(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    write_manifest(path, manifest(), schema=run_manifest_schema)
    document = json.loads(Path(path).read_text(encoding="utf-8"))

    assert document["participants"][0]["config_digest"] == DIGEST
    serialised = json.dumps(document)
    assert "endpoint" not in serialised
    assert "://" not in serialised.replace("schemas.harness.invalid", "")


def test_a_manifest_carrying_a_configuration_value_is_refused_by_the_schema(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    document = manifest().as_document()
    document["participants"][0]["config"] = {"broker": {"url": "mqtt://broker.invalid:1883"}}
    from harness_core.config import validate_document

    with pytest.raises(ConfigInvalidError):
        validate_document(document, run_manifest_schema, source="run-manifest")


def test_the_manifest_names_the_rule_rather_than_a_table_of_seeds(
    run_manifest_schema: dict[str, Any],
) -> None:
    document = manifest().as_document()
    assert document["seed_derivation"] == {
        "rule": DERIVATION_RULE,
        "version": DERIVATION_VERSION,
    }
    assert "seeds" not in document


def test_it_is_sufficient_to_reconstruct_the_run(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    """The replay claim: the manifest and the code version it names, and nothing else."""
    path = str(tmp_path / "run-manifest.json")
    write_manifest(path, manifest(), schema=run_manifest_schema)

    restored = read_manifest(path, schema=run_manifest_schema)
    settings = ClockSettings(**restored.clock_settings())
    engine = ClockEngine(settings)
    streams = RandomStreams(restored.root_seed)

    assert settings.epoch == SimInstant.from_iso(EPOCH_ISO)
    assert settings.mode is ClockMode.LOCKSTEP
    assert engine.tick_for(10).instant.micros == settings.epoch.micros + 1_000_000
    assert streams.rng_for("alpha.draw").random() == RandomStreams(12345).rng_for(
        "alpha.draw"
    ).random()


def test_participants_accumulate_and_the_document_stays_ordered(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    writer = ManifestWriter(path, manifest(participants=()), schema=run_manifest_schema)
    writer.start()
    writer.add_participant(ManifestParticipant("beta", ParticipantRole.LOCKSTEP, DIGEST, 0))
    writer.add_participant(ManifestParticipant("alpha", ParticipantRole.LOCKSTEP, DIGEST, 0))
    writer.add_participant(ManifestParticipant("alpha", ParticipantRole.OBSERVER, DIGEST, 3))

    document = json.loads(Path(path).read_text(encoding="utf-8"))
    assert [item["id"] for item in document["participants"]] == ["alpha", "beta"]
    assert document["participants"][0]["role"] == "observer"
    assert document["participants"][0]["registered_tick"] == 3


def test_the_exit_state_and_final_tick_are_recorded(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    writer = ManifestWriter(path, manifest(), schema=run_manifest_schema)
    writer.start()
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    assert document["exit_state"]["state"] == "running"

    writer.finalise(ExitState.COMPLETED, final_tick=999)
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    assert document["exit_state"] == {"state": "completed", "final_tick": 999}


def test_an_interrupted_write_leaves_the_previous_document_intact(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    write_manifest(path, manifest(), schema=run_manifest_schema)
    before = Path(path).read_bytes()

    broken = manifest(run_id="Not A Valid Run Id")
    with pytest.raises(ConfigInvalidError):
        write_manifest(path, broken, schema=run_manifest_schema)

    assert Path(path).read_bytes() == before
    assert not (tmp_path / "run-manifest.json.partial").exists()


def test_the_write_is_a_rename_so_no_reader_sees_half_a_document(
    tmp_path: Path, run_manifest_schema: dict[str, Any]
) -> None:
    path = str(tmp_path / "run-manifest.json")
    write_manifest(path, manifest(), schema=run_manifest_schema)
    writer = ManifestWriter(path, manifest(), schema=run_manifest_schema)
    writer.finalise(ExitState.COMPLETED, final_tick=1000)

    # Whatever a reader opens, it parses: there is never a partial document at the name.
    assert json.loads(Path(path).read_text(encoding="utf-8"))["exit_state"]["final_tick"] == 1000
    assert list(tmp_path.iterdir()) == [Path(path)]


def test_non_reproducible_fields_are_declared_and_excluded_from_comparison(
    run_manifest_schema: dict[str, Any],
) -> None:
    first = manifest().as_document()
    second = manifest(detail="stalled on beta after 4.2 host seconds").as_document()

    assert "/exit_state/detail" in first["non_reproducible"]
    assert compare_manifests(first, second) == ()

    differing = manifest(root_seed=999).as_document()
    assert compare_manifests(first, differing) == ("root_seed",)


def test_the_schema_annotates_the_fields_it_declares_non_reproducible(
    run_manifest_schema: dict[str, Any],
) -> None:
    detail = run_manifest_schema["properties"]["exit_state"]["properties"]["detail"]
    assert detail["x-non-reproducible"] is True
