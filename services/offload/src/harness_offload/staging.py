"""Writing a bundle into the staging area so that a half-written one is never staged.

Both files are written under a partial suffix, flushed and fsynced, and only then renamed
into place — the bundle first, the sidecar second. The sidecar is therefore the completion
marker, and the only window that remains is a bundle with no sidecar yet, which is the safe
direction: a bundle with no sidecar has no digest, so nothing can claim it was transferred,
and the ledger has not heard of it.

Disk exhaustion is the case this ordering is for. A write that fails part way leaves a
partial file, which is removed, and nothing enters the ledger — so the bundle is simply not
staged, and the next cycle stages it again. The alternative, writing into place and
recording afterwards, leaves a truncated bundle under its real name with a sidecar
describing bytes that are not there.

The staging area is also the only area the eviction path may delete from, which is why this
module is the only one that names it and why every path it hands out is built from the
configured directory rather than passed in.
"""

from __future__ import annotations

import contextlib
import os
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

__all__ = ["StagedBundle", "StagingArea"]


@dataclass(frozen=True)
class StagedBundle:
    """One bundle on disk: where its files are, and what the bundle hashes to.

    ``run_manifest_path`` is the run-manifest sibling — the copy of the run manifest that
    carries the window's measurement geometry. It travels beside the bundle and is never
    a member of it; the sidecar names it without membership (014 T047).
    """

    bundle_id: str
    path: Path
    sidecar_path: Path
    run_manifest_path: Path
    digest: str
    byte_length: int


class StagingArea:
    """Where bundles live between being written and being evicted.

    Every name comes from configuration: the directory, the two suffixes that turn a bundle
    identifier into a file name, and the suffix a file wears while it is still being
    written (Constitution IV).
    """

    def __init__(
        self,
        directory: Path,
        *,
        bundle_suffix: str,
        manifest_suffix: str,
        run_manifest_suffix: str,
        partial_suffix: str,
    ) -> None:
        self.directory = directory
        self.bundle_suffix = bundle_suffix
        self.manifest_suffix = manifest_suffix
        self.run_manifest_suffix = run_manifest_suffix
        self.partial_suffix = partial_suffix

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> StagingArea:
        return cls(
            Path(section["directory"]),
            bundle_suffix=str(section["bundle_suffix"]),
            manifest_suffix=str(section["manifest_suffix"]),
            run_manifest_suffix=str(section["run_manifest_suffix"]),
            partial_suffix=str(section["partial_suffix"]),
        )

    def bundle_path(self, bundle_id: str) -> Path:
        return self.directory / f"{bundle_id}{self.bundle_suffix}"

    def sidecar_path(self, bundle_id: str) -> Path:
        return self.directory / f"{bundle_id}{self.manifest_suffix}"

    def run_manifest_path(self, bundle_id: str) -> Path:
        """The run-manifest sibling: beside the bundle, never inside it (014 T047)."""
        return self.directory / f"{bundle_id}{self.run_manifest_suffix}"

    def run_manifest_name(self, bundle_id: str) -> str:
        """The sibling's name as the sidecar records it: a name, not a location."""
        return f"{bundle_id}{self.run_manifest_suffix}"

    def member_name(self, bundle_id: str) -> str:
        """The bundle's name within itself: a name, not a location (FR-006)."""
        return f"{bundle_id}{self.bundle_suffix}"

    def occupied_bytes(self) -> int:
        """What the staging area currently holds, partial files included.

        Partial files included on purpose: a disk filling with half-written bundles is
        still a disk filling, and the retention policy is asking about space rather than
        about bundles.
        """
        total = 0
        with contextlib.suppress(FileNotFoundError):
            for entry in self.directory.iterdir():
                with contextlib.suppress(OSError):
                    total += entry.stat().st_size
        return total

    def staged_bundle_ids(self) -> Iterator[str]:
        """Every bundle identifier the filesystem shows, in a stable order."""
        with contextlib.suppress(FileNotFoundError):
            for entry in sorted(self.directory.iterdir()):
                name = entry.name
                if name.endswith(self.partial_suffix):
                    continue
                if name.endswith(self.bundle_suffix):
                    yield name[: -len(self.bundle_suffix)]

    def write(
        self,
        bundle_id: str,
        *,
        payload: bytes,
        sidecar: bytes,
        run_manifest: bytes,
        digest: str,
    ) -> StagedBundle:
        """Write every file durably, then reveal them, the sidecar strictly last.

        The sidecar stays the completion marker, so the run-manifest sibling it names is
        revealed before it: a reader that finds the sidecar finds everything the sidecar
        names, and the only window that remains is files with no sidecar yet, which
        nothing can claim was staged.
        """
        self.directory.mkdir(parents=True, exist_ok=True)
        bundle_path = self.bundle_path(bundle_id)
        sidecar_path = self.sidecar_path(bundle_id)
        run_manifest_path = self.run_manifest_path(bundle_id)
        bundle_partial = bundle_path.with_name(bundle_path.name + self.partial_suffix)
        sidecar_partial = sidecar_path.with_name(sidecar_path.name + self.partial_suffix)
        run_manifest_partial = run_manifest_path.with_name(
            run_manifest_path.name + self.partial_suffix
        )
        try:
            _write_durably(bundle_partial, payload)
            _write_durably(run_manifest_partial, run_manifest)
            _write_durably(sidecar_partial, sidecar)
            # A sidecar from an earlier attempt must not survive beside this attempt's
            # bundle for even an instant: it would describe bytes that are no longer there.
            _remove_if_present(sidecar_path)
            os.replace(bundle_partial, bundle_path)
            os.replace(run_manifest_partial, run_manifest_path)
            os.replace(sidecar_partial, sidecar_path)
        finally:
            _remove_if_present(bundle_partial)
            _remove_if_present(sidecar_partial)
            _remove_if_present(run_manifest_partial)
        return StagedBundle(
            bundle_id=bundle_id,
            path=bundle_path,
            sidecar_path=sidecar_path,
            run_manifest_path=run_manifest_path,
            digest=digest,
            byte_length=len(payload),
        )


def _write_durably(path: Path, payload: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def _remove_if_present(path: Path) -> None:
    with contextlib.suppress(FileNotFoundError):
        os.remove(path)
