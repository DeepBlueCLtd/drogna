"""The external-resource gate, and the proof that it can fail (015 T009, FR-007, SC-004).

`site/tools/check_no_external_resources.py` is the oldest gate in this feature and, until
this file was written, the only one with no test and no control. It reported zero findings
over the real built site on every run, and zero was read as the property holding — but a
gate that has never been watched failing is worth nothing, and this one would report the
same zero if its patterns had quietly stopped matching. Two of the four had never been
executed against anything at all.

So the assertions here are in pairs. Every pattern is watched catching a violation planted
for it in `site/gates/fixtures/external_reference/`, and the two references the gate must
*not* report — an outbound hyperlink, and a same-origin sub-resource — are watched being
left alone. A change that made the gate flag a hyperlink would leave the fixture red and
would still be a regression.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
ROOT = GATES.parents[1]
GATE = ROOT / "site" / "tools" / "check_no_external_resources.py"
FIXTURE = GATES / "fixtures" / "external_reference" / "built"

CLEAN, FINDINGS, MISUSED = 0, 1, 2


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


@pytest.fixture(scope="module")
def seeded() -> subprocess.CompletedProcess[str]:
    """One run over the deliberate control, shared by the assertions about it."""
    return run(str(FIXTURE))


@pytest.fixture(scope="module")
def reported(seeded: subprocess.CompletedProcess[str]) -> str:
    """Everything the run said, on either stream.

    The gate writes its findings to standard error. Asserting against standard output
    alone passed on an empty string for every one of these, which is the same shape of
    silent pass this file exists to rule out.
    """
    return seeded.stdout + seeded.stderr


def test_the_gate_script_is_where_the_workflow_says_it_is() -> None:
    """A test that ran the wrong file would pass while gating nothing."""
    assert GATE.is_file()


def test_the_seeded_control_fails(seeded: subprocess.CompletedProcess[str]) -> None:
    assert seeded.returncode == FINDINGS, seeded.stdout + seeded.stderr


def test_a_stylesheet_from_another_origin_is_caught(reported: str) -> None:
    assert "cdn.example.invalid/theme/material.css" in reported


def test_a_script_from_another_origin_is_caught(reported: str) -> None:
    assert "cdn.example.invalid/analytics.js" in reported


def test_a_protocol_relative_script_is_caught(reported: str) -> None:
    """`//host/path` inherits the page's scheme and is still another origin."""
    assert "//cdn.example.invalid/legacy.js" in reported


def test_an_image_from_another_origin_is_caught(reported: str) -> None:
    assert "images.example.invalid/plot.png" in reported


def test_a_srcset_from_another_origin_is_caught(reported: str) -> None:
    """`srcset` fetches as surely as `src`, and is the easier one to forget."""
    assert "images.example.invalid/plot-2x.png" in reported


def test_a_css_url_from_another_origin_is_caught(reported: str) -> None:
    assert "fonts.example.invalid/something.woff2" in reported


def test_a_css_import_from_another_origin_is_caught(reported: str) -> None:
    assert "fonts.example.invalid/css?family=Something" in reported


def test_every_file_carrying_a_violation_is_named(reported: str) -> None:
    """A finding nobody can locate is a finding nobody will fix."""
    assert "index.html" in reported
    assert "assets/theme.css" in reported


def test_an_outbound_hyperlink_is_not_reported(reported: str) -> None:
    """The one external reference the site is *supposed* to carry.

    A gate that flagged this would forbid citing a standards document, which would make it
    unusable and would get it turned off rather than obeyed.
    """
    assert "docs.ogc.org" not in reported


def test_a_same_origin_sub_resource_is_not_reported(reported: str) -> None:
    assert "/assets/local.js" not in reported
    assert "/assets/local.png" not in reported


def test_a_tree_with_nothing_external_is_clean(tmp_path: Path) -> None:
    """The other half of the pair: the gate is capable of reporting zero, too."""
    (tmp_path / "index.html").write_text(
        '<html><head><link rel="stylesheet" href="/assets/theme.css"></head>'
        '<body><a href="https://docs.ogc.org/">a hyperlink</a>'
        '<script src="assets/local.js"></script></body></html>',
        encoding="utf-8",
    )
    result = run(str(tmp_path))
    assert result.returncode == CLEAN, result.stdout + result.stderr


def test_a_directory_that_does_not_exist_is_refused_rather_than_reported_clean(
    tmp_path: Path,
) -> None:
    """Exit 0 on a path the gate never read is the failure shape this repository keeps
    finding: a check that examined nothing and looked exactly like a clean run."""
    result = run(str(tmp_path / "no-such-build"))
    assert result.returncode == MISUSED, result.stdout + result.stderr
