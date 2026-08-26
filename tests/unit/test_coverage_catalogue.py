"""The catalogue resolves runs from the store, and refuses rather than guessing.

Four fixtures, because four states are the ones that matter: a complete run, an incomplete
one, two runs claiming to be current, and an empty store. Everything else the catalogue does
follows from getting those four right.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import query_layer_support as support  # noqa: E402
from plugins.coverage_catalogue import (  # noqa: E402
    CoverageCatalogue,
    derive_run_id,
    validate_manifest,
)
from plugins.errors import CatalogueError, CoverageStoreError  # noqa: E402


def test_a_complete_run_is_catalogued_and_current(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    catalogue = CoverageCatalogue(layout)

    entry = catalogue.current()
    assert entry.run_id == support.run_id_for(0)
    assert catalogue.identifiers() == [entry.run_id]
    assert entry.valid_time == (
        support.TIME_ORIGIN,
        "2026-09-01T04:00:00.000000Z",
    )


def test_an_incomplete_run_is_never_served_and_the_reason_is_reported(tmp_path: Path) -> None:
    layout = support.layout_for(tmp_path)
    support.write_run(layout, 0)
    partial = support.write_run(layout, 1, complete=False)
    support.set_current(layout, support.run_id_for(0))
    catalogue = CoverageCatalogue(layout)

    assert catalogue.identifiers() == [support.run_id_for(0)]
    reasons = dict(catalogue.incomplete())
    assert partial in reasons
    assert layout.uncertainty_file in reasons[partial]
    assert layout.manifest_file in reasons[partial]

    with pytest.raises(CatalogueError) as refusal:
        catalogue.entry(partial)
    assert partial in str(refusal.value)


def test_a_directory_being_written_is_invisible_while_it_carries_the_partial_suffix(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    in_flight = layout.runs_directory / (support.run_id_for(3) + layout.partial_suffix)
    in_flight.mkdir(parents=True)
    (in_flight / layout.forecast_file).write_bytes(b"not finished")

    assert CoverageCatalogue(layout).identifiers() == [support.run_id_for(0)]


def test_two_runs_claiming_to_be_current_refuse_to_resolve_and_report_both(
    tmp_path: Path,
) -> None:
    layout = support.layout_for(tmp_path)
    first = support.write_run(layout, 0)
    second = support.write_run(layout, 1)
    support.set_current(layout, first, second)

    with pytest.raises(CatalogueError) as refusal:
        CoverageCatalogue(layout).current()
    message = str(refusal.value)
    assert first in message
    assert second in message
    # Both runs stay addressable by their own identifiers: it is resolving *which is
    # current* that is refused, not serving either one.
    catalogue = CoverageCatalogue(layout)
    assert catalogue.entry(first).run_id == first
    assert catalogue.entry(second).run_id == second


def test_an_empty_store_lists_nothing_and_says_why_rather_than_failing(tmp_path: Path) -> None:
    layout = support.layout_for(tmp_path)
    layout.runs_directory.mkdir(parents=True)
    catalogue = CoverageCatalogue(layout)

    assert catalogue.identifiers() == []
    with pytest.raises(CatalogueError) as refusal:
        catalogue.current()
    assert layout.current_pointer in str(refusal.value)


def test_a_superseded_run_stays_addressable_by_its_own_identifier(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=3, current=2)
    catalogue = CoverageCatalogue(layout)

    assert catalogue.current().run_id == support.run_id_for(2)
    for sequence in (0, 1):
        assert catalogue.entry(support.run_id_for(sequence)).run_id == support.run_id_for(sequence)


def test_run_identifiers_derive_from_the_seed_and_the_sequence_alone() -> None:
    first = [
        derive_run_id(
            root_seed=support.ROOT_SEED,
            run_sequence=sequence,
            rule=support.RUN_ID_RULE,
            version=support.RUN_ID_VERSION,
            prefix=support.RUN_ID_PREFIX,
        )
        for sequence in range(4)
    ]
    second = [support.run_id_for(sequence) for sequence in range(4)]
    assert first == second

    # A different seed gives different identifiers, so two scenarios cannot collide.
    other = derive_run_id(
        root_seed=support.ROOT_SEED + 1,
        run_sequence=0,
        rule=support.RUN_ID_RULE,
        version=support.RUN_ID_VERSION,
        prefix=support.RUN_ID_PREFIX,
    )
    assert other != first[0]

    # And the rule's version is part of the input, so bumping it is visible.
    bumped = derive_run_id(
        root_seed=support.ROOT_SEED,
        run_sequence=0,
        rule=support.RUN_ID_RULE,
        version=support.RUN_ID_VERSION + 1,
        prefix=support.RUN_ID_PREFIX,
    )
    assert bumped != first[0]


def test_the_worked_examples_in_the_layout_document_are_the_ones_the_rule_produces() -> None:
    """The documentation quotes identifiers. A quoted identifier that has drifted is a trap."""
    text = (REPO_ROOT / "stores" / "coverage" / "layout.md").read_text(encoding="utf-8")
    for sequence in (0, 1, 2, 17):
        assert support.run_id_for(sequence) in text


def test_the_example_manifest_validates_against_the_convention_it_illustrates() -> None:
    path = REPO_ROOT / "stores" / "coverage" / "run-manifest.example.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    validate_manifest(document, source=path.name)
    assert document["run_id"] == support.run_id_for(document["run_sequence"])


def test_a_manifest_missing_a_key_is_refused_with_the_key_named(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run_id = support.run_id_for(0)
    manifest = json.loads(
        (layout.run_directory(run_id) / layout.manifest_file).read_text(encoding="utf-8")
    )
    del manifest["ensemble"]
    (layout.run_directory(run_id) / layout.manifest_file).write_text(
        json.dumps(manifest), encoding="utf-8"
    )

    with pytest.raises(CoverageStoreError) as refusal:
        validate_manifest(manifest, source=layout.manifest_file)
    assert "ensemble" in str(refusal.value)

    catalogue = CoverageCatalogue(layout)
    assert catalogue.identifiers() == []
    assert "ensemble" in dict(catalogue.incomplete())[run_id]


def test_a_manifest_naming_a_different_run_is_refused(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run_id = support.run_id_for(0)
    path = layout.run_directory(run_id) / layout.manifest_file
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["run_id"] = support.run_id_for(9)
    path.write_text(json.dumps(manifest), encoding="utf-8")

    reasons = dict(CoverageCatalogue(layout).incomplete())
    assert support.run_id_for(9) in reasons[run_id]


def test_the_catalogue_notices_a_run_appearing_without_being_asked_to_reread(
    tmp_path: Path,
) -> None:
    """The cache is keyed on the store's state, so a new run is seen on the next request.

    This is the property FR-021 rests on, checked at the level where it is decided. There is
    no interval here and no clock: the store changed, so the answer changed.
    """
    layout = support.build_store(tmp_path, runs=1, current=0)
    catalogue = CoverageCatalogue(layout)
    assert catalogue.identifiers() == [support.run_id_for(0)]

    support.write_run(layout, 1)
    support.set_current(layout, support.run_id_for(1))

    assert catalogue.identifiers() == [support.run_id_for(0), support.run_id_for(1)]
    assert catalogue.current().run_id == support.run_id_for(1)
