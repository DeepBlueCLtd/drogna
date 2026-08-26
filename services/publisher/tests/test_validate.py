"""A staged run is publishable or it is refused, and the refusal says which way it is wrong.

FR-026. Every case here is a way a run can be incomplete, and each is caught by arithmetic
or by the descriptor rather than by looking at the field and forming an impression.
"""

from __future__ import annotations

from pathlib import Path

from harness_publisher.validate import inspect_staged
from publisher_support import FORECAST_FILE, MANIFEST_FILE, UNCERTAINTY_FILE, stage_run


def inspect(directory: Path):
    return inspect_staged(
        directory,
        forecast_file=FORECAST_FILE,
        uncertainty_file=UNCERTAINTY_FILE,
        manifest_file=MANIFEST_FILE,
    )


def test_a_complete_run_is_complete(tmp_path: Path) -> None:
    inspection = inspect(stage_run(tmp_path))

    assert inspection.complete
    assert inspection.run_id == "run-abc"
    assert inspection.refusals == ()


def test_a_run_without_an_uncertainty_field_is_incomplete(tmp_path: Path) -> None:
    """The specification's edge case: not a forecast-only run, an unfinished one."""
    inspection = inspect(stage_run(tmp_path, omit_uncertainty=True))

    assert not inspection.complete
    assert any("uncertainty" in refusal for refusal in inspection.refusals)


def test_a_half_written_field_fails_its_own_digest(tmp_path: Path) -> None:
    """The check that catches the failure this component exists to prevent."""
    inspection = inspect(stage_run(tmp_path, truncate_forecast=True))

    assert not inspection.complete
    assert any("does not match the digest" in refusal for refusal in inspection.refusals)


def test_a_run_marked_failed_is_refused(tmp_path: Path) -> None:
    inspection = inspect(stage_run(tmp_path, status="failed"))

    assert not inspection.complete
    assert any("status" in refusal for refusal in inspection.refusals)


def test_a_run_with_one_member_is_refused(tmp_path: Path) -> None:
    """A spread over one member is not the quantity the uncertainty field claims to be."""
    inspection = inspect(stage_run(tmp_path, member_count=1))

    assert not inspection.complete
    assert any("member" in refusal for refusal in inspection.refusals)


def test_a_run_with_no_descriptor_is_refused(tmp_path: Path) -> None:
    directory = stage_run(tmp_path)
    (directory / MANIFEST_FILE).unlink()

    inspection = inspect(directory)

    assert not inspection.complete
    assert any("descriptor" in refusal for refusal in inspection.refusals)


def test_a_missing_staged_run_is_refused_by_name(tmp_path: Path) -> None:
    inspection = inspect(tmp_path / "run-that-is-not-there")

    assert not inspection.complete
    assert "no such staged run" in inspection.refusals[0]


def test_every_reason_is_reported_not_only_the_first(tmp_path: Path) -> None:
    inspection = inspect(
        stage_run(tmp_path, status="failed", member_count=1, omit_uncertainty=True)
    )

    assert len(inspection.refusals) >= 3
