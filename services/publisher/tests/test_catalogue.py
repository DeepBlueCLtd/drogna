"""The naming convention, and the mark-current operation that makes a run the one served.

FR-023 and SRD FR-21: a published run is servable without a collection being enumerated
anywhere. The store's names are derivable from the run identifier alone; the collection is
the fixed one the query layer serves, carried in the announcement beside the run identifier
rather than derived from it (the link-5 decision recorded on issue #34). These tests are
about the names and the pointer; the atomicity of the swap is tested in
``tests/integration/test_publication_atomicity.py``, where there is a reader to be atomic
towards.
"""

from __future__ import annotations

from pathlib import Path

from control_loop import manual_clock, publisher_document
from harness_publisher.service import PublisherService
from harness_types.config.publisher import DrognaPublisherConfiguration
from publisher_support import current_field, run_directory, stage_run


def publisher(tmp_path: Path, recorder=None) -> PublisherService:
    document = publisher_document(
        staging=str(tmp_path / "staging"), catalogue=str(tmp_path / "coverage")
    )
    settings = DrognaPublisherConfiguration.model_validate(document)
    (tmp_path / "coverage").mkdir(parents=True, exist_ok=True)
    return PublisherService(settings, clock=manual_clock(), publisher=recorder)


def test_a_published_run_lands_under_its_own_name(tmp_path: Path) -> None:
    stage_run(tmp_path / "staging", "run-abc")
    service = publisher(tmp_path)

    service.take("run-abc")

    assert (run_directory(tmp_path / "coverage", "run-abc") / "forecast.nc").is_file()
    assert not (tmp_path / "staging" / "run-abc").exists()


def test_the_current_pointer_resolves_to_the_newest_run(tmp_path: Path) -> None:
    stage_run(tmp_path / "staging", "run-one", body=b"first field")
    stage_run(tmp_path / "staging", "run-two", body=b"second field")
    service = publisher(tmp_path)

    service.take("run-one")
    assert service.current_run_id == "run-one"

    service.take("run-two")
    assert service.current_run_id == "run-two"
    assert current_field(tmp_path / "coverage") == b"second field"


def test_a_superseded_run_stays_addressable(tmp_path: Path) -> None:
    """Older runs are not deleted: eviction is somebody else's decision, not this one's."""
    stage_run(tmp_path / "staging", "run-one", body=b"first field")
    stage_run(tmp_path / "staging", "run-two", body=b"second field")
    service = publisher(tmp_path)

    service.take("run-one")
    service.take("run-two")

    forecast = run_directory(tmp_path / "coverage", "run-one") / "forecast.nc"
    assert forecast.read_bytes() == b"first field"


def test_the_announcement_carries_the_fixed_collection_and_the_run_separately(
    tmp_path: Path,
) -> None:
    """The collection is the configured fixed identifier; the run is named by run_id alone.

    There is no uncertainty entry to assert on: the master removed it, because it named a
    collection that will never exist — the uncertainty is a parameter of the one collection.
    """
    from control_loop import Recorder

    recorder = Recorder()
    stage_run(tmp_path / "staging", "run-abc")
    service = publisher(tmp_path, recorder)

    message = service.take("run-abc")

    assert message is not None
    assert message["collections"] == {"forecast": "forecast"}
    assert message["run_id"] == "run-abc"
    assert recorder.on("ctl/run-published") == [message]


def test_publishing_a_run_twice_under_one_name_is_refused(tmp_path: Path) -> None:
    """A run identifier names one run. Two would be indistinguishable to every consumer."""
    stage_run(tmp_path / "staging", "run-abc")
    service = publisher(tmp_path)
    service.take("run-abc")

    stage_run(tmp_path / "staging", "run-abc", body=b"a different field")
    second = service.take("run-abc")

    assert second is None
    assert service.refused == 1
    assert current_field(tmp_path / "coverage") == b"a complete forecast field"
