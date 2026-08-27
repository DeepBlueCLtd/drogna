"""The decision-record gate, watched failing on each rule it claims to enforce.

Each test plants one violation in a fixture tree and asserts the gate names it. The
last test is against the real records: it asserts that the shape of heading the
open-questions rule hunts for is the shape a real record uses, so the rule is known to
be aimed at something that exists rather than at something imagined.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
REPO_ROOT = GATES.parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


check_adr = _load("check_adr", GATES / "check_adr.py")

RECORD = """# ADR-0001: A decision

**Status:** Accepted
**Date:** 1 January 2026

## Context

Something was contested.

## Decision

It was decided.
"""

INDEX_HTML = """<html><body><h1>Architecture decision records</h1>
<table><tr><td>0001-a-decision</td><td>A decision</td><td>Accepted</td></tr></table>
</body></html>
"""


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A repository with one record, a manifest publishing it, and a matching build."""
    records = tmp_path / "docs" / "adr"
    records.mkdir(parents=True)
    (records / "0001-a-decision.md").write_text(RECORD, encoding="utf-8")
    (records / "README.md").write_text("# Not a record\n", encoding="utf-8")

    (tmp_path / "manifest-under-test.yaml").write_text(
        "adrs:\n  published: true\n  source: docs/adr\n", encoding="utf-8"
    )

    published = tmp_path / "build" / "decisions" / "adr"
    (published / "0001-a-decision").mkdir(parents=True)
    (published / "0001-a-decision" / "index.html").write_text(
        "<html><body><h1>ADR-0001: A decision</h1><h2>Context</h2></body></html>",
        encoding="utf-8",
    )
    (published / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    return tmp_path


def gate(tree: Path, capsys) -> tuple[int, str]:
    code = check_adr.main(
        [
            "--site",
            str(tree / "build"),
            "--manifest",
            str(tree / "manifest-under-test.yaml"),
            "--repo-root",
            str(tree),
        ]
    )
    return code, capsys.readouterr().out


def test_a_clean_tree_passes(tree: Path, capsys):
    code, out = gate(tree, capsys)
    assert code == 0, out
    assert out.strip().endswith("adr: 0 findings")


def test_a_record_the_manifest_publishes_but_the_build_omits_fails(tree: Path, capsys):
    (tree / "build" / "decisions" / "adr" / "0001-a-decision" / "index.html").unlink()
    code, out = gate(tree, capsys)
    assert code == 1
    assert "record-not-published" in out
    assert "0001-a-decision" in out


def test_a_record_missing_from_the_index_fails(tree: Path, capsys):
    index = tree / "build" / "decisions" / "adr" / "index.html"
    index.write_text("<html><body><h1>Architecture decision records</h1></body></html>")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "index-incomplete" in out


def test_an_index_status_that_disagrees_with_the_record_fails(tree: Path, capsys):
    index = tree / "build" / "decisions" / "adr" / "index.html"
    index.write_text(INDEX_HTML.replace("Accepted", "Superseded"))
    code, out = gate(tree, capsys)
    assert code == 1
    assert "index-status" in out


def test_a_record_with_no_status_fails(tree: Path, capsys):
    record = tree / "docs" / "adr" / "0001-a-decision.md"
    record.write_text(RECORD.replace("**Status:** Accepted\n", ""), encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "status-unrecorded" in out


def test_a_published_page_with_an_open_questions_list_fails(tree: Path, capsys):
    page = tree / "build" / "decisions" / "adr" / "0001-a-decision" / "index.html"
    page.write_text(
        "<html><body><h1>ADR-0001: A decision</h1><h2>Open questions</h2>"
        "<p>Nobody knows.</p></body></html>",
        encoding="utf-8",
    )
    code, out = gate(tree, capsys)
    assert code == 1
    assert "open-questions" in out
    assert "docs/adr/0001-a-decision.md" in out


def test_open_questions_are_caught_on_any_page_not_only_a_record(tree: Path, capsys):
    other = tree / "build" / "algorithms"
    other.mkdir(parents=True)
    (other / "index.html").write_text(
        "<html><body><h1>Algorithms</h1><h3>Unresolved</h3></body></html>", encoding="utf-8"
    )
    code, out = gate(tree, capsys)
    assert code == 1
    assert "algorithms/index.html" in out


def test_prose_about_an_open_question_is_not_a_finding(tree: Path, capsys):
    page = tree / "build" / "decisions" / "adr" / "0001-a-decision" / "index.html"
    page.write_text(
        "<html><body><h1>ADR-0001: A decision</h1><p>This was an open question until "
        "it was answered here.</p></body></html>",
        encoding="utf-8",
    )
    code, out = gate(tree, capsys)
    assert code == 0, out


def test_publishing_against_a_manifest_that_says_no_fails(tree: Path, capsys):
    (tree / "manifest-under-test.yaml").write_text("adrs:\n  published: false\n", encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "published-against-decision" in out


def test_a_manifest_recording_no_decision_fails(tree: Path, capsys):
    (tree / "manifest-under-test.yaml").write_text("pages: {}\n", encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "publication-decision" in out


def test_no_manifest_cannot_run(tree: Path, capsys):
    (tree / "manifest-under-test.yaml").unlink()
    code = check_adr.main(
        [
            "--site",
            str(tree / "build"),
            "--manifest",
            str(tree / "manifest-under-test.yaml"),
            "--repo-root",
            str(tree),
        ]
    )
    assert code == 2
    error = capsys.readouterr().err
    assert "cannot run" in error
    assert "manifest" in error


def test_no_built_site_cannot_run(tree: Path, capsys):
    code = check_adr.main(
        [
            "--site",
            str(tree / "never-built"),
            "--manifest",
            str(tree / "manifest-under-test.yaml"),
            "--repo-root",
            str(tree),
        ]
    )
    assert code == 2
    assert "cannot run" in capsys.readouterr().err


def test_the_real_records_all_state_a_status():
    found = check_adr.records(REPO_ROOT)
    assert found, "no decision records were read"
    missing = [record.stem for record in found if not record.status]
    assert not missing, f"records with no status: {missing}"


def test_the_open_questions_rule_is_aimed_at_a_heading_a_real_record_uses():
    """ADR-0010 heads a list of deferred points `Open points`, and the rule catches it.

    This test does not assert the site is clean of such lists — it is not, and that is
    the gate's finding rather than this suite's business. It asserts the rule is aimed
    at the shape of heading that actually occurs.
    """
    assert check_adr.OPEN_QUESTIONS.search("Open points")
    assert check_adr.OPEN_QUESTIONS.search("Open questions")
    assert not check_adr.OPEN_QUESTIONS.search("Consequences")
