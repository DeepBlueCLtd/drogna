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

What is written here is validated against ``coverage-run-manifest.schema.json`` before it
reaches the store. That master did not exist while this module did, which is why the shape
was stated twice — once in the publisher that writes it and once in the catalogue that reads
it — and why a manifest could drift from what the query layer would accept without anything
noticing until a run failed to be catalogued.

``run_sequence`` used to be a third gap and is now carried. The store's identifier rule
derives a run's name from the root seed and this sequence, so where an identifier obeys the
rule the sequence can be read straight back out of it; the scheduler now names runs by that
rule and the run request carries the sequence besides, so the manifest records a fact rather
than a parse. The parse is kept as the fallback for a run named some other way, and where
neither answers the manifest still says so with a null — a guess would be worse than an
absence, because it would look like a fact that reproduced the run.

Two values the store asks for are still not carried through staging, and each is recorded as
what is known rather than as a plausible number:

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

from harness_core.config import validate_document

from harness_publisher.schemas import schema

__all__ = [
    "RUN_MANIFEST_SCHEMA_VERSION",
    "manifest_schema",
    "run_manifest",
    "sequence_of",
    "write_run_manifest",
]

# harness:allow-literal-path resource shipped inside this package, not a deployment location
_SCHEMA_FILE = "coverage-run-manifest.schema.json"

# Bumped when the manifest's shape changes in a way a reader must notice. It is a constant
# here rather than a configured value because it is a property of the shape rather than of a
# destination: the master declares which versions it accepts and this is the one this
# component writes.
RUN_MANIFEST_SCHEMA_VERSION = 1


def manifest_schema() -> Mapping[str, Any]:
    """The coverage store's run manifest master, as it travels inside this package."""
    return schema(_SCHEMA_FILE)


# The shape the store's identifier rule produces: a prefix, the run sequence padded to six
# digits, and twelve hex digits of a digest. Only the shape is checked, and only where the
# descriptor carries no sequence of its own. Recomputing the digest would prove the
# identifier as well as read it, but that needs the rule's name, its version and its prefix,
# and the publisher's configuration carries none of the three.
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

    Validated against the master before it is written rather than after. A manifest the query
    layer would refuse is a run that reaches the store and is never catalogued, which shows
    up as a published run that cannot be served — the least legible failure this component
    has, and the one the master exists to make impossible.
    """
    document = run_manifest(descriptor)
    validate_document(document, manifest_schema(), source=name)
    path = directory / name
    with path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(document, indent=2, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    return path


def _named_version(generator: Mapping[str, Any]) -> str:
    return " ".join(
        part for part in (str(generator.get("name", "")), str(generator.get("version", ""))) if part
    )
