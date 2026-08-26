"""The seeding record is the evidence that two instances hold the same content.

Everything asserted here can be checked without a container runtime, because the record is
a function of the destination configuration, the seeding steps and their artefacts, and of
nothing else. The end-to-end claim — seed, reset, reseed, compare — is in
`tests/integration/test_seed_idempotence.py`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "deploy" / "lib"))

import seed_record  # noqa: E402
from destination import ConfigurationError  # noqa: E402

TIME_WORDS = ("timestamp", "created_at", "generated_at", "date", "time")


def test_the_record_is_a_function_of_its_inputs(tmp_path: Path) -> None:
    first = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)
    second = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)

    assert seed_record.serialise(first) == seed_record.serialise(second)


def test_the_record_carries_no_time(tmp_path: Path) -> None:
    """There is no host time to take (Constitution I), and a timestamp would make two
    equivalent instances compare unequal, which is the opposite of the record's purpose."""
    record = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)

    serialised = seed_record.serialise(record).lower()
    for word in TIME_WORDS:
        assert word not in serialised


def test_the_record_names_the_root_seed_taken_from_configuration(tmp_path: Path) -> None:
    record = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)

    common = json.loads((REPOSITORY_ROOT / "config" / "local" / "common.json").read_text())
    assert record["root_seed"] == common["seed"]["root"]


def test_the_record_digests_every_configuration_file(tmp_path: Path) -> None:
    record = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)

    names = sorted(path.name for path in (REPOSITORY_ROOT / "config" / "local").glob("*.json"))
    assert sorted(record["configuration"]) == names
    assert all(digest.startswith("sha256:") for digest in record["configuration"].values())


def test_an_artefact_changing_changes_the_record(tmp_path: Path) -> None:
    """The record is only evidence if it moves when the content moves."""
    steps = REPOSITORY_ROOT / "deploy" / "seed.d"
    installed = seed_record.seed_steps(REPOSITORY_ROOT)
    if not installed:
        pytest.skip(f"no seeding steps are installed in {steps} yet")

    before = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)
    directory = tmp_path / installed[0].stem
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "field.nc").write_text("not really a field", encoding="utf-8")
    after = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)

    assert seed_record.serialise(before) != seed_record.serialise(after)


def test_the_record_is_written_whole_or_not_at_all(tmp_path: Path) -> None:
    """An interrupted run must never leave a record claiming success."""
    record = seed_record.build_record("local", tmp_path, REPOSITORY_ROOT)
    target = tmp_path / "runtime" / "seeding-record.json"

    seed_record.write_record(record, target)

    assert json.loads(target.read_text()) == record
    assert list(target.parent.glob("*.partial")) == []


def test_a_destination_with_no_root_seed_is_refused(tmp_path: Path) -> None:
    """A seed the deployment invented would be a seed nobody could reproduce."""
    directory = tmp_path / "config" / "here"
    directory.mkdir(parents=True)
    (directory / "common.json").write_text(json.dumps({"seed": {}}), encoding="utf-8")

    with pytest.raises(ConfigurationError) as failure:
        seed_record.root_seed("here", tmp_path)

    assert "seed.root" in str(failure.value)
