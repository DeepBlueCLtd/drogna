"""The vocabulary gate is run against a planted violation and asserted to report it.

Zero findings on a tree with nothing in it is not evidence of anything. Every assertion
here that the gate is quiet is paired with an assertion that the same gate, on the same
run, is loud about the seeded fixture — and with an assertion that it actually read the
images, because "no findings" from a check that never looked is the failure this
repository has been burned by twice and the one exit code 2 exists for.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
REPO_ROOT = GATES.parents[1]
SEEDED = GATES / "fixtures" / "seeded_violation" / "built"

sys.path.insert(0, str(GATES))

import check_vocabulary as gate  # noqa: E402

ENGINE = shutil.which("tesseract")
needs_engine = pytest.mark.skipif(
    ENGINE is None,
    reason=(
        "no OCR engine on PATH, so the image half of the gate cannot be exercised here. "
        "`apt-get install -y tesseract-ocr` makes it run. The gate's own behaviour without "
        "an engine is asserted by test_no_engine_is_a_refusal_to_run, which always runs."
    ),
)


def run(*arguments: str, path: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run the gate as the contract says it is run: a subprocess with --site."""
    environment = dict(os.environ)
    if path is not None:
        environment["PATH"] = path
    return subprocess.run(
        [sys.executable, str(GATES / "check_vocabulary.py"), *arguments],
        capture_output=True,
        text=True,
        check=False,
        env=environment,
    )


