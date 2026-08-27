"""Is this staged run complete? Asked before anything becomes visible, and answered with digests.

FR-026: a run that fails validation leaves the previous current run untouched, discards its
staging, and records the failure. Everything rests on this module being able to tell a
finished run from an unfinished one, and it does so by arithmetic rather than by inspection:
the run's descriptor carries the SHA-256 of each field, so a truncated or half-written file
fails to match its own digest.

The other checks are cheap and each corresponds to a way a run can be wrong: a missing
uncertainty field (the specification's edge case — the run is incomplete, not a forecast-only
run), a descriptor that says the run failed, an ensemble of fewer than two members, and a
valid time range that is not a range.

What this does not do is decode the fields. Reading NetCDF here would make the publisher a
second consumer of a format the coverage output port exists to hide, and would still not
prove more than the digest does.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

__all__ = ["StagedInspection", "inspect_staged"]

_COMPLETE = "complete"
_SMALLEST_ENSEMBLE = 2


@dataclass(frozen=True)
class StagedInspection:
    """What was found, and every reason it is not publishable rather than the first."""

    directory: Path
    descriptor: dict[str, Any] = field(default_factory=dict)
    refusals: tuple[str, ...] = ()

    @property
    def complete(self) -> bool:
        return not self.refusals

    @property
    def run_id(self) -> str:
        return str(self.descriptor.get("run_id", self.directory.name))


def _digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def inspect_staged(
    directory: Path, *, forecast_file: str, uncertainty_file: str, manifest_file: str
) -> StagedInspection:
    """Inspect one staged run. A refusal names what is wrong, never merely that something is."""
    refusals: list[str] = []
    if not directory.is_dir():
        return StagedInspection(directory, refusals=(f"{directory.name}: no such staged run",))

    manifest_path = directory / manifest_file
    descriptor: dict[str, Any] = {}
    if not manifest_path.is_file():
        refusals.append("the staged run carries no descriptor, so nothing about it is known")
    else:
        try:
            loaded = json.loads(manifest_path.read_text(encoding="utf-8"))
        except ValueError as exc:
            refusals.append(f"the staged run's descriptor is not readable JSON ({exc})")
        else:
            if isinstance(loaded, dict):
                descriptor = loaded
            else:
                refusals.append("the staged run's descriptor is not an object")

    if descriptor:
        status = str(descriptor.get("status", ""))
        if status != _COMPLETE:
            refusals.append(f"the run's descriptor says its status is {status!r}")
        members = int(descriptor.get("member_count", 0) or 0)
        if members < _SMALLEST_ENSEMBLE:
            refusals.append(
                f"the run records {members} member(s); a spread over fewer than "
                f"{_SMALLEST_ENSEMBLE} is not the quantity the uncertainty field claims"
            )
        refusals.extend(_time_refusals(descriptor))

    digests = descriptor.get("digests", {}) if descriptor else {}
    for label, name in (("forecast", forecast_file), ("uncertainty", uncertainty_file)):
        path = directory / name
        if not path.is_file():
            refusals.append(f"the staged run has no {label} field at {name}")
            continue
        recorded = str(digests.get(label, "")) if isinstance(digests, dict) else ""
        if not recorded:
            refusals.append(f"the descriptor records no digest for the {label} field")
        elif recorded != _digest(path):
            refusals.append(
                f"the {label} field does not match the digest its descriptor records; it "
                "was written partially, or it was written twice"
            )

    return StagedInspection(directory, descriptor=descriptor, refusals=tuple(refusals))


def _time_refusals(descriptor: dict[str, Any]) -> Sequence[str]:
    valid = descriptor.get("valid_time")
    if not isinstance(valid, dict):
        refusal = "the run records no valid time range, so nothing could say when it applies"
        return (refusal,)
    if not valid.get("start_sim_time") or not valid.get("end_sim_time"):
        return ("the run's valid time range is missing an end",)
    if str(valid["end_sim_time"]) < str(valid["start_sim_time"]):
        return ("the run's valid time range ends before it starts",)
    return ()
