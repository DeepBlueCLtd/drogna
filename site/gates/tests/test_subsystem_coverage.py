"""The subsystem coverage gate (T026), and the proof that it counts nothing (FR-012).

SC-006 names C-01 to C-18, and the temptation is to write eighteen down. A gate that
counted to eighteen would be satisfied by eighteen of the wrong identifiers and would be
silent on the day a nineteenth appeared — which is the day the property is at risk. So
the gate reads the identifiers out of the requirements document's component table, and
the test that matters here hands it a table with a C-19 in it and watches it notice.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
import yaml

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_subsystem_coverage.py"
ROOT = GATES.parents[1]
MANIFEST = ROOT / "docs" / "manifest.yaml"
REQUIREMENTS = ROOT / "harness-srd.md"

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2

TABLE_HEADER = "| ID | Component | Responsibility | Risk |\n|---|---|---|---|\n"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def requirements_at(tmp_path: Path, *identifiers: str) -> Path:
    """A stand-in requirements document whose component table names exactly these."""
    rows = "".join(
        f"| {name} | Component {name} | doing something | a risk |\n" for name in identifiers
    )
    path = tmp_path / "probe-srd.md"
    path.write_text("# Probe\n\n## Components\n\n" + TABLE_HEADER + rows, encoding="utf-8")
    return path


def manifest_at(tmp_path: Path, docs: Path, pages: dict, components: dict | None = None) -> Path:
    body = {
        "docs_root": str(docs),
        "stub_marker": '^!!!\\s+\\w+\\s+"Stub\\b',
        "kinds": {"page": {"min_words": 1}},
        "pages": pages,
        "components": components or {},
        "adrs": {"published": False},
    }
    path = tmp_path / "probe-manifest.yaml"
    path.write_text(yaml.safe_dump(body), encoding="utf-8")
    return path


@pytest.fixture
def docs(tmp_path: Path) -> Path:
    directory = tmp_path / "docs"
    directory.mkdir()
    return directory


def written(docs: Path, name: str) -> None:
    (docs / name).write_text("# Page\n\nProse.\n", encoding="utf-8")


def probe(tmp_path: Path, manifest: Path, requirements: Path) -> subprocess.CompletedProcess[str]:
    return run(
        "--site",
        str(tmp_path),
        "--manifest",
        str(manifest),
        "--requirements",
        str(requirements),
    )


def test_a_component_with_a_page_is_accounted_for(tmp_path: Path, docs: Path) -> None:
    """The control, without which every test below would pass against a gate that always fails."""
    written(docs, "c01.md")
    manifest = manifest_at(tmp_path, docs, {"c01.md": {"kind": "page", "component": "C-01"}})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01"))
    assert result.returncode == CLEAN, result.stdout + result.stderr
    assert "subsystem-coverage: 0 findings" in result.stdout


def test_a_component_with_neither_a_page_nor_an_entry_is_named(tmp_path: Path, docs: Path) -> None:
    written(docs, "c01.md")
    manifest = manifest_at(tmp_path, docs, {"c01.md": {"kind": "page", "component": "C-01"}})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01", "C-02"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.unaccounted" in result.stdout
    assert "C-02" in result.stdout
    assert "C-01" not in result.stdout


def test_a_nineteenth_component_is_noticed(tmp_path: Path, docs: Path) -> None:
    """The whole reason the eighteen are not written down in the gate.

    The manifest accounts for C-01 to C-18 exactly as the real one does. The
    requirements document then grows a C-19, and nothing about the manifest changes.
    A gate that counted to eighteen would report a clean run.
    """
    names = [f"C-{number:02d}" for number in range(1, 19)]
    pages = {}
    for name in names:
        leaf = name.lower().replace("-", "") + ".md"
        written(docs, leaf)
        pages[leaf] = {"kind": "page", "component": name}
    manifest = manifest_at(tmp_path, docs, pages)

    eighteen = probe(tmp_path, manifest, requirements_at(tmp_path, *names))
    assert eighteen.returncode == CLEAN, eighteen.stdout + eighteen.stderr

    nineteen = probe(tmp_path, manifest, requirements_at(tmp_path, *names, "C-19"))
    assert nineteen.returncode == FINDINGS, nineteen.stdout
    assert "C-19" in nineteen.stdout
    assert "subsystem-coverage.unaccounted" in nineteen.stdout


def test_an_explicit_not_yet_built_entry_accounts_for_a_component(
    tmp_path: Path, docs: Path
) -> None:
    reason = {"C-02": "not yet built — no code exists and no page is written."}
    written(docs, "c01.md")
    manifest = manifest_at(
        tmp_path, docs, {"c01.md": {"kind": "page", "component": "C-01"}}, reason
    )
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01", "C-02"))
    assert result.returncode == CLEAN, result.stdout + result.stderr


def test_a_not_yet_built_entry_with_no_reason_accounts_for_nothing(
    tmp_path: Path, docs: Path
) -> None:
    """An entry nobody had to justify justifies nothing, as with the exemption markers."""
    written(docs, "c01.md")
    pages = {"c01.md": {"kind": "page", "component": "C-01"}}
    manifest = manifest_at(tmp_path, docs, pages, {"C-02": ""})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01", "C-02"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.unreasoned" in result.stdout


def test_a_page_that_accounts_for_a_component_and_does_not_exist_is_named(
    tmp_path: Path, docs: Path
) -> None:
    manifest = manifest_at(tmp_path, docs, {"absent.md": {"kind": "page", "component": "C-01"}})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.missing" in result.stdout
    assert "absent.md" in result.stdout


def test_a_component_the_requirements_document_no_longer_names_is_reported(
    tmp_path: Path, docs: Path
) -> None:
    """The other direction: a page claiming an identifier that has gone away."""
    written(docs, "c99.md")
    manifest = manifest_at(tmp_path, docs, {"c99.md": {"kind": "page", "component": "C-99"}})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.unknown" in result.stdout
    assert "C-99" in result.stdout


def test_two_pages_claiming_one_component_is_reported(tmp_path: Path, docs: Path) -> None:
    written(docs, "first.md")
    written(docs, "second.md")
    pages = {
        "first.md": {"kind": "page", "component": "C-01"},
        "second.md": {"kind": "page", "component": "C-01"},
    }
    manifest = manifest_at(tmp_path, docs, pages)
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.duplicate" in result.stdout


def test_a_component_both_published_and_recorded_as_unbuilt_is_reported(
    tmp_path: Path, docs: Path
) -> None:
    written(docs, "c01.md")
    pages = {"c01.md": {"kind": "page", "component": "C-01"}}
    manifest = manifest_at(tmp_path, docs, pages, {"C-01": "not yet built"})
    result = probe(tmp_path, manifest, requirements_at(tmp_path, "C-01"))
    assert result.returncode == FINDINGS, result.stdout
    assert "subsystem-coverage.contradiction" in result.stdout


def test_a_requirements_document_with_no_component_table_cannot_run(
    tmp_path: Path, docs: Path
) -> None:
    """An empty derivation would otherwise report every manifest as fully covered."""
    empty = tmp_path / "empty-srd.md"
    empty.write_text("# Probe\n\nNo table here.\n", encoding="utf-8")
    manifest = manifest_at(tmp_path, docs, {})
    result = probe(tmp_path, manifest, empty)
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "could not run" in result.stderr
    assert "An empty run is not a clean one" in result.stderr


def test_a_missing_requirements_document_cannot_run(tmp_path: Path, docs: Path) -> None:
    manifest = manifest_at(tmp_path, docs, {})
    result = probe(tmp_path, manifest, tmp_path / "nowhere.md")
    assert result.returncode == CANNOT_RUN, result.stdout + result.stderr
    assert "nowhere.md" in result.stderr


def test_the_real_tree_is_covered() -> None:
    """Every identifier the SRD defines is accounted for by the committed manifest."""
    result = run("--site", str(ROOT))
    assert result.returncode == CLEAN, result.stdout + result.stderr


def test_the_identifiers_are_read_from_the_requirements_document() -> None:
    """Not written down here either: the count is compared, not asserted against 18."""
    manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    claimed = {entry["component"] for entry in manifest["pages"].values() if "component" in entry}
    text = REQUIREMENTS.read_text(encoding="utf-8")
    for identifier in sorted(claimed):
        assert f"| {identifier} |" in text, f"{identifier} is claimed by a page and not defined"
