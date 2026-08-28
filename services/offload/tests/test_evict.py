"""Eviction, which is to say: the four ways a verified bundle stays on disk.

FR-44's premature-eviction guarantee is not proved by a bundle being deleted when it should
be. It is proved by the bundles that are not deleted, so the happy path is one test here
and the refusals are the rest. Every test asserts what survived.
"""

from __future__ import annotations

from harness_core.clock import SimInstant
from harness_offload.bundle import digest_of
from harness_offload.evict import (
    Candidate,
    RetentionPolicy,
    asked_for_space,
    delete_verified,
    due_for_eviction,
)
from offload_support import EPOCH

PAYLOAD = b"a verified bundle"
GENEROUS = RetentionPolicy(maximum_staging_bytes=1_000_000, maximum_age_simulation_seconds=86_400)


def candidate(
    tmp_path, name: str = "b-0123456789abcdef", *, payload: bytes = PAYLOAD, age: int = 0
):
    path = tmp_path / f"{name}.nc"
    sidecar = tmp_path / f"{name}.manifest.json"
    run_manifest = tmp_path / f"{name}.run-manifest.json"
    path.write_bytes(payload)
    sidecar.write_text("{}", encoding="utf-8")
    run_manifest.write_text("{}", encoding="utf-8")
    return Candidate(
        bundle_id=name,
        path=path,
        sidecar_path=sidecar,
        run_manifest_path=run_manifest,
        verified_digest=digest_of(payload),
        byte_length=len(payload),
        verified_at=SimInstant.from_iso(EPOCH).plus_micros(-age * 1_000_000),
    )


def now():
    return SimInstant.from_iso(EPOCH)


# ---------------------------------------------------- a receipt permits, it does not cause


def test_a_verified_bundle_under_no_retention_pressure_stays_on_disk(tmp_path) -> None:
    """FR-014. The bundle is verified, the destination has it, and it is still here."""
    one = candidate(tmp_path)

    due = due_for_eviction([one], policy=GENEROUS, staging_bytes=len(PAYLOAD), now=now())

    assert due == ()
    assert one.path.read_bytes() == PAYLOAD
    assert one.sidecar_path.exists()


def test_nothing_is_asked_for_when_both_bounds_are_satisfied(tmp_path) -> None:
    one = candidate(tmp_path)

    assert not asked_for_space([one], policy=GENEROUS, staging_bytes=len(PAYLOAD), now=now())


def test_the_size_bound_asks_for_only_as_much_as_it_needs(tmp_path) -> None:
    """Oldest first, and it stops when there is room. It does not empty the area."""
    old = candidate(tmp_path, "b-aaaaaaaaaaaaaaaa", age=100)
    new = candidate(tmp_path, "b-bbbbbbbbbbbbbbbb", age=1)
    policy = RetentionPolicy(
        maximum_staging_bytes=len(PAYLOAD), maximum_age_simulation_seconds=86_400
    )

    due = due_for_eviction([new, old], policy=policy, staging_bytes=2 * len(PAYLOAD), now=now())

    assert [item.bundle_id for item in due] == [old.bundle_id]
    assert new.path.exists()


def test_the_age_bound_asks_for_only_the_bundles_it_names(tmp_path) -> None:
    old = candidate(tmp_path, "b-aaaaaaaaaaaaaaaa", age=100_000)
    new = candidate(tmp_path, "b-bbbbbbbbbbbbbbbb", age=1)
    policy = RetentionPolicy(maximum_staging_bytes=1_000_000, maximum_age_simulation_seconds=10)

    due = due_for_eviction([new, old], policy=policy, staging_bytes=2 * len(PAYLOAD), now=now())

    assert [item.bundle_id for item in due] == [old.bundle_id]


# ----------------------------------------------------------------- the pre-delete check


def test_a_bundle_whose_file_changed_after_verification_is_not_deleted(tmp_path) -> None:
    """FR-013. Whatever this file now is, the destination has not got it."""
    one = candidate(tmp_path)
    one.path.write_bytes(b"something else entirely")

    outcome = delete_verified(one)

    assert not outcome.deleted
    assert "the only copy" in outcome.reason
    assert one.path.read_bytes() == b"something else entirely"
    assert one.sidecar_path.exists()


def test_a_bundle_that_has_been_truncated_is_not_deleted(tmp_path) -> None:
    one = candidate(tmp_path)
    one.path.write_bytes(PAYLOAD[:-1])

    outcome = delete_verified(one)

    assert not outcome.deleted
    assert one.path.exists()


def test_a_bundle_that_vanished_is_reported_rather_than_resolved(tmp_path) -> None:
    """The ledger and the filesystem disagree, and deleting something does not settle it."""
    one = candidate(tmp_path)
    one.path.unlink()

    outcome = delete_verified(one)

    assert not outcome.deleted
    assert "cannot be read" in outcome.reason
    assert one.sidecar_path.exists()


def test_a_bundle_verified_against_a_different_digest_is_not_deleted(tmp_path) -> None:
    """The digest carried forward from verification is what the file must still match."""
    one = candidate(tmp_path)
    impostor = Candidate(
        bundle_id=one.bundle_id,
        path=one.path,
        sidecar_path=one.sidecar_path,
        run_manifest_path=one.run_manifest_path,
        verified_digest=digest_of(b"bytes the destination never saw"),
        byte_length=one.byte_length,
        verified_at=one.verified_at,
    )

    outcome = delete_verified(impostor)

    assert not outcome.deleted
    assert one.path.read_bytes() == PAYLOAD


# ------------------------------------------------------------------------- and the one


def test_a_bundle_the_policy_asked_for_and_the_bytes_still_match_is_deleted(tmp_path) -> None:
    """The happy path, asserted last and once, with the sidecar going with it."""
    one = candidate(tmp_path)

    outcome = delete_verified(one)

    assert outcome.deleted
    assert not one.path.exists()
    assert not one.sidecar_path.exists()
