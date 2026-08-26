"""A new run becomes servable without a configuration edit, a restart or a hand-added file.

This is FR-021, and it is what makes the control loop's publication step meaningful: if
serving a run required a human to edit a collection definition, the sense → decide → act →
publish cycle would have a person in the middle of it.

The query layer is left running throughout — the same catalogue object answers before and
after — because "restart it and see" would prove something weaker than what is claimed.
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
from plugins.coverage_catalogue import CoverageCatalogue  # noqa: E402
from plugins.edr_coverage import CoverageQuery, open_run  # noqa: E402
from plugins.errors import CatalogueError  # noqa: E402

CONFIGURATION = REPO_ROOT / "config" / "local" / "query.json"
TEMPLATE = REPO_ROOT / "query" / "pygeoapi-config.yaml.template"


def position(catalogue: CoverageCatalogue, run_id: str | None = None):
    entry = catalogue.entry(run_id) if run_id else catalogue.current()
    return CoverageQuery(open_run(entry, support.settings())).position(
        longitude=-4.5, latitude=49.0, depth=25.0, time_iso="2026-09-01T01:00:00.000000Z"
    )


def test_a_run_appearing_while_the_service_runs_is_served_with_no_configuration_edit(
    tmp_path: Path,
) -> None:
    configuration_before = CONFIGURATION.read_bytes()
    template_before = TEMPLATE.read_bytes()

    layout = support.build_store(tmp_path, runs=1, current=0)
    catalogue = CoverageCatalogue(layout)
    assert catalogue.current().run_id == support.run_id_for(0)
    assert position(catalogue)["type"] == "Coverage"

    # The publisher's move: write the run, then replace the pointer. Nothing else happens.
    support.write_run(layout, 1)
    support.set_current(layout, support.run_id_for(1))

    assert catalogue.current().run_id == support.run_id_for(1)
    assert position(catalogue)["type"] == "Coverage"

    assert CONFIGURATION.read_bytes() == configuration_before
    assert TEMPLATE.read_bytes() == template_before


def test_every_run_is_addressable_by_its_own_identifier_and_the_current_one_is_marked(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=3, current=1)
    catalogue = CoverageCatalogue(layout)

    identifiers = catalogue.identifiers()
    assert identifiers == [support.run_id_for(index) for index in range(3)]
    assert catalogue.is_current(support.run_id_for(1))
    assert not catalogue.is_current(support.run_id_for(0))
    assert not catalogue.is_current(support.run_id_for(2))


def test_a_superseded_run_is_still_served_so_two_runs_can_be_compared(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=2, current=1)
    catalogue = CoverageCatalogue(layout)

    superseded = position(catalogue, support.run_id_for(0))
    current = position(catalogue)
    assert superseded["type"] == current["type"] == "Coverage"
    assert superseded["ranges"].keys() == current["ranges"].keys()


def test_a_partially_written_run_is_never_served(tmp_path: Path) -> None:
    """The window a reader can catch is a directory under the partial suffix, which is invisible."""
    layout = support.build_store(tmp_path, runs=1, current=0)
    catalogue = CoverageCatalogue(layout)

    in_flight = layout.runs_directory / (support.run_id_for(1) + layout.partial_suffix)
    in_flight.mkdir(parents=True)
    (in_flight / layout.forecast_file).write_bytes(b"half a file")
    assert catalogue.identifiers() == [support.run_id_for(0)]

    # Renamed into place complete, it appears; there is no state in which it appears half done.
    finished = layout.run_directory(support.run_id_for(1))
    support.write_run(layout, 1)
    assert finished.is_dir()
    assert catalogue.identifiers() == [support.run_id_for(0), support.run_id_for(1)]


def test_two_current_pointers_refuse_to_resolve_and_report_the_conflict(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=2, current=0)
    catalogue = CoverageCatalogue(layout)
    assert catalogue.current().run_id == support.run_id_for(0)

    support.set_current(layout, support.run_id_for(0), support.run_id_for(1))
    with pytest.raises(CatalogueError) as refusal:
        catalogue.current()
    message = str(refusal.value)
    assert support.run_id_for(0) in message
    assert support.run_id_for(1) in message
    assert "arbitrary" in message


def test_replaying_a_scenario_from_its_seed_produces_identical_run_identifiers(
    tmp_path: Path,
) -> None:
    """SC-007. Identifiers derive from seed and sequence, so a replay catalogues the same runs."""
    first = support.build_store(tmp_path / "first", runs=3, current=2)
    second = support.build_store(tmp_path / "second", runs=3, current=2)

    assert CoverageCatalogue(first).identifiers() == CoverageCatalogue(second).identifiers()
    assert CoverageCatalogue(first).current().run_id == CoverageCatalogue(second).current().run_id

    # And the manifests agree, because nothing in them comes from a clock or from entropy.
    for run_id in CoverageCatalogue(first).identifiers():
        left = json.loads(
            (first.run_directory(run_id) / first.manifest_file).read_text(encoding="utf-8")
        )
        right = json.loads(
            (second.run_directory(run_id) / second.manifest_file).read_text(encoding="utf-8")
        )
        assert left == right


def test_the_store_validator_agrees_with_the_catalogue(tmp_path: Path) -> None:
    """One implementation of the convention, called by both. A second one would disagree."""
    sys.path.insert(0, str(REPO_ROOT / "stores" / "coverage"))
    import validate_layout

    good = support.build_store(tmp_path / "good", runs=2, current=1)
    assert validate_layout.check_store(good) == []

    bad = support.layout_for(tmp_path / "bad")
    support.write_run(bad, 0, complete=False)
    faults = validate_layout.check_store(bad)
    assert any(support.run_id_for(0) in fault for fault in faults)
