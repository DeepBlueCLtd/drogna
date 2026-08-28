"""`mkdocs build --strict` rejects a broken internal link, watched (015 T024, FR-019).

T024 asked for `site/gates/check_links.py` and its test. This closes it differently and the
difference is the point.

The property — zero broken internal links, with a link to a repository file that is not
published counting as broken — is already held, by `mkdocs build --strict` over a
`validation:` block that raises omitted files, absolute links, unrecognised links and
dangling anchors to warnings, which `--strict` turns into errors. Writing a second link
checker would put two authorities over one property, and this repository has already
written down what that costs: `docs/manifest.yaml` declines to restate the per-image size
cap for exactly this reason.

What was actually missing was evidence. **Nobody had ever watched `--strict` reject
anything.** A `validation:` block relaxed to `ignore`, or a `--strict` dropped from a
workflow argument list, would leave every build green with broken links published, and no
test would have said so. `site/gates/fixtures/broken_link/` is the control that closes that,
and this file is what makes the observation repeatable rather than something somebody did
once in a terminal.

**Where this runs.** mkdocs is deliberately outside the `uv` workspace (ADR-0010), so under
`uv run pytest` there is no mkdocs and these tests **skip, loudly and with the reason**.
They never fail for want of it and they never quietly pass. In CI they run in the `site`
job, which installs the pinned site tooling, and a contributor gets them by running pytest
from the same environment they build the site with.
"""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
ROOT = GATES.parents[1]
FIXTURE = GATES / "fixtures" / "broken_link"
SITE_CONFIG = ROOT / "site" / "mkdocs.yml"

HAVE_MKDOCS = importlib.util.find_spec("mkdocs") is not None

needs_mkdocs = pytest.mark.skipif(
    not HAVE_MKDOCS,
    reason=(
        "mkdocs is not importable by this interpreter, and it is deliberately outside the "
        "uv workspace (ADR-0010). Install site/requirements.txt and run pytest from that "
        "environment. Skipped rather than passed: a build nobody ran has rejected nothing."
    ),
)

# The faults planted in the fixture, and the text mkdocs uses to report each. Written out
# rather than matched loosely, because "the build failed" is the assertion that would still
# pass if --strict were failing for some unrelated reason.
FAULTS = {
    "unrecognized_links: a page that does not exist": "does-not-exist.md",
    "unrecognized_links: a repository file that is not published": "run_gates.py",
    "anchors: an anchor that is not on the page named": "no-such-heading",
    "absolute_links: an absolute link": "absolute link",
    "omitted_files: a page absent from the navigation": "unpublished.md",
}


def build(config: Path, out: Path, strict: bool = True) -> subprocess.CompletedProcess[str]:
    arguments = [sys.executable, "-m", "mkdocs", "build", "--config-file", str(config)]
    if strict:
        arguments.append("--strict")
    arguments += ["--site-dir", str(out)]
    return subprocess.run(arguments, capture_output=True, text=True, check=False, cwd=ROOT)


def reported(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout + result.stderr


def corrected(tmp_path: Path) -> Path:
    """The same fixture with its links repaired, so success is a property of the links."""
    target = tmp_path / "corrected"
    shutil.copytree(FIXTURE, target)
    (target / "docs" / "index.md").write_text(
        "# A page whose links resolve\n\n"
        "A link to [a published page](published.md), and to "
        "[a heading on it](published.md#published).\n",
        encoding="utf-8",
    )
    config = target / "mkdocs.yml"
    config.write_text(
        config.read_text(encoding="utf-8").replace(
            "  - Published: published.md\n",
            "  - Published: published.md\n  - Unpublished: unpublished.md\n",
        ),
        encoding="utf-8",
    )
    return config


# --- the fixture is evidence about the real configuration, not about its own ---------


def test_the_fixture_validates_on_the_same_terms_as_the_real_site() -> None:
    """The copied `validation:` block still matches `site/mkdocs.yml`.

    Without this, relaxing the real site's validation would leave the control below still
    green — proving that settings the site no longer uses would have caught the fault.
    """

    def validation(path: Path) -> list[str]:
        lines = path.read_text(encoding="utf-8").splitlines()
        start = lines.index("validation:")
        block: list[str] = []
        for line in lines[start + 1 :]:
            if line.strip() and not line.startswith((" ", "\t")):
                break
            if line.strip():
                block.append(line.strip())
        return sorted(block)

    assert validation(FIXTURE / "mkdocs.yml") == validation(SITE_CONFIG)


def test_the_real_site_still_asks_for_strict_validation() -> None:
    """A `validation:` block deleted outright would make the comparison above vacuous."""
    assert "validation:" in SITE_CONFIG.read_text(encoding="utf-8")


# --- --strict rejects -----------------------------------------------------------------


@needs_mkdocs
def test_the_control_is_refused_under_strict(tmp_path: Path) -> None:
    result = build(FIXTURE / "mkdocs.yml", tmp_path / "out")
    assert result.returncode != 0, reported(result)


@needs_mkdocs
@pytest.mark.parametrize("fault,evidence", sorted(FAULTS.items()))
def test_each_planted_fault_is_named(tmp_path: Path, fault: str, evidence: str) -> None:
    """Every rule the real site raises is watched catching its own case.

    Parametrised so a rule that stopped reporting is one named failure rather than a
    disappearance inside a single assertion about the whole log.
    """
    output = reported(build(FIXTURE / "mkdocs.yml", tmp_path / "out"))
    assert evidence in output, f"{fault} was not reported:\n{output}"


@needs_mkdocs
def test_it_is_strict_that_refuses_and_not_the_fixture_being_unbuildable(
    tmp_path: Path,
) -> None:
    """Without `--strict` the same tree builds, warnings and all.

    This is what says the rejection above comes from the flag under test rather than from
    a fixture that is simply broken — which would make every assertion here about nothing.
    """
    result = build(FIXTURE / "mkdocs.yml", tmp_path / "lax", strict=False)
    assert result.returncode == 0, reported(result)


# --- and is capable of accepting ------------------------------------------------------


@needs_mkdocs
def test_the_same_fixture_with_its_links_repaired_builds(tmp_path: Path) -> None:
    """A checker that refuses everything is no more use than one that refuses nothing."""
    result = build(corrected(tmp_path), tmp_path / "out")
    assert result.returncode == 0, reported(result)


@needs_mkdocs
def test_the_real_site_builds_under_strict(tmp_path: Path) -> None:
    result = build(SITE_CONFIG, tmp_path / "real")
    assert result.returncode == 0, reported(result)
