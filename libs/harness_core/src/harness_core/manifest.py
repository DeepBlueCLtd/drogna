"""The run manifest: what a run was, and what a replay needs.

A manifest records the root seed, the seed derivation rule and its version, the clock
configuration, the code version, and the digest of each participant's configuration. It
records digests and never values, so publishing a manifest cannot leak a secret a config
file happens to carry.

Two properties are load-bearing. It is *sufficient*: together with the code version it
names, nothing else is consulted to start the run again. And it is *finalised
atomically*: the document is written to a sibling file and renamed over the target, so a
reader either sees the previous manifest or the new one, never half of either.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from enum import StrEnum
from typing import Any

from harness_core.clock import ClockMode, ParticipantRole, SimInstant
from harness_core.config import read_json_document, validate_document

__all__ = [
    "SCHEMA_VERSION",
    "ExitState",
    "ManifestParticipant",
    "ManifestWriter",
    "RunManifest",
    "compare_manifests",
    "read_manifest",
    "write_manifest",
]

SCHEMA_VERSION = 1

_PARTIAL_SUFFIX = ".partial"
_NON_REPRODUCIBLE = ("/exit_state/detail",)


class ExitState(StrEnum):
    """How a run ended. ``running`` is what a manifest says until it is finalised."""

    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STALLED = "stalled"


@dataclass(frozen=True)
class ManifestParticipant:
    """A component that registered with the clock, and the digest it started from."""

    id: str
    role: ParticipantRole
    config_digest: str
    registered_tick: int | None = None

    def as_document(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role.value,
            "config_digest": self.config_digest,
            "registered_tick": self.registered_tick,
        }

    @classmethod
    def from_document(cls, payload: Mapping[str, Any]) -> ManifestParticipant:
        return cls(
            id=str(payload["id"]),
            role=ParticipantRole(str(payload["role"])),
            config_digest=str(payload["config_digest"]),
            registered_tick=payload.get("registered_tick"),
        )


@dataclass(frozen=True)
class RunManifest:
    """The manifest as a value. Serialised by :meth:`as_document`."""

    run_id: str
    root_seed: int
    seed_rule: str
    seed_rule_version: int
    clock: Mapping[str, Any]
    code_revision: str
    code_dirty: bool = False
    participants: tuple[ManifestParticipant, ...] = ()
    streams: tuple[str, ...] = ()
    exit_state: ExitState = ExitState.RUNNING
    final_tick: int | None = None
    detail: str = ""

    def as_document(self) -> dict[str, Any]:
        exit_state: dict[str, Any] = {"state": self.exit_state.value, "final_tick": self.final_tick}
        if self.detail:
            exit_state["detail"] = self.detail
        return {
            "schema_version": SCHEMA_VERSION,
            "run_id": self.run_id,
            "root_seed": self.root_seed,
            "seed_derivation": {"rule": self.seed_rule, "version": self.seed_rule_version},
            "clock": dict(self.clock),
            "code_version": {"revision": self.code_revision, "dirty": self.code_dirty},
            "participants": [participant.as_document() for participant in self.participants],
            "streams": list(self.streams),
            "exit_state": exit_state,
            "non_reproducible": list(_NON_REPRODUCIBLE),
        }

    @classmethod
    def from_document(cls, payload: Mapping[str, Any]) -> RunManifest:
        derivation = payload["seed_derivation"]
        code_version = payload["code_version"]
        exit_state = payload.get("exit_state", {})
        return cls(
            run_id=str(payload["run_id"]),
            root_seed=int(payload["root_seed"]),
            seed_rule=str(derivation["rule"]),
            seed_rule_version=int(derivation["version"]),
            clock=dict(payload["clock"]),
            code_revision=str(code_version["revision"]),
            code_dirty=bool(code_version.get("dirty", False)),
            participants=tuple(
                ManifestParticipant.from_document(item) for item in payload.get("participants", ())
            ),
            streams=tuple(str(item) for item in payload.get("streams", ())),
            exit_state=ExitState(str(exit_state.get("state", ExitState.RUNNING.value))),
            final_tick=exit_state.get("final_tick"),
            detail=str(exit_state.get("detail", "")),
        )

    # Replay inputs ---------------------------------------------------------------

    def clock_settings(self) -> dict[str, Any]:
        """The keyword arguments a :class:`~harness_core.clock_service.ClockSettings` needs.

        This is the whole of what a replay reads from the manifest about time: the epoch,
        the interval, the mode and the rate bounds. Tick values follow from the first two
        alone, which is why a rate change never disturbs a replay.
        """
        clock = dict(self.clock)
        settings: dict[str, Any] = {
            "run_id": self.run_id,
            "epoch": SimInstant.from_iso(str(clock["epoch"])),
            "tick_interval_us": int(clock["tick_interval_us"]),
            "mode": ClockMode(str(clock["mode"])),
            "rate": float(clock["rate"]),
        }
        for optional in ("min_rate", "max_rate", "lockstep_deadline_seconds"):
            if clock.get(optional) is not None:
                settings[optional] = float(clock[optional])
        return settings


def _serialise(document: Mapping[str, Any]) -> bytes:
    """Stable bytes: sorted keys, fixed separators, trailing newline."""
    return (json.dumps(document, indent=2, sort_keys=True) + "\n").encode("utf-8")


def write_manifest(
    path: str,
    manifest: RunManifest,
    *,
    schema: Mapping[str, Any],
) -> str:
    """Validate, then write atomically. An interrupted write leaves the previous document.

    The document is serialised and validated before the target is touched at all, so a
    manifest that would not validate never replaces one that did.
    """
    document = manifest.as_document()
    validate_document(document, schema, source=path)
    payload = _serialise(document)

    partial = path + _PARTIAL_SUFFIX
    with open(partial, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(partial, path)
    return path


def read_manifest(path: str, *, schema: Mapping[str, Any]) -> RunManifest:
    """Read a manifest and validate it before believing a word of it."""
    document = read_json_document(path)
    validate_document(document, schema, source=path)
    return RunManifest.from_document(document)


class ManifestWriter:
    """Writes the manifest at run start, appends participants, finalises at the end.

    The clock service owns this, because it is the component that must exist before any
    other and it holds the run's identity. Participants reach it through the
    ``config_digest`` and ``run_id`` fields of their heartbeats.
    """

    def __init__(self, path: str, manifest: RunManifest, *, schema: Mapping[str, Any]) -> None:
        self._path = path
        self._schema = schema
        self._manifest = manifest

    @property
    def manifest(self) -> RunManifest:
        return self._manifest

    @property
    def path(self) -> str:
        return self._path

    def start(self) -> RunManifest:
        """Write the manifest in its ``running`` state."""
        self._manifest = replace(self._manifest, exit_state=ExitState.RUNNING)
        write_manifest(self._path, self._manifest, schema=self._schema)
        return self._manifest

    def add_participant(self, participant: ManifestParticipant) -> RunManifest:
        """Record a participant, or update the record of one already known."""
        others = tuple(item for item in self._manifest.participants if item.id != participant.id)
        ordered = tuple(sorted((*others, participant), key=lambda item: item.id))
        self._manifest = replace(self._manifest, participants=ordered)
        write_manifest(self._path, self._manifest, schema=self._schema)
        return self._manifest

    def record_streams(self, streams: Iterable[str]) -> RunManifest:
        """Record the RNG streams the run is expected to use."""
        self._manifest = replace(self._manifest, streams=tuple(sorted(set(streams))))
        write_manifest(self._path, self._manifest, schema=self._schema)
        return self._manifest

    def finalise(
        self, state: ExitState, *, final_tick: int | None, detail: str = ""
    ) -> RunManifest:
        """Record the exit state and the final tick, atomically."""
        self._manifest = replace(
            self._manifest, exit_state=state, final_tick=final_tick, detail=detail
        )
        write_manifest(self._path, self._manifest, schema=self._schema)
        return self._manifest


def _resolve(document: Mapping[str, Any], pointer: str) -> Any:
    node: Any = document
    for part in pointer.split("/")[1:]:
        key = part.replace("~1", "/").replace("~0", "~")
        if isinstance(node, Mapping):
            if key not in node:
                return None
            node = node[key]
        elif isinstance(node, Sequence) and not isinstance(node, str):
            index = int(key)
            if index >= len(node):
                return None
            node = node[index]
        else:
            return None
    return node


def compare_manifests(
    first: Mapping[str, Any],
    second: Mapping[str, Any],
) -> tuple[str, ...]:
    """Return the top-level keys in which two manifests differ, ignoring declared exclusions.

    The exclusions come from the manifests themselves, so a comparison needs the two
    documents and nothing else.
    """
    excluded = set(first.get("non_reproducible", ())) | set(second.get("non_reproducible", ()))
    left = json.loads(json.dumps(first))
    right = json.loads(json.dumps(second))
    for pointer in excluded:
        for document in (left, right):
            parent_pointer, _, leaf = pointer.rpartition("/")
            parent = _resolve(document, parent_pointer) if parent_pointer else document
            if isinstance(parent, dict):
                parent.pop(leaf, None)
    return tuple(sorted(key for key in set(left) | set(right) if left.get(key) != right.get(key)))
