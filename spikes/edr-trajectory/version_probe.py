"""Does the M ordinate of an EDR trajectory `coords` string survive WKT parsing?

SPIKE CODE. Throwaway. Hardcodes paths, ports and versions on purpose, and skips
drogna's single-environment-variable config contract (Constitution IV), as argued in
`specs/002-edr-trajectory-spike/plan.md` Complexity Tracking. Nothing here is imported
by drogna and nothing here is promoted into it.

The one exception is the assertion below: `assert_m_survives_wkt_parsing()` is written
to be adopted unchanged by the deployment feature as the test SRD FR-51 demands.

Why this matters
----------------
OGC API-EDR carries a trajectory's per-vertex times in the M ordinate of a WKT
`LINESTRING M` or `LINESTRING ZM`. pygeoapi parses the `coords` query parameter with
`shapely.wkt.loads` and hands the resulting geometry to the provider untouched, so
every drogna requirement that depends on per-vertex arrival times (FR-20, and the
client's four-dimensional route in FR-47) depends first on Shapely returning M.

Below Shapely 2.1 built against GEOS 3.12 it does not, and it does not fail loudly:

* Shapely 2.1+ / GEOS < 3.12 — `shapely.get_coordinates(..., include_m=True)` returns
  NaN for every M value, and `shapely.has_m` raises `UnsupportedGEOSVersionError`.
* Shapely 2.0.x / GEOS >= 3.12 — `LINESTRING M` parses, but the Python coordinate
  sequence is (x, y) only: M is unreachable. A `LINESTRING ZM` loses M altogether.
* Shapely 2.0.x / GEOS < 3.12 — worst of the three: `LINESTRING M` is read back as a
  *Z* geometry whose Z values are the timestamps. Nothing raises. A provider reading Z
  as depth would silently treat epoch seconds as metres.

None of those raises an exception on the parse itself, which is why the pin exists and
why it must carry its reason inline.

The pin
-------
    shapely >= 2.1  # built against GEOS >= 3.12: below this the M ordinate of an EDR
                    # trajectory's LINESTRINGZM is lost silently (NaN, or misread as
                    # Z), per-vertex arrival times vanish, and FR-20 fails without
                    # raising. Do not relax without re-running the FR-51 test.

Run it
------
    python3 version_probe.py            # human-readable report, exit 1 below the pin
    python3 version_probe.py --json     # machine-readable, always exit 0
    pytest version_probe.py             # the adoptable assertion
"""

from __future__ import annotations

import json
import sys

import shapely
from shapely.wkt import loads as shapely_loads

# The versions SRD FR-51 pins. GEOS gained XYM/XYZM support in 3.12; Shapely exposed it
# to Python in 2.1.
MIN_SHAPELY = (2, 1)
MIN_GEOS = (3, 12)

# A four-dimensional route: longitude, latitude, elevation (WKT Z, metres, positive up)
# and arrival time (WKT M, seconds since the Unix epoch). The M values are distinct,
# increasing and far from any plausible coordinate value, so a version that loses them
# cannot be mistaken for one that keeps them.
WKT_ZM = (
    'LINESTRING ZM ('
    '-3.60 48.40 -5.0 1788220800, '
    '-2.55 49.45 -100.0 1788226668, '
    '-1.50 50.50 -220.0 1788232536, '
    '0.60 52.60 -380.0 1788238404)'
)

# The three-dimensional case: a route with arrival times but no depth. Recorded
# separately because a provider must handle it differently (SRD FR-20; the route
# without a vertical component is a legitimate query).
WKT_M = (
    'LINESTRING M ('
    '-3.60 48.40 1788220800, '
    '-2.55 49.45 1788226668, '
    '-1.50 50.50 1788232536, '
    '0.60 52.60 1788238404)'
)

EXPECTED_M = [1788220800.0, 1788226668.0, 1788232536.0, 1788238404.0]
EXPECTED_Z = [-5.0, -100.0, -220.0, -380.0]


def _version_tuple(text: str) -> tuple[int, ...]:
    parts = []
    for chunk in text.split('.'):
        digits = ''
        for character in chunk:
            if not character.isdigit():
                break
            digits += character
        parts.append(int(digits) if digits else 0)
    return tuple(parts)


def shapely_version() -> tuple[int, ...]:
    return _version_tuple(shapely.__version__)


def geos_version() -> tuple[int, ...]:
    return tuple(shapely.geos_version)


def meets_pin() -> bool:
    """Is this interpreter running the combination FR-51 pins?"""
    return (
        shapely_version()[:2] >= MIN_SHAPELY
        and geos_version()[:2] >= MIN_GEOS
    )


def read_m(geometry) -> list[float | None]:
    """Recover the M ordinate of every vertex, or None where it cannot be reached.

    Deliberately tries the modern route first and degrades rather than raising, so the
    probe reports what an older stack actually does instead of dying on it.
    """
    try:
        coordinates = shapely.get_coordinates(
            geometry, include_z=True, include_m=True
        )
    except TypeError:
        # Shapely < 2.1: get_coordinates has no include_m at all. M is unreachable
        # through the public API even when GEOS retained it internally.
        return [None] * len(geometry.coords)
    return [None if value != value else float(value) for value in coordinates[:, 3]]


def read_z(geometry) -> list[float | None]:
    try:
        coordinates = shapely.get_coordinates(geometry, include_z=True)
    except TypeError:  # pragma: no cover - shapely always accepts include_z
        return [None] * len(geometry.coords)
    return [None if value != value else float(value) for value in coordinates[:, 2]]


