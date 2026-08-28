"""The corridor: a route with a width whose answer genuinely depends on the width.

The fixture grid's horizontal spacing is 0.6 deg longitude and 0.5 deg latitude, so the
cross-track step is the longitude spacing at the domain's mid-latitude (49 deg):
0.6 x 111.195 x cos(49 deg), about 43.77 km. The offset expectations below are that
arithmetic, not a rerun of the code under test; the values are scored against the
multilinear field's closed form, which quadrilinear interpolation reproduces exactly at
displaced vertices too.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import query_layer_support as support  # noqa: E402
from plugins.coverage_catalogue import CoverageCatalogue  # noqa: E402
from plugins.edr_corridor import (  # noqa: E402
    CorridorQuery,
    cross_track_offsets_km,
    cross_track_step_km,
)
from plugins.edr_coverage import open_run  # noqa: E402
from plugins.edr_geometry import KM_PER_DEGREE_LATITUDE  # noqa: E402
from plugins.edr_trajectory import Vertex  # noqa: E402
from plugins.errors import RequestTooLargeError, TrajectoryRefusedError  # noqa: E402

EXPECTED_STEP_KM = 0.6 * KM_PER_DEGREE_LATITUDE * math.cos(math.radians(49.0))


def corridor(tmp_path: Path, **limits: int) -> CorridorQuery:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    return CorridorQuery(open_run(entry, support.settings(**limits)))


def due_east_route(latitude: float = 49.0, depth: float = 50.0) -> list[Vertex]:
    return [
        Vertex(
            index=index,
            longitude=longitude,
            latitude=latitude,
            depth=depth,
            unix_seconds=support.unix_seconds(f"2026-09-01T0{index}:00:00.000000Z"),
        )
        for index, longitude in enumerate((-5.4, -4.8, -4.2))
    ]


def test_the_cross_track_step_is_the_grids_own_resolution(tmp_path: Path) -> None:
    assert cross_track_step_km(corridor(tmp_path).run) == pytest.approx(EXPECTED_STEP_KM, rel=1e-9)


def test_offsets_always_include_the_centreline_and_both_edges() -> None:
    # Narrower than the grid step: still three routes, so any width changes the answer.
    assert cross_track_offsets_km(20.0, EXPECTED_STEP_KM) == [-10.0, 0.0, 10.0]
    # Wider: interior offsets at the grid step join the edges.
    wide = cross_track_offsets_km(100.0, EXPECTED_STEP_KM)
    assert wide == sorted(wide)
    assert set(wide) == {
        -50.0,
        -EXPECTED_STEP_KM,
        0.0,
        EXPECTED_STEP_KM,
        50.0,
    }


def test_a_corridor_is_parallel_trajectories_scored_against_the_field(tmp_path: Path) -> None:
    document = corridor(tmp_path).sample(
        due_east_route(), width_km=20.0, parameters=["sea_water_temperature"]
    )
    assert document["type"] == "CoverageCollection"
    assert document["domainType"] == "Trajectory"
    block = document["drogna:corridor"]
    assert block["width_km"] == 20.0
    assert block["cross_track_step_km"] == pytest.approx(EXPECTED_STEP_KM, rel=1e-9)
    assert block["offsets_km"] == [-10.0, 0.0, 10.0]

    members = document["coverages"]
    assert [member["drogna:cross_track_km"] for member in members] == [-10.0, 0.0, 10.0]

    for member in members:
        offset = member["drogna:cross_track_km"]
        # Left of due-east travel is north: the whole route is displaced in latitude
        # only, by the offset over the kilometres in a degree.
        expected_latitude = 49.0 + offset / KM_PER_DEGREE_LATITUDE
        vertices = member["domain"]["axes"]["composite"]["values"]
        values = member["ranges"]["sea_water_temperature"]["values"]
        assert len(vertices) == 3
        for index, ((_, longitude, latitude, depth), value) in enumerate(
            zip(vertices, values, strict=True)
        ):
            assert longitude == pytest.approx((-5.4, -4.8, -4.2)[index], abs=1e-9)
            assert latitude == pytest.approx(expected_latitude, abs=1e-9)
            expected = support.truth(
                "sea_water_temperature", index * 3600.0, depth, latitude, longitude
            )
            assert value == pytest.approx(expected, abs=1e-9)


def test_an_edge_pushed_past_the_extent_is_declined_in_that_member_only(tmp_path: Path) -> None:
    # A route along the domain's top edge: the port edge (+10 km) leaves the domain and
    # is declined by name, vertex by vertex; the centre and starboard members answer.
    document = corridor(tmp_path).sample(
        due_east_route(latitude=50.0), width_km=20.0, parameters=["sea_water_temperature"]
    )
    by_offset = {member["drogna:cross_track_km"]: member for member in document["coverages"]}
    assert [entry["vertex"] for entry in by_offset[10.0]["drogna:declined"]] == [0, 1, 2]
    port_values = by_offset[10.0]["ranges"]["sea_water_temperature"]["values"]
    assert all(value is None for value in port_values)
    assert by_offset[0.0]["drogna:declined"] == []
    assert by_offset[-10.0]["drogna:declined"] == []
    assert all(
        value is not None for value in by_offset[0.0]["ranges"]["sea_water_temperature"]["values"]
    )


def test_an_over_budget_corridor_is_refused_with_both_factors_and_the_limit(
    tmp_path: Path,
) -> None:
    with pytest.raises(RequestTooLargeError) as caught:
        corridor(tmp_path, corridor_maximum_samples=8).sample(due_east_route(), width_km=20.0)
    message = str(caught.value)
    assert "9 samples" in message
    assert "3 offset routes" in message
    assert "corridor_maximum_samples is 8" in message
    assert "truncated" in message


def test_the_trajectory_vertex_budget_applies_per_route(tmp_path: Path) -> None:
    with pytest.raises(RequestTooLargeError, match="3 vertices"):
        corridor(tmp_path, trajectory_maximum_vertices=2).sample(due_east_route(), width_km=20.0)


def test_a_route_out_of_time_order_is_refused_before_any_width_arithmetic(
    tmp_path: Path,
) -> None:
    route = due_east_route()
    backwards = [route[0], route[2], route[1]]
    reindexed = [
        Vertex(
            index=index,
            longitude=vertex.longitude,
            latitude=vertex.latitude,
            depth=vertex.depth,
            unix_seconds=vertex.unix_seconds,
        )
        for index, vertex in enumerate(backwards)
    ]
    with pytest.raises(TrajectoryRefusedError, match="not after"):
        corridor(tmp_path).sample(reindexed, width_km=20.0)
