"""The ADR numbering gate, and the duplicate that was real before it was a fixture.

The gate exists because two branches took the same next number twice in one afternoon —
lane C took 0022, lane D took 0023 — while a third held each in flight. Adding
`0023-a.md` and adding `0023-b.md` is not a textual conflict, so git merged both without
a word; the collision was visible only because both lanes had also edited the same line
of `docs/adr/README.md`. Every test here hands the gate a directory it can reach a
conclusion about, and the first one is that collision.

The committed records are checked too, in both directions, because a gate that has only
ever been run against fixtures has never been run against the thing it guards.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

GATES = Path(__file__).resolve().parents[1]
GATE = GATES / "check_adr_numbers.py"
ROOT = GATES.parents[1]
RECORDS = ROOT / "docs" / "adr"

CLEAN, FINDINGS, CANNOT_RUN = 0, 1, 2

INDEX_HEADER = "# Architecture Decision Records\n\n| # | Title | Status |\n|---|---|---|\n"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(GATE), "--site", "unused", *arguments],
        capture_output=True,
        text=True,
        check=False,
        cwd=ROOT,
    )


def records_at(tmp_path: Path, records: dict[str, str], indexed: dict[str, str] | None) -> Path:
    """A stand-in records directory: `records` become files, `indexed` become rows.

    `indexed` defaults to a row per record, which is the state the repository is meant to
    be in; a test that wants the index to disagree passes its own.
    """
    directory = tmp_path / "adr"
    directory.mkdir()
    for name, title in records.items():
        (directory / name).write_text(f"# {title}\n\n**Status:** Accepted\n", encoding="utf-8")
    rows = {name: title for name, title in (indexed or records).items()}
    index = INDEX_HEADER + "".join(
        f"| [{name[:4]}]({name}) | {title} | Accepted |\n" for name, title in rows.items()
    )
    (directory / "README.md").write_text(index, encoding="utf-8")
    return directory


def test_two_records_claiming_one_number_are_reported(tmp_path: Path) -> None:
    """The fault that produced this gate, in the shape it actually arrived in."""
    directory = records_at(
        tmp_path,
        {
            "0022-generator-selection.md": "ADR-0022: generators",
            "0023-the-advisory-store.md": "ADR-0023: the advisory store",
            "0023-authenticates-by-trust.md": "ADR-0023: trust authentication",
        },
        None,
    )
    result = run("--records", str(directory))
    assert result.returncode == FINDINGS, result.stdout
    assert "adr-numbers.duplicate" in result.stdout
    assert "2 records claim ADR-0023" in result.stdout
    # Both are named: a report that says "somewhere" is a report nobody can act on.
    assert "0023-the-advisory-store.md" in result.stdout
    assert "0023-authenticates-by-trust.md" in result.stdout


def test_a_record_the_index_does_not_list_is_reported(tmp_path: Path) -> None:
    """The hole `check_adr.py` cannot see: the published index is generated, this one is typed."""
    directory = records_at(
        tmp_path,
        {"0001-first.md": "ADR-0001: first", "0002-second.md": "ADR-0002: second"},
        {"0001-first.md": "ADR-0001: first"},
    )
    result = run("--records", str(directory))
    assert result.returncode == FINDINGS, result.stdout
    assert "adr-numbers.unindexed" in result.stdout
    assert "ADR-0002" in result.stdout


def test_a_row_naming_a_file_that_does_not_exist_is_reported(tmp_path: Path) -> None:
    directory = records_at(tmp_path, {"0001-first.md": "ADR-0001: first"}, None)
    index = directory / "README.md"
    index.write_text(
        index.read_text(encoding="utf-8").replace("0001-first.md)", "0001-renamed.md)"),
        encoding="utf-8",
    )
    result = run("--records", str(directory))
    assert result.returncode == FINDINGS, result.stdout
    assert "adr-numbers.dangling" in result.stdout


def test_a_file_that_is_not_a_record_is_reported(tmp_path: Path) -> None:
    directory = records_at(tmp_path, {"0001-first.md": "ADR-0001: first"}, None)
    (directory / "notes.md").write_text("stray\n", encoding="utf-8")
    result = run("--records", str(directory))
    assert result.returncode == FINDINGS, result.stdout
    assert "adr-numbers.unrecognised" in result.stdout


def test_a_gap_in_the_numbering_is_not_a_finding(tmp_path: Path) -> None:
    """There is no ADR-0017, on purpose. A gate demanding a contiguous run would be wrong."""
    directory = records_at(
        tmp_path,
        {"0016-sixteen.md": "ADR-0016: sixteen", "0018-eighteen.md": "ADR-0018: eighteen"},
        None,
    )
    result = run("--records", str(directory))
    assert result.returncode == CLEAN, result.stdout


@pytest.mark.parametrize(
    ("populate", "expected"),
    [
        (lambda directory: None, "holds no record this gate recognises"),
        (lambda directory: (directory / "README.md").unlink(), "no index at"),
    ],
)
def test_a_directory_it_cannot_conclude_about_is_a_refusal_not_a_pass(
    tmp_path: Path, populate, expected: str
) -> None:
    """An empty run is not a clean one, in either direction."""
    directory = records_at(tmp_path, {"0001-first.md": "ADR-0001: first"}, None)
    for record in directory.glob("0*.md"):
        record.unlink()
    populate(directory)
    result = run("--records", str(directory))
    assert result.returncode == CANNOT_RUN, result.stdout
    assert expected in result.stderr


def test_a_missing_directory_is_a_refusal(tmp_path: Path) -> None:
    result = run("--records", str(tmp_path / "absent"))
    assert result.returncode == CANNOT_RUN
    assert "no records directory" in result.stderr


def test_the_committed_records_are_clean() -> None:
    """Against the tree, not a fixture. The gate guards this directory or nothing."""
    result = run("--records", str(RECORDS))
    assert result.returncode == CLEAN, result.stdout
