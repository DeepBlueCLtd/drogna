"""Issue the trajectory queries, capture what comes back, and score it.

SPIKE CODE. Throwaway. Literal hostnames and ports on purpose; see `version_probe.py`
for the standing caveat. Uses only the standard library for HTTP so the spike adds no
dependency the pygeoapi image does not already carry.

Every request and every response is written to `results/` verbatim. The finding quotes
those files; it does not paraphrase them.
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
import shapely

from expectation import (
    QUERY_TIME,
    as_records,
    epoch_seconds,
    hypotheses,
    route,
    separation,
    wkt_linestring_m,
    wkt_linestring_zm,
)
from make_fixture import (
    DEPTHS,
    LAT0,
    LAT1,
    LON0,
    LON1,
    SEED,
    T0,
    TOLERANCE,
    coefficients,
    grid,
    hours_since_t0,
    theta,
)

HERE = pathlib.Path(__file__).resolve().parent
RESULTS = HERE / 'results'

# Compose service names. The tools container shares the spike's network.
AT_PIN = 'http://pygeoapi:80'
BELOW_PIN = 'http://pygeoapi-below-pin:80'

COLLECTION = 'spike_coverage'
EXTRAPOLATING_COLLECTION = 'spike_coverage_extrapolate'
STOCK_COLLECTION = 'spike_coverage_stock'

# The WKT is emitted with six decimal places, so the comparison rounds to the same
# precision. Anything beyond that is the spike's own formatting, not the framework's.
WKT_DECIMALS = 6
PARAMETER = 'sea_water_temperature'


def fetch(url: str, method: str = 'GET') -> dict:
    """Issue one request and record everything about it, errors included."""
    record: dict = {'request_url': url, 'method': method}
    request = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode('utf-8', errors='replace')
            record['status'] = response.status
            record['headers'] = dict(response.headers.items())
    except urllib.error.HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')
        record['status'] = error.code
        record['headers'] = dict(error.headers.items()) if error.headers else {}
    except Exception as error:  # noqa: BLE001 - a transport failure is a result
        record['status'] = None
        record['error'] = f'{type(error).__name__}: {error}'
        record['body'] = None
        return record

    record['body_bytes'] = len(body)
    try:
        record['body'] = json.loads(body)
    except json.JSONDecodeError:
        record['body'] = body[:4000]
        record['body_is_json'] = False
    else:
        record['body_is_json'] = True
    return record


def edr_url(
    base: str,
    collection: str,
    query_type: str,
    params: dict[str, str],
) -> str:
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return f'{base}/collections/{collection}/{query_type}?{query}'


def write(name: str, payload) -> pathlib.Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / name
    if isinstance(payload, str):
        path.write_text(payload)
    else:
        path.write_text(json.dumps(payload, indent=2, sort_keys=False) + '\n')
    return path


def nearest_step_expectation() -> np.ndarray:
    """What a provider that snapped each vertex to the nearest time step would return."""
    vertices = route()
    steps = hours_since_t0(grid()['time'])
    wanted = hours_since_t0(vertices['time'])
    snapped = steps[np.abs(steps[None, :] - wanted[:, None]).argmin(axis=1)]
    return theta(
        vertices['lon'], vertices['lat'], vertices['depth'], snapped, coefficients()
    )


def returned_values(body: dict) -> list[float | None] | None:
    try:
        return body['ranges'][PARAMETER]['values']
    except (KeyError, TypeError):
        return None


def score(body: dict) -> dict:
    """Compare returned values with the three competing expectations."""
    values = returned_values(body)
    if values is None:
        return {'scored': False, 'reason': 'no ranges in response'}

    expectations = hypotheses()
    nearest = nearest_step_expectation()
    returned = np.array(
        [np.nan if value is None else float(value) for value in values], dtype=float
    )
    if returned.size != expectations['per_vertex'].size:
        return {
            'scored': False,
            'reason': f'expected {expectations["per_vertex"].size} values, '
            f'received {returned.size}',
        }

    def error_against(reference: np.ndarray) -> float:
        return float(np.nanmax(np.abs(returned - reference)))

    per_vertex_error = error_against(expectations['per_vertex'])
    return {
        'scored': True,
        'tolerance_degC': TOLERANCE,
        'max_abs_error_vs_per_vertex_degC': per_vertex_error,
        'max_abs_error_vs_single_time_query_degC': error_against(
            expectations['single_time_query']
        ),
        'max_abs_error_vs_single_time_first_vertex_degC': error_against(
            expectations['single_time_first_vertex']
        ),
        'max_abs_error_vs_nearest_time_step_degC': error_against(nearest),
        'matches_per_vertex_within_tolerance': bool(per_vertex_error <= TOLERANCE),
        'per_vertex_hypothesis_wins': bool(
            per_vertex_error
            < min(
                error_against(expectations['single_time_query']),
                error_against(nearest),
            )
        ),
        'per_vertex_table': [
            {
                'index': index,
                'returned': None if values[index] is None else float(values[index]),
                'expected_per_vertex': float(expectations['per_vertex'][index]),
                'expected_single_time_query': float(
                    expectations['single_time_query'][index]
                ),
                'expected_nearest_time_step': float(nearest[index]),
            }
            for index in range(returned.size)
        ],
    }


def validate_coveragejson(body: dict) -> dict:
    """Structural checks against the CoverageJSON Trajectory domain."""
    problems: list[str] = []
    vertices = route()
    expected_n = len(vertices['lon'])

    if body.get('type') != 'Coverage':
        problems.append(f"type is {body.get('type')!r}, expected 'Coverage'")
    domain = body.get('domain') or {}
    if domain.get('domainType') != 'Trajectory':
        problems.append(
            f"domainType is {domain.get('domainType')!r}, expected 'Trajectory'"
        )
    composite = (domain.get('axes') or {}).get('composite') or {}
    if composite.get('dataType') != 'tuple':
        problems.append('composite axis is not of dataType tuple')
    coordinates = composite.get('coordinates')
    if coordinates != ['t', 'x', 'y', 'z']:
        problems.append(f'composite coordinates are {coordinates!r}')
    values = composite.get('values') or []
    if len(values) != expected_n:
        problems.append(f'{len(values)} composite tuples, expected {expected_n}')
    if values and len(values[0]) != 4:
        problems.append(f'composite tuple has {len(values[0])} members, expected 4')

    ranges = body.get('ranges') or {}
    if PARAMETER not in ranges:
        problems.append(f'no range for {PARAMETER}')
    else:
        range_ = ranges[PARAMETER]
        if range_.get('axisNames') != ['composite']:
            problems.append(f"range axisNames are {range_.get('axisNames')!r}")
        if range_.get('shape') != [expected_n]:
            problems.append(f"range shape is {range_.get('shape')!r}")
        if len(range_.get('values') or []) != expected_n:
            problems.append('range value count does not match the composite axis')

    times_returned = [row[0] for row in values] if values else []
    times_sent = [
        str(np.datetime64(value, 's')) + 'Z' for value in route()['time']
    ]

    return {
        'well_formed_trajectory_coveragejson': not problems,
        'problems': problems,
        'domain_type': domain.get('domainType'),
        'composite_coordinates': coordinates,
        'composite_tuple_count': len(values),
        'first_composite_tuple': values[0] if values else None,
        'per_vertex_times_returned_match_times_sent': times_returned == times_sent,
        'referencing_systems': [
            entry.get('system', {}).get('type')
            for entry in (domain.get('referencing') or [])
        ],
        'parameters_present': sorted((body.get('parameters') or {}).keys()),
    }


def compare_handoff() -> dict:
    """Vertex by vertex: what was sent against what the provider was handed."""
    path = RESULTS / f"handoff-trajectory-{len(route()['lon'])}v.json"
    if not path.exists():
        return {'available': False, 'reason': f'{path.name} not written'}
    handoff = json.loads(path.read_text())
    geometry = handoff.get('geometry') or {}
    sent = as_records()
    m_sent = [record['m_epoch_seconds'] for record in sent]
    z_sent = [round(record['wkt_z_elevation_m'], WKT_DECIMALS) for record in sent]
    lon_sent = [round(record['lon'], WKT_DECIMALS) for record in sent]
    lat_sent = [round(record['lat'], WKT_DECIMALS) for record in sent]

    coords = geometry.get('coords_tuples') or []
    lon_got = [round(vertex[0], WKT_DECIMALS) for vertex in coords]
    lat_got = [round(vertex[1], WKT_DECIMALS) for vertex in coords]

    differences = []
    for index in range(len(sent)):
        row = {
            'index': index,
            'lon_sent': lon_sent[index],
            'lon_received': lon_got[index] if index < len(lon_got) else None,
            'lat_sent': lat_sent[index],
            'lat_received': lat_got[index] if index < len(lat_got) else None,
            'z_sent': z_sent[index],
            'z_received': (geometry.get('z_recovered') or [None] * len(sent))[index],
            'm_sent': m_sent[index],
            'm_received': (geometry.get('m_recovered') or [None] * len(sent))[index],
        }
        row['identical'] = (
            row['lon_sent'] == row['lon_received']
            and row['lat_sent'] == row['lat_received']
            and row['z_sent'] == row['z_received']
            and row['m_sent'] == row['m_received']
        )
        differences.append(row)

    return {
        'available': True,
        'handoff_file': path.name,
        'shapely_version': handoff.get('shapely_version'),
        'geos_version': handoff.get('geos_version'),
        'provider_class': handoff.get('provider_class'),
        'query_types_advertised': handoff.get('query_types_advertised'),
        'geom_type_received': geometry.get('geom_type'),
        'vertex_count_received': geometry.get('vertex_count'),
        'wkt_as_received': geometry.get('wkt_as_received'),
        'all_vertices_identical': all(row['identical'] for row in differences),
        'vertices': differences,
        'kwargs_received': handoff.get('kwargs'),
    }


def boundary_probes(base: str, collection: str = COLLECTION) -> dict:
    """Vertices outside the domain, non-monotonic times, and a repeated vertex."""
    origin = float(epoch_seconds(np.array([T0]))[0])
    hour = 3600.0
    beyond_horizon = origin + 60 * hour  # the fixture ends at +36 h
    deepest = float(DEPTHS[-1])

    cases = {
        'outside_horizontal_domain': (
            f'LINESTRING ZM ({LON0 - 5.0} {LAT0 - 5.0} -10 {origin + hour}, '
            f'{LON1 + 5.0} {LAT1 + 5.0} -10 {origin + 2 * hour})'
        ),
        'below_deepest_level': (
            f'LINESTRING ZM (-2.0 50.0 {-(deepest + 500.0)} {origin + hour}, '
            f'-1.0 51.0 {-(deepest + 900.0)} {origin + 2 * hour})'
        ),
        'beyond_last_time_step': (
            f'LINESTRING ZM (-2.0 50.0 -10 {beyond_horizon}, '
            f'-1.0 51.0 -10 {beyond_horizon + hour})'
        ),
        'non_monotonic_times': (
            f'LINESTRING ZM (-2.0 50.0 -10 {origin + 10 * hour}, '
            f'-1.0 51.0 -10 {origin + 2 * hour}, '
            f'-0.5 51.5 -10 {origin + 20 * hour})'
        ),
        'repeated_vertex': (
            f'LINESTRING ZM (-2.0 50.0 -10 {origin + 4 * hour}, '
            f'-2.0 50.0 -10 {origin + 4 * hour}, '
            f'-1.0 51.0 -10 {origin + 8 * hour})'
        ),
        'above_the_surface': (
            f'LINESTRING ZM (-2.0 50.0 250 {origin + 4 * hour}, '
            f'-1.0 51.0 300 {origin + 8 * hour})'
        ),
    }

    results = {}
    for label, wkt in cases.items():
        response = fetch(
            edr_url(base, collection, 'trajectory', {'coords': wkt, 'f': 'json'})
        )
        body = response.get('body')
        results[label] = {
            'request_url': response['request_url'],
            'status': response['status'],
            'values': returned_values(body) if isinstance(body, dict) else None,
            'body_excerpt': body if not isinstance(body, dict) else None,
            'composite': (
                ((body.get('domain') or {}).get('axes') or {})
                .get('composite', {})
                .get('values')
                if isinstance(body, dict)
                else None
            ),
        }
    return results


def _long_route_url(base: str, count: int) -> str:
    origin = float(epoch_seconds(np.array([T0]))[0])
    fraction = np.linspace(0.0, 1.0, count)
    lon = LON0 + 0.5 + fraction * (LON1 - LON0 - 1.0)
    lat = LAT0 + 0.5 + fraction * (LAT1 - LAT0 - 1.0)
    seconds = origin + fraction * 30 * 3600.0
    wkt = (
        'LINESTRING ZM ('
        + ', '.join(
            f'{lon[i]:.5f} {lat[i]:.5f} -25 {seconds[i]:.0f}' for i in range(count)
        )
        + ')'
    )
    return edr_url(base, COLLECTION, 'trajectory', {'coords': wkt, 'f': 'json'})


def length_probe(base: str) -> dict:
    """How long a trajectory can be before the request stops working, and why."""
    attempts = []

    def attempt(count: int) -> dict:
        url = _long_route_url(base, count)
        response = fetch(url)
        record = {
            'vertices': count,
            'url_length_bytes': len(url),
            'status': response['status'],
            'error': response.get('error'),
            'values_returned': (
                len(returned_values(response.get('body')) or [])
                if isinstance(response.get('body'), dict)
                else None
            ),
            'body_excerpt': (
                str(response.get('body'))[:300]
                if response['status'] != 200
                else None
            ),
        }
        attempts.append(record)
        return record

    low, high = 2, 2
    while attempt(high)['status'] == 200 and high < 8192:
        low, high = high, high * 2
    # Bisect for the exact vertex count at which the request stops being accepted.
    while high - low > 1:
        middle = (low + high) // 2
        if attempt(middle)['status'] == 200:
            low = middle
        else:
            high = middle

    last_good = _long_route_url(base, low)
    first_bad = _long_route_url(base, high)

    post = fetch(f'{base}/collections/{COLLECTION}/trajectory?f=json', method='POST')
    return {
        'attempts': attempts,
        'largest_accepted_vertex_count': low,
        'largest_accepted_url_bytes': len(last_good),
        'smallest_rejected_vertex_count': high,
        'smallest_rejected_url_bytes': len(first_bad),
        'note': (
            'The rejection is a request-line length limit, not anything about EDR: '
            'gunicorn defaults limit_request_line to 4094 bytes. It is configurable, '
            'and the vertex count it corresponds to depends on coordinate precision.'
        ),
        'post_form': {
            'request_url': post['request_url'],
            'status': post['status'],
            'body_excerpt': str(post['body'])[:300],
        },
    }


def run() -> dict:
    summary: dict = {
        'fixture_seed': SEED,
        'shapely_version_of_query_client': shapely.__version__,
        'geos_version_of_query_client': '.'.join(
            str(part) for part in shapely.geos_version
        ),
        'query_time_parameter': str(QUERY_TIME),
        'separation': separation(),
    }

    # What the server says it can do, for both providers (T011).
    for label, collection, base in (
        ('bespoke', COLLECTION, AT_PIN),
        ('stock-xarray-edr', STOCK_COLLECTION, AT_PIN),
    ):
        metadata = fetch(f'{base}/collections/{collection}?f=json')
        write(f'collection-metadata-{label}.json', metadata)
        body = metadata.get('body')
        summary.setdefault('advertised_query_types', {})[label] = (
            sorted((body.get('data_queries') or {}).keys())
            if isinstance(body, dict)
            else None
        )

    # The main event: one four-dimensional route, at the pin (T010, T019).
    wkt = wkt_linestring_zm()
    url = edr_url(
        AT_PIN,
        COLLECTION,
        'trajectory',
        {'coords': wkt, 'parameter-name': PARAMETER, 'datetime': f'{QUERY_TIME}Z',
         'f': 'json'},
    )
    response = fetch(url)
    write('trajectory-at-pin.json', response)
    summary['trajectory_at_pin'] = {
        'request_url': url,
        'coords': wkt,
        'status': response['status'],
        'content_type': response.get('headers', {}).get('Content-Type'),
    }
    if isinstance(response.get('body'), dict):
        summary['trajectory_at_pin']['score'] = score(response['body'])
        summary['trajectory_at_pin']['coveragejson'] = validate_coveragejson(
            response['body']
        )
    summary['handoff_comparison'] = compare_handoff()
    write('handoff-comparison.json', summary['handoff_comparison'])

    # The same request below the pin (T005 in the server, not just the probe).
    below = fetch(
        edr_url(
            BELOW_PIN,
            COLLECTION,
            'trajectory',
            {'coords': wkt, 'parameter-name': PARAMETER, 'f': 'json'},
        )
    )
    write('trajectory-below-pin.json', below)
    summary['trajectory_below_pin'] = {
        'request_url': below['request_url'],
        'status': below['status'],
        'body': below.get('body'),
    }

    # Three dimensions: a route with arrival times but no depth.
    m_only = fetch(
        edr_url(
            AT_PIN,
            COLLECTION,
            'trajectory',
            {'coords': wkt_linestring_m(), 'f': 'json'},
        )
    )
    write('trajectory-linestring-m.json', m_only)
    summary['trajectory_linestring_m'] = {
        'request_url': m_only['request_url'],
        'status': m_only['status'],
        'values': returned_values(m_only.get('body'))
        if isinstance(m_only.get('body'), dict)
        else None,
    }

    # Parameter selection, and a deliberately wrong parameter name.
    bad_parameter = fetch(
        edr_url(
            AT_PIN,
            COLLECTION,
            'trajectory',
            {'coords': wkt, 'parameter-name': 'not_a_parameter', 'f': 'json'},
        )
    )
    write('trajectory-bad-parameter.json', bad_parameter)
    summary['parameter_selection'] = {
        'valid_name_status': summary['trajectory_at_pin']['status'],
        'invalid_name_status': bad_parameter['status'],
        'invalid_name_body': bad_parameter.get('body'),
    }

    # Ascending against descending, so a Z sign error cannot hide (spec FR-009).
    ascending = wkt_linestring_zm()
    descending_vertices = route()
    descending_vertices['depth'] = descending_vertices['depth'][::-1].copy()
    descending = fetch(
        edr_url(
            AT_PIN,
            COLLECTION,
            'trajectory',
            {'coords': wkt_linestring_zm(descending_vertices), 'f': 'json'},
        )
    )
    write('trajectory-descending.json', descending)
    summary['vertical_direction'] = {
        'ascending_coords': ascending,
        'descending_status': descending['status'],
        'values_differ': (
            returned_values(descending.get('body'))
            != returned_values(response.get('body'))
            if isinstance(descending.get('body'), dict)
            else None
        ),
    }

    summary['boundary_probes'] = {
        'returning_null_outside_the_domain': boundary_probes(AT_PIN, COLLECTION),
        'extrapolating_outside_the_domain': boundary_probes(
            AT_PIN, EXTRAPOLATING_COLLECTION
        ),
    }
    write('boundary-probes.json', summary['boundary_probes'])

    summary['length_probe'] = length_probe(AT_PIN)
    write('length-probe.json', summary['length_probe'])

    write('summary.json', summary)
    return summary


def _print(summary: dict) -> None:
    print('=' * 78)
    print('drogna EDR trajectory spike — one four-dimensional route')
    print('=' * 78)
    print(f"fixture seed              : {summary['fixture_seed']}")
    print(f"advertised query types    : {summary.get('advertised_query_types')}")
    print()
    at_pin = summary['trajectory_at_pin']
    print(f"request                   : {at_pin['request_url'][:150]}...")
    print(f"status                    : {at_pin['status']}")
    covjson = at_pin.get('coveragejson') or {}
    print(f"domain type               : {covjson.get('domain_type')}")
    print(f"well-formed Trajectory    : {covjson.get('well_formed_trajectory_coveragejson')}")  # noqa: E501
    scored = at_pin.get('score') or {}
    if scored.get('scored'):
        print()
        print(f"tolerance                 : {scored['tolerance_degC']} degC")
        print(f"max error vs per-vertex   : {scored['max_abs_error_vs_per_vertex_degC']:.3e} degC")  # noqa: E501
        print(f"max error vs single-time  : {scored['max_abs_error_vs_single_time_query_degC']:.3e} degC")  # noqa: E501
        print(f"max error vs nearest step : {scored['max_abs_error_vs_nearest_time_step_degC']:.3e} degC")  # noqa: E501
        print()
        print('  idx    returned   per-vertex  single-time  nearest-step')
        for row in scored['per_vertex_table']:
            returned = 'null' if row['returned'] is None else f"{row['returned']:10.5f}"
            print(
                '  {index:3d}  {returned}  {pv:10.5f}  {st:11.5f}  {ns:12.5f}'.format(
                    index=row['index'],
                    returned=returned,
                    pv=row['expected_per_vertex'],
                    st=row['expected_single_time_query'],
                    ns=row['expected_nearest_time_step'],
                )
            )
    print()
    handoff = summary.get('handoff_comparison') or {}
    print(f"hand-off recorded         : {handoff.get('available')}")
    print(f"every vertex identical    : {handoff.get('all_vertices_identical')}")
    print(f"provider saw shapely      : {handoff.get('shapely_version')} / GEOS {handoff.get('geos_version')}")  # noqa: E501
    print()
    below = summary.get('trajectory_below_pin') or {}
    print(f"same request below the pin: HTTP {below.get('status')}")
    print()
    print(f'results written to {RESULTS}')


if __name__ == '__main__':
    try:
        _print(run())
    except Exception as error:  # noqa: BLE001 - the spike reports its own failures
        print(f'query run failed: {type(error).__name__}: {error}')
        raise
    sys.exit(0)
