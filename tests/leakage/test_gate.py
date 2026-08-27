"""The gate itself: one command, from a clean checkout, with nothing running (SC-008).

`scripts/check_leakage.py` is what CI runs and what somebody runs at the moment of
releasing something. It is registered in `scripts/gates.registry`, which is the whole of
FR-019, and it takes a candidate bundle so that it is a release gate rather than only a
regression test.

A gate is tested by being given something it must object to. Everything below either drives
it at a deliberate control and asserts it complains, or drives it at the corpus and asserts
it does not.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
GATE = REPOSITORY_ROOT / "scripts" / "check_leakage.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
MANIFEST = FIXTURES / "mitigated_pair" / "run-manifest.json"
REGISTRY = REPOSITORY_ROOT / "scripts" / "gates.registry"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=REPOSITORY_ROOT,
    )


def test_the_corpus_passes_and_says_what_it_looked_at() -> None:
    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert "clean_bundle" in result.stdout
    assert "mitigated_pair" in result.stdout


def test_the_figures_are_printed_rather_than_asserted_silently() -> None:
    """SC-005. A statistic nobody sees is a statistic nobody notices drifting."""
    result = run()

    assert "recovery" in result.stdout
    assert "chance" in result.stdout and "discovery" in result.stdout


def test_a_leaky_candidate_bundle_fails_the_gate() -> None:
    result = run("--bundle", str(FIXTURES / "leaky_bundle"), "--manifest", str(MANIFEST))

    assert result.returncode != 0
    assert "history" in result.stderr


def test_a_clean_candidate_bundle_passes_the_gate() -> None:
    """A gate that fails a clean artefact is one people learn to run with a flag."""
    result = run("--bundle", str(FIXTURES / "clean_bundle"), "--manifest", str(MANIFEST))

    assert result.returncode == 0, result.stdout + result.stderr


def test_a_bundle_with_no_geometry_is_refused_rather_than_scanned_half_blind() -> None:
    """The coordinate rule needs something to measure against, and says so when it has none."""
    result = run("--bundle", str(FIXTURES / "clean_bundle"))

    assert result.returncode != 0
    assert "geometry" in result.stderr


def test_a_bundle_scanned_against_an_invalid_geometry_is_refused_just_as_loudly(
    tmp_path: Path,
) -> None:
    """A missing geometry and an unusable one are different faults, and neither is a scan.

    An invalid geometry buys exactly what a missing one does: a coordinate rule with nothing
    to compare against. The failure worth guarding is the one where a document that almost
    parses leaves the rule scoring against no measurements and the bundle reporting clean, so
    the manifest here is the corpus's own with one coordinate taken out of one measurement —
    the smallest edit that a validator could plausibly wave through.
    """
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    del document["measurement_geometry"]["measurements"][0]["latitude"]
    broken = tmp_path / "run-manifest.json"
    broken.write_text(json.dumps(document), encoding="utf-8")

    result = run("--bundle", str(FIXTURES / "clean_bundle"), "--manifest", str(broken))

    assert result.returncode != 0, result.stdout + result.stderr
    assert "latitude" in result.stderr
    assert "refused" in result.stderr


def test_a_pair_whose_manifest_carries_no_geometry_is_refused_rather_than_scored(
    tmp_path: Path,
) -> None:
    """The manifest C-01 writes is a valid manifest and is not a geometry.

    It is the document a run leaves on the run-data volume, and pointing the gate at a pair
    beside one must not produce a statistic: an assessment computed against no measurements
    would be reported as inconclusive, and an inconclusive result nobody reads is how this
    gate stops working.
    """
    pair = tmp_path / "pair"
    for product in ("t0", "t1"):
        (pair / product).mkdir(parents=True)
        (pair / product / "drogna-forecast.nc").write_bytes(
            (FIXTURES / "mitigated_pair" / product / "drogna-forecast.nc").read_bytes()
        )
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    del document["measurement_geometry"]
    (pair / "run-manifest.json").write_text(json.dumps(document), encoding="utf-8")

    result = run("--pair", str(pair))

    assert result.returncode != 0, result.stdout + result.stderr
    assert "measurement_geometry" in result.stderr


def test_a_leaking_pair_fails_the_gate() -> None:
    result = run("--pair", str(FIXTURES / "unmitigated_pair"))

    assert result.returncode != 0
    assert "recovers the measurement geometry" in result.stderr


def test_an_inconclusive_pair_fails_rather_than_passing() -> None:
    result = run("--pair", str(FIXTURES / "unchanged_pair"))

    assert result.returncode != 0
    assert "inconclusive" in result.stderr


def test_the_report_is_written_whether_or_not_anything_was_found(tmp_path: Path) -> None:
    """A silent pass and a scan that did not run must be distinguishable."""
    report = tmp_path / "leakage.json"
    result = run(
        "--bundle",
        str(FIXTURES / "clean_bundle"),
        "--manifest",
        str(MANIFEST),
        "--report",
        str(report),
    )

    assert result.returncode == 0
    document = json.loads(report.read_text(encoding="utf-8"))
    assert document["complaints"] == []
    assert document["bundles"]["clean_bundle"]["members_scanned"]
    assert document["settings"]["chance_bound"]


def test_the_gate_is_registered() -> None:
    """FR-019. A gate nothing runs is a script."""
    lines = [
        line
        for line in REGISTRY.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]

    assert [line for line in lines if "check_leakage.py" in line]
