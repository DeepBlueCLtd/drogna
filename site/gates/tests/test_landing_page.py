"""The landing-page gate, and the proof that it catches what the grep could not (T008).

FR-003's ordering half — the statement comes before anything else a viewer would read —
was held by nothing until this gate was written. A workflow step grepped the built
`index.html` for three phrases anywhere in the file, which is the presence half, and
presence was never the half in danger.

So the control that matters here is `site/gates/fixtures/landing_page/statement_late/`: a
page carrying all three phrases, below a heading and two paragraphs of prose. The grep
passes on it. `test_the_grep_this_gate_replaced_passes_the_control` asserts that in the
same file as the gate's own finding, because the two facts together are the argument for
the gate existing, and either alone is not.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_landing_page.py"
ROOT = GATES.parents[1]
REQUIREMENTS = ROOT / "harness-srd.md"
STATEMENT_LATE = GATES / "fixtures" / "landing_page" / "statement_late"

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2
PHRASES = ("learning harness", "synthetic", "fake")

CORRECT = """<!DOCTYPE html><html><body><article>
<h1>drogna</h1>
<div class="admonition warning">
<p class="admonition-title">Read this first</p>
<p><strong>drogna is a learning harness. Its data is synthetic and its numerics are
deliberately fake.</strong></p>
</div>
<h2>What it is</h2>
<p>A small runnable system.</p>
</article></body></html>"""


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def reported(result: subprocess.CompletedProcess[str]) -> str:
    """Both streams. The findings go to standard error and the summary to standard out."""
    return result.stdout + result.stderr


def built(tmp_path: Path, html: str, name: str = "index.html") -> Path:
    site = tmp_path / "built"
    site.mkdir(exist_ok=True)
    (site / name).write_text(html, encoding="utf-8")
    return site


# --- the control, and why it is one -------------------------------------------------


def test_the_grep_this_gate_replaced_passes_the_control() -> None:
    """The workflow step this gate replaces sees nothing wrong with the fixture.

    This is not a test of the gate. It is the record of why the gate had to be written, and
    it fails if somebody "fixes" the fixture by moving its statement to the top — which
    would leave the file below still green while controlling nothing.
    """
    page = (STATEMENT_LATE / "index.html").read_text(encoding="utf-8")
    for phrase in PHRASES:
        assert re.search(re.escape(phrase), page, re.IGNORECASE), phrase


def test_the_control_fails_the_gate() -> None:
    result = run("--site", str(STATEMENT_LATE))
    assert result.returncode == FINDINGS, reported(result)


def test_the_control_is_reported_as_an_ordering_fault_not_an_absence() -> None:
    """`statement-absent` on this fixture would mean it had stopped being a control."""
    output = reported(run("--site", str(STATEMENT_LATE)))
    assert "statement-not-first" in output
    assert "statement-absent" not in output


def test_the_control_names_the_element_the_statement_landed_in() -> None:
    assert "<h2>" in reported(run("--site", str(STATEMENT_LATE)))


def test_every_required_phrase_is_reported_separately() -> None:
    output = reported(run("--site", str(STATEMENT_LATE)))
    for phrase in PHRASES:
        assert repr(phrase) in output, phrase


# --- the other half of the pair: it is capable of reporting nothing ------------------


def test_a_page_with_the_statement_first_is_clean(tmp_path: Path) -> None:
    result = run("--site", str(built(tmp_path, CORRECT)))
    assert result.returncode == CLEAN, reported(result)


def test_the_real_built_site_is_clean_if_it_has_been_built() -> None:
    site = ROOT / "site" / "build"
    if not (site / "index.html").is_file():
        pytest.skip(
            "no built site at site/build: run "
            "`mkdocs build --strict --config-file site/mkdocs.yml` first. This test is "
            "skipped rather than passed, because a gate that read nothing has "
            "established nothing."
        )
    result = run("--site", str(site))
    assert result.returncode == CLEAN, reported(result)


# --- the failures that are not about ordering ---------------------------------------


def test_a_page_missing_a_phrase_is_reported_as_absent(tmp_path: Path) -> None:
    site = built(tmp_path, CORRECT.replace("synthetic", "invented"))
    output = reported(run("--site", str(site)))
    assert "statement-absent" in output
    assert "'synthetic'" in output


def test_a_heading_before_the_statement_is_permitted(tmp_path: Path) -> None:
    """Every page on the site opens with its own title; failing that would fail them all."""
    assert run("--site", str(built(tmp_path, CORRECT))).returncode == CLEAN


def test_a_site_with_no_landing_page_is_a_finding(tmp_path: Path) -> None:
    site = built(tmp_path, CORRECT, name="somewhere-else.html")
    output = reported(run("--site", str(site)))
    assert "landing-page-missing" in output


def test_a_site_directory_that_does_not_exist_is_refused_rather_than_clean(
    tmp_path: Path,
) -> None:
    """Exit 0 on a path nothing read is the silent pass this repository keeps finding."""
    result = run("--site", str(tmp_path / "no-such-build"))
    assert result.returncode == CANNOT_RUN, reported(result)


# --- the gate is a reading of the requirement, not a second opinion about it ---------


def test_every_phrase_the_gate_looks_for_is_a_phrase_fr_01_uses() -> None:
    """Against the real requirements document, so the declaration cannot drift from it."""
    result = run("--site", str(ROOT / "site" / "gates" / "fixtures" / "landing_page"))
    assert "requirement-drift" not in reported(result)


def test_a_reworded_requirement_is_reported_rather_than_quietly_ignored(
    tmp_path: Path,
) -> None:
    """The gate restates FR-01's phrases, so it has to notice FR-01 changing under it."""
    reworded = tmp_path / "probe-srd.md"
    reworded.write_text(
        "# Probe\n\n- **FR-01** The landing page shall state plainly that this is a "
        "teaching rig with invented data and made-up numerics.\n\n## Next\n",
        encoding="utf-8",
    )
    output = reported(run("--site", str(built(tmp_path, CORRECT)), "--requirements", str(reworded)))
    assert "requirement-drift" in output
    assert "'learning harness'" in output


def test_a_requirements_document_without_fr_01_cannot_be_run_against(
    tmp_path: Path,
) -> None:
    empty = tmp_path / "no-fr-01.md"
    empty.write_text("# Probe\n\nNothing here numbers a requirement.\n", encoding="utf-8")
    result = run("--site", str(built(tmp_path, CORRECT)), "--requirements", str(empty))
    assert result.returncode == CANNOT_RUN, reported(result)


def test_the_requirements_document_this_gate_reads_by_default_exists() -> None:
    """A default that had moved would make every run above a test of a temporary file."""
    assert REQUIREMENTS.is_file()
