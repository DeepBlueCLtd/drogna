"""The blog gate, watched failing on each rule it claims to enforce.

Every test here plants one violation in a fixture tree, runs the gate over it, and
asserts the gate names the rule and the file. A gate that has only ever been seen to
pass is not evidence of anything, and these are the runs that make it evidence.

The last two tests are different: they check the generated coverage table against the
real repository, counting the two sets here rather than calling the generator's own
counting, so that the generator agreeing with itself does not count as agreement.
"""

from __future__ import annotations

import importlib.util
import re
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


check_blog = _load("check_blog", GATES / "check_blog.py")
blog_coverage = _load("blog_coverage", REPO_ROOT / "site" / "hooks" / "blog_coverage.py")

ENTRY = """---
date: 2026-01-01
categories:
  - Feature
slug: an-entry
feature: specs/001-alpha
description: One sentence.
---

# An entry

Text.

![Alt text](../assets/001-a-shot.png)
"""

COVERAGE_HTML = """<html><body>
<h2>Which features have an entry</h2>
<p>1 of the 2 features have an entry; 1 have none.</p>
<table><tr><td>001-alpha</td><td>An entry</td></tr>
<tr><td>002-beta</td><td>no entry yet</td></tr></table>
</body></html>
"""


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    """A minimal repository and the site built from it, with nothing wrong."""
    for feature in ("001-alpha", "002-beta"):
        (tmp_path / "specs" / feature).mkdir(parents=True)

    posts = tmp_path / "site" / "docs" / "blog" / "posts"
    posts.mkdir(parents=True)
    (posts / "an-entry.md").write_text(ENTRY, encoding="utf-8")

    assets = tmp_path / "site" / "docs" / "blog" / "assets"
    assets.mkdir(parents=True)
    (assets / "001-a-shot.png").write_bytes(b"not really a picture")
    (assets / "001-a-shot.provenance.json").write_text("{}", encoding="utf-8")

    built = tmp_path / "build"
    (built / "blog" / "an-entry").mkdir(parents=True)
    (built / "blog" / "an-entry" / "index.html").write_text("<html></html>", encoding="utf-8")
    (built / "blog" / "index.html").write_text(COVERAGE_HTML, encoding="utf-8")
    return tmp_path


def gate(tree: Path, capsys, manifest: Path | None = None) -> tuple[int, str]:
    argv = ["--site", str(tree / "build"), "--repo-root", str(tree)]
    argv += ["--manifest", str(manifest if manifest else tree / "no-manifest")]
    code = check_blog.main(argv)
    return code, capsys.readouterr().out


def test_a_clean_tree_passes(tree: Path, capsys):
    code, out = gate(tree, capsys)
    assert code == 0, out
    assert out.strip().endswith("blog: 0 findings")


