"""Each gate is run against a planted violation and asserted to report it.

A gate that has never failed is not a gate. These tests exist because a lint gate that
silently stops matching — a renamed module, a changed regular expression, an exclusion
that grew too wide — looks exactly like a clean tree. The only way to tell the two apart
is to hand it something that must be caught.

Fixtures are stored as `.py.fixture` and copied to a temporary directory under a neutral
name before a gate is pointed at them. Two details make that necessary rather than fussy.
The `.py.fixture` suffix keeps them out of the repository-wide walk, so a planted
violation never fails the real gate run. The neutral location matters more: the wall-clock
and literal-path gates deliberately treat any path under a `tests/` directory as a
permitted zone, so a fixture left beside this file would be exempted for being a fixture,
and every assertion below would pass without the gate having examined anything.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "gates"


def run_gate(gate: str, fixture: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    """Copy a fixture out of the test tree and run one gate against it."""
    planted = tmp_path / f"probe_{fixture}"
    shutil.copyfile(FIXTURES / f"{fixture}.fixture", planted)
    return subprocess.run(
        [sys.executable, str(SCRIPTS / f"{gate}.py"), str(planted)],
        capture_output=True,
        text=True,
        check=False,
    )


CAUGHT = [
    ("check_no_wallclock", "wallclock_violation.py", "time.time"),
    ("check_seeded_rng", "seeded_rng_violation.py", "random.random"),
    ("check_no_literal_paths", "literal_path_violation.py", "/var/lib/drogna"),
    ("check_forbidden_vocabulary", "vocabulary_violation.py", "contact"),
    # The pattern-matching halves. Each gate names TypeScript and SQL constructs that no
    # syntax tree examines, so each pattern needs its own planted violation: a regular
    # expression that has quietly stopped matching looks exactly like a clean tree (T033).
    ("check_no_wallclock", "wallclock_violation.ts", "Date.now"),
    ("check_no_wallclock", "wallclock_violation.sql", "now()"),
    ("check_seeded_rng", "seeded_rng_violation.ts", "Math.random"),
    ("check_seeded_rng", "seeded_rng_violation.sql", "gen_random_uuid"),
    ("check_no_literal_paths", "literal_path_violation.ts", "query.local"),
    ("check_no_literal_paths", "literal_path_violation.sql", "/var/lib/drogna"),
]


@pytest.mark.parametrize(("gate", "fixture", "expected"), CAUGHT)
def test_the_gate_reports_a_planted_violation(
    gate: str, fixture: str, expected: str, tmp_path: Path
) -> None:
    result = run_gate(gate, fixture, tmp_path)

    assert result.returncode != 0, f"{gate} passed a file containing a deliberate violation"
    assert expected in result.stdout + result.stderr


PERMITTED = [
    ("check_no_wallclock", "wallclock_clean.py"),
    ("check_seeded_rng", "seeded_rng_clean.py"),
    ("check_no_literal_paths", "literal_path_clean.py"),
    ("check_no_wallclock", "wallclock_clean.ts"),
    ("check_no_wallclock", "wallclock_clean.sql"),
    ("check_seeded_rng", "seeded_rng_clean.ts"),
    ("check_seeded_rng", "seeded_rng_clean.sql"),
    ("check_no_literal_paths", "literal_path_clean.ts"),
    ("check_no_literal_paths", "literal_path_clean.sql"),
]


@pytest.mark.parametrize(("gate", "fixture"), PERMITTED)
def test_the_gate_passes_correct_code(gate: str, fixture: str, tmp_path: Path) -> None:
    """A gate that fails correct code is worse than no gate: it teaches people to ignore it."""
    result = run_gate(gate, fixture, tmp_path)

    assert result.returncode == 0, (
        f"{gate} rejected code that obeys the principle:\n{result.stdout}{result.stderr}"
    )


EXEMPT_WITH_REASON = [
    # Python markers are read from comment tokens; TypeScript and SQL markers are read
    # from a line scan over their own comment syntaxes. Each parsing path gets a fixture,
    # because each is a place the marker could quietly stop being recognised (T033).
    ("check_no_wallclock", "wallclock_exempt_with_reason.py"),
    ("check_no_wallclock", "wallclock_exempt_with_reason.ts"),
    ("check_no_literal_paths", "literal_path_exempt_with_reason.sql"),
]


@pytest.mark.parametrize(("gate", "fixture"), EXEMPT_WITH_REASON)
def test_an_exemption_with_a_reason_is_honoured(gate: str, fixture: str, tmp_path: Path) -> None:
    result = run_gate(gate, fixture, tmp_path)

    assert result.returncode == 0, (
        f"a reasoned exemption was rejected by {gate}:\n{result.stdout}{result.stderr}"
    )


EXEMPT_BARE = [
    ("check_no_wallclock", "wallclock_exempt_bare.py"),
    ("check_no_wallclock", "wallclock_exempt_bare.ts"),
    ("check_no_literal_paths", "literal_path_exempt_bare.sql"),
]


@pytest.mark.parametrize(("gate", "fixture"), EXEMPT_BARE)
def test_an_exemption_without_a_reason_exempts_nothing(
    gate: str, fixture: str, tmp_path: Path
) -> None:
    """The marker is a place to record why, not a way to switch the gate off."""
    result = run_gate(gate, fixture, tmp_path)

    assert result.returncode != 0, "a bare marker silently disabled the gate"
    assert "no reason" in result.stdout + result.stderr
