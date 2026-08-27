"""The ledger: what is about to happen, written down before it happens.

Premature eviction is the failure this component owns, and it is the one failure here that
no re-run can undo, because the bytes it destroys were the only copy. The whole of the
answer is the ordering of side effects, and this module is where that ordering is made
durable.

**The rule.** A record for state *S* is appended, flushed and fsynced **before** *S*'s side
effect is attempted. The record for the next state is therefore also the evidence that the
previous state's side effect completed. Nothing else is evidence: not the filesystem, not
the destination, not the fact that the process got as far as the next line.

That gives the two crash cases their answers, and they are different answers on purpose.
Killed *before* the record: the ledger has not heard of the transition, the bundle is in
the earlier state, and the work is redone. Killed *after* the record but *before* the side
effect completed: the ledger names a state whose side effect is unconfirmed, and recovery
re-attempts it idempotently rather than assuming it happened. A ledger written after its
side effect would invert both: a completed transfer would be forgotten, and — for the one
transition that matters — a deleted file would be remembered as present.

**Eviction, specifically.** ``evictable`` is written before the delete and ``evicted``
after it. Recording ``evicted`` first and crashing would leave a file on disk the ledger
believes is gone, which is a leak; recording it after and crashing leaves a file the ledger
believes may still be there, and re-attempting a delete of a file that is already gone
costs nothing. The safe direction is the one where the ledger over-estimates what survives.

**Monotonic.** Each state has a rank, and a bundle's rank never decreases except through an
explicit ``failed`` record, which names the state it fell back from and is the only thing a
re-entry may re-enter at. A self-transition is permitted and means an idempotent
re-attempt. A skipped state, a backwards state, an unknown state name, and any record at
all after ``evicted`` are refused — refused at append time, so a caller cannot record a
transition the state machine does not admit and discover later that the ledger is fiction.

**Append-only, one JSON document per line.** A handful of records per run does not need a
database, and a database would be operational surface for nothing. What it does need is
durability, so every append is flushed and fsynced before the call returns; the cost is one
fsync per transition, on a path that is not a latency path.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import Any

from harness_core.clock import SimInstant

__all__ = [
    "SUCCESSOR",
    "BundleState",
    "Ledger",
    "LedgerError",
    "LedgerRecord",
    "rank",
]


class BundleState(StrEnum):
    """The six states FR-011 declares, and nothing else."""

    STAGED = "staged"
    TRANSFERRED = "transferred"
    VERIFIED = "verified"
    EVICTABLE = "evictable"
    EVICTED = "evicted"
    FAILED = "failed"


_PROGRESS: tuple[BundleState, ...] = (
    BundleState.STAGED,
    BundleState.TRANSFERRED,
    BundleState.VERIFIED,
    BundleState.EVICTABLE,
    BundleState.EVICTED,
)

SUCCESSOR: Mapping[BundleState, BundleState | None] = {
    BundleState.STAGED: BundleState.TRANSFERRED,
    BundleState.TRANSFERRED: BundleState.VERIFIED,
    BundleState.VERIFIED: BundleState.EVICTABLE,
    BundleState.EVICTABLE: BundleState.EVICTED,
    BundleState.EVICTED: None,
}

TERMINAL = BundleState.EVICTED

#: States whose side effect is unconfirmed until the next record appears. Recovery
#: re-verifies every bundle sitting in one of these rather than promoting it on the
#: strength of what was written (FR-012).
INTERMEDIATE: frozenset[BundleState] = frozenset(
    {
        BundleState.STAGED,
        BundleState.TRANSFERRED,
        BundleState.VERIFIED,
        BundleState.EVICTABLE,
        BundleState.FAILED,
    }
)


def rank(state: BundleState) -> int:
    """Where a state sits in the progression. ``failed`` sits below all of them."""
    if state is BundleState.FAILED:
        return -1
    return _PROGRESS.index(state)


class LedgerError(Exception):
    """A transition the state machine does not admit, or a ledger that cannot be read."""


@dataclass(frozen=True)
class LedgerRecord:
    """One line of the ledger: a bundle, a state, and what justified being in it."""

    bundle_id: str
    state: BundleState
    sim_time: str
    sequence: int
    detail: str = ""
    from_state: BundleState | None = None
    digest: str | None = None
    byte_length: int | None = None
    receipt: Mapping[str, Any] | None = None

    def as_document(self) -> dict[str, Any]:
        document: dict[str, Any] = {
            "sequence": self.sequence,
            "bundle_id": self.bundle_id,
            "state": self.state.value,
            "sim_time": self.sim_time,
        }
        if self.detail:
            document["detail"] = self.detail
        if self.from_state is not None:
            document["from_state"] = self.from_state.value
        if self.digest is not None:
            document["digest"] = self.digest
        if self.byte_length is not None:
            document["byte_length"] = self.byte_length
        if self.receipt is not None:
            document["receipt"] = dict(self.receipt)
        return document

    @classmethod
    def from_document(cls, document: Mapping[str, Any]) -> LedgerRecord:
        try:
            state = BundleState(str(document["state"]))
        except ValueError as exc:
            raise LedgerError(f"the ledger names a state that does not exist: {exc}") from exc
        except KeyError as exc:
            raise LedgerError("a ledger record names no state") from exc
        origin = document.get("from_state")
        return cls(
            bundle_id=str(document["bundle_id"]),
            state=state,
            sim_time=str(document["sim_time"]),
            sequence=int(document["sequence"]),
            detail=str(document.get("detail", "")),
            from_state=None if origin is None else BundleState(str(origin)),
            digest=None if document.get("digest") is None else str(document["digest"]),
            byte_length=(
                None if document.get("byte_length") is None else int(document["byte_length"])
            ),
            receipt=document.get("receipt"),
        )


def _refuse(bundle_id: str, current: LedgerRecord | None, proposed: BundleState) -> LedgerError:
    if current is None:
        return LedgerError(
            f"{bundle_id}: a bundle enters the ledger as {BundleState.STAGED.value!r}, not "
            f"{proposed.value!r}; a bundle nothing staged is a bundle that does not exist"
        )
    if current.state is TERMINAL:
        return LedgerError(
            f"{bundle_id}: is {TERMINAL.value!r}, which is terminal; there is nothing left "
            f"to move to {proposed.value!r} and nothing left on disk to move it with"
        )
    if current.state is BundleState.FAILED:
        return LedgerError(
            f"{bundle_id}: failed in {current.from_state} and may only re-enter there, not "
            f"at {proposed.value!r}; promoting a failed bundle is how a receipt that never "
            "arrived comes to justify an eviction"
        )
    return LedgerError(
        f"{bundle_id}: {current.state.value!r} does not advance to {proposed.value!r}; the "
        "states move forward one at a time so that no side effect is skipped over"
    )


def permitted(current: LedgerRecord | None, proposed: BundleState) -> bool:
    """Whether the state machine admits this transition. The whole rule, in one place."""
    if current is None:
        return proposed is BundleState.STAGED
    if current.state is TERMINAL:
        return False
    if proposed is BundleState.FAILED:
        return current.state is not BundleState.FAILED
    if current.state is BundleState.FAILED:
        return proposed is current.from_state
    return proposed is current.state or proposed is SUCCESSOR[current.state]


class Ledger:
    """The durable record, held open for append and read back in full on start.

    Read back in full because the file is small and because a partially-read ledger is
    indistinguishable from a shorter one. A truncated final line — the signature of a kill
    between the write and the fsync — is discarded with a report rather than parsed
    optimistically: the transition it describes is exactly the one whose side effect is
    unconfirmed, and treating the bundle as being in the earlier state redoes the work,
    which is the safe direction.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._records: list[LedgerRecord] = []
        self._truncated_tail = False
        self._load()

    @property
    def path(self) -> Path:
        return self._path

    @property
    def truncated_tail(self) -> bool:
        """Whether the last line on disk was incomplete when the ledger was opened."""
        return self._truncated_tail

    def _load(self) -> None:
        try:
            text = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return
        except OSError as exc:
            raise LedgerError(f"the ledger cannot be read ({exc.strerror or exc})") from exc
        lines = text.splitlines(keepends=True)
        for number, line in enumerate(lines, start=1):
            body = line.strip()
            if not body:
                continue
            if not line.endswith("\n") and number == len(lines):
                self._truncated_tail = True
                break
            try:
                document = json.loads(body)
            except json.JSONDecodeError as exc:
                if number == len(lines):
                    self._truncated_tail = True
                    break
                raise LedgerError(f"ledger line {number} is not JSON ({exc})") from exc
            self._records.append(LedgerRecord.from_document(document))

    def records(self) -> tuple[LedgerRecord, ...]:
        return tuple(self._records)

    def bundles(self) -> tuple[str, ...]:
        """Every bundle the ledger has heard of, in the order it first heard of them."""
        seen: dict[str, None] = {}
        for record in self._records:
            seen.setdefault(record.bundle_id, None)
        return tuple(seen)

    def current(self, bundle_id: str) -> LedgerRecord | None:
        """The latest record for a bundle, or nothing where there is none."""
        for record in reversed(self._records):
            if record.bundle_id == bundle_id:
                return record
        return None

    def state(self, bundle_id: str) -> BundleState | None:
        record = self.current(bundle_id)
        return None if record is None else record.state

    def intermediate(self) -> tuple[LedgerRecord, ...]:
        """Every bundle whose latest state leaves a side effect unconfirmed (FR-012)."""
        return tuple(
            record
            for bundle_id in self.bundles()
            if (record := self.current(bundle_id)) is not None and record.state in INTERMEDIATE
        )

    def append(
        self,
        bundle_id: str,
        state: BundleState,
        *,
        when: SimInstant,
        detail: str = "",
        digest: str | None = None,
        byte_length: int | None = None,
        receipt: Mapping[str, Any] | None = None,
    ) -> LedgerRecord:
        """Record a transition, durably, before its side effect is attempted."""
        existing = self.current(bundle_id)
        if not permitted(existing, state):
            raise _refuse(bundle_id, existing, state)
        record = LedgerRecord(
            bundle_id=bundle_id,
            state=state,
            sim_time=when.iso(),
            sequence=len(self._records),
            detail=detail,
            from_state=(
                existing.state if state is BundleState.FAILED and existing is not None else None
            ),
            digest=digest,
            byte_length=byte_length,
            receipt=receipt,
        )
        self._write(record)
        self._records.append(record)
        return record

    def _write(self, record: LedgerRecord) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(record.as_document(), sort_keys=True, ensure_ascii=False) + "\n"
        with open(self._path, "a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            # The whole point of the ledger is that it survives the kill. A buffered write
            # that has not reached the platter is not a record of anything.
            os.fsync(handle.fileno())

    def counts(self) -> dict[str, int]:
        """How many bundles sit in each state. What telemetry publishes (FR-020)."""
        tally = dict.fromkeys((state.value for state in BundleState), 0)
        for bundle_id in self.bundles():
            state = self.state(bundle_id)
            if state is not None:
                tally[state.value] += 1
        return tally

    def __iter__(self) -> Iterator[LedgerRecord]:
        return iter(self._records)

    def __len__(self) -> int:
        return len(self._records)


def receipts_in(records: Sequence[LedgerRecord]) -> dict[str, Mapping[str, Any]]:
    """Every receipt the ledger has recorded, by bundle. The durable half of FR-008."""
    found: dict[str, Mapping[str, Any]] = {}
    for record in records:
        if record.receipt is not None:
            found[record.bundle_id] = record.receipt
    return found
