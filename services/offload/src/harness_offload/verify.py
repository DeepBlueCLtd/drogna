"""Verification: comparing a receipt against the bytes on disk, and never against itself.

The one sentence this module exists for: **the digest a receipt is compared against is
recomputed here, from the file on disk, at verification time**. Not the digest the transfer
request declared, not the digest the sidecar recorded when the bundle was written, and not
the digest held in memory since staging. Each of those is a value this process produced, and
comparing a destination's answer against a value this process produced proves only that a
request was sent.

The failure that makes this concrete is the echoing destination: one that returns whatever
digest it was handed. Against a declared digest it agrees every time, including when the
declared digest is wrong and the bytes never arrived. Against a digest recomputed from
disk it agrees only when the bytes at the destination really are the bytes on disk. The
test that sends a deliberately wrong declared digest and asserts verification fails is the
one that proves the comparison is real; if it ever passes, this module is trusting its own
input.

Five things must all hold, and a receipt missing any field fails before any of them are
examined (FR-009). The destination must be the one this component was configured to send
to; the bundle must be the one that was sent; the digest must match the recomputed local
digest; the byte count must match the local length; and the document must validate against
the receipt master. Byte count is checked as well as digest because a destination
acknowledging a different length has not received what was sent, whatever it says it
hashed — and because a destination that acknowledges *more* bytes than were sent is
describing a file that is not this one.

Nothing here writes, moves or deletes anything. Every function returns an outcome; the
caller records it. A verification module that could delete would be a verification module
that could delete by accident.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harness_core.config import ConfigInvalidError, validate_document
from harness_types.messages.offload_receipt import DrognaOffloadReceipt

from harness_offload.bundle import digest_of
from harness_offload.schemas import RECEIPT_SCHEMA, schema

__all__ = ["Verification", "digest_of_file", "verify_receipt"]

_READ_CHUNK = 1 << 20


def digest_of_file(path: Path) -> tuple[str, int]:
    """The digest and length of what is on disk **now**, read back in full.

    Read back rather than remembered. The file may have been truncated, replaced or
    corrupted since it was written, and the whole purpose of this function is to notice.
    """
    hasher = hashlib.sha256()
    length = 0
    with open(path, "rb") as handle:
        while chunk := handle.read(_READ_CHUNK):
            hasher.update(chunk)
            length += len(chunk)
    return "sha256:" + hasher.hexdigest(), length


@dataclass(frozen=True)
class Verification:
    """The outcome. ``ok`` is the only thing that may make a bundle eligible for eviction."""

    ok: bool
    reason: str = ""
    digest: str = ""
    byte_length: int = 0
    receipt: Mapping[str, Any] | None = None

    def __bool__(self) -> bool:
        return self.ok


def _refused(reason: str, digest: str = "", byte_length: int = 0) -> Verification:
    return Verification(False, reason=reason, digest=digest, byte_length=byte_length)


def verify_receipt(
    receipt: Mapping[str, Any] | None,
    *,
    bundle_id: str,
    destination_id: str,
    path: Path,
) -> Verification:
    """Decide whether this receipt justifies calling this bundle eligible for eviction."""
    if receipt is None:
        return _refused(
            f"{bundle_id}: the destination returned success with no receipt body. Success "
            "is not an acknowledgement of anything in particular, and nothing in "
            "particular is what it would justify deleting"
        )
    if not isinstance(receipt, Mapping):
        return _refused(f"{bundle_id}: the receipt is not a document")
    try:
        validate_document(dict(receipt), schema(RECEIPT_SCHEMA), source=f"receipt for {bundle_id}")
        DrognaOffloadReceipt.model_validate(dict(receipt))
    except (ConfigInvalidError, ValueError) as exc:
        return _refused(f"{bundle_id}: the receipt does not validate against its master ({exc})")

    if str(receipt["destination_id"]) != destination_id:
        return _refused(
            f"{bundle_id}: the receipt is from {receipt['destination_id']!r} but this "
            f"component sends to {destination_id!r}; an acknowledgement from somewhere else "
            "is not an acknowledgement"
        )
    if str(receipt["bundle_id"]) != bundle_id:
        return _refused(
            f"{bundle_id}: the receipt acknowledges {receipt['bundle_id']!r}. A receipt for "
            "another bundle is a receipt for another bundle, however well formed"
        )

    try:
        local_digest, local_length = digest_of_file(path)
    except OSError as exc:
        return _refused(
            f"{bundle_id}: the staged file cannot be read to be verified ({exc.strerror or exc}); "
            "an unreadable file is not a verified one"
        )

    if str(receipt["digest"]) != local_digest:
        return _refused(
            f"{bundle_id}: the destination computed {receipt['digest']} over what it "
            f"received; the file on disk hashes to {local_digest}. The local bytes are "
            "unchanged and stay where they are",
            digest=local_digest,
            byte_length=local_length,
        )
    if int(receipt["byte_count"]) != local_length:
        return _refused(
            f"{bundle_id}: the destination acknowledges {receipt['byte_count']} bytes and "
            f"the file on disk is {local_length}. A matching digest over a different length "
            "describes a file that is not this one",
            digest=local_digest,
            byte_length=local_length,
        )
    return Verification(True, digest=local_digest, byte_length=local_length, receipt=dict(receipt))


def declared_digest_matches(declared: str, payload: bytes) -> bool:
    """Whether a digest declared in a transfer request matches the payload it described.

    Used by the stub destination in tests to be *honest*, and never by verification. It is
    here, in the open, so that the difference between an honest destination and an echoing
    one is a property of the destination rather than something the verifier can be talked
    into ignoring.
    """
    return declared == digest_of(payload)
