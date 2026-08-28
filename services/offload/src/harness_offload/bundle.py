"""Bundle identity, digests, and the sidecar manifest that says what the bytes hash to.

**Identity is derived, never drawn.** A bundle identifier is a pure function of the run's
identity — its identifier and its root seed — the format version, and the bundle's logical
position, which is the index of its window counted from the run's simulation epoch. Nothing
about when the packager ran, where it ran or how many times it has run enters it. Two
packaging runs over one run manifest therefore name the same bundles, which is what lets a
replay be compared bundle for bundle (Constitution II, FR-005) and what makes a re-packaged
bundle the same logical bundle rather than a duplicate the ledger has to arbitrate.

The derivation goes through ``harness_core.rng``, which owns the rule and its version, and
the seed it derives from is the run manifest's root seed rather than the packager's own
configured seed. That distinction is load-bearing: a bundle's name is a property of the run
it packages, so packaging the same run from a differently-configured packager must give the
same name.

**The run reference is not the run.** The manifest digest goes in the sidecar, where it can
be checked against ground truth (Constitution IX). What goes in the exported file is an
opaque derivation of that digest: enough to tie a bundle to a run for someone who holds the
manifest, and useless to anyone who does not (FR-017).

**The sidecar is written with the bundle and never regenerated.** A manifest recomputed
from a bundle after the fact agrees with whatever the file has become, which is the one
thing a manifest exists to detect. It is validated against its schema before the bundle is
called staged, so a bundle that entered the ledger has a sidecar that parses.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_core.clock import SimInstant
from harness_core.config import validate_document
from harness_core.rng import RandomStreams
from harness_types.messages.bundle_manifest import DrognaBundleManifest

from harness_offload.schemas import BUNDLE_MANIFEST_SCHEMA, schema
from harness_offload.version import FORMAT_VERSION, MANIFEST_SCHEMA_VERSION

__all__ = [
    "BUNDLE_ID_LENGTH",
    "BUNDLE_ID_PREFIX",
    "BundleManifest",
    "BundleMember",
    "bundle_id_for",
    "digest_of",
    "run_reference_for",
    "sidecar_manifest",
    "validate_manifest",
]

BUNDLE_ID_PREFIX = "b"
BUNDLE_ID_LENGTH = 16
"""Sixteen hex characters: 64 bits over a space of a few bundles per run.

Long enough that two windows of one run cannot collide, short enough to read aloud. The
prefix is there so a bundle identifier is recognisable as one in a ledger line, and so it
satisfies the master's pattern without depending on the first hex digit being a letter.
"""

_STREAM = "offload.bundle"


def digest_of(payload: bytes) -> str:
    """The SHA-256 digest, in the ``sha256:`` form every document here records."""
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def _streams(run_manifest: Mapping[str, Any]) -> RandomStreams:
    try:
        return RandomStreams(int(run_manifest["root_seed"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError(
            "the run manifest carries no usable root seed, so no bundle it produced could "
            "be named deterministically"
        ) from exc


def bundle_id_for(run_manifest: Mapping[str, Any], window_index: int) -> str:
    """The identifier of the bundle covering window ``window_index`` of this run.

    The stream name carries the run identifier and the format version, so a bundle written
    by a later format version is a different bundle rather than the same name over
    different bytes — which is what a reader comparing two replays would otherwise have to
    untangle by opening both files.
    """
    if isinstance(window_index, bool) or not isinstance(window_index, int):
        raise TypeError("a window index is an integer")
    if window_index < 0:
        raise ValueError("window indices are counted forward from the simulation epoch")
    run_id = str(run_manifest.get("run_id", ""))
    if not run_id:
        raise ValueError("the run manifest carries no run identifier")
    stream = f"{_STREAM}.{run_id}.{FORMAT_VERSION}"
    suffix = _streams(run_manifest).identifier_for(stream, window_index, length=BUNDLE_ID_LENGTH)
    return f"{BUNDLE_ID_PREFIX}-{suffix}"


def run_reference_for(run_manifest_digest: str) -> str:
    """The opaque run reference the exported file carries: 32 hex characters, one way.

    A second hashing of the manifest digest, under a label of its own. The point is not
    secrecy against an attacker who holds the manifest — they can compute this — but that a
    file handed to someone who does not hold it discloses nothing about the run beyond the
    fact that two bundles came from the same one.
    """
    material = b"drogna-run-reference/1\x00" + run_manifest_digest.encode("ascii")
    return hashlib.sha256(material).hexdigest()[:32]


@dataclass(frozen=True)
class BundleMember:
    """One file in a bundle: its name, its digest and its length. A name, not a location."""

    name: str
    digest: str
    byte_length: int

    def as_document(self) -> dict[str, Any]:
        return {"name": self.name, "digest": self.digest, "byte_length": self.byte_length}


@dataclass(frozen=True)
class BundleManifest:
    """The sidecar, as a document and as the bytes that are written beside the bundle."""

    document: Mapping[str, Any]

    @property
    def bundle_id(self) -> str:
        return str(self.document["bundle_id"])

    @property
    def members(self) -> tuple[BundleMember, ...]:
        return tuple(
            BundleMember(str(item["name"]), str(item["digest"]), int(item["byte_length"]))
            for item in self.document["members"]
        )

    def member(self, name: str) -> BundleMember:
        for member in self.members:
            if member.name == name:
                return member
        raise KeyError(f"the sidecar manifest names no member {name!r}")

    def payload(self) -> bytes:
        """The bytes written to disk: sorted keys, two-space indent, one trailing newline.

        Fixed rendering, because the sidecar's own bytes are compared between two packaging
        runs and a JSON serialiser's default key order is not a promise.
        """
        return (
            json.dumps(dict(self.document), indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        ).encode("utf-8")

    def model(self) -> DrognaBundleManifest:
        """The generated model, so every constraint the master declares is enforced."""
        return DrognaBundleManifest.model_validate(dict(self.document))


def validate_manifest(document: Mapping[str, Any]) -> None:
    """Refuse a sidecar the master would refuse, before the bundle is called staged."""
    validate_document(document, schema(BUNDLE_MANIFEST_SCHEMA), source="bundle manifest")


def sidecar_manifest(
    *,
    bundle_id: str,
    run_manifest_digest: str,
    window_index: int,
    window_start: SimInstant,
    window_end: SimInstant,
    members: Sequence[BundleMember],
    variables: Sequence[str],
    profile_count: int,
    level_count: int,
    run_manifest: BundleMember | None = None,
) -> BundleManifest:
    """Build and validate the sidecar for one bundle.

    ``run_manifest`` is the run-manifest sibling: the copy that carries the window's
    measurement geometry, staged beside the bundle. It is recorded under its own key and
    deliberately never appended to ``members`` — the sidecar names it without membership,
    because the sibling is the document a release withholds and the members list is the
    artefact the provenance scanner scores (014 T047, SC-006).
    """
    document: dict[str, Any] = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "bundle_id": bundle_id,
        "run_reference": run_reference_for(run_manifest_digest),
        "run_manifest_digest": run_manifest_digest,
        "format_version": FORMAT_VERSION,
        "window": {
            "index": window_index,
            "start_sim_time": window_start.iso(),
            "end_sim_time": window_end.iso(),
        },
        "members": [member.as_document() for member in members],
        "variables": list(variables),
        "profile_count": profile_count,
        "level_count": level_count,
    }
    if run_manifest is not None:
        document["run_manifest"] = run_manifest.as_document()
    validate_manifest(document)
    manifest = BundleManifest(document)
    manifest.model()
    return manifest
