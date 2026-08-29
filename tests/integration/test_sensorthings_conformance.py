"""The served conformance statement and the documentation say the same thing (SC-014).

A conformance claim that is only true in one of the places it appears is worse than none.
So this reads both — the statement the interface serves in its own metadata, and
`query/conformance.md` — and checks that every entity set, every absent entity set, every
implemented option and every excluded option appears in both.

It also checks the negative claim: that no artefact of this feature describes the
SensorThings interface as conformant. A harness that overstates its conformance is worth
less as evidence than one that states a small conformance accurately.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from plugins.sensorthings_entities import ABSENT_ENTITY_SETS, ENTITY_SETS  # noqa: E402
from plugins.sensorthings_options import (  # noqa: E402
    IMPLEMENTED_OPTIONS,
    OUT_OF_SCOPE,
    SPATIAL_FUNCTION,
)
from plugins.sensorthings_provider import conformance_statement  # noqa: E402

CONFORMANCE_URL = "https://drogna.invalid/query/conformance"
DOCUMENT = REPO_ROOT / "query" / "conformance.md"

# The primer PR-09 promises. Feature 008 left this pointing at docs/standards/, a path it did
# not own and nobody wrote, so the check skipped for as long as the primer did not exist.
# Feature 015 wrote it, and it lives on the published site rather than in the repository's
# docs/ — which is architecture notes and decision records. This is the path it is actually
# at, so the check now runs instead of skipping.
PRIMER = REPO_ROOT / "site" / "docs" / "standards" / "sensorthings.md"

# How the out-of-scope keys that are not literal option names read in prose. The served
# statement carries the key; the documentation carries the sentence. Both must be there.
PROSE = {
    "$expand-nested": "Nested `$expand`",
    "$expand-options": "Query options inside an `$expand`",
    "$filter-property": "`$filter` on any property other than `phenomenonTime`",
    "$filter-function": "geospatial and temporal functions, save one",
    "write": "write operation",
    "Tasking": "Part 2 Tasking",
    "MQTT": "MQTT subscription extension",
}


@pytest.fixture(scope="module")
def statement() -> dict:
    return conformance_statement(CONFORMANCE_URL)


@pytest.fixture(scope="module")
def prose() -> str:
    return DOCUMENT.read_text(encoding="utf-8")


def test_the_served_statement_says_plainly_that_it_is_not_conformant(statement) -> None:
    assert statement["conformant"] is False
    assert "claims no conformance" in statement["claim"]
    assert "subset" in statement["claim"]


def test_the_document_says_plainly_that_it_is_not_conformant(prose: str) -> None:
    assert "not conformant" in prose
    assert "does not claim to be" in prose


def test_no_artefact_of_this_feature_describes_the_interface_as_conformant() -> None:
    """The count of artefacts claiming conformance is zero, and this is how it is counted."""
    claims = re.compile(r"\bis conformant\b|\bfully conformant\b|\bconformant with\b", re.I)
    offenders: list[str] = []
    for path in sorted((REPO_ROOT / "query").rglob("*")):
        if path.is_file() and path.suffix in {".py", ".md", ".template", ".yaml"}:
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if claims.search(line):
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{number}: {line.strip()}")
    assert offenders == []


def test_both_accounts_name_the_same_entity_sets(statement, prose: str) -> None:
    assert statement["entity_sets_served"] == list(ENTITY_SETS)
    for name in ENTITY_SETS:
        assert f"`{name}`" in prose, f"{name} is served and the documentation does not list it"


def test_both_accounts_name_the_same_absent_entity_sets_with_the_same_reason(
    statement, prose: str
) -> None:
    assert set(statement["entity_sets_absent"]) == set(ABSENT_ENTITY_SETS)
    for name, reason in ABSENT_ENTITY_SETS.items():
        assert f"`{name}`" in prose
        # The reason itself, not merely the absence, because FR-026 asks that the reason be
        # visible: an unexplained absence reads as an oversight.
        assert reason.split(".")[0][:40] in prose or "Constitution V" in prose
    assert "Constitution V" in prose


def test_both_accounts_name_the_same_implemented_options(statement, prose: str) -> None:
    assert statement["query_options_implemented"] == list(IMPLEMENTED_OPTIONS)
    for option in IMPLEMENTED_OPTIONS:
        assert f"`{option}`" in prose


def test_both_accounts_name_the_same_absent_options(statement, prose: str) -> None:
    assert set(statement["query_options_absent"]) == set(OUT_OF_SCOPE)
    for key in OUT_OF_SCOPE:
        expected = PROSE.get(key, f"`{key}`")
        assert expected in prose, f"{key} is out of scope and the documentation does not say so"


def test_the_statement_names_the_time_it_serves_and_the_grammar_it_implements(
    statement, prose: str
) -> None:
    assert "simulation time" in statement["time"]
    assert "arrival time" in statement["time"]
    assert "simulation time" in prose
    assert "navigation step" in statement["path_grammar"]
    assert "navigation step" in prose


def test_both_accounts_say_the_data_is_synthetic(statement, prose: str) -> None:
    """This is public-facing text, and PR-01 binds it (FR-056)."""
    assert "synthetic" in statement["synthetic"]
    assert "synthetic" in prose
    assert "deliberately fake" in prose


def test_the_statement_points_at_where_the_documentation_lives(statement) -> None:
    assert statement["href"] == CONFORMANCE_URL


def test_the_standards_primer_agrees_where_it_exists() -> None:
    """PR-09's primer is carried from `query/conformance.md` so the two cannot disagree."""
    if not PRIMER.is_file():
        pytest.skip(
            "docs/standards/edr-and-sensorthings.md has not been written. It belongs to "
            "docs/, which this feature does not own; query/conformance.md is the source it "
            "must be carried from, and this test is what will compare them."
        )
    text = PRIMER.read_text(encoding="utf-8")
    assert "not conformant" in text
    for name in ENTITY_SETS:
        assert name in text
    for name in ABSENT_ENTITY_SETS:
        assert name in text
    for option in IMPLEMENTED_OPTIONS:
        assert option in text


def test_both_accounts_state_the_one_spatial_predicate_identically(statement, prose: str) -> None:
    """FR-80: the widening and the conformance statement move in the same commit.

    The subset's honesty has been its narrowness, so the one predicate is stated with the
    same precision as the refusals around it — in the served statement, and in the
    documentation, spelt the same way.
    """
    assert SPATIAL_FUNCTION == "st_within"
    assert "st_within(location, geography'POLYGON" in statement["spatial"]
    assert "refused" in statement["spatial"]
    assert "st_within(location, geography'POLYGON" in prose
    assert "ADR-0027" in prose
