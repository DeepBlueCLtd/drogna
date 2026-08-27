"""A kill at every ledger transition, on both sides of the write, and a restart after each.

The guarantee in :mod:`test_offload_receipt_paths` holds while the process runs. This file
attacks it across a crash, which is the only version of the guarantee worth having: one
that evaporates when the process dies is not a guarantee, it is a habit.

**How the kill is injected.** The ledger is the only thing that has to survive, so the
injection point is the ledger's own append: ``before`` a state means the process dies with
the transition unrecorded, and ``after`` means the record reached the disk and the side
effect it describes did not. Those are the two halves of every transition, and they have
different right answers — unrecorded means redo, recorded means re-attempt idempotently —
so both are covered for every state.

**What is asserted after every restart**, in every case, without exception:

- no bundle is evicted unless the ledger holds a verified record carrying a receipt whose
  digest matches the file that was deleted;
- a bundle that is still on disk is byte for byte what it was before the kill;
- the packager converges without anyone touching anything: the second run is given the same
  directories and nothing else.

SC-003 asks for the count of covered transitions to be reported, so a transition added later
without a test is visible. :data:`INJECTION_POINTS` is that count, and the last test in this
file asserts it covers every state the ledger admits.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "services" / "offload" / "tests",):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from harness_core.clock import SimInstant  # noqa: E402
from harness_offload.ledger import BundleState, Ledger  # noqa: E402
from harness_offload.main import Packager, PackagerSettings  # noqa: E402
from harness_offload.verify import digest_of_file  # noqa: E402
from offload_support import (  # noqa: E402
    StubDestination,
    configuration,
    manual_clock,
    snapshot,
    write_run,
)


class KilledError(Exception):
    """The process died here. Nothing after this line in the cycle happened."""


class KillingLedger(Ledger):
    """A ledger that dies at a named transition, before or after the record reaches disk.

    Before and after are genuinely different failures and this is the only place they can be
    told apart, because the ledger is the only thing whose write ordering matters. Dying
    inside the side effect itself is the ``after`` case by another name: the record is on
    disk and the effect did not complete.
    """

    def __init__(self, path: Path, *, kill: str, when: str) -> None:
        self.kill = kill
        self.when = when
        self.killed = False
        super().__init__(path)

    def append(self, bundle_id, state, **kwargs):
        if state.value == self.kill and not self.killed:
            if self.when == "before":
                self.killed = True
                raise KilledError(f"killed before recording {state.value}")
            super().append(bundle_id, state, **kwargs)
            self.killed = True
            raise KilledError(f"killed after recording {state.value}")
        return super().append(bundle_id, state, **kwargs)


def run_until_killed(instance: Packager, *, recover: bool = False) -> bool:
    """Run a cycle, absorbing the kill. Returns whether the process died."""
    try:
        instance.cycle(recover=recover)
    except KilledError:
        return True
    return False


#: Every transition, on both sides of the ledger write. Reported by the last test.
INJECTION_POINTS: tuple[tuple[str, str], ...] = tuple(
    (state.value, side)
    for state in (
        BundleState.STAGED,
        BundleState.TRANSFERRED,
        BundleState.VERIFIED,
        BundleState.EVICTABLE,
        BundleState.EVICTED,
    )
    for side in ("before", "after")
)


def pressing_configuration(tmp_path: Path) -> dict:
    """A configuration whose retention policy is asking for space, so eviction is reached."""
    document = configuration(tmp_path)
    document["offload"]["retention"]["maximum_staging_bytes"] = 1
    return document


def prepare(tmp_path: Path) -> StubDestination:
    """A recorded run on disk and a destination that behaves. The crash is the variable."""
    write_run(tmp_path / "run")
    return StubDestination()


def build(tmp_path: Path, destination, *, document=None, kill=None, when="before", tick=0):
    settings = PackagerSettings.from_config(document or configuration(tmp_path))
    instance = Packager(settings, clock=manual_clock(tick), destination=destination)
    if kill is not None:
        instance.ledger = KillingLedger(settings.ledger_path, kill=kill, when=when)
    return instance


def evictions_are_justified(instance: Packager) -> None:
    """The assertion every case makes: nothing was evicted without a matching receipt.

    Matching against what, after the file is gone? Against the digest the verified record
    carried, which is the digest the destination computed and which was compared against
    the file on disk both at verification and immediately before the delete. A bundle whose
    ledger holds no verified record with a receipt has no justification at all, and that is
    what this refuses.
    """
    for bundle_id in instance.ledger.bundles():
        if instance.ledger.state(bundle_id) is not BundleState.EVICTED:
            continue
        justification = [
            record
            for record in instance.ledger.records()
            if record.bundle_id == bundle_id
            and record.state is BundleState.VERIFIED
            and record.receipt is not None
        ]
        assert justification, f"{bundle_id} was evicted with no recorded receipt"
        record = justification[-1]
        assert record.receipt["digest"] == record.digest
        assert record.receipt["bundle_id"] == bundle_id


@pytest.mark.parametrize(("state", "side"), INJECTION_POINTS)
def test_a_kill_at_each_transition_never_evicts_without_a_receipt(
    tmp_path: Path, state: str, side: str
) -> None:
    """SC-003, one case per transition per side of the write."""
    destination = prepare(tmp_path)
    document = pressing_configuration(tmp_path)

    first = build(tmp_path, destination, document=document, kill=state, when=side)
    died = run_until_killed(first)

    second = build(tmp_path, destination, document=document, tick=1)
    second.cycle(recover=True)

    evictions_are_justified(second)
    assert died or state == "evicted", f"the kill at {state}/{side} never fired"
    assert set(second.ledger.bundles())


@pytest.mark.parametrize(("state", "side"), INJECTION_POINTS)
def test_a_surviving_file_is_byte_for_byte_what_it_was(
    tmp_path: Path, state: str, side: str
) -> None:
    """Recovery may finish a delete the policy already asked for; it may not alter a file."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination, kill=state, when=side)
    run_until_killed(first)
    before = snapshot(first.settings.staging.directory)

    second = build(tmp_path, destination, tick=1)
    second.cycle(recover=True)
    after = snapshot(second.settings.staging.directory)

    for name, payload in before.items():
        if name in after:
            assert after[name] == payload, f"{name} changed across the restart"


