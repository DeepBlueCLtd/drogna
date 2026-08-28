"""The store's run manifest: translated from staging, and validated before it is written.

Two documents describe a run and they are not the same document. Staging's descriptor answers
the publisher's question — is this finished, and do the fields match their digests. The store's
manifest answers the query layer's — what can a served value be traced back to. This module is
the translation, and these tests are about the translation being right and about it being
refused when it is not.

Validation before the write is the part worth having. A manifest the query layer would refuse
produces a run that reaches the store and is never catalogued: the publisher reports success,
the announcement goes out, and the EDR collection says no such run exists. That failure
surfaces three components away from its cause, which is why ``coverage-run-manifest.schema.json``
exists and why it is applied here rather than at the reader.
"""

from __future__ import annotations

import json
from pathlib import Path

import publisher_support as support
import pytest
from harness_core.config import ConfigError
from harness_publisher.manifest import (
    RUN_MANIFEST_SCHEMA_VERSION,
    run_manifest,
    sequence_of,
    write_run_manifest,
)

# What stores/coverage/layout.md requires of a manifest before a run is catalogued.
REQUIRED_KEYS = (
    "schema_version",
    "run_id",
    "root_seed",
    "run_sequence",
    "generator_version",
    "model_version",
    "sim_time",
    "valid_time",
    "ensemble",
)


def _descriptor(**overrides: object) -> dict:
    descriptor = support.descriptor_for("run-000004-abcdef012345", b"forecast", b"spread")
    descriptor.update(overrides)
    return descriptor


def test_the_manifest_carries_everything_the_store_asks_for() -> None:
    document = run_manifest(_descriptor())

    assert set(document) == set(REQUIRED_KEYS)
    assert document["schema_version"] == RUN_MANIFEST_SCHEMA_VERSION
    assert document["run_id"] == "run-000004-abcdef012345"
    assert document["root_seed"] == 20260826


def test_the_sequence_is_taken_from_the_descriptor_rather_than_parsed() -> None:
    """Carried on the request since 009 T053, so the manifest records a fact and not a parse."""
    assert sequence_of(_descriptor(run_sequence=4, run_id="named-some-other-way")) == 4


def test_the_sequence_falls_back_to_the_name_for_a_run_that_carries_none() -> None:
    """A run named by the store's rule has its sequence in its name; reading it back is safe."""
    assert sequence_of(_descriptor(run_sequence=None)) == 4


def test_a_run_that_carries_no_sequence_and_is_named_otherwise_records_a_null() -> None:
    """An absence, not a guess: a number here would look like a fact that reproduced the run."""
    document = run_manifest(_descriptor(run_sequence=None, run_id="run-initial"))

    assert document["run_sequence"] is None


def test_a_manifest_the_query_layer_would_refuse_is_refused_here_instead(tmp_path: Path) -> None:
    """The failure this validation exists to prevent, caught where it can still be reported.

    A descriptor with no valid time produces a manifest with an empty extent, which the
    catalogue refuses — and it refuses it after the run has been renamed into the store and
    announced, which is a published run that cannot be served.
    """
    with pytest.raises(ConfigError):
        write_run_manifest(
            tmp_path,
            name="run-manifest.json",
            descriptor=_descriptor(valid_time={"start_sim_time": "2026-08-26T00:00:00.000000Z"}),
        )

    assert not (tmp_path / "run-manifest.json").exists(), (
        "the manifest was written before it was validated, so a refusal leaves a bad file"
    )


def test_a_good_manifest_is_written_whole_and_reads_back(tmp_path: Path) -> None:
    path = write_run_manifest(tmp_path, name="run-manifest.json", descriptor=_descriptor())

    written = json.loads(path.read_text(encoding="utf-8"))
    assert written == run_manifest(_descriptor())
