"""The binary-access assumption is a deliverable, not documentation of one (FR-009).

`docs/adr/README.md` has linked to ADR-0001 since the repository's first commit, and the
record it linked to did not exist. That is the failure this file exists to stop happening
again: a table row is a claim, and a claim nothing checks is a claim that decays.

Constitution X rests on the decision recorded there. If it softened to tiered access the
architecture would change materially — a filtering component, a user model, and FR-42's
gates moved onto a different artefact — so the record has to say what would change, and
this asserts that it does rather than trusting that it did.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ADR = REPOSITORY_ROOT / "docs" / "adr" / "0001-binary-access.md"
INDEX = REPOSITORY_ROOT / "docs" / "adr" / "README.md"
CONSTITUTION = REPOSITORY_ROOT / ".specify" / "memory" / "constitution.md"


@pytest.fixture(scope="module")
def record() -> str:
    assert ADR.is_file(), (
        f"{ADR} does not exist; FR-009 asks for the decision, not a plan to make it"
    )
    return ADR.read_text(encoding="utf-8")


def test_it_carries_the_four_required_parts(record: str) -> None:
    """Status, Context, Decision, Consequences — the shape every ADR here has.

    Status is a field rather than a heading in this repository's ADRs, and the other three
    are headings. Both spellings are checked as they are actually written, because a test
    that demanded a shape none of the twelve existing records use would be asserting a
    convention rather than the one in force.
    """
    assert re.search(r"^\*\*Status:\*\*\s+\S+", record, re.MULTILINE)
    for heading in ("Context", "Decision", "Consequences"):
        assert re.search(rf"^##\s+{heading}\s*$", record, re.MULTILINE), heading


def test_it_names_tiered_access_as_the_rejected_alternative(record: str) -> None:
    context = record.split("## Decision", 1)[0].lower()

    assert "tiered access" in context
    assert "rejected" in context


def test_it_says_what_would_change_if_the_assumption_softened(record: str) -> None:
    """The point of the record. From the outside, adding a tier looks like a configuration line."""
    consequences = record.split("## Consequences", 1)[1].lower()

    assert "softened" in consequences or "softens" in consequences
    for change in ("component", "user model", "supersed"):
        assert change in consequences, change


def test_it_records_that_no_response_body_is_altered(record: str) -> None:
    """FR-005 is the operative half of the decision, and belongs in the record, not only in code."""
    assert "sub_filter" in record
    assert "per-field redaction" in record


def test_the_index_links_to_it_and_says_it_is_accepted() -> None:
    row = next(
        line
        for line in INDEX.read_text(encoding="utf-8").splitlines()
        if "0001-binary-access" in line
    )

    assert "Accepted" in row, "the index still calls ADR-0001 a proposal, and it is a decision"


def test_the_constitution_points_at_it() -> None:
    """SC-007. Principle X is the principle this record is the argument for."""
    principle = CONSTITUTION.read_text(encoding="utf-8").split("### X. Default Deny", 1)[1]

    assert "ADR-0001" in principle.split("###", 1)[0]