def test_a_kill_before_the_staged_record_leaves_no_bundle_and_the_work_is_redone(
    tmp_path: Path,
) -> None:
    """US3 scenario 1: the earlier state, and the work redone rather than skipped."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination, kill="staged", when="before")
    run_until_killed(first)

    assert snapshot(first.settings.staging.directory) == {}

    second = build(tmp_path, destination, tick=1)
    report = second.cycle(recover=True)

    assert report.staged
    assert second.ledger.state(report.staged[0]) in (
        BundleState.VERIFIED,
        BundleState.EVICTED,
    )


def test_a_kill_after_the_staged_record_leaves_a_bundle_the_ledger_cannot_find(
    tmp_path: Path,
) -> None:
    """The record is on disk, the file is not. Reported, never silently re-staged."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination, kill="staged", when="after")
    run_until_killed(first)

    second = build(tmp_path, destination, tick=1)
    report = second.cycle(recover=True)

    assert any("filesystem disagree" in failure for failure in report.failures)
    assert report.evicted == []


def test_a_kill_after_the_transferred_record_re_attempts_the_transfer(
    tmp_path: Path,
) -> None:
    """US3 scenario 2: the side effect is re-attempted and the outcome is the same."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination, kill="transferred", when="after")
    run_until_killed(first)

    assert destination.commits == []

    second = build(tmp_path, destination, tick=1)
    report = second.cycle(recover=True)

    assert destination.commits
    assert report.verified
    assert not report.refused


def test_a_kill_before_the_evicted_record_finishes_the_delete_on_restart(
    tmp_path: Path,
) -> None:
    """The file is gone and the confirming record is not. Re-deleting nothing costs nothing."""
    destination = prepare(tmp_path)
    document = pressing_configuration(tmp_path)
    first = build(tmp_path, destination, document=document, kill="evicted", when="before")
    run_until_killed(first)
    bundle_id = first.ledger.bundles()[0]

    assert first.ledger.state(bundle_id) is BundleState.EVICTABLE
    assert not first.settings.staging.bundle_path(bundle_id).exists()

    second = build(tmp_path, destination, document=document, tick=1)
    second.cycle(recover=True)

    assert second.ledger.state(bundle_id) is BundleState.EVICTED
    evictions_are_justified(second)


def test_a_kill_after_the_evictable_record_re_verifies_before_deleting(
    tmp_path: Path,
) -> None:
    """The record says the policy asked. It is not evidence that the receipt still holds."""
    destination = prepare(tmp_path)
    document = pressing_configuration(tmp_path)
    first = build(tmp_path, destination, document=document, kill="evictable", when="after")
    run_until_killed(first)
    bundle_id = first.ledger.bundles()[0]
    path = first.settings.staging.bundle_path(bundle_id)

    assert path.exists()
    tampered = path.read_bytes() + b"tampered"
    path.write_bytes(tampered)

    second = build(tmp_path, destination, document=document, tick=1)
    report = second.cycle(recover=True)

    assert path.read_bytes() == tampered
    assert second.ledger.state(bundle_id) is BundleState.FAILED
    assert report.evicted == []


def test_a_staged_bundle_deleted_by_hand_is_reported(tmp_path: Path) -> None:
    """The ledger and the filesystem disagree, and neither is corrected silently."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination)
    report = first.cycle()
    bundle_id = report.staged[0]
    first.settings.staging.bundle_path(bundle_id).unlink()

    second = build(tmp_path, destination, tick=1)
    second_report = second.cycle(recover=True)

    assert any(bundle_id in failure for failure in second_report.failures)
    assert second_report.evicted == []


