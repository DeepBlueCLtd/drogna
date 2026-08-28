"""The indexing gate, and the proof that it reads more than the landing page (T013).

FR-008 was held by two greps in `.github/workflows/pages.yml`: a `robots` meta tag in the
built `index.html`, and `Disallow: /` in `robots.txt`. The meta tag reaches every page
through one theme override, so the way that mechanism fails is by ceasing to apply on
*some* pages — and a check that reads the landing page alone cannot see that at all.

`site/gates/fixtures/indexable_site/built/` is a tree where both greps pass and two of the
three pages are indexable. As in the landing-page tests, the assertion that the old greps
pass sits in the same file as the gate's finding, because the pair is the argument.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_indexing.py"
ROOT = GATES.parents[1]
FIXTURE = GATES / "fixtures" / "indexable_site" / "built"

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2

DECLINING = (
    '<!DOCTYPE html><html><head><meta name="robots" content="noindex, nofollow">'
    "<title>t</title></head><body><p>a page</p></body></html>"
)
ROBOTS = "User-agent: *\nDisallow: /\n"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def reported(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


def site_at(tmp_path: Path, pages: dict[str, str], robots: str | None = ROBOTS) -> Path:
    site = tmp_path / "built"
    site.mkdir(exist_ok=True)
    for name, html in pages.items():
        page = site / name
        page.parent.mkdir(parents=True, exist_ok=True)
        page.write_text(html, encoding="utf-8")
    if robots is not None:
        (site / "robots.txt").write_text(robots, encoding="utf-8")
    return site


@pytest.fixture(scope="module")
def control() -> str:
    return reported(run("--site", str(FIXTURE)))


# --- the control, and why it is one -------------------------------------------------


def test_both_greps_this_gate_replaced_pass_the_control() -> None:
    """Neither of the two workflow steps would have reported this tree."""
    landing = (FIXTURE / "index.html").read_text(encoding="utf-8")
    assert re.search(r'name="robots"', landing, re.IGNORECASE)
    robots = (FIXTURE / "robots.txt").read_text(encoding="utf-8")
    assert re.search(r"Disallow: /", robots, re.IGNORECASE)


def test_the_control_fails_the_gate() -> None:
    assert run("--site", str(FIXTURE)).returncode == FINDINGS


def test_a_page_with_no_robots_tag_at_all_is_caught(control: str) -> None:
    assert "deep/orphan.html" in control


def test_a_nested_page_is_reached(control: str) -> None:
    """The override fails per template, not per directory level, so a top-level walk
    would miss the case this fixture is built around."""
    assert "deep/" in control


def test_a_tag_saying_only_nofollow_is_caught(control: str) -> None:
    """The hard case: a tag is present, so anything checking for presence is satisfied."""
    assert "weak.html" in control
    assert "nofollow" in control


def test_the_compliant_page_in_the_control_is_not_reported(control: str) -> None:
    assert "index.html" not in control


# --- the other half of the pair -----------------------------------------------------


def test_a_site_that_declines_indexing_everywhere_is_clean(tmp_path: Path) -> None:
    site = site_at(tmp_path, {"index.html": DECLINING, "a/b.html": DECLINING})
    result = run("--site", str(site))
    assert result.returncode == CLEAN, reported(result)


def test_the_real_built_site_is_clean_if_it_has_been_built() -> None:
    site = ROOT / "site" / "build"
    if not (site / "index.html").is_file():
        pytest.skip(
            "no built site at site/build: run "
            "`mkdocs build --strict --config-file site/mkdocs.yml` first. Skipped rather "
            "than passed, because a gate that read nothing has established nothing."
        )
    result = run("--site", str(site))
    assert result.returncode == CLEAN, reported(result)


# --- robots.txt ---------------------------------------------------------------------


def test_a_missing_robots_txt_is_a_finding(tmp_path: Path) -> None:
    site = site_at(tmp_path, {"index.html": DECLINING}, robots=None)
    assert "robots-missing" in reported(run("--site", str(site)))


def test_a_robots_txt_that_allows_everything_is_a_finding(tmp_path: Path) -> None:
    site = site_at(tmp_path, {"index.html": DECLINING}, robots="User-agent: *\nAllow: /\n")
    output = reported(run("--site", str(site)))
    assert "robots-permissive" in output
    assert "Disallow: /" in output


def test_a_robots_txt_binding_no_crawler_is_a_finding(tmp_path: Path) -> None:
    """`Disallow: /` under a named agent leaves every other crawler unaddressed."""
    site = site_at(tmp_path, {"index.html": DECLINING}, robots="User-agent: SomeBot\nDisallow: /\n")
    assert "robots-permissive" in reported(run("--site", str(site)))


def test_comments_and_spacing_in_robots_txt_are_tolerated(tmp_path: Path) -> None:
    """The committed file opens with two comment lines; a gate that refused them would
    report the real site and be turned off within a day."""
    site = site_at(
        tmp_path,
        {"index.html": DECLINING},
        robots="# why this file exists\n#\nUser-agent:  *\nDisallow:  /\n",
    )
    result = run("--site", str(site))
    assert result.returncode == CLEAN, reported(result)


# --- refusing rather than reporting clean -------------------------------------------


def test_a_site_directory_that_does_not_exist_is_refused(tmp_path: Path) -> None:
    assert run("--site", str(tmp_path / "nothing")).returncode == CANNOT_RUN


def test_a_directory_with_no_pages_is_refused_rather_than_reported_clean(
    tmp_path: Path,
) -> None:
    """Zero findings over zero pages is the shape that looks exactly like a clean run."""
    site = tmp_path / "built"
    site.mkdir()
    (site / "robots.txt").write_text(ROBOTS, encoding="utf-8")
    result = run("--site", str(site))
    assert result.returncode == CANNOT_RUN, reported(result)
