"""The state machine: forward only, written before the fact, and durable across a kill.

Every test here is about a transition the ledger must refuse or a record that must already
be on disk. A ledger that accepted anything would still make every happy-path test pass,
which is why the refusals outnumber the acceptances below.
"""

from __future__ import annotations

import json

import pytest
from harness_offload.ledger import (
    INTERMEDIATE,
    BundleState,
    Ledger,
    LedgerError,
    rank,
)
from offload_support import manual_clock

BUNDLE = "b-0123456789abcdef"


def ledger(tmp_path) -> Ledger:
    return Ledger(tmp_path / "ledger" / "bundles.jsonl")


def now(index: int = 0):
    return manual_clock(index).now()


def test_a_bundle_enters_the_ledger_as_staged_and_no_other_way(tmp_path) -> None:
    """A bundle nothing staged is a bundle that does not exist."""
    book = ledger(tmp_path)

    for state in (BundleState.TRANSFERRED, BundleState.VERIFIED, BundleState.EVICTED):
        with pytest.raises(LedgerError, match="enters the ledger"):
            book.append(BUNDLE, state, when=now())

    assert book.append(BUNDLE, BundleState.STAGED, when=now()).state is BundleState.STAGED


def test_the_states_advance_one_at_a_time(tmp_path) -> None:
    book = ledger(tmp_path)
    book.append(BUNDLE, BundleState.STAGED, when=now())

    with pytest.raises(LedgerError, match="does not advance"):
        book.append(BUNDLE, BundleState.VERIFIED, when=now())

    book.append(BUNDLE, BundleState.TRANSFERRED, when=now())
    assert book.state(BUNDLE) is BundleState.TRANSFERRED


def test_a_backwards_transition_is_refused(tmp_path) -> None:
    """Monotonic: a bundle that has been verified cannot be un-verified into transferred."""
    book = ledger(tmp_path)
    book.append(BUNDLE, BundleState.STAGED, when=now())
    book.append(BUNDLE, BundleState.TRANSFERRED, when=now())
    book.append(BUNDLE, BundleState.VERIFIED, when=now())

    with pytest.raises(LedgerError, match="does not advance"):
        book.append(BUNDLE, BundleState.TRANSFERRED, when=now())


def test_a_self_transition_is_an_idempotent_re_attempt(tmp_path) -> None:
    book = ledger(tmp_path)
    book.append(BUNDLE, BundleState.STAGED, when=now())
    book.append(BUNDLE, BundleState.TRANSFERRED, when=now())

    book.append(BUNDLE, BundleState.TRANSFERRED, when=now(1), detail="retried")

    assert book.state(BUNDLE) is BundleState.TRANSFERRED
    assert len(book) == 3


def test_eviction_is_terminal(tmp_path) -> None:
    """There is nothing left to move, and nothing left on disk to move it with."""
    book = ledger(tmp_path)
    for state in (
        BundleState.STAGED,
        BundleState.TRANSFERRED,
        BundleState.VERIFIED,
        BundleState.EVICTABLE,
        BundleState.EVICTED,
    ):
        book.append(BUNDLE, state, when=now())

    for state in BundleState:
        with pytest.raises(LedgerError, match="terminal"):
            book.append(BUNDLE, state, when=now())


def test_a_failure_names_the_state_it_fell_from_and_only_that_may_re_enter(tmp_path) -> None:
    book = ledger(tmp_path)
    book.append(BUNDLE, BundleState.STAGED, when=now())
    book.append(BUNDLE, BundleState.TRANSFERRED, when=now())
    book.append(BUNDLE, BundleState.FAILED, when=now(), detail="the destination went away")

    assert book.current(BUNDLE).from_state is BundleState.TRANSFERRED
    with pytest.raises(LedgerError, match="may only re-enter"):
        book.append(BUNDLE, BundleState.VERIFIED, when=now())

    book.append(BUNDLE, BundleState.TRANSFERRED, when=now(1))
    assert book.state(BUNDLE) is BundleState.TRANSFERRED


