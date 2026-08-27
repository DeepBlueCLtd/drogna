"""The run manifest: what staging said about a run, restated in the coverage store's terms.

The model runner writes a descriptor into staging that answers the publisher's question —
is this run finished, and do the fields match their digests. The coverage store asks a
different question, which is what a served value can be traced back to, and it asks it in
its own vocabulary: ``stores/coverage/layout.md`` fixes the keys and the query layer refuses
to catalogue a run whose manifest lacks them. The two documents are not the same document
and neither is wrong; they are addressed to different readers.

Translating between them is this component's work and nobody else's. The publisher is the
only thing that stands between staging and the store, which is why its configuration has
carried a separate ``manifest_file`` on each side from the beginning. Before this module
existed the staged descriptor was moved into the store unchanged and under its staging name,
so the query layer found no manifest it could read, catalogued no run, and served nothing —
with every test on both sides passing, because neither side had a test that crossed.

Three values the store asks for are not carried through staging today, and each is recorded
as what is known rather than as a plausible number:

``run_sequence``
    The store's identifier rule derives a run's name from the root seed and this sequence,
    so where a run identifier obeys that rule the sequence can be read straight back out of
    it. The scheduler's identifiers do not obey it — they are a hash of an ordinal, not the
    ordinal — and the ordinal itself is not carried on the run request, so for a run named
    that way there is nothing to read and the manifest says so with a null. A guess here
    would be worse than an absence: it would look like a fact that reproduced the run.

``generator_version``
    The store means the environment generator that produced the initial state. Staging
    records the model runner instead, under a key called ``generator``, and the environment
    generator's version is not carried at all. What is recorded is therefore the runner's.

``ensemble.method``
    Staging names the kernel, not the way members were combined. The kernel is recorded.
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

__all__ = ["RUN_MANIFEST_SCHEMA_VERSION", "run_manifest", "sequence_of", "write_run_manifest"]

# Bumped when the manifest's shape changes in a way a reader must notice. It is a constant
# here rather than a configured value because the shape's master does not exist yet: by
# Constitution III it belongs in `contracts/schemas/` as a generated-types master, and the
# layout document records that absence as a gap rather than a decision.
RUN_MANIFEST_SCHEMA_VERSION = 1

# The shape the store's identifier rule produces: a prefix, the run sequence padded to six
# digits, and twelve hex digits of a digest. Only the shape is checked. Recomputing the
# digest would prove the identifier as well as read it, but that needs the rule's name, its
# version and its prefix, and the publisher's configuration carries none of the three.
_LAYOUT_IDENTIFIER = re.compile(r"^[A-Za-z0-9]+-(\d{6})-[0-9a-f]{12}$")


def sequence_of(descriptor: Mapping[str, Any]) -> int | None:
    """Which run of this scenario this is, or nothing when nothing carries it."""
    stated = descriptor.get("run_sequence")
    if isinstance(stated, int) and not isinstance(stated, bool):
        return stated
    found = _LAYOUT_IDENTIFIER.match(str(descriptor.get("run_id", "")))
    return int(found.group(1)) if found else None


def run_manifest(descriptor: Mapping[str, Any]) -> dict[str, Any]:
    """The store's manifest for one run, from the descriptor staging left beside it."""
    valid_time = descriptor.get("valid_time") or {}
    generator = descriptor.get("generator") or {}
    seed = descriptor.get("seed") or {}
    kernel = str(descriptor.get("kernel", ""))
    return {
        "schema_version": RUN_MANIFEST_SCHEMA_VERSION,
        "run_id": str(descriptor.get("run_id", "")),
        "root_seed": seed.get("root"),
        "run_sequence": sequence_of(descriptor),
        "generator_version": _named_version(generator),
        "model_version": " ".join(
            part for part in (kernel, str(generator.get("analytic_form_version", ""))) if part
        ),
        "sim_time": str(descriptor.get("initialisation_sim_time", "")),
        "valid_time": {
            "begin": str(valid_time.get("start_sim_time", "")),
            "end": str(valid_time.get("end_sim_time", "")),
        },
        "ensemble": {
            "members": descriptor.get("member_count"),
            "method": str(descriptor.get("ensemble_method") or kernel),
        },
    }


def write_run_manifest(directory: Path, *, name: str, descriptor: Mapping[str, Any]) -> Path:
    """Write the manifest into a staged run, flushed, before anything moves it into the store.

    Written while the run is still in staging, so that the run reaches the store's tree
    complete in one rename rather than acquiring its manifest after arriving — which would
    be a window in which a reader could catalogue a run with no manifest.
    """
    path = directory / name
    with path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(run_manifest(descriptor), indent=2, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    return path


def _named_version(generator: Mapping[str, Any]) -> str:
    return " ".join(
        part for part in (str(generator.get("name", "")), str(generator.get("version", ""))) if part
    )
