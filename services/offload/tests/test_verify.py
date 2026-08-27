"""Verification, and the one test that proves it is real: the echoing destination.

A destination that returns whatever digest it was handed agrees with a declared digest
every time — including when the declared digest is wrong and the bytes never arrived. It
can only be caught by comparing against a digest recomputed from the file on disk. So the
echoing test below sends a deliberately wrong declared digest and asserts verification
fails. If that test ever passes, the comparison is against this process's own input and the
whole guarantee is decoration.
"""

from __future__ import annotations

import pytest
from harness_offload.bundle import digest_of
from harness_offload.verify import digest_of_file, verify_receipt
from offload_support import EPOCH

DESTINATION = "archive"
BUNDLE = "b-0123456789abcdef"
BYTES = b"the bundle as it is on disk"


def staged(tmp_path, payload: bytes = BYTES):
    path = tmp_path / f"{BUNDLE}.nc"
    path.write_bytes(payload)
    return path


def receipt(**overrides):
    document = {
        "destination_id": DESTINATION,
        "bundle_id": BUNDLE,
        "digest": digest_of(BYTES),
        "byte_count": len(BYTES),
        "sim_time": EPOCH,
        "schema_version": 1,
    }
    document.update(overrides)
    return document


def verify(tmp_path, document, payload: bytes = BYTES):
    return verify_receipt(
        document,
        bundle_id=BUNDLE,
        destination_id=DESTINATION,
        path=staged(tmp_path, payload),
    )


def test_a_matching_receipt_verifies(tmp_path) -> None:
    outcome = verify(tmp_path, receipt())

    assert outcome.ok
    assert outcome.digest == digest_of(BYTES)
    assert outcome.byte_length == len(BYTES)


# ------------------------------------------------------------- the echoing destination


def test_an_echoing_destination_does_not_verify(tmp_path) -> None:
    """SC-005. The transfer request declared a wrong digest; the destination echoed it.

    Nothing about the receipt is malformed. It names the right destination, the right
    bundle, the right byte count and a perfectly well-shaped digest. The only thing wrong
    with it is that it is not what the file on disk hashes to, and that is the only thing
    that can be wrong with a destination that never computes anything.
    """
    declared_but_wrong = digest_of(b"bytes that were never sent")

    outcome = verify(tmp_path, receipt(digest=declared_but_wrong))

    assert not outcome.ok
    assert "hashes to" in outcome.reason
    assert staged(tmp_path).read_bytes() == BYTES


def test_verification_reads_the_file_rather_than_trusting_a_remembered_digest(
    tmp_path,
) -> None:
    """The file changed after it was written; the receipt is about what it used to be."""
    path = staged(tmp_path)
    honest_receipt = receipt()
    path.write_bytes(b"something else entirely")

    outcome = verify_receipt(
        honest_receipt, bundle_id=BUNDLE, destination_id=DESTINATION, path=path
    )

    assert not outcome.ok
    assert path.read_bytes() == b"something else entirely"


# ------------------------------------------------------- every field is required (FR-009)


@pytest.mark.parametrize(
    "missing", ["destination_id", "bundle_id", "digest", "byte_count", "sim_time"]
)
def test_a_receipt_missing_any_required_field_does_not_verify(tmp_path, missing) -> None:
    document = receipt()
    del document[missing]

    outcome = verify(tmp_path, document)

    assert not outcome.ok
    assert "master" in outcome.reason


def test_no_receipt_at_all_does_not_verify(tmp_path) -> None:
    outcome = verify(tmp_path, None)

    assert not outcome.ok
    assert "no receipt body" in outcome.reason


def test_a_malformed_receipt_does_not_verify(tmp_path) -> None:
    outcome = verify(tmp_path, {"malformed": "this is not a receipt"})

    assert not outcome.ok


def test_a_receipt_for_another_bundle_does_not_verify(tmp_path) -> None:
    outcome = verify(tmp_path, receipt(bundle_id="b-ffffffffffffffff"))

    assert not outcome.ok
    assert "another bundle" in outcome.reason


def test_a_receipt_from_another_destination_does_not_verify(tmp_path) -> None:
    outcome = verify(tmp_path, receipt(destination_id="somewhere-else"))

    assert not outcome.ok
    assert "somewhere else" in outcome.reason


def test_the_right_digest_with_the_wrong_byte_count_does_not_verify(tmp_path) -> None:
    """A matching digest over a different length describes a file that is not this one."""
    outcome = verify(tmp_path, receipt(byte_count=len(BYTES) + 1))

    assert not outcome.ok
    assert "bytes" in outcome.reason


def test_a_destination_acknowledging_more_bytes_than_were_sent_does_not_verify(
    tmp_path,
) -> None:
    outcome = verify(tmp_path, receipt(byte_count=len(BYTES) * 10))

    assert not outcome.ok


def test_a_receipt_whose_simulation_time_precedes_the_transfer_still_verifies(
    tmp_path,
) -> None:
    """Accelerated replay can deliver one; it is a property of the clock, not a fault."""
    outcome = verify(tmp_path, receipt(sim_time="2020-01-01T00:00:00.000000Z"))

    assert outcome.ok


def test_an_unreadable_staged_file_does_not_verify(tmp_path) -> None:
    outcome = verify_receipt(
        receipt(), bundle_id=BUNDLE, destination_id=DESTINATION, path=tmp_path / "absent.nc"
    )

    assert not outcome.ok
    assert "cannot be read" in outcome.reason


def test_the_local_digest_is_computed_over_the_whole_file(tmp_path) -> None:
    payload = b"x" * (3 * (1 << 20) + 17)
    path = staged(tmp_path, payload)

    assert digest_of_file(path) == (digest_of(payload), len(payload))