def test_promoting_a_failed_bundle_is_how_a_missing_receipt_justifies_an_eviction(
    tmp_path,
) -> None:
    """Named for what it prevents rather than for what it does."""
    book = ledger(tmp_path)
    book.append(BUNDLE, BundleState.STAGED, when=now())
    book.append(BUNDLE, BundleState.TRANSFERRED, when=now())
    book.append(BUNDLE, BundleState.FAILED, when=now(), detail="no receipt")

    with pytest.raises(LedgerError):
        book.append(BUNDLE, BundleState.EVICTABLE, when=now())


def test_a_state_the_machine_does_not_have_cannot_be_read_back(tmp_path) -> None:
    path = tmp_path / "ledger" / "bundles.jsonl"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps({"sequence": 0, "bundle_id": BUNDLE, "state": "deleted", "sim_time": "x"})
        + "\n",
        encoding="utf-8",
    )

    with pytest.raises(LedgerError, match="does not exist"):
        Ledger(path)


# ------------------------------------------------------------------------- durability


def test_a_record_is_on_disk_before_append_returns(tmp_path) -> None:
    """Write-ahead: the record exists before the side effect it describes is attempted."""
    path = tmp_path / "ledger" / "bundles.jsonl"
    book = Ledger(path)

    book.append(BUNDLE, BundleState.STAGED, when=now(), digest="sha256:" + "0" * 64)

    document = json.loads(path.read_text(encoding="utf-8").splitlines()[0])
    assert document["state"] == "staged"
    assert document["bundle_id"] == BUNDLE
    assert document["digest"] == "sha256:" + "0" * 64


def test_a_ledger_reopened_holds_what_was_written(tmp_path) -> None:
    path = tmp_path / "ledger" / "bundles.jsonl"
    first = Ledger(path)
    first.append(BUNDLE, BundleState.STAGED, when=now())
    first.append(BUNDLE, BundleState.TRANSFERRED, when=now())

    second = Ledger(path)

    assert second.state(BUNDLE) is BundleState.TRANSFERRED
    assert len(second) == 2


def test_a_truncated_final_line_is_discarded_and_reported(tmp_path) -> None:
    """The signature of a kill between the write and the fsync.

    The transition it describes is exactly the one whose side effect is unconfirmed, so the
    bundle is treated as being in the earlier state and the work is redone — which is the
    safe direction, and is asserted here rather than inferred.
    """
    path = tmp_path / "ledger" / "bundles.jsonl"
    book = Ledger(path)
    book.append(BUNDLE, BundleState.STAGED, when=now())
    with open(path, "a", encoding="utf-8") as handle:
        handle.write('{"sequence": 1, "bundle_id": "b-01234567')

    reopened = Ledger(path)

    assert reopened.truncated_tail
    assert reopened.state(BUNDLE) is BundleState.STAGED
    assert reopened.append(BUNDLE, BundleState.TRANSFERRED, when=now()) is not None


def test_the_counts_are_the_state_machines_own_tally(tmp_path) -> None:
    book = ledger(tmp_path)
    book.append("b-aaaaaaaaaaaaaaaa", BundleState.STAGED, when=now())
    book.append("b-bbbbbbbbbbbbbbbb", BundleState.STAGED, when=now())
    book.append("b-bbbbbbbbbbbbbbbb", BundleState.TRANSFERRED, when=now())

    assert book.counts() == {
        "staged": 1,
        "transferred": 1,
        "verified": 0,
        "evictable": 0,
        "evicted": 0,
        "failed": 0,
    }


def test_every_state_but_the_terminal_one_leaves_a_side_effect_unconfirmed() -> None:
    """SC-003 counts transitions; this asserts the set recovery walks is the whole set."""
    assert {state for state in BundleState if state is not BundleState.EVICTED} == INTERMEDIATE
    assert rank(BundleState.FAILED) < rank(BundleState.STAGED) < rank(BundleState.EVICTED)
