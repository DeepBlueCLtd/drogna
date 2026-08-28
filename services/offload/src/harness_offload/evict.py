"""Eviction: the only place a local file is deleted, and the only thing allowed to ask.

**A receipt permits an eviction. It does not cause one.** The distinction is the whole of
FR-014 and it is easy to lose: the natural way to write this component is to delete a
bundle as soon as it is verified, because that is when it becomes safe to. It is also when
the harness stops being able to demonstrate anything about the bundle, and it makes the
receipt into a delete trigger — so a destination that acknowledged everything instantly
would empty the staging area, and nobody would have decided that should happen. The
retention policy asks for space. Verification says which bundles may answer.

**The pre-delete check.** Immediately before unlinking, the digest is recomputed from the
file on disk and compared against the digest that was verified. This is not paranoia about
the filesystem; it is the case where a bundle was verified, an operator replaced the file,
and the eviction path would otherwise delete a file the destination never received. The
recomputation costs one read of a file that is about to be destroyed, which is the cheapest
possible moment to spend it.

**Order of side effects.** ``evictable`` is recorded before the delete and ``evicted``
after, so a kill between them leaves a ledger that believes a file may still be present.
Re-attempting a delete of a file that is already gone costs nothing; believing a present
file is gone loses it. That ordering lives in :mod:`harness_offload.ledger`; what lives
here is the refusal to delete anything the ordering has not reached.

**What survives is what is asserted.** No test in this feature asserts an eviction happened
as its only assertion.
"""

from __future__ import annotations

import contextlib
import os
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from harness_core.clock import SimInstant

from harness_offload.verify import digest_of_file

__all__ = [
    "Candidate",
    "EvictionOutcome",
    "RetentionPolicy",
    "asked_for_space",
    "delete_verified",
    "due_for_eviction",
]

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class RetentionPolicy:
    """The configured rule that asks for space. Both bounds are examined every cycle."""

    maximum_staging_bytes: int
    maximum_age_simulation_seconds: float

    @property
    def maximum_age_micros(self) -> int:
        return round(self.maximum_age_simulation_seconds * _MICROS_PER_SECOND)


@dataclass(frozen=True)
class Candidate:
    """A verified bundle that could be evicted, and everything needed to decide.

    ``verified_digest`` is what the destination's receipt agreed with. It is carried so the
    pre-delete check has something to compare against that is not recomputed from the same
    file at the same moment, which would agree with itself whatever the file had become.
    """

    bundle_id: str
    path: Path
    sidecar_path: Path
    run_manifest_path: Path
    verified_digest: str
    byte_length: int
    verified_at: SimInstant


@dataclass(frozen=True)
class EvictionOutcome:
    """What happened, and — where nothing happened — why the file is still there."""

    bundle_id: str
    deleted: bool
    reason: str = ""


def asked_for_space(
    candidates: Sequence[Candidate],
    *,
    policy: RetentionPolicy,
    staging_bytes: int,
    now: SimInstant,
) -> bool:
    """Whether the retention policy is asking for space at all.

    Two bounds, either of which asks: the staging area is over its size, or a verified
    bundle is older in simulation time than the age bound. Simulation time, because every
    interval in this component except heartbeat cadence is measured on the clock port
    (Constitution I; ADR-0006 carves out cadence and nothing else).
    """
    if staging_bytes > policy.maximum_staging_bytes:
        return True
    return any(
        (now - candidate.verified_at) > policy.maximum_age_micros for candidate in candidates
    )


def due_for_eviction(
    candidates: Sequence[Candidate],
    *,
    policy: RetentionPolicy,
    staging_bytes: int,
    now: SimInstant,
) -> tuple[Candidate, ...]:
    """The bundles the policy is asking for, oldest first, and none at all when it is not.

    Oldest first because the oldest bundle is the one whose local copy has been redundant
    longest. Returning nothing when the policy is quiet is the behaviour FR-014 asks for,
    and it is asserted directly: a verified bundle under no retention pressure stays.
    """
    if not asked_for_space(candidates, policy=policy, staging_bytes=staging_bytes, now=now):
        return ()
    ordered = sorted(
        candidates, key=lambda candidate: (candidate.verified_at.micros, candidate.bundle_id)
    )
    if staging_bytes <= policy.maximum_staging_bytes:
        # Only the age bound is asking, so only the bundles it names are due. A size bound
        # that is satisfied does not get to take the young ones along with it.
        return tuple(
            candidate
            for candidate in ordered
            if (now - candidate.verified_at) > policy.maximum_age_micros
        )
    due: list[Candidate] = []
    remaining = staging_bytes
    for candidate in ordered:
        if remaining <= policy.maximum_staging_bytes:
            break
        due.append(candidate)
        remaining -= candidate.byte_length
    return tuple(due)


def delete_verified(candidate: Candidate) -> EvictionOutcome:
    """Delete a bundle, having first re-read the bytes it is about to destroy (FR-013).

    The sidecar goes with it, and only after the bundle itself is gone: a sidecar without
    its bundle is a description of nothing, while a bundle without its sidecar is at least
    still the data. The run-manifest sibling goes last, for the same reason the sidecar
    that names it does not outlive the bundle: a geometry describing an evicted bundle is
    a description of nothing, and one left behind would accumulate exact measurement
    positions in a staging area whose bundles are long gone.
    """
    try:
        current_digest, _ = digest_of_file(candidate.path)
    except OSError as exc:
        return EvictionOutcome(
            candidate.bundle_id,
            deleted=False,
            reason=(
                f"{candidate.bundle_id}: the staged file cannot be read immediately before "
                f"deleting it ({exc.strerror or exc}). The ledger and the filesystem "
                "disagree, which is reported rather than resolved by deleting something"
            ),
        )
    if current_digest != candidate.verified_digest:
        return EvictionOutcome(
            candidate.bundle_id,
            deleted=False,
            reason=(
                f"{candidate.bundle_id}: the file on disk now hashes to {current_digest} "
                f"but {candidate.verified_digest} is what the destination acknowledged. "
                "Whatever this file is, the destination has not got it, and it is the only "
                "copy"
            ),
        )
    os.remove(candidate.path)
    with contextlib.suppress(FileNotFoundError):
        os.remove(candidate.sidecar_path)
    with contextlib.suppress(FileNotFoundError):
        os.remove(candidate.run_manifest_path)
    return EvictionOutcome(candidate.bundle_id, deleted=True)
