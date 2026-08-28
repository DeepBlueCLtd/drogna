"""The single indivisible step, and the reason it is a rename.

FR-022 requires that no reader ever observes a partially written field. The property is not
achieved by writing carefully; it is achieved by never writing where a reader looks. A run
is written into staging by the model runner, moved into the catalogue under its own name,
and then — in one operation — the current pointer is replaced.

Both steps are ``os.replace`` on the same volume, which the platform performs atomically:
either the old name resolves or the new one does, and there is no instant at which it
resolves to something half-made. A reader following the pointer therefore always finds a
complete run, and the worst that can happen to a reader mid-swap is that it reads the
previous run, which is a complete field and a true statement about a moment slightly ago.

The pointer itself is a text file holding one run identifier on one line, which is what
``stores/coverage/layout.md`` requires and what the query layer reads. It is deliberately
not a symlink to the run's directory. A symlink cannot be read as text, so a reader
following the convention gets an error rather than a name; and a symlink cannot hold two
identifiers, so the state the layout asks a reader to detect and refuse — two runs both
claiming to be current — could not be represented at all, only guessed at.

The mechanism is a rename because that is the simplest thing with the property on one host.
The SRD requires the property and not the mechanism, and a coverage store that moved to Zarr
would satisfy it differently — which is why the mechanism sits behind the coverage output
port and this module is the only place that knows it is a rename.

Two things this deliberately does not do. It does not copy: a copy across volumes is not
indivisible, so staging and the catalogue are configured onto one volume and a cross-device
move is refused rather than silently degraded. And it does not delete the run it replaces:
older runs stay addressable under their own names, and eviction is somebody else's decision.
"""

from __future__ import annotations

import errno
import os
from pathlib import Path

__all__ = ["AtomicPublishError", "discard", "make_current", "move_into_catalogue"]


class AtomicPublishError(RuntimeError):
    """The visibility step could not be performed indivisibly, so it was not performed."""


def move_into_catalogue(staged: Path, destination: Path) -> Path:
    """Move a finished run from staging into the catalogue, in one operation."""
    if destination.exists():
        raise AtomicPublishError(
            f"{destination.name} is already catalogued; a run identifier names one run, "
            "and replacing one silently would make two runs indistinguishable"
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.replace(staged, destination)
    except OSError as exc:
        if exc.errno == errno.EXDEV:
            raise AtomicPublishError(
                "staging and the catalogue are on different volumes, so making a run "
                "visible would be a copy and a copy is not indivisible; configure both "
                "onto one volume"
            ) from exc
        raise AtomicPublishError(f"the run could not be catalogued ({exc})") from exc
    return destination


def make_current(pointer: Path, run_id: str, *, partial_suffix: str) -> None:
    """Repoint the current run. One rename over the pointer, and never a delete-then-create.

    A pointer that is removed and recreated has a window in which the current run does not
    exist, which is the same failure as a partial field wearing a different hat. So the new
    identifier is written to a pending file beside the pointer, flushed to the platform, and
    moved onto the pointer in a single ``os.replace``: every reader sees either the old
    identifier or the new one, and never an absent or a half-written pointer.

    The identifier is written on one line and nothing else is written, because a second line
    is how the layout represents two runs both claiming to be current — a conflict a reader
    refuses to resolve. A publisher that emitted one would be manufacturing that conflict.

    The suffix arrives from configuration rather than being a constant here. The store's
    convention makes anything under it invisible to the catalogue, so a pending pointer left
    behind by a crash is not mistaken for a stray file at the store root — and it is the same
    value the model runner stages under and the query layer refuses to catalogue, which is
    exactly why no component should be stating it in source.
    """
    pending = pointer.with_name(pointer.name + partial_suffix)
    try:
        with pending.open("w", encoding="utf-8") as handle:
            handle.write(f"{run_id}\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(pending, pointer)
    except OSError as exc:
        pending.unlink(missing_ok=True)
        raise AtomicPublishError(f"the current pointer could not be replaced ({exc})") from exc


def discard(staged: Path) -> None:
    """Remove a staged run that will not be published. Failure to remove is not fatal."""
    if not staged.is_dir():
        return
    for entry in sorted(staged.iterdir()):
        if entry.is_file() or entry.is_symlink():
            entry.unlink()
    staged.rmdir()
