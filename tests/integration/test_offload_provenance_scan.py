"""Feature 013's provenance scanner, over a bundle feature 014's packager actually wrote.

Two features meet at one artefact and nowhere else: the packager decides what an exported
file may say, and the leakage scanner decides what a released file may say. Neither imports
the other, which is right — but ADR-0011 is the record of what that costs when nobody
exercises the seam from both ends, so this is the test that does.

**What it asserts, and why in this shape.** The scanner has two halves. The identifying
patterns look for material that says where measurements were taken, who took them or on
what: filesystem paths, home directories, host names, sensor, thing and datastream
identifiers, and coordinate pairs falling inside the identification radius. Those are the
half that FR-42 names for this feature, and the assertion here is that a produced bundle
yields **zero** of them, in the NetCDF and in the sidecar alike.

The other half is an attribute allow-list, and it is calibrated for the released coverage
products the proxy serves — a gridded forecast field — rather than for a
``trajectoryProfile`` export. It therefore flags the geometry: ``cf_role``,
``sample_dimension``, ``instance_dimension``, ``coordinates``, the ``trajectory``,
``profile`` and ``obs`` dimensions, ``featureType = "trajectoryProfile"``, and a CF time
units string, which is longer than the pattern for a plain unit allows.

Those are not leaks and this test says so by name, in a list. It does **not** widen
013's rule file: that file is 013's, adding an entry to it is a deliberate reviewable diff
by design, and an offload bundle is not a released artefact in the first place — it goes to
the harness's own archive and is never placed under the released path prefix (FR-018,
asserted in ``services/offload/tests/test_attributes.py``). What this test does is pin the
list, so that a hit which is *not* one of these appears here as a failure rather than being
lost in the noise of the ones that are expected.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (
    REPO_ROOT / "tests" / "leakage",
    REPO_ROOT / "services" / "offload" / "tests",
):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import scanner  # noqa: E402
from harness_offload.writer import VARIABLE_ORDER  # noqa: E402
from offload_support import (  # noqa: E402
    StubDestination,
    configuration,
    manual_clock,
    packager_for,
    write_run,
)

#: Hits that are the geometry, not a disclosure. Each is a shape the released coverage
#: products do not have and the allow-list was therefore never given.
EXPECTED_SHAPE_RULES = frozenset(
    {
        "attribute-not-on-the-allow-list",
        "attribute-value-outside-its-pattern",
        "dimension-not-on-the-allow-list",
    }
)

EXPECTED_LOCATIONS = frozenset(
    {
        "global:bundle_id",
        "global:featureType",
        "global:format_version",
        "global:run_reference",
        "global:summary",
        "global:time_coverage_end",
        "global:time_coverage_start",
        "dimension:trajectory",
        "dimension:profile",
        "dimension:obs",
        "variable:trajectory:cf_role",
        "variable:profile:cf_role",
        "variable:trajectory_index:instance_dimension",
        "variable:row_size:sample_dimension",
        "variable:time:units",
        "variable:sea_water_temperature:coordinates",
        "variable:sea_water_practical_salinity:coordinates",
        "variable:sea_water_pressure:coordinates",
    }
)


def packaged(tmp_path: Path):
    write_run(tmp_path / "run")
    packager = packager_for(
        tmp_path,
        destination=StubDestination(),
        clock=manual_clock(),
        document=configuration(tmp_path),
    )
    packager.cycle()
    return packager


def artefact(tmp_path: Path, packager, *, include_sibling: bool = False) -> Path:
    """The bundle as SC-006 scores it: every member the sidecar lists, and the sidecar.

    The staging directory also holds the run-manifest sibling — the manifest copy
    carrying the measurement geometry, which the sidecar names *without* membership
    (014 T047) — and that file is deliberately not part of the artefact: it is the
    document the release withholds, staged beside the bundle so the leakage gate can
    score against it. ``include_sibling`` exists for the one test that proves the
    scanner is not silent about it should it ever stray inside.
    """
    staging = packager.settings.staging
    tree = tmp_path / ("artefact-with-sibling" if include_sibling else "artefact")
    tree.mkdir()
    for bundle_id in staging.staged_bundle_ids():
        sources = [staging.bundle_path(bundle_id), staging.sidecar_path(bundle_id)]
        if include_sibling:
            sources.append(staging.run_manifest_path(bundle_id))
        for source in sources:
            shutil.copyfile(source, tree / source.name)
    return tree


def scanned(tmp_path: Path):
    packager = packaged(tmp_path)
    return scanner.scan_bundle(artefact(tmp_path, packager), released_variables=VARIABLE_ORDER)


def test_the_scanner_examined_every_member_rather_than_skipping_one(tmp_path: Path) -> None:
    """A scan that reports zero hits on a bundle it did not read is the dangerous result."""
    result = scanned(tmp_path)

    assert result.members
    assert all(
        member.endswith(".nc") or member.endswith(".manifest.json") for member in result.members
    )
    assert not [
        finding for finding in result.findings if finding.rule == "member-in-an-unrecognised-format"
    ]


def test_a_produced_bundle_yields_no_identifying_material(tmp_path: Path) -> None:
    """SC-006. No path, no host, no user, no sensor, no thing, no datastream, no position."""
    result = scanned(tmp_path)

    identifying = [
        finding for finding in result.findings if finding.rule not in EXPECTED_SHAPE_RULES
    ]

    assert identifying == []


def test_the_sidecar_manifest_yields_nothing_at_all(tmp_path: Path) -> None:
    """It holds digests, a window and an opaque run reference. It holds no run manifest."""
    result = scanned(tmp_path)

    sidecar_hits = [
        finding for finding in result.findings if finding.member.endswith(".manifest.json")
    ]

    assert sidecar_hits == []


def test_the_run_manifest_sibling_is_outside_the_artefact_and_named_by_the_sidecar(
    tmp_path: Path,
) -> None:
    """014 T047's decision, observed at this seam: beside the bundle, never a member.

    The sidecar names the sibling under its own key, the members list does not carry it,
    and the artefact the scanner walks does not contain it — which is why SC-006's
    assertions above stay as written.
    """
    packager = packaged(tmp_path)
    staging = packager.settings.staging
    tree = artefact(tmp_path, packager)

    scanned_names = {path.name for path in tree.iterdir()}
    for bundle_id in staging.staged_bundle_ids():
        sibling_name = staging.run_manifest_name(bundle_id)
        assert staging.run_manifest_path(bundle_id).exists()
        assert sibling_name not in scanned_names
        sidecar = json.loads(staging.sidecar_path(bundle_id).read_text(encoding="utf-8"))
        assert sidecar["run_manifest"]["name"] == sibling_name
        assert sibling_name not in {member["name"] for member in sidecar["members"]}


def test_the_sibling_is_not_silent_should_it_stray_into_the_artefact(tmp_path: Path) -> None:
    """The guard on the guard: a manifest copy inside the scanned artefact is a hit.

    The scanner's identifying patterns flag the run identifier the sibling necessarily
    carries, so a future change that quietly turned the sibling into a member would fail
    here rather than pass as a clean scan over a wider artefact.
    """
    packager = packaged(tmp_path)
    tree = artefact(tmp_path, packager, include_sibling=True)

    result = scanner.scan_bundle(tree, released_variables=VARIABLE_ORDER)

    sibling_hits = [
        finding for finding in result.findings if finding.member.endswith(".run-manifest.json")
    ]
    assert sibling_hits, (
        "the run-manifest sibling was scanned as part of the artefact and nothing was "
        "flagged; the scanner has lost the ability to object to the withheld document"
    )


def test_every_remaining_hit_is_the_geometry_and_is_named_here(tmp_path: Path) -> None:
    """The pinned list. A hit that is not on it fails here rather than hiding among these."""
    result = scanned(tmp_path)

    unexpected = sorted(
        {
            finding.location
            for finding in result.findings
            if finding.location not in EXPECTED_LOCATIONS
        }
    )

    assert unexpected == []