def test_an_entry_naming_a_feature_that_does_not_exist_fails(tree: Path, capsys):
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text(ENTRY.replace("specs/001-alpha", "specs/099-invented"), encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "feature-directory" in out
    assert "099-invented" in out
    assert "an-entry.md" in out


def test_an_entry_with_no_front_matter_fails(tree: Path, capsys):
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text("# An entry\n\nText.\n", encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "front-matter" in out


def test_an_entry_missing_a_required_key_fails(tree: Path, capsys):
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text(ENTRY.replace("date: 2026-01-01\n", ""), encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "front matter carries no `date`" in out


def test_an_entry_with_no_screenshot_fails(tree: Path, capsys):
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text(ENTRY.replace("![Alt text](../assets/001-a-shot.png)", ""), encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "screenshot: references no screenshot" in out


def test_a_screenshot_with_no_provenance_sidecar_fails(tree: Path, capsys):
    (tree / "site" / "docs" / "blog" / "assets" / "001-a-shot.provenance.json").unlink()
    code, out = gate(tree, capsys)
    assert code == 1
    assert "screenshot-provenance" in out


def test_a_screenshot_that_is_not_committed_fails(tree: Path, capsys):
    (tree / "site" / "docs" / "blog" / "assets" / "001-a-shot.png").unlink()
    code, out = gate(tree, capsys)
    assert code == 1
    assert "screenshot-missing" in out


def test_a_screenshot_named_after_no_feature_fails(tree: Path, capsys):
    assets = tree / "site" / "docs" / "blog" / "assets"
    (assets / "001-a-shot.png").rename(assets / "a-shot.png")
    (assets / "001-a-shot.provenance.json").rename(assets / "a-shot.provenance.json")
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text(ENTRY.replace("001-a-shot.png", "a-shot.png"), encoding="utf-8")
    code, out = gate(tree, capsys)
    assert code == 1
    assert "screenshot-name" in out


def test_an_entry_missing_from_the_built_site_fails(tree: Path, capsys):
    (tree / "build" / "blog" / "an-entry" / "index.html").unlink()
    code, out = gate(tree, capsys)
    assert code == 1
    assert "not-published" in out


def test_a_feature_left_out_of_the_coverage_table_fails(tree: Path, capsys):
    index = tree / "build" / "blog" / "index.html"
    index.write_text(COVERAGE_HTML.replace("<tr><td>002-beta</td><td>no entry yet</td></tr>", ""))
    code, out = gate(tree, capsys)
    assert code == 1
    assert "coverage-table" in out
    assert "002-beta" in out


def test_totals_that_disagree_with_the_count_fail(tree: Path, capsys):
    index = tree / "build" / "blog" / "index.html"
    index.write_text(COVERAGE_HTML.replace("1 of the 2 features", "2 of the 2 features"))
    code, out = gate(tree, capsys)
    assert code == 1
    assert "coverage-table" in out


def test_a_recorded_allowance_is_printed_rather_than_silent(tree: Path, capsys):
    entry = tree / "site" / "docs" / "blog" / "posts" / "an-entry.md"
    entry.write_text(ENTRY.replace("![Alt text](../assets/001-a-shot.png)", ""), encoding="utf-8")
    manifest = tree / "manifest-under-test.yaml"
    manifest.write_text(
        "blog:\n"
        "  screenshot_allowance:\n"
        "    recorded: 2026-01-02\n"
        "    reason: the capture mechanism is not built yet\n"
        "    entries:\n"
        "      - an-entry\n",
        encoding="utf-8",
    )
    code, out = gate(tree, capsys, manifest=manifest)
    assert code == 0, out
    assert "screenshot-allowance" in out
    assert "the capture mechanism is not built yet" in out


def test_no_built_site_cannot_run(tree: Path, capsys):
    code = check_blog.main(["--site", str(tree / "never-built"), "--repo-root", str(tree)])
    assert code == 2
    assert "cannot run" in capsys.readouterr().err


def _features_counted_here() -> set[str]:
    """The feature directories, counted without asking the generator."""
    return {
        path.name
        for path in (REPO_ROOT / "specs").iterdir()
        if path.is_dir() and re.fullmatch(r"\d{3}-[a-z0-9-]+", path.name)
    }


def _covered_counted_here() -> set[str]:
    """The features with an entry, read from the entries without asking the generator."""
    covered: set[str] = set()
    for path in sorted((REPO_ROOT / "site" / "docs" / "blog" / "posts").glob("*.md")):
        match = re.search(r"^feature:\s*(?P<value>\S+)\s*$", path.read_text(), re.MULTILINE)
        if match:
            covered.add(match.group("value").rstrip("/").split("/")[-1])
    return covered


def test_the_generated_table_matches_a_count_made_here():
    features = _features_counted_here()
    covered = _covered_counted_here() & features
    table = blog_coverage.coverage_table(REPO_ROOT)

    assert f"{len(covered)} of the {len(features)} features have an entry" in table
    assert f"{len(features) - len(covered)} have none" in table
    for name in features:
        assert f"| `{name}` |" in table, f"{name} has no row in the coverage table"
    for name in features - covered:
        row = next(line for line in table.splitlines() if line.startswith(f"| `{name}` |"))
        assert blog_coverage.NO_ENTRY in row, f"{name} has no entry but the table does not say so"


def test_the_blog_index_asks_for_the_generated_table():
    index = (REPO_ROOT / "site" / "docs" / "blog" / "index.md").read_text(encoding="utf-8")
    assert blog_coverage.MARKER in index
