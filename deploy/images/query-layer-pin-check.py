"""Assert that the query layer image satisfies the FR-51 pin, by behaviour not by version.

Run during the image build, after the dependencies are installed, and left in the image so
that the same assertion can be made against a running container when a base image or a
wheel moves. A non-zero exit fails the build.

The reason this exists as a build step rather than only as a test lives beside the pin, in
``query-layer.requirements.txt``. In short: the GEOS half of the pin is a property of the
built Shapely wheel and cannot be expressed as a dependency constraint, and every way of
failing it is silent. The failure this catches produces a trajectory response that is
structurally correct and wrong, so the last moment it can be made loud is the build.

This is not the FR-51 test. That is ``assert_m_survives_wkt_parsing`` in
``spikes/edr-trajectory/version_probe.py``, which features 002 and 008 own and which proves
rather more. This is the gate on the artefact, and it is deliberately the cheapest thing
that distinguishes all three failure modes recorded in
``spikes/edr-trajectory/FINDING.md``.
"""

from __future__ import annotations

import sys

import shapely
from shapely import get_coordinates
from shapely.wkt import loads

# Two vertices of a four-dimensional route. Z carries elevation in metres, negative
# downwards; M carries the arrival time as seconds since the Unix epoch. The two are
# chosen to be unmistakable for one another, because the failure mode below the pin that
# does the most damage is the one that delivers the M values in the Z slot.
TRAJECTORY_WKT = "LINESTRING ZM (-3.6 48.4 -5 1788220800, -2.55 49.45 -100 1788226668)"
EXPECTED_Z = [-5.0, -100.0]
EXPECTED_M = [1788220800.0, 1788226668.0]

REQUIRED = "FR-51 requires Shapely >= 2.1 built against GEOS >= 3.12."
CONSEQUENCE = (
    "An EDR trajectory's per-vertex arrival times would be lost before any provider code "
    "ran, and the response would look correct. See deploy/images/"
    "query-layer.requirements.txt and spikes/edr-trajectory/FINDING.md."
)


def _versions() -> str:
    geos = ".".join(str(part) for part in shapely.geos_version)
    return f"shapely {shapely.__version__}, GEOS {geos}"


def main() -> int:
    versions = _versions()
    geometry = loads(TRAJECTORY_WKT)

    try:
        coordinates = get_coordinates(geometry, include_z=True, include_m=True)
    except TypeError:
        # Shapely 2.0.x: no include_m parameter exists. The M ordinate is absent rather
        # than NaN, which is the published pygeoapi image as it ships.
        print(f"FR-51 pin FAILED: {versions}", file=sys.stderr)
        print(
            f"  shapely.get_coordinates has no include_m parameter, so the M ordinate "
            f"is unreachable. {REQUIRED} {CONSEQUENCE}",
            file=sys.stderr,
        )
        return 1

    if coordinates.shape[1] != 4:
        print(f"FR-51 pin FAILED: {versions}", file=sys.stderr)
        print(
            f"  a LINESTRING ZM parsed to {coordinates.shape[1]} ordinates per vertex, "
            f"not 4. {REQUIRED} {CONSEQUENCE}",
            file=sys.stderr,
        )
        return 1

    recovered_z = [float(value) for value in coordinates[:, 2]]
    recovered_m = [float(value) for value in coordinates[:, 3]]

    # An inequality rather than an is-NaN test on purpose: NaN compares unequal to
    # everything, so this one comparison covers the NaN mode and any other corruption
    # without naming them.
    if recovered_m != EXPECTED_M:
        print(f"FR-51 pin FAILED: {versions}", file=sys.stderr)
        print(
            f"  M recovered as {recovered_m}, expected {EXPECTED_M}. {REQUIRED} {CONSEQUENCE}",
            file=sys.stderr,
        )
        return 1

    # Checked as well as M, because the third failure mode returns the timestamps in Z and
    # a check on M alone would not distinguish it from a correct parse.
    if recovered_z != EXPECTED_Z:
        print(f"FR-51 pin FAILED: {versions}", file=sys.stderr)
        print(
            f"  Z recovered as {recovered_z}, expected {EXPECTED_Z}. {REQUIRED} {CONSEQUENCE}",
            file=sys.stderr,
        )
        return 1

    print(f"FR-51 pin holds: {versions}; M and Z both survived WKT parsing exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
