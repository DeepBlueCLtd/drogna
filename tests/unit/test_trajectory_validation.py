"""What a trajectory request is refused for, and that each refusal names its own cause.

Every case here is one that would otherwise return HTTP 200 with a plausible answer:
a route reordered into increasing time, a route truncated to the framework's record limit, a
route quietly extrapolated past the forecast horizon. Those are the failures worth testing,
because none of them is visible in the response.

The vertices are built from coordinate rows rather than from parsed geometry, so these rules
are checked without a geometry library present. `test_wkt_m_ordinate.py` is where the parse
itself is asserted.
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
from plugins.edr_trajectory import (  # noqa: E402
    TrajectoryQuery,
    vertices_from_coordinates,
)
from plugins.errors import RequestTooLargeError, TrajectoryRefusedError  # noqa: E402

INSIDE = "2026-09-01T01:00:00.000000Z"


def query_over(tmp_path: Path, **limits: int) -> TrajectoryQuery:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    return TrajectoryQuery(open_run(entry, support.settings(**limits)))


def route(*moments: str, longitude: float = -4.5, latitude: float = 49.0, depth: float = 25.0):
    return vertices_from_coordinates(
        [[longitude, latitude, -depth, support.unix_seconds(moment)] for moment in moments],
        default_depth_metres=0.0,
    )


def test_a_route_whose_times_go_backwards_is_refused_with_the_vertex_named(
    tmp_path: Path,
) -> None:
    vertices = route(
        "2026-09-01T00:30:00.000000Z",
        "2026-09-01T01:30:00.000000Z",
        "2026-09-01T01:00:00.000000Z",
    )
    with pytest.raises(TrajectoryRefusedError) as refusal:
        query_over(tmp_path).sample(vertices)
    message = str(refusal.value)
    assert "vertex 2" in message
    assert "vertex 1" in message
    assert "reordered" in message


def test_two_vertices_at_the_same_moment_are_refused_rather_than_deduplicated(
    tmp_path: Path,
) -> None:
    vertices = route(INSIDE, INSIDE)
    with pytest.raises(TrajectoryRefusedError) as refusal:
        query_over(tmp_path).sample(vertices)
    assert "vertex 1" in str(refusal.value)


def test_a_route_longer_than_the_limit_is_refused_with_the_limit_stated(
    tmp_path: Path,
) -> None:
    moments = [f"2026-09-01T00:{minute:02d}:00.000000Z" for minute in range(0, 24, 4)]
    with pytest.raises(RequestTooLargeError) as refusal:
        query_over(tmp_path, trajectory_maximum_vertices=4).sample(route(*moments))
    message = str(refusal.value)
    assert "6 vertices" in message
    assert "limit is 4" in message
    assert "truncated" in message


def test_a_vertex_beyond_the_forecast_horizon_is_declined_and_never_extrapolated(
    tmp_path: Path,
) -> None:
    vertices = route(INSIDE, "2026-09-02T00:00:00.000000Z")
    coverage = query_over(tmp_path).sample(vertices, parameters=["sea_water_temperature"])

    values = coverage["ranges"]["sea_water_temperature"]["values"]
    assert values[0] is not None
    assert values[1] is None

    declined = coverage["drogna:declined"]
    assert [entry["vertex"] for entry in declined] == [1]
    assert "time" in declined[0]["reason"]
    assert "extrapolat" in declined[0]["note"]


def test_a_vertex_outside_the_horizontal_domain_is_declined_by_name(tmp_path: Path) -> None:
    vertices = vertices_from_coordinates(
        [
            [-4.5, 49.0, -25.0, support.unix_seconds(INSIDE)],
            [12.0, 49.0, -25.0, support.unix_seconds("2026-09-01T02:00:00.000000Z")],
        ],
        default_depth_metres=0.0,
    )
    coverage = query_over(tmp_path).sample(vertices, parameters=["sea_water_temperature"])
    declined = coverage["drogna:declined"]

    assert [entry["vertex"] for entry in declined] == [1]
    assert "longitude" in declined[0]["reason"]


def test_a_vertex_deeper_than_the_deepest_level_is_declined(tmp_path: Path) -> None:
    vertices = vertices_from_coordinates(
        [[-4.5, 49.0, -5000.0, support.unix_seconds(INSIDE)]],
        default_depth_metres=0.0,
    )
    coverage = query_over(tmp_path).sample(vertices, parameters=["sea_water_temperature"])

    assert coverage["ranges"]["sea_water_temperature"]["values"] == [None]
    assert "depth" in coverage["drogna:declined"][0]["reason"]


def test_a_route_with_no_vertices_is_refused() -> None:
    with pytest.raises(TrajectoryRefusedError):
        vertices_from_coordinates([], default_depth_metres=0.0)


def test_a_nan_arrival_time_is_refused_with_the_version_pin_named() -> None:
    with pytest.raises(TrajectoryRefusedError) as refusal:
        vertices_from_coordinates([[-4.5, 49.0, -25.0, float("nan")]], default_depth_metres=0.0)
    assert "FR-051" in str(refusal.value)


def test_a_vertex_with_too_few_ordinates_is_refused_rather_than_defaulted() -> None:
    with pytest.raises(TrajectoryRefusedError) as refusal:
        vertices_from_coordinates([[-4.5, 49.0]], default_depth_metres=0.0)
    assert "arrival time" in str(refusal.value)


def test_an_unknown_parameter_is_refused_with_what_is_served_named(tmp_path: Path) -> None:
    with pytest.raises(Exception) as refusal:
        query_over(tmp_path).sample(route(INSIDE), parameters=["speed_of_sound_in_sea_water"])
    message = str(refusal.value)
    assert "speed_of_sound_in_sea_water" in message
    assert "sea_water_temperature" in message
