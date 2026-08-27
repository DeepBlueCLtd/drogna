"""Every failure a destination can present, driven through the packager's own state machine.

SC-002 counts the local files deleted across the whole set of injected failures, and the
count is zero. That is asserted here byte for byte after each case rather than argued for:
the staging area is snapshotted before the cycle and compared after it, so a case that
deleted a file fails even if it also reported the failure correctly.

The packager is not stood in for. Each case runs :meth:`Packager.cycle`, which stages,
transfers, verifies and evicts in the order ``main`` fixes, against a destination that
misbehaves in exactly one way. A stub that misbehaves is not a second implementation of the
transport (Constitution VI); it is a way of presenting one specific failure.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "services" / "offload" / "tests",):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from harness_offload.bundle import digest_of  # noqa: E402
from harness_offload.ledger import BundleState  # noqa: E402
from harness_offload.transfer import send  # noqa: E402
from harness_offload.verify import verify_receipt  # noqa: E402
from offload_support import (  # noqa: E402
    EchoingDestination,
    MalformedDestination,
    SilentDestination,
    StubDestination,
    WrongBundleDestination,
    WrongDestinationIdDestination,
    WrongLengthDestination,
    configuration,
    manual_clock,
    packager_for,
    snapshot,
    write_run,
)


def prepared(tmp_path: Path, destination):
    """A packager over a recorded run, with one staged bundle already transferred."""
    write_run(tmp_path / "run")
    return packager_for(
        tmp_path,
        destination=destination,
        clock=manual_clock(),
        document=configuration(tmp_path),
    )


def cycle_against(tmp_path: Path, destination):
    """Run one cycle and hand back the packager, its report and the staging snapshots."""
    packager = prepared(tmp_path, destination)
    first = packager.cycle()
    before = snapshot(packager.settings.staging.directory)
    return packager, first, before


FAILING_DESTINATIONS = {
    "no receipt body": SilentDestination,
    "a malformed receipt": MalformedDestination,
    "a receipt for another bundle": WrongBundleDestination,
    "the right digest and the wrong byte count": WrongLengthDestination,
    "a receipt from another destination": WrongDestinationIdDestination,
}


@pytest.mark.parametrize("label", sorted(FAILING_DESTINATIONS))
def test_no_receipt_failure_deletes_a_local_file(tmp_path: Path, label: str) -> None:
    """SC-002: after each injected failure, the staging area is byte for byte what it was."""
    destination = FAILING_DESTINATIONS[label]()
    packager, report, before = cycle_against(tmp_path, destination)

    assert report.staged, "the case is vacuous unless a bundle was staged"
    assert report.refused, f"{label} should have been refused"
    assert snapshot(packager.settings.staging.directory) == before
    assert report.evicted == []


@pytest.mark.parametrize("label", sorted(FAILING_DESTINATIONS))
def test_every_refusal_is_reported_rather_than_swallowed(tmp_path: Path, label: str) -> None:
    """FR-016. A failure nobody hears about is a failure nobody fixes."""
    packager, report, _ = cycle_against(tmp_path, FAILING_DESTINATIONS[label]())

    assert report.failures
    for bundle_id in report.refused:
        assert packager.ledger.state(bundle_id) is BundleState.FAILED
        assert packager.ledger.current(bundle_id).detail


def test_a_duplicate_receipt_evicts_nothing_a_second_time(tmp_path: Path) -> None:
    """The same receipt arriving twice is the same permission twice, not two permissions."""
    destination = StubDestination()
    packager = prepared(tmp_path, destination)
    first = packager.cycle()
    before = snapshot(packager.settings.staging.directory)

    second = packager.cycle()

    assert first.verified
    assert second.verified == []
    assert second.evicted == []
    assert snapshot(packager.settings.staging.directory) == before


def test_an_unreachable_destination_leaves_everything_where_it_is(tmp_path: Path) -> None:
    destination = StubDestination(unreachable=True)
    packager = prepared(tmp_path, destination)

    report = packager.cycle()
    after = snapshot(packager.settings.staging.directory)

    assert report.staged
    assert report.verified == []
    assert report.evicted == []
    assert set(after) == {
        name
        for bundle_id in report.staged
        for name in (f"{bundle_id}.nc", f"{bundle_id}.manifest.json")
    }
    assert report.failures


def test_an_echoing_destination_with_a_wrong_declared_digest_fails_verification(
    tmp_path: Path,
) -> None:
    """SC-005, over a bundle the packager really wrote. The one test that proves the rest.

    The transfer request declares a digest the bytes never had, and the destination — which
    computes nothing — echoes it back. Everything else about the receipt is impeccable: the
    right destination, the right bundle, the right length, a well-shaped digest. An
    implementation comparing the receipt against the digest it sent finds perfect
    agreement and evicts. Comparing against a digest recomputed from the file on disk is
    the only thing that catches it.
    """
    destination = EchoingDestination()
    packager = prepared(tmp_path, destination)
    report = packager.cycle()
    bundle_id = report.staged[0]
    path = packager.settings.staging.bundle_path(bundle_id)
    before = snapshot(packager.settings.staging.directory)

    outcome = send(
        destination,
        bundle_id,
        path.read_bytes(),
        declared_digest=digest_of(b"bytes that were never sent"),
    )
    verification = verify_receipt(
        outcome.receipt, bundle_id=bundle_id, destination_id=destination.id, path=path
    )

    assert not verification.ok
    assert "hashes to" in verification.reason
    assert snapshot(packager.settings.staging.directory) == before


def test_an_honest_destination_ignores_a_wrong_declared_digest(tmp_path: Path) -> None:
    """The other half of the same proof: the declared value takes no part in the decision.

    The same wrong declaration, to a destination that computes its own digest over what
    arrived. Verification succeeds, because what was declared was never consulted.
    """
    destination = StubDestination()
    packager = prepared(tmp_path, destination)
    report = packager.cycle()
    bundle_id = report.staged[0]
    path = packager.settings.staging.bundle_path(bundle_id)

    outcome = send(
        destination,
        bundle_id,
        path.read_bytes(),
        declared_digest=digest_of(b"bytes that were never sent"),
    )
    verification = verify_receipt(
        outcome.receipt, bundle_id=bundle_id, destination_id=destination.id, path=path
    )

    assert verification.ok


def test_a_partial_object_is_never_acknowledged(tmp_path: Path) -> None:
    """FR-015. The destination has a prefix under a temporary name and nothing committed."""
    destination = StubDestination(fail_upload_after_bytes=32)
    packager = prepared(tmp_path, destination)

    report = packager.cycle()

    assert destination.uploads
    assert destination.commits == []
    assert destination.committed == {}
    for bundle_id in report.staged:
        assert destination.receipt(bundle_id) is None
    assert report.verified == []


def test_a_retry_after_a_partial_transfer_succeeds(tmp_path: Path) -> None:
    """The temporary name is derived from the bundle, so the retry replaces the remains."""
    destination = StubDestination(fail_upload_after_bytes=32)
    packager = prepared(tmp_path, destination)
    packager.cycle()

    destination.fail_upload_after_bytes = None
    recovered = packager_for(
        tmp_path,
        destination=destination,
        clock=manual_clock(1),
        document=configuration(tmp_path),
    )
    report = recovered.cycle(recover=True)

    assert destination.commits
    assert not report.refused


def test_nothing_is_evicted_in_any_of_these_cases(tmp_path: Path) -> None:
    """The aggregate SC-002 assertion: one number, over every failure above, and it is zero."""
    deleted = 0
    for index, factory in enumerate(FAILING_DESTINATIONS.values()):
        area = tmp_path / f"case-{index}"
        packager, _report, before = cycle_against(area, factory())
        after = snapshot(packager.settings.staging.directory)
        deleted += len(set(before) - set(after))

    assert deleted == 0