def test_the_same_seed_replayed_is_the_same_logical_bundle(tmp_path: Path) -> None:
    """A bundle identifier the ledger has seen is not a duplicate fault."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination)
    first_report = first.cycle()

    second = build(tmp_path, destination, tick=1)
    second_report = second.cycle(recover=True)

    assert first_report.staged
    assert second_report.staged == []
    assert second_report.failures == []


def test_no_receipt_and_no_verified_record_means_no_eviction_anywhere(
    tmp_path: Path,
) -> None:
    """The aggregate: over every injection point, every eviction had a matching receipt."""
    checked = 0
    for index, (state, side) in enumerate(INJECTION_POINTS):
        area = tmp_path / f"case-{index}"
        destination = prepare(area)
        document = pressing_configuration(area)
        first = build(area, destination, document=document, kill=state, when=side)
        run_until_killed(first)
        second = build(area, destination, document=document, tick=1)
        second.cycle(recover=True)
        evictions_are_justified(second)
        checked += 1

    assert checked == len(INJECTION_POINTS)


def test_the_covered_transitions_are_reported_and_cover_every_state() -> None:
    """SC-003. A transition added later without a test shows up here as a failure."""
    covered = {state for state, _ in INJECTION_POINTS}
    every_state = {state.value for state in BundleState if state is not BundleState.FAILED}

    print(f"crash injection covers {len(INJECTION_POINTS)} transitions: {sorted(covered)}")

    assert covered == every_state
    assert len(INJECTION_POINTS) == 2 * len(every_state)


def test_a_verified_bundle_survives_a_kill_with_its_digest_intact(tmp_path: Path) -> None:
    """The digest recorded with the receipt is what the file still hashes to after a crash."""
    destination = prepare(tmp_path)
    first = build(tmp_path, destination, kill="evictable", when="before")
    run_until_killed(first)

    second = build(tmp_path, destination, tick=1)
    second.cycle(recover=True)

    for bundle_id in second.ledger.bundles():
        record = second.ledger.current(bundle_id)
        if record is None or record.state is not BundleState.VERIFIED:
            continue
        digest, length = digest_of_file(second.settings.staging.bundle_path(bundle_id))
        assert digest == record.digest
        assert length == record.byte_length
        assert SimInstant.from_iso(record.sim_time) is not None
