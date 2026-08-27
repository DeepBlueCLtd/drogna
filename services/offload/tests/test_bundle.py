"""Bundle identity and the sidecar: derived from the run, never from the moment.

The property under test is not that an identifier looks right but that it is a function of
declared inputs and of nothing else. So each test changes exactly one input and asserts the
identifier moved, and the determinism test changes nothing and asserts it did not.
"""

from __future__ import annotations

import pytest
from harness_core.clock import SimInstant
from harness_core.config import ConfigInvalidError
from harness_offload.bundle import (
    BUNDLE_ID_PREFIX,
    BundleMember,
    bundle_id_for,
    digest_of,
    run_reference_for,
    sidecar_manifest,
    validate_manifest,
)
from harness_offload.version import FORMAT_VERSION, MANIFEST_SCHEMA_VERSION
from offload_support import EPOCH, run_manifest


def test_a_bundle_identifier_is_a_function_of_the_run_and_the_window() -> None:
    manifest = run_manifest()

    assert bundle_id_for(manifest, 0) == bundle_id_for(manifest, 0)
    assert bundle_id_for(manifest, 0) != bundle_id_for(manifest, 1)
    assert bundle_id_for(manifest, 0).startswith(f"{BUNDLE_ID_PREFIX}-")


def test_a_different_root_seed_names_a_different_bundle() -> None:
    """The seed is the run's identity; two runs must not collide on a bundle name."""
    assert bundle_id_for(run_manifest(), 0) != bundle_id_for(run_manifest(root_seed=20260827), 0)


def test_a_different_run_identifier_names_a_different_bundle() -> None:
    assert bundle_id_for(run_manifest(), 0) != bundle_id_for(
        run_manifest(run_id="run-000001-6ab42ca09e7d"), 0
    )


def test_a_manifest_with_no_run_identity_names_no_bundle() -> None:
    """Refused rather than defaulted: a bundle nobody can trace is worse than no bundle."""
    with pytest.raises(ValueError, match="run identifier"):
        bundle_id_for(run_manifest(run_id=""), 0)
    with pytest.raises(ValueError, match="root seed"):
        bundle_id_for({"run_id": "run-000000-7f80b47c7b91"}, 0)


def test_a_window_index_is_a_whole_number_counted_forwards() -> None:
    with pytest.raises(ValueError):
        bundle_id_for(run_manifest(), -1)
    with pytest.raises(TypeError):
        bundle_id_for(run_manifest(), True)


def test_the_run_reference_hides_the_digest_it_came_from() -> None:
    """FR-017: enough to tie two bundles to one run, useless without the manifest."""
    digest = digest_of(b"a run manifest")
    reference = run_reference_for(digest)

    assert len(reference) == 32
    assert all(character in "0123456789abcdef" for character in reference)
    assert digest.removeprefix("sha256:") not in reference
    assert reference == run_reference_for(digest)
    assert reference != run_reference_for(digest_of(b"a different run manifest"))


# ------------------------------------------------------------------------- the sidecar


def sidecar(**overrides):
    epoch = SimInstant.from_iso(EPOCH)
    arguments = {
        "bundle_id": "b-0123456789abcdef",
        "run_manifest_digest": digest_of(b"a run manifest"),
        "window_index": 0,
        "window_start": epoch,
        "window_end": epoch.plus_micros(3600 * 1_000_000),
        "members": [BundleMember("b-0123456789abcdef.nc", digest_of(b"bundle"), 6)],
        "variables": ["sea_water_temperature"],
        "profile_count": 3,
        "level_count": 9,
    }
    arguments.update(overrides)
    return sidecar_manifest(**arguments)


def test_the_sidecar_records_every_member_with_its_digest_and_length() -> None:
    manifest = sidecar()

    member = manifest.member("b-0123456789abcdef.nc")
    assert member.digest == digest_of(b"bundle")
    assert member.byte_length == 6
    assert manifest.document["format_version"] == FORMAT_VERSION
    assert manifest.document["schema_version"] == MANIFEST_SCHEMA_VERSION


def test_the_sidecar_records_the_window_it_covers_in_simulation_time() -> None:
    window = sidecar().document["window"]

    assert window["index"] == 0
    assert window["start_sim_time"] == EPOCH
    assert window["end_sim_time"] == "2026-09-01T01:00:00.000000Z"


def test_the_sidecar_carries_the_run_manifest_digest_and_not_the_manifest() -> None:
    """Constitution IX needs the digest; FR-42 forbids the document."""
    document = sidecar().document

    assert document["run_manifest_digest"] == digest_of(b"a run manifest")
    assert "run_manifest" not in document
    assert document["run_reference"] == run_reference_for(document["run_manifest_digest"])


def test_the_sidecar_bytes_are_stable_across_two_constructions() -> None:
    assert sidecar().payload() == sidecar().payload()


def test_a_sidecar_the_master_would_refuse_is_refused_here() -> None:
    """Validated before the bundle counts as staged, so a bad sidecar never enters the ledger."""
    with pytest.raises(ConfigInvalidError):
        sidecar(profile_count=0)
    with pytest.raises(ConfigInvalidError):
        sidecar(members=[])


def test_a_member_digest_of_the_wrong_shape_is_refused() -> None:
    with pytest.raises(ConfigInvalidError):
        validate_manifest(
            {
                **sidecar().document,
                "members": [{"name": "x.nc", "digest": "not-a-digest", "byte_length": 1}],
            }
        )


def test_digests_are_sha256_and_say_so() -> None:
    assert digest_of(b"").startswith("sha256:")
    assert len(digest_of(b"")) == len("sha256:") + 64
