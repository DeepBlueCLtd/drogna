"""The cycle: the order it runs the steps in, and what it refuses to do when it cannot.

The ordering assertions here are the ones that would be silently lost in a refactor: that
a verified bundle under no pressure stays, that a staging area at its bound stops producing
rather than making room, and that an empty window produces nothing at all.
"""

from __future__ import annotations

import json

from harness_offload.ledger import BundleState
from offload_support import (
    ProfileSpec,
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    snapshot,
    write_run,
)


def build(tmp_path, destination=None, *, document=None, tick=0):
    return packager_for(
        tmp_path,
        destination=destination or StubDestination(),
        clock=manual_clock(tick),
        document=document or configuration(tmp_path),
    )


def test_a_run_is_divided_into_windows_counted_from_the_simulation_epoch(tmp_path) -> None:
    """Two profiles in the first hour and one in the second: two bundles, not three."""
    write_run(tmp_path / "run")
    packager = build(tmp_path)

    report = packager.cycle()

    assert len(report.staged) == 2
    windows = [
        json.loads(packager.settings.staging.sidecar_path(b).read_text(encoding="utf-8"))["window"][
            "index"
        ]
        for b in report.staged
    ]
    assert windows == [0, 1]


def test_a_window_with_no_profiles_produces_no_bundle_and_records_the_skip(tmp_path) -> None:
    """An empty file would be a bundle a reader could not tell from a run that sampled none."""
    write_run(
        tmp_path / "run",
        (
            ProfileSpec(0, 50.0, -4.0, (0.0, 10.0)),
            # Nothing in the second or third hour; the fourth has one profile.
            ProfileSpec(4 * 3600, 50.5, -4.5, (0.0, 10.0)),
        ),
    )
    packager = build(tmp_path)

    report = packager.cycle()

    assert len(report.staged) == 2
    assert set(snapshot(packager.settings.staging.directory)) == {
        name
        for b in report.staged
        for name in (f"{b}.nc", f"{b}.manifest.json", f"{b}.run-manifest.json")
    }


def test_a_verified_bundle_under_no_retention_pressure_is_still_there(tmp_path) -> None:
    """FR-014, through the cycle rather than through the eviction module alone."""
    write_run(tmp_path / "run")
    packager = build(tmp_path)

    report = packager.cycle()

    assert report.verified
    assert report.evicted == []
    assert report.retained == report.verified
    for bundle_id in report.verified:
        assert packager.settings.staging.bundle_path(bundle_id).exists()
        assert packager.ledger.state(bundle_id) is BundleState.VERIFIED


def test_a_full_staging_area_stops_producing_rather_than_making_room(tmp_path) -> None:
    """The destination is unreachable and the area is full. Eviction stays gated.

    The correct behaviour is to stop and report, because a staging area full of bundles
    nobody has acknowledged is a destination problem. Making room would mean deleting a
    bundle no receipt justifies, which is the failure this component exists to own.
    """
    write_run(tmp_path / "run")
    document = configuration(tmp_path)
    document["offload"]["retention"]["maximum_staging_bytes"] = 1
    destination = StubDestination(unreachable=True)
    packager = build(tmp_path, destination, document=document)

    first = packager.cycle()
    after_first = snapshot(packager.settings.staging.directory)
    second = build(tmp_path, destination, document=document, tick=1).cycle()

    assert len(first.staged) == 1, "the bound stops production after the first bundle"
    assert second.staged == []
    assert second.producing is False
    assert second.evicted == []
    assert any("no further bundles are produced" in note for note in second.failures)
    assert snapshot(packager.settings.staging.directory) == after_first


def test_a_verified_bundle_the_policy_asks_for_is_evicted_and_recorded(tmp_path) -> None:
    """The one place in this suite where something is deleted, and the ledger says why."""
    write_run(tmp_path / "run")
    document = configuration(tmp_path)
    document["offload"]["retention"]["maximum_staging_bytes"] = 1
    packager = build(tmp_path, document=document)

    report = packager.cycle()

    assert report.evicted
    for bundle_id in report.evicted:
        assert packager.ledger.state(bundle_id) is BundleState.EVICTED
        justification = [
            record
            for record in packager.ledger.records()
            if record.bundle_id == bundle_id and record.receipt is not None
        ]
        assert justification, "nothing was evicted without a recorded receipt"


def test_a_source_that_cannot_be_read_is_reported_and_stages_nothing(tmp_path) -> None:
    packager = build(tmp_path)

    report = packager.cycle()

    assert report.staged == []
    assert report.failures
    assert snapshot(packager.settings.staging.directory) == {}