@pytest.fixture(scope="session")
def built_site(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """The real built site, built here if it is not already on disk."""
    existing = REPO_ROOT / "site" / "build"
    if existing.is_dir():
        return existing
    if importlib.util.find_spec("mkdocs") is None:
        pytest.skip(
            "no built site on disk and MkDocs is not installed in this interpreter, so "
            "the real site cannot be built to gate it. The publishing workflow builds it "
            "and runs this assertion there; locally, build it first and re-run. This is "
            "the Docker trap in CLAUDE.md wearing a different hat: what skips here runs "
            "in CI, and is untested until CI says otherwise."
        )
    built = tmp_path_factory.mktemp("built")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "mkdocs",
            "build",
            "--strict",
            "--config-file",
            str(REPO_ROOT / "site" / "mkdocs.yml"),
            "--site-dir",
            str(built),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return built


# --- the real site -------------------------------------------------------------------


@needs_engine
def test_the_real_built_site_reports_no_findings(built_site: Path) -> None:
    result = run("--site", str(built_site))
    assert result.returncode == 0, result.stdout + result.stderr
    assert "vocabulary: 0 findings" in result.stdout


@needs_engine
def test_the_real_site_pass_is_not_a_gate_that_looked_at_nothing(built_site: Path) -> None:
    """The quiet run above must have read prose, emitted code, assets and an image.

    A pass is only worth something if the reader reached every zone the rules apply to.
    """
    fragments = list(gate.iter_fragments(built_site, ENGINE))
    zones = {fragment.zone for fragment in fragments}
    assert {gate.PROSE, gate.EMITTED, gate.ASSET, gate.IMAGE_TEXT} <= zones, zones
    read = [f for f in fragments if f.zone == gate.IMAGE_TEXT and f.text.strip()]
    assert read, "no published image produced any text; the image half read nothing"


def test_the_one_acknowledgement_is_load_bearing_and_carries_a_reason(built_site: Path) -> None:
    """Remove the acknowledgement and the real site fails. That is what makes it honest."""
    assert all(entry.reason.strip() for entry in gate.ACKNOWLEDGED), (
        "an acknowledgement with no reason acknowledges nothing, which is the same rule "
        "_gate_lib applies to an exemption marker"
    )
    entry = next(e for e in gate.ACKNOWLEDGED if e.rule == "personal-identifier")

    # It suppresses this match and nothing else's.
    assert gate.acknowledged(entry.location, entry.rule, entry.text)
    assert not gate.acknowledged("assets/javascripts/bundle.js", entry.rule, entry.text)

    # And the match is really there, so the acknowledgement is hiding something rather
    # than describing something that has since gone away.
    vendored = built_site / entry.location
    if not vendored.is_file():
        pytest.skip(f"the theme no longer emits {entry.location}; the acknowledgement is stale")
    assert entry.text in vendored.read_text(encoding="utf-8", errors="replace")


def test_an_acknowledgement_with_no_reason_acknowledges_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The rule `_gate_lib.exempted` applies to a marker, applied to this list.

    Written because neutering `Acknowledgement.stands` broke no test: the one entry in the
    list has a reason, so bypassing the check changed nothing observable, and the property
    was being asserted of the data rather than of the mechanism.
    """
    reasoned = gate.Acknowledgement("a.js", "personal-identifier", "x@y.invalid", "because")
    silent = gate.Acknowledgement("a.js", "personal-identifier", "x@y.invalid", "  ")

    monkeypatch.setattr(gate, "ACKNOWLEDGED", (reasoned,))
    assert gate.acknowledged("a.js", "personal-identifier", "x@y.invalid")

    monkeypatch.setattr(gate, "ACKNOWLEDGED", (silent,))
    assert not gate.acknowledged("a.js", "personal-identifier", "x@y.invalid")


def test_the_inherited_prose_ruling_is_still_in_force() -> None:
    """If `site` ever leaves the source gate's exclusions, the zone table must be re-argued.

    The gate does not apply the tracked-entity nouns to prose, because `_gate_lib` already
    records the decision that documentation must be able to discuss the prohibition in
    order to state it. That decision is read, not copied — and this is what notices if it
    changes underneath.
    """
    assert gate.SOURCE_SCAN_EXCLUDES_SITE, (
        "`site` is no longer excluded from scripts/check_forbidden_vocabulary.py, so the "
        "documentation is being scanned for these nouns again and check_vocabulary.py's "
        "prose exemption has to be argued afresh rather than left as it is"
    )


# --- the seeded fixture --------------------------------------------------------------


@pytest.fixture(scope="module")
def seeded() -> list[gate.Finding]:
    """The gate's verdict on the fixture, read once. Every image costs an OCR pass.

    The fixture carries four images, so the gate refuses to report on it at all without an
    engine — it will not call a site clean when it could not read part of it. That refusal
    is the correct behaviour and is asserted by test_no_engine_is_a_refusal_to_run; here it
    means this fixture cannot be built, so every test drawing on it skips with the reason
    rather than failing. Both halves of the gate are exercised wherever an engine exists,
    and CI installs one.
    """
    if ENGINE is None:
        pytest.skip(
            "no OCR engine on PATH, so the gate refuses to read the seeded fixture at all "
            "— it carries four images and will not report on a tree it could not read in "
            "full. `apt-get install -y tesseract-ocr` makes this run, and CI installs it."
        )
    return gate.findings(SEEDED, ENGINE)


@needs_engine
def test_the_fixture_fails_the_gate_and_names_the_file_and_the_term() -> None:
    result = run("--site", str(SEEDED))
    assert result.returncode == 1, result.stdout + result.stderr
    assert "index.html" in result.stdout
    assert "j.doe@example.invalid" in result.stdout
    assert "/home/jdoe" in result.stdout


@pytest.mark.parametrize(
    ("location", "rule", "term"),
    [
        ("index.html", "personal-identifier", "j.doe@example.invalid"),
        ("index.html", "host-path", "/home/jdoe"),
        ("index.html", "tracked-entity", "detection"),
        ("assets/theme.js", "tracked-entity", "detection"),
        ("assets/sidecar.json", "tracked-entity", "contact"),
    ],
)
def test_the_text_path_names_each_seeded_term(
    location: str, rule: str, term: str, seeded: list[gate.Finding]
) -> None:
    found = seeded
    named = [f for f in found if f.location == location and f.rule == rule and term in f.matched]
    assert named, f"{rule} not reported for {term!r} in {location}: {[f.render() for f in found]}"


@needs_engine
@pytest.mark.parametrize(
    ("image", "rule", "term"),
    [
        ("assets/seeded-shot-vocabulary.png", "tracked-entity", "detection"),
        ("assets/seeded-shot-vocabulary.png", "tracked-entity", "tracklet"),
        ("assets/seeded-shot-address-bar.png", "address-bar", "https://drogna.invalid"),
        ("assets/seeded-shot-host-path.png", "host-path", "/home/jdoe"),
        ("assets/seeded-shot-email.png", "personal-identifier", "j.doe@example.invalid"),
    ],
)
def test_the_image_path_names_each_seeded_term(
    image: str, rule: str, term: str, seeded: list[gate.Finding]
) -> None:
    """T018's edge case in four pieces: an address bar, a filesystem path, an email."""
    found = seeded
    named = [f for f in found if f.location == image and f.rule == rule and term in f.matched]
    assert named, f"{rule} was not reported for {term!r} in {image}: {[f.render() for f in found]}"


@needs_engine
def test_every_seeded_image_still_reads() -> None:
    """An illegible control is not a control, and would look exactly like a clean run."""
    for image in sorted((SEEDED / "assets").glob("*.png")):
        assert gate.ocr(image, ENGINE).strip(), f"{image.name} OCRs to nothing"


# --- the refusals --------------------------------------------------------------------


def test_no_engine_is_a_refusal_to_run(tmp_path: Path) -> None:
    """No OCR engine and images present: exit 2, naming what is missing. Never 0."""
    empty = tmp_path / "bin"
    empty.mkdir()
    result = run("--site", str(SEEDED), path=str(empty))
    assert result.returncode == 2, result.stdout + result.stderr
    assert "cannot run" in result.stdout
    assert "tesseract" in result.stdout
    assert "0 findings" not in result.stdout


def test_a_site_that_is_not_there_is_a_refusal_to_run(tmp_path: Path) -> None:
    result = run("--site", str(tmp_path / "nowhere"))
    assert result.returncode == 2
    assert "cannot run" in result.stdout


def test_a_clean_tree_passes(tmp_path: Path) -> None:
    """A gate that fails correct output is worse than none: it teaches people to ignore it."""
    page = tmp_path / "index.html"
    page.write_text(
        "<html><body><p>drogna is a learning harness. Its data is synthetic and its "
        "numerics are deliberately fake. Read the "
        '<a href="https://docs.ogc.org/is/">standard</a>.</p></body></html>',
        encoding="utf-8",
    )
    result = run("--site", str(tmp_path))
    assert result.returncode == 0, result.stdout
    assert "vocabulary: 0 findings" in result.stdout


# --- the pieces the rules stand on ----------------------------------------------------


def test_ocr_sentence_spacing_is_repaired_before_matching() -> None:
    """The engine puts a space after a full stop, and the repair is load-bearing.

    `j.doe@example. invalid` is what a leaked address looks like once it has been read.
    Matching the raw output would let the exact thing this check exists for walk past.
    """
    raw = "From: j.doe@example. invalid"
    assert not gate.EMAIL.search(raw)
    assert gate.EMAIL.search(gate.repair_ocr(raw))


def test_a_one_line_document_is_not_one_permission(tmp_path: Path) -> None:
    """`permitted` is asked about a window, not a whole line.

    The built tree holds documents that are one line long. Asking such a line whether it
    is permitted hands a blanket pass to every match in the file the moment one permitted
    phrase appears anywhere in it — and the search index is exactly that shape.
    """
    padding = "x" * (gate.CONTEXT * 2)
    fragment = gate.Fragment(
        "search/search_index.json",
        1,
        gate.ASSET,
        f'{{"a": "a tracked file", "b": "{padding}", "c": "one detection"}}',
    )
    hits = [rule for rule, _, _ in gate.rule_hits(fragment)]
    assert "tracked-entity" in hits


def test_svg_path_data_is_not_read_as_prose() -> None:
    """Every page of this site carries `2.41.44.82` inside an SVG path. It is geometry."""
    page = '<svg><path d="M12 22l-2.41-3.44c.74.27 2.41.44.82 0"/></svg><p>real prose</p>'
    split = gate._Split()
    split.feed(page)
    split.close()
    prose = " ".join(text for _, zone, text in split.fragments if zone == gate.PROSE)
    assert "real prose" in prose
    assert "2.41.44.82" not in prose
