"""FR-051: the M ordinate survives WKT parsing, and Z is still the elevations.

An EDR trajectory carries its per-vertex arrival times in the M ordinate of a WKT
`LINESTRING M` or `LINESTRING ZM`. pygeoapi parses that string with `shapely.wkt.loads`
before any provider code runs. If M does not survive the parse, the arrival times are gone
before drogna sees them at all, FR-020 fails, and **nothing raises**: the response stays
structurally correct and entirely plausible.

Feature 002 measured this rather than citing it and found three failure modes rather than the
one FR-051 names — M returned as NaN, M absent altogether, or the timestamps delivered in
the Z slot. The second is the published pygeoapi image as it ships, and it is the one this
deployment actually has to correct. **A test asserting only that M is not NaN passes there
while the times are already gone.** So this asserts that M comes back exactly and that Z is
still the elevations, which is what distinguishes all three.

That is deliberately the same pair of assertions `deploy/images/query-layer-pin-check.py`
makes during the image build, on the same geometry, so the runtime test and the build gate
cannot disagree about what the pin means. The build gate is the one that runs
unconditionally; this is the one that runs where the provider does.

`shapely.has_m` is not used and must not be: on Shapely 2.1 built against GEOS below 3.12 it
raises `UnsupportedGEOSVersionError` rather than returning `False`, so a guard written in
terms of it errors out instead of failing informatively.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from plugins.edr_trajectory import (  # noqa: E402
    TrajectoryRefusedError,
    vertices_from_geometry,
)

shapely = pytest.importorskip(
    "shapely",
    reason=(
        "the FR-051 pin is a property of the geometry stack the query layer image installs, "
        "and this workspace does not carry pygeoapi's dependency tree. The same two "
        "assertions are made unconditionally at image build time by "
        "deploy/images/query-layer-pin-check.py, which fails the build rather than a test."
    ),
)
wkt = pytest.importorskip("shapely.wkt", reason="as above")

# The same geometry the image's build-time check parses. Z carries elevation in metres,
# negative downwards; M carries the arrival time as seconds since the Unix epoch. The two are
# chosen to be unmistakable for one another, because the failure mode that does the most
# damage is the one that delivers the M values in the Z slot.
TRAJECTORY_WKT = "LINESTRING ZM (-3.6 48.4 -5 1788220800, -2.55 49.45 -100 1788226668)"
EXPECTED_Z = [-5.0, -100.0]
EXPECTED_M = [1788220800.0, 1788226668.0]

MINIMUM_SHAPELY = (2, 1)
MINIMUM_GEOS = (3, 12)


def _versions() -> str:
    geos = ".".join(str(part) for part in shapely.geos_version)
    return f"shapely {shapely.__version__}, GEOS {geos}"


def test_the_deployed_geometry_stack_meets_the_pin() -> None:
    """Version numbers first, so a failure below says which half of the pin was violated."""
    installed = tuple(int(part) for part in shapely.__version__.split(".")[:2])
    assert installed >= MINIMUM_SHAPELY, (
        f"{_versions()}: Shapely below 2.1 has no include_m parameter at all, so the M "
        f"ordinate is absent rather than NaN"
    )
    assert tuple(shapely.geos_version[:2]) >= MINIMUM_GEOS, (
        f"{_versions()}: the GEOS this Shapely was built against returns M as NaN. The GEOS "
        f"half of the pin is a property of the built wheel and no requirements file can "
        f"express it"
    )


def test_every_per_vertex_m_ordinate_survives_parsing_and_z_is_still_the_elevations() -> None:
    geometry = wkt.loads(TRAJECTORY_WKT)
    coordinates = shapely.get_coordinates(geometry, include_z=True, include_m=True)

    assert coordinates.shape[1] == 4, (
        f"{_versions()}: a LINESTRING ZM parsed to {coordinates.shape[1]} ordinates per "
        f"vertex, not four"
    )
    recovered_m = [float(value) for value in coordinates[:, 3]]
    recovered_z = [float(value) for value in coordinates[:, 2]]

    # An equality rather than an is-NaN test: NaN compares unequal to everything, so this one
    # comparison covers the NaN mode and any other corruption without naming them.
    assert recovered_m == EXPECTED_M, f"{_versions()}: M recovered as {recovered_m}"
    # Checked as well as M, because the third failure mode returns the timestamps in Z and a
    # check on M alone cannot tell that from a correct parse.
    assert recovered_z == EXPECTED_Z, f"{_versions()}: Z recovered as {recovered_z}"


def test_the_provider_reads_the_arrival_times_from_the_geometry_it_is_handed() -> None:
    """What the framework hands over is what the provider reads. No raw string is involved."""
    geometry = wkt.loads(TRAJECTORY_WKT)
    vertices = vertices_from_geometry(geometry, default_depth_metres=0.0)

    assert [vertex.unix_seconds for vertex in vertices] == EXPECTED_M
    # WKT Z is elevation, positive up; the coverage's axis is depth, positive down.
    assert [vertex.depth for vertex in vertices] == [5.0, 100.0]
    assert [vertex.longitude for vertex in vertices] == [-3.6, -2.55]


def test_a_three_dimensional_route_takes_the_configured_default_depth() -> None:
    geometry = wkt.loads("LINESTRING M (-3.6 48.4 1788220800, -2.55 49.45 1788226668)")
    vertices = vertices_from_geometry(geometry, default_depth_metres=25.0)

    assert [vertex.depth for vertex in vertices] == [25.0, 25.0]
    assert [vertex.unix_seconds for vertex in vertices] == EXPECTED_M


def test_a_geometry_with_no_m_is_refused_with_the_pin_named() -> None:
    """The default outcome of losing M must not be a plausible answer at a single time."""
    geometry = wkt.loads("LINESTRING Z (-3.6 48.4 -5, -2.55 49.45 -100)")

    with pytest.raises(TrajectoryRefusedError) as refusal:
        vertices_from_geometry(geometry, default_depth_metres=0.0)
    message = str(refusal.value)
    assert "FR-051" in message
    assert "2.1" in message and "3.12" in message
