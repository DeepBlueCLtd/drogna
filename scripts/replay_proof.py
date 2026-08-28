#!/usr/bin/env python3
"""The replay proof, demonstrable from a clean checkout in one command (001 T047).

    uv run python scripts/replay_proof.py [--seed N] [--ticks N]

Runs the two-participant lockstep scenario 001 T042 describes twice, from one run
manifest, and compares every output file byte for byte and the finished manifests field
for field. A third run redelivers every seventh tick — the shape a retrying transport
produces — and must change nothing, because the participants key their records to tick
values rather than to counts of received ticks.

This is the same code path ``tests/acceptance/test_at04_deterministic_replay.py`` scores;
the script exists so the claim is demonstrable without a test runner, which is what the
constitution's demonstrability bar asks for. It starts no service, opens no socket and
reads no clock: everything happens in this process, in a temporary directory that is
removed on the way out.

Exit status: 0 when every comparison is identical, 1 with the first differing line named
when any is not — a proof that could not fail would prove nothing.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tests" / "acceptance"))

from harness_core.manifest import RunManifest, compare_manifests  # noqa: E402
from participants import SCENARIO_TICKS, ScenarioResult, build_manifest, run_scenario  # noqa: E402

DEFAULT_SEED = 4_242


def first_difference(first: bytes, second: bytes) -> str:
    for number, (left, right) in enumerate(
        zip(first.splitlines(), second.splitlines(), strict=False), start=1
    ):
        if left != right:
            return f"line {number}: {left!r} != {right!r}"
    return f"lengths differ: {len(first)} bytes != {len(second)} bytes"


def replay(document: dict, out_dir: Path, *, ticks: int, redeliver_every: int | None = None):
    """One run, from the serialised manifest document — the thing FR-11 calls sufficient."""
    manifest = RunManifest.from_document(json.loads(json.dumps(document)))
    return run_scenario(manifest, out_dir, ticks=ticks, redeliver_every=redeliver_every)


def compare(label: str, first: ScenarioResult, second: ScenarioResult) -> list[str]:
    complaints: list[str] = []
    for path_a, path_b in zip(first.output_paths, second.output_paths, strict=True):
        bytes_a, bytes_b = path_a.read_bytes(), path_b.read_bytes()
        verdict = "identical" if bytes_a == bytes_b else "DIFFERENT"
        print(f"  {label}: {path_a.name}: {verdict}")
        if bytes_a != bytes_b:
            complaints.append(f"{label}: {path_a.name}: {first_difference(bytes_a, bytes_b)}")
    differing = compare_manifests(first.manifest.as_document(), second.manifest.as_document())
    if differing:
        complaints.append(f"{label}: manifests differ in {', '.join(differing)}")
    return complaints


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="drogna replay proof (001 T042/T047)")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="the run's root seed")
    parser.add_argument("--ticks", type=int, default=SCENARIO_TICKS, help="ticks to run")
    arguments = parser.parse_args(argv)

    document = build_manifest(arguments.seed).as_document()
    print(
        f"replay proof: run {document['run_id']!r}, root seed {arguments.seed}, "
        f"{arguments.ticks} ticks in lockstep, two participants"
    )

    complaints: list[str] = []
    with tempfile.TemporaryDirectory(prefix="drogna-replay-proof-") as scratch:
        base = Path(scratch)
        first = replay(document, base / "first", ticks=arguments.ticks)
        for name, digest in sorted(first.digests().items()):
            print(f"  first run: {name}: {digest}")
        second = replay(document, base / "second", ticks=arguments.ticks)
        complaints += compare("replay", first, second)
        redelivered = replay(
            document, base / "redelivered", ticks=arguments.ticks, redeliver_every=7
        )
        complaints += compare("redelivery", first, redelivered)

    if complaints:
        for complaint in complaints:
            print(f"FAIL: {complaint}")
        return 1
    print(
        "PASS: two runs from one manifest are byte-identical, redelivery changes nothing, "
        "and the manifests differ in no reproducible field"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
