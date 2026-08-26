"""Every vertex answered for its own arrival time, and the shape the client needs.

The failure this file exists to catch is not a crash. It is a provider that evaluates the
whole route at one time and returns HTTP 200: structurally correct CoverageJSON, plausible
values, and nothing in the response to say which question was answered. So the assertions
are comparative rather than structural — each vertex against its own time, and against what
the same route would have returned at the query time.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import query_layer_support as support  # noqa: E402
from plugins.coverage_catalogue import CoverageCatalogue  # noqa: E402
from plugins.edr_coverage import open_run  # noqa: E402
from plugins.edr_trajectory import TrajectoryQuery, vertices_from_coordinates  # noqa: E402

TEMPERATURE = "sea_water_temperature"
UNCERTAINTY = "temperature_uncertainty"

# Vertex times sit deliberately between the fixture's hourly steps, so that interpolating in
# time and snapping to the nearest step give different answers. The spike found half a degree
# between them, and no way to tell from outside which had been done.
ROUTE = (
    (-5.4, 48.5, 10.0, "2026-09-01T00:18:00.000000Z"),
    (-4.8, 48.8, 40.0, "2026-09-01T01:12:00.000000Z"),
    (-4.2, 49.1, 90.0, "2026-09-01T02:06:00.000000Z"),
    (-3.6, 49.4, 150.0, "2026-09-01T03:24:00.000000Z"),
)


@pytest.fixture
def query(tmp_path: Path) -> TrajectoryQuery:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    return TrajectoryQuery(open_run(entry, support.settings()))


def vertices(route=ROUTE):
    return vertices_from_coordinates(
        [
            [longitude, latitude, -depth, support.unix_seconds(moment)]
            for longitude, latitude, depth, moment in route
        ],
        default_depth_metres=0.0,
    )


def seconds_of(moment: str) -> float:
    return support.unix_seconds(moment) - support.unix_seconds(support.TIME_ORIGIN)


def test_the_response_is_a_trajectory_domain_with_a_per_vertex_composite_axis(
    query: TrajectoryQuery,
) -> None:
    document = query.sample(vertices(), parameters=[TEMPERATURE, UNCERTAINTY])

    domain = document["domain"]
    assert domain["domainType"] == "Trajectory"
    composite = domain["axes"]["composite"]
    assert composite["dataType"] == "tuple"
    assert composite["coordinates"] == ["t", "x", "y", "z"]
    assert len(composite["values"]) == len(ROUTE)
    for tuple_, (longitude, latitude, depth, moment) in zip(
        composite["values"], ROUTE, strict=True
    ):
        assert tuple_ == [moment, longitude, latitude, depth]

    for name in (TEMPERATURE, UNCERTAINTY):
        block = document["ranges"][name]
        assert block["axisNames"] == ["composite"]
        assert block["shape"] == [len(ROUTE)]
        assert len(block["values"]) == len(ROUTE)


def test_each_vertex_is_answered_for_its_own_time_and_not_for_the_query_s(
    query: TrajectoryQuery, capsys: pytest.CaptureFixture[str]
) -> None:
    document = query.sample(vertices(), parameters=[TEMPERATURE])
    returned = document["ranges"][TEMPERATURE]["values"]

    per_vertex = [
        support.truth(TEMPERATURE, seconds_of(moment), depth, latitude, longitude)
        for longitude, latitude, depth, moment in ROUTE
    ]
    # What the same route would have returned had the provider evaluated it all at the
    # first vertex's time — the failure mode that is invisible from the response.
    single_time = [
        support.truth(TEMPERATURE, seconds_of(ROUTE[0][3]), depth, latitude, longitude)
        for longitude, latitude, depth, _ in ROUTE
    ]
    # And what snapping each vertex to the nearest coverage step would have returned.
    nearest = [
        support.truth(
            TEMPERATURE,
            min(support.TIMES, key=lambda step: abs(step - seconds_of(moment))),
            depth,
            latitude,
            longitude,
        )
        for longitude, latitude, depth, moment in ROUTE
    ]

    against_per_vertex = max(abs(a - b) for a, b in zip(returned, per_vertex, strict=True))
    against_single = max(abs(a - b) for a, b in zip(returned, single_time, strict=True))
    against_nearest = max(abs(a - b) for a, b in zip(returned, nearest, strict=True))

    with capsys.disabled():
        print(
            f"\n  worst error against per-vertex times : {against_per_vertex:.3e} degC"
            f"\n  worst error against one query time   : {against_single:.3e} degC"
            f"\n  worst error against nearest step     : {against_nearest:.3e} degC"
        )

    assert against_per_vertex < 1e-9
    assert against_single > 1e-2, "the per-vertex and single-time answers are not separated"
    assert against_nearest > 1e-3, "the response cannot be told from one that snapped"


def test_changing_one_vertex_s_time_changes_that_vertex_and_no_other(
    query: TrajectoryQuery,
) -> None:
    """SC-004, and the direction the moving feature implies."""
    before = query.sample(vertices(), parameters=[TEMPERATURE])["ranges"][TEMPERATURE]["values"]

    shifted = list(ROUTE)
    longitude, latitude, depth, _ = shifted[2]
    shifted[2] = (longitude, latitude, depth, "2026-09-01T03:06:00.000000Z")
    after = query.sample(vertices(tuple(shifted)), parameters=[TEMPERATURE])["ranges"][TEMPERATURE][
        "values"
    ]

    assert after[2] != before[2]
    for index in (0, 1, 3):
        assert after[index] == before[index]

    # The field carries a time-by-longitude term, so an hour later at this longitude moves
    # the value in a direction the coefficient fixes. Asserted as a direction, not a value:
    # a magnitude would be asserting the fixture rather than the provider.
    field = support.FIELDS[TEMPERATURE]
    per_hour_here = field.per_hour + field.time_longitude * longitude
    assert (after[2] - before[2] > 0) == (per_hour_here > 0)


def test_the_forecast_and_the_uncertainty_are_sampled_on_the_same_vertices(
    query: TrajectoryQuery,
) -> None:
    document = query.sample(vertices(), parameters=[TEMPERATURE, UNCERTAINTY])
    for name in (TEMPERATURE, UNCERTAINTY):
        values = document["ranges"][name]["values"]
        expected = [
            support.truth(name, seconds_of(moment), depth, latitude, longitude)
            for longitude, latitude, depth, moment in ROUTE
        ]
        assert values == pytest.approx(expected, abs=1e-9)


def test_a_route_with_no_depth_takes_the_configured_default(query: TrajectoryQuery) -> None:
    flat = vertices_from_coordinates(
        [
            [longitude, latitude, support.unix_seconds(moment)]
            for longitude, latitude, _, moment in ROUTE
        ],
        default_depth_metres=50.0,
    )
    document = query.sample(flat, parameters=[TEMPERATURE])
    assert [tuple_[3] for tuple_ in document["domain"]["axes"]["composite"]["values"]] == [
        50.0
    ] * len(ROUTE)


def test_a_ninety_one_vertex_route_is_answered(query: TrajectoryQuery) -> None:
    """The GET ceiling the spike measured, at the limit both destinations configure."""
    long_route = tuple(
        (
            -5.9 + index * 0.03,
            48.1 + index * 0.02,
            5.0 + index,
            f"2026-09-01T{index // 60:02d}:{index % 60:02d}:00.000000Z",
        )
        for index in range(91)
    )
    document = query.sample(vertices(long_route), parameters=[TEMPERATURE])
    assert len(document["ranges"][TEMPERATURE]["values"]) == 91
    assert document["drogna:declined"] == []
