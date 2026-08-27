"""The fixed-sleep gate, run against a planted violation and against correct code.

016-visual-capture's FR-019 says every wait in every capture path is on the client's
readiness signal, and SC-011 asks for a lint rule over ``client/e2e/`` and
``scripts/capture/``. A lint rule that has never been seen to fire is worth nothing: a
regular expression that has stopped matching looks exactly like a tree with no sleeps in it.

Fixtures are copied out of this directory before the gate is pointed at them, for the same
reason the other gates' fixtures are: the ``.fixture`` suffix keeps a planted violation out
of the repository-wide walk, and a neutral location keeps it out of any permitted zone.
This gate has no test-path exemption — ``client/e2e/tests/`` and the ``.spec.ts`` files are
the capture paths — but the fixtures are copied anyway, so that adding one later cannot
quietly make these assertions vacuous.

A separate file from ``test_gates_fail.py`` on purpose: that one is shared, several agents
work on this tree at once, and a gate's own tests are the last thing that should be lost to
a merge.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "gates"
GATE = SCRIPTS / "check_no_fixed_sleep.py"


def run(fixture: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    planted = tmp_path / f"probe_{fixture}"
    shutil.copyfile(FIXTURES / f"{fixture}.fixture", planted)
    return subprocess.run(
        [sys.executable, str(GATE), str(planted)],
        capture_output=True,
        text=True,
        check=False,
    )


def test_a_planted_sleep_is_reported(tmp_path: Path) -> None:
    result = run("fixed_sleep_violation.ts", tmp_path)

    assert result.returncode != 0, "the gate passed a capture path containing a fixed delay"
    assert "waitForTimeout" in result.stdout + result.stderr


def test_a_wait_on_the_application_is_permitted(tmp_path: Path) -> None:
    """A gate that fails correct code is worse than no gate: it teaches people to ignore it."""
    result = run("fixed_sleep_clean.ts", tmp_path)

    assert result.returncode == 0, (
        f"the gate rejected a capture that waits on a readiness signal:\n"
        f"{result.stdout}{result.stderr}"
    )


def test_a_marker_without_a_reason_exempts_nothing(tmp_path: Path) -> None:
    result = run("fixed_sleep_exempt_bare.ts", tmp_path)

    assert result.returncode != 0, "a bare marker silently disabled the gate"
    assert "no reason" in result.stdout + result.stderr


def test_the_capture_directories_are_clean(tmp_path: Path) -> None:
    """The rule over the real tree, which is what SC-011 actually asks for."""
    result = subprocess.run(
        [sys.executable, str(GATE)],
        capture_output=True,
        text=True,
        check=False,
        cwd=SCRIPTS.parent,
    )

    assert result.returncode == 0, f"{result.stdout}{result.stderr}"
    assert "clean" in result.stdout
