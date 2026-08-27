"""Fixtures for the packager's tests: a recorded run, a configuration, and destinations.

Everything here is deterministic. The observations are generated from a fixed table rather
than drawn, the manual clock advances only when told to, and no value in any fixture comes
from a host clock — a test suite that quietly used one would be unable to see the bug it
exists to catch.

The destinations are stubs, and each one misbehaves in exactly one way. That is the point:
a stub that misbehaves is not a second implementation of the transport (Constitution VI),
it is a way of presenting one specific failure to the state machine and asserting that the
local bytes survive it.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_offload.bundle import digest_of
from harness_offload.transfer import TransferError

REPO_ROOT = Path(__file__).resolve().parents[3]

EPOCH = "2026-09-01T00:00:00.000000Z"
ROOT_SEED = 20260826
RUN_ID = "run-000000-7f80b47c7b91"
TICK_INTERVAL_US = 1_000_000

PROPERTIES = ("temperature", "salinity", "pressure")


def run_manifest(**overrides: Any) -> dict[str, Any]:
    """A run manifest of the shape ``run-manifest.schema.json`` declares."""
    document: dict[str, Any] = {
        "schema_version": 1,
        "run_id": RUN_ID,
        "root_seed": ROOT_SEED,
        "seed_derivation": {"rule": "harness-rng", "version": 1},
        "clock": {
            "epoch": EPOCH,
            "tick_interval_us": TICK_INTERVAL_US,
            "mode": "lockstep",
            "rate": 1.0,
        },
        "code_version": {"revision": "fixture", "dirty": False},
        "participants": [],
        "exit_state": {"state": "completed", "final_tick": 7200},
        "non_reproducible": ["/exit_state/detail"],
    }
    document.update(overrides)
    return document


def observation(
    *,
    index: int,
    offset_seconds: int,
    latitude: float,
    longitude: float,
    depth_m: float,
    prop: str,
    result: float,
) -> dict[str, Any]:
    """One observation, in the vocabulary ``observation.schema.json`` declares.

    It carries a thing, a sensor and a datastream, because a real one does. None of them
    reaches the export, and the attribute tests assert that by looking at what came out.
    """
    when = SimInstant.from_iso(EPOCH).plus_micros(offset_seconds * 1_000_000)
    return {
        "observation_id": f"obs-{index:06d}",
        "scenario_run_id": RUN_ID,
        "sim_time": when.iso(),
        "tick": offset_seconds,
        "thing_id": "glider-alpha",
        "datastream_id": f"glider-alpha.{prop}",
        "sensor_id": f"ctd-{prop}",
        "feature_of_interest_id": "foi-0001",
        "observed_property": prop,
        "result": result,
        "location": {"latitude": latitude, "longitude": longitude, "depth_m": depth_m},
        "context": {
            "thing": {"name": "glider alpha", "description": "a simulated sampling platform"},
            "sensor": {
                "name": f"ctd {prop}",
                "description": "a simulated instrument",
                "encoding_type": "application/json",
                "metadata": {"noise_sigma": 0.01},
            },
            "observed_property": {"name": prop, "definition": prop, "description": prop},
            "datastream": {
                "name": f"glider-alpha {prop}",
                "description": "a simulated datastream",
                "unit": {"name": prop, "symbol": "x", "definition": prop},
            },
            "feature_of_interest": {
                "name": "a sampled position",
                "description": "the position the sample pertains to",
                "encoding_type": "application/geo+json",
            },
        },
    }


@dataclass(frozen=True)
class ProfileSpec:
    """One profile to record: when it was taken, where, and how deep it got."""

    offset_seconds: int
    latitude: float
    longitude: float
    depths: tuple[float, ...]
    omit: tuple[tuple[float, str], ...] = ()


#: Three profiles along a path, truncated at different depths because the seabed shoals.
#: Five, three and one level: the ragged case, and the single-level case, in one fixture.
DEFAULT_PROFILES: tuple[ProfileSpec, ...] = (
    ProfileSpec(0, 50.0, -4.0, (0.0, 10.0, 20.0, 30.0, 40.0)),
    ProfileSpec(1800, 50.1, -4.1, (0.0, 10.0, 20.0)),
    ProfileSpec(3600, 50.2, -4.2, (0.0,)),
)


def observations_for(specs: Sequence[ProfileSpec] = DEFAULT_PROFILES) -> list[dict[str, Any]]:
    """The recorded observation stream for a set of profiles, in a fixed order."""
    records: list[dict[str, Any]] = []
    index = 0
    for spec in specs:
        for depth in spec.depths:
            for prop in PROPERTIES:
                if (depth, prop) in spec.omit:
                    continue
                records.append(
                    observation(
                        index=index,
                        offset_seconds=spec.offset_seconds,
                        latitude=spec.latitude,
                        longitude=spec.longitude,
                        depth_m=depth,
                        prop=prop,
                        # A value that is a function of the position, so two fixtures with
                        # the same shape hold the same numbers and a difference in a file
                        # means a difference in the writer.
                        result=round(
                            _value_for(prop, spec.offset_seconds, spec.latitude, depth), 6
                        ),
                    )
                )
                index += 1
    return records


def _value_for(prop: str, offset: int, latitude: float, depth: float) -> float:
    base = {"temperature": 12.0, "salinity": 35.0, "pressure": 0.0}[prop]
    gradient = {"temperature": -0.05, "salinity": 0.002, "pressure": 1.01}[prop]
    return base + gradient * depth + 0.001 * offset + 0.01 * latitude


def write_run(
    directory: Path, specs: Sequence[ProfileSpec] = DEFAULT_PROFILES, **manifest_overrides: Any
) -> Path:
    """Write a recorded run — manifest and observations — into ``directory``."""
    directory.mkdir(parents=True, exist_ok=True)
    manifest = run_manifest(**manifest_overrides)
    (directory / "run-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    lines = "\n".join(json.dumps(record, sort_keys=True) for record in observations_for(specs))
    (directory / "observations.jsonl").write_text(lines + "\n", encoding="utf-8")
    return directory


def configuration(tmp_path: Path, **offload_overrides: Any) -> dict[str, Any]:
    """The local destination's own configuration, rebased onto a temporary directory.

    The local file rather than a hand-written document, so a value that drifts in
    ``config/local/offload.json`` fails here rather than on the droplet.
    """
    document = json.loads(
        (REPO_ROOT / "config" / "local" / "offload.json").read_text(encoding="utf-8")
    )
    offload = document["offload"]
    offload["source"]["directory"] = str(tmp_path / "run")
    offload["staging"]["directory"] = str(tmp_path / "staging")
    offload["ledger"]["directory"] = str(tmp_path / "ledger")
    offload["release"]["directory"] = str(tmp_path / "released")
    for key, value in offload_overrides.items():
        if isinstance(value, Mapping) and isinstance(offload.get(key), Mapping):
            offload[key] = {**offload[key], **value}
        else:
            offload[key] = value
    return document


def manual_clock(index: int = 0) -> ManualClock:
    """A clock that moves only when a test moves it (Constitution I)."""
    return ManualClock(
        run_id=RUN_ID,
        epoch=SimInstant.from_iso(EPOCH),
        tick_interval_us=TICK_INTERVAL_US,
        mode=ClockMode.LOCKSTEP,
        index=index,
    )


# ------------------------------------------------------------------- the stub destinations


@dataclass
class StubDestination:
    """An honest destination: it computes its own digest over the bytes that arrived.

    Objects uploaded under a temporary name are invisible until committed, and no receipt
    is issued for anything that has not been committed. That is FR-015 modelled at the
    destination, so a test asserting the destination never acknowledges a partial object is
    asserting something the destination could get wrong rather than something the test
    arranged.
    """

    identifier: str = "archive"
    committed: dict[str, bytes] = field(default_factory=dict)
    partials: dict[str, bytes] = field(default_factory=dict)
    uploads: list[str] = field(default_factory=list)
    commits: list[str] = field(default_factory=list)
    receipt_calls: list[str] = field(default_factory=list)
    declared: dict[str, str] = field(default_factory=dict)
    sim_time: str = EPOCH
    fail_upload_after_bytes: int | None = None
    unreachable: bool = False

    @property
    def id(self) -> str:
        return self.identifier

    def upload(self, temporary_name: str, payload: bytes) -> None:
        if self.unreachable:
            raise TransferError(f"{self.identifier}: unreachable")
        self.uploads.append(temporary_name)
        if self.fail_upload_after_bytes is not None:
            # A kill part way through the upload: the temporary name holds a prefix of the
            # bundle and nothing is committed, so nothing can be acknowledged.
            self.partials[temporary_name] = payload[: self.fail_upload_after_bytes]
            raise TransferError(f"{self.identifier}: the connection dropped mid-upload")
        self.partials[temporary_name] = payload

    def commit(self, temporary_name: str, bundle_id: str, declared_digest: str) -> None:
        if self.unreachable:
            raise TransferError(f"{self.identifier}: unreachable")
        self.commits.append(bundle_id)
        self.declared[bundle_id] = declared_digest
        try:
            self.committed[bundle_id] = self.partials.pop(temporary_name)
        except KeyError as exc:
            raise TransferError(
                f"{self.identifier}: nothing was uploaded under {temporary_name!r}"
            ) from exc

    def _receipt_for(self, bundle_id: str, payload: bytes) -> dict[str, Any]:
        return {
            "destination_id": self.identifier,
            "bundle_id": bundle_id,
            "digest": digest_of(payload),
            "byte_count": len(payload),
            "sim_time": self.sim_time,
            "schema_version": 1,
        }

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        if self.unreachable:
            raise TransferError(f"{self.identifier}: unreachable")
        self.receipt_calls.append(bundle_id)
        payload = self.committed.get(bundle_id)
        if payload is None:
            return None
        return self._receipt_for(bundle_id, payload)


@dataclass
class EchoingDestination(StubDestination):
    """Returns the digest it was told, having computed nothing over the bytes that arrived.

    The one destination that must fail verification when the declared digest is wrong. It
    agrees with whatever the request declared every single time, including when the request
    declared a value the bytes never had, so an implementation comparing the receipt
    against the digest it sent would find perfect agreement. Only a comparison against a
    digest recomputed from the file on disk can tell the difference.
    """

    def _receipt_for(self, bundle_id: str, payload: bytes) -> dict[str, Any]:
        receipt = super()._receipt_for(bundle_id, payload)
        receipt["digest"] = self.declared.get(bundle_id, receipt["digest"])
        return receipt


@dataclass
class SilentDestination(StubDestination):
    """Returns success and no receipt body at all."""

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        self.receipt_calls.append(bundle_id)
        return None


@dataclass
class MalformedDestination(StubDestination):
    """Returns a document that is not a receipt."""

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        self.receipt_calls.append(bundle_id)
        return {"malformed": "this is not a receipt", "bundle_id": bundle_id}


@dataclass
class WrongBundleDestination(StubDestination):
    """Acknowledges a different bundle, correctly and completely."""

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        receipt = super().receipt(bundle_id)
        if receipt is None:
            return None
        amended = dict(receipt)
        amended["bundle_id"] = "b-0000000000000000"
        return amended


@dataclass
class WrongLengthDestination(StubDestination):
    """Right digest, wrong byte count: a file that is not this one."""

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        receipt = super().receipt(bundle_id)
        if receipt is None:
            return None
        amended = dict(receipt)
        amended["byte_count"] = int(amended["byte_count"]) + 1
        return amended


@dataclass
class WrongDestinationIdDestination(StubDestination):
    """A receipt from somewhere this component was not configured to send to."""

    def receipt(self, bundle_id: str) -> Mapping[str, Any] | None:
        receipt = super().receipt(bundle_id)
        if receipt is None:
            return None
        amended = dict(receipt)
        amended["destination_id"] = "somewhere-else"
        return amended


def snapshot(directory: Path) -> dict[str, bytes]:
    """Every file in a directory and its exact bytes: what a test compares afterwards."""
    if not directory.exists():
        return {}
    return {
        entry.name: entry.read_bytes() for entry in sorted(directory.iterdir()) if entry.is_file()
    }


def deep_copy(document: Mapping[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(dict(document))


def packager_for(
    tmp_path: Path,
    *,
    destination: StubDestination | None = None,
    clock: ManualClock | None = None,
    document: Mapping[str, Any] | None = None,
) -> Any:
    """A packager wired to a temporary staging area and a stub destination.

    Imported lazily so that the modules under test are imported by the test, not by the
    support module: a support module that imports everything hides a circular import that
    a component would hit in production.
    """
    from harness_offload.main import Packager, PackagerSettings

    settings = PackagerSettings.from_config(document or configuration(tmp_path))
    return Packager(
        settings,
        clock=clock or manual_clock(),
        destination=destination or StubDestination(),
    )