def _flag(name: str, geometry) -> bool | str:
    """Call shapely.has_z / has_m, reporting rather than raising on old stacks."""
    function = getattr(shapely, name, None)
    if function is None:
        return f'{name} absent (shapely < 2.1)'
    try:
        return bool(function(geometry))
    except Exception as error:  # noqa: BLE001 - the probe records whatever happens
        return f'{type(error).__name__}: {error}'


def probe_one(label: str, wkt: str) -> dict:
    record: dict = {'label': label, 'wkt_in': wkt}
    try:
        geometry = shapely_loads(wkt)
    except Exception as error:  # noqa: BLE001 - a parse failure is a result
        record['parsed'] = False
        record['error'] = f'{type(error).__name__}: {error}'
        return record

    record['parsed'] = True
    record['exception_raised'] = False
    record['geom_type'] = geometry.geom_type
    record['has_z'] = _flag('has_z', geometry)
    record['has_m'] = _flag('has_m', geometry)
    record['coords_tuples'] = [list(vertex) for vertex in geometry.coords]
    record['m_recovered'] = read_m(geometry)
    record['z_recovered'] = read_z(geometry)
    record['wkt_round_trip'] = geometry.wkt
    record['m_matches_input'] = record['m_recovered'] == EXPECTED_M
    return record


def probe() -> dict:
    """Parse both spellings and report everything worth recording."""
    return {
        'shapely_version': shapely.__version__,
        'geos_version': '.'.join(str(part) for part in geos_version()),
        'geos_capi_version': getattr(shapely, 'geos_capi_version_string', None),
        'meets_fr51_pin': meets_pin(),
        'pin': {
            'shapely_minimum': '.'.join(str(part) for part in MIN_SHAPELY),
            'geos_minimum': '.'.join(str(part) for part in MIN_GEOS),
        },
        'expected_m': EXPECTED_M,
        'expected_z_as_elevation': EXPECTED_Z,
        'cases': {
            'LINESTRING ZM': probe_one('LINESTRING ZM', WKT_ZM),
            'LINESTRING M': probe_one('LINESTRING M', WKT_M),
        },
        'vertical_convention': {
            'wkt_z_is': 'elevation, metres, positive up (OGC simple features)',
            'coverage_axis_is': 'depth, metres, positive down (CF convention)',
            'provider_must_apply': 'depth = -z',
            'why_it_matters': (
                'A route that descends carries decreasing Z and increasing depth. '
                'If the provider passes Z through as depth, an ascending route and a '
                'descending one return each other\'s values and nothing raises.'
            ),
        },
    }


def assert_m_survives_wkt_parsing() -> None:
    """The assertion SRD FR-51 requires. Adopt this unchanged in the deployment tests.

    Asserts that the per-vertex arrival times of an EDR trajectory `coords` string are
    still readable after `shapely.wkt.loads`. If this fails, EDR trajectory queries
    return structurally valid CoverageJSON containing values for the wrong times, and
    no other test in drogna will notice.
    """
    if not meets_pin():
        raise AssertionError(
            'Shapely {} on GEOS {} is below the FR-51 pin (Shapely >= {}, '
            'GEOS >= {}). The M ordinate of an EDR trajectory is lost silently at '
            'this combination.'.format(
                shapely.__version__,
                '.'.join(str(part) for part in geos_version()),
                '.'.join(str(part) for part in MIN_SHAPELY),
                '.'.join(str(part) for part in MIN_GEOS),
            )
        )

    for wkt in (WKT_ZM, WKT_M):
        geometry = shapely_loads(wkt)
        if not shapely.has_m(geometry):
            raise AssertionError(f'M ordinate absent after parsing: {wkt}')
        recovered = read_m(geometry)
        if recovered != EXPECTED_M:
            raise AssertionError(
                f'M ordinate corrupted after parsing {wkt}: '
                f'expected {EXPECTED_M}, recovered {recovered}'
            )

    zm_geometry = shapely_loads(WKT_ZM)
    if read_z(zm_geometry) != EXPECTED_Z:
        raise AssertionError(
            'Z ordinate corrupted after parsing LINESTRING ZM: expected '
            f'{EXPECTED_Z}, recovered {read_z(zm_geometry)}'
        )


def test_m_ordinate_survives_wkt_parsing() -> None:
    """pytest entry point for the assertion above (SRD FR-51)."""
    assert_m_survives_wkt_parsing()


def _report(result: dict) -> str:
    lines = [
        'EDR trajectory M-ordinate probe',
        '  shapely {}  GEOS {}  meets FR-51 pin: {}'.format(
            result['shapely_version'],
            result['geos_version'],
            'YES' if result['meets_fr51_pin'] else 'NO',
        ),
        '',
    ]
    for case in result['cases'].values():
        lines.append(f"  {case['label']}")
        if not case['parsed']:
            lines.append(f"    parse failed: {case['error']}")
            lines.append('')
            continue
        lines.append(f"    exception raised   : {case['exception_raised']}")
        lines.append(f"    geom_type          : {case['geom_type']}")
        lines.append(f"    has_z / has_m      : {case['has_z']} / {case['has_m']}")
        lines.append(f"    M expected         : {result['expected_m']}")
        lines.append(f"    M recovered        : {case['m_recovered']}")
        lines.append(f"    M matches input    : {case['m_matches_input']}")
        lines.append(f"    Z recovered        : {case['z_recovered']}")
        lines.append(f"    WKT round trip     : {case['wkt_round_trip']}")
        lines.append('')
    return '\n'.join(lines)


def main(argv: list[str]) -> int:
    result = probe()
    if '--json' in argv:
        print(json.dumps(result, indent=2))
        return 0
    print(_report(result))
    try:
        assert_m_survives_wkt_parsing()
    except AssertionError as error:
        print(f'FR-51 assertion FAILED: {error}')
        return 1
    print('FR-51 assertion PASSED: every per-vertex M ordinate survived parsing.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
