"""The leakage gate's updated-region half, over a geometry the packager actually wrote.

Until 014 T047 the only ``run-manifest.json`` carrying a measurement geometry was the one
``tests/leakage/fixtures/make_fixtures.py`` writes by hand — a document nothing in the
harness produced. This is the test that closes that seam from both ends: the packager
stages the run-manifest sibling beside each bundle, and
``tests/leakage/updated_region.load_geometry`` — the one consumer, and the reader
``scripts/check_leakage.py`` points at a pair's manifest — reads it with no change of its
own, which is what the recorded decision predicted and the reason the sibling is a
``run-manifest.json`` at all.

The refusal direction is asserted too: the manifest C-01 writes (the one in the recorded
run directory) carries no geometry, and the consumer must refuse it rather than read the
absence as an empty geometry. Both directions were built refusing-first, so a silent
empty list here is a regression and not a convenience.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (
    REPO_ROOT / "tests" / "leakage",
    REPO_ROOT / "services" / "offload" / "tests",
):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from offload_support import (  # noqa: E402
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    write_run,
)
from updated_region import InvalidGeometryError, load_geometry  # noqa: E402


def packaged(tmp_path: Path):
    write_run(tmp_path / "run")
    packager = packager_for(
        tmp_path,
        destination=StubDestination(),
        clock=manual_clock(),
        document=configuration(tmp_path),
    )
    report = packager.cycle()
    return packager, report


def test_the_consumer_reads_a_sibling_the_packager_wrote_unchanged(tmp_path: Path) -> None:
    packager, report = packaged(tmp_path)

    assert report.staged
    counts = []
    for bundle_id in report.staged:
        measurements = load_geometry(packager.settings.staging.run_manifest_path(bundle_id))
        assert measurements, f"{bundle_id}: the consumer read an empty geometry"
        counts.append(len(measurements))
        for measurement in measurements:
            assert -90.0 <= measurement.latitude <= 90.0
            assert -180.0 <= measurement.longitude <= 180.0
            assert measurement.simulation_seconds >= 0
    # The fixture run holds two profiles in the first window and one in the second.
    assert counts == [2, 1]


def test_the_manifest_without_a_geometry_is_refused_not_read_as_empty(tmp_path: Path) -> None:
    """C-01's manifest is complete without the block, and the consumer must say so."""
    packaged(tmp_path)

    with pytest.raises(InvalidGeometryError, match="measurement_geometry"):
        load_geometry(tmp_path / "run" / "run-manifest.json")
