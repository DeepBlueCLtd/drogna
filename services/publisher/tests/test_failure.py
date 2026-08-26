"""A refused run leaves the previous one exactly as it was, and says why it was refused.

FR-026 in three parts: the previous current run is untouched, the staging is discarded, and
the failure is recorded. The first is the one that matters — a publisher that half-published
a bad run would have produced the failure this component exists to prevent while checking
for it.
"""

from __future__ import annotations

from pathlib import Path

from control_loop import Recorder, manual_clock, publisher_document
from harness_publisher.service import PublisherService
from harness_types.config.publisher import DrognaPublisherConfiguration
from publisher_support import current_field, run_directory, stage_run


def publisher(tmp_path: Path, recorder: Recorder) -> PublisherService:
    document = publisher_document(
        staging=str(tmp_path / "staging"), catalogue=str(tmp_path / "coverage")
    )
    (tmp_path / "coverage").mkdir(parents=True, exist_ok=True)
    return PublisherService(
        DrognaPublisherConfiguration.model_validate(document),
        clock=manual_clock(),
        publisher=recorder,
    )


def test_a_failed_run_leaves_the_current_one_alone(tmp_path: Path) -> None:
    recorder = Recorder()
    service = publisher(tmp_path, recorder)
    stage_run(tmp_path / "staging", "run-good", body=b"the good field")
    service.take("run-good")

    stage_run(tmp_path / "staging", "run-bad", truncate_forecast=True)
    refused = service.take("run-bad")

    assert refused is None
    assert service.current_run_id == "run-good"
    assert current_field(tmp_path / "coverage") == b"the good field"
    assert not run_directory(tmp_path / "coverage", "run-bad").exists()


def test_a_failed_run_has_its_staging_discarded(tmp_path: Path) -> None:
    recorder = Recorder()
    service = publisher(tmp_path, recorder)
    stage_run(tmp_path / "staging", "run-bad", status="failed")

    service.take("run-bad")

    assert not (tmp_path / "staging" / "run-bad").exists()


def test_a_failure_is_recorded_with_its_reasons(tmp_path: Path) -> None:
    recorder = Recorder()
    service = publisher(tmp_path, recorder)
    stage_run(tmp_path / "staging", "run-bad", omit_uncertainty=True)

    service.take("run-bad")

    records = recorder.on("ctl/telemetry")
    assert [record["kind"] for record in records] == ["publication-refused"]
    assert records[0]["run_id"] == "run-bad"
    assert records[0]["refusals"]
    assert recorder.on("ctl/run-published") == []


def test_nothing_is_announced_for_a_run_that_was_not_published(tmp_path: Path) -> None:
    recorder = Recorder()
    service = publisher(tmp_path, recorder)
    stage_run(tmp_path / "staging", "run-bad", member_count=1)

    service.take("run-bad")

    assert recorder.topics().count("ctl/run-published") == 0
    assert service.published == 0
