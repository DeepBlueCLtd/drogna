"""AT-01: a four-dimensional route through the forecast volume, scored against ground truth.

The SRD's first acceptance test. A route is submitted whose vertices each carry the time the
platform is expected to be there, and the returned values are compared against what the field
says at each vertex's own position, depth and time. The **error is reported as a figure**;
recovery is not asserted without one (Constitution IX).

**What the ground truth is here, and what it is not.** The field is this feature's fixture:
multilinear, with a closed form, so the expected value at an off-grid vertex is arithmetic
rather than a second interpolation, and so "each vertex at its own time" cannot be confused
with "the whole route at one time". It stands in for the environment generator's recorded
manifest, which reaches a coverage store only once the publisher writes a generated run into
one — feature 009's work, not this feature's. That substitution is named rather than glossed:
what is scored here is the query layer's four-dimensional sampling, not the model's skill.

The three comparisons are the ones the spike found necessary. Against per-vertex times, the
answer should be exact. Against a single query time, it should be far away — otherwise the
route was evaluated at one moment and the response, which is structurally identical either
way, would be wrong in a manner nobody could see. Against snapping to the nearest coverage
step, it should also be distinguishable — otherwise half a degree of avoidable error is being
reported as the harness's recovery figure.
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

PARAMETERS = ("sea_water_temperature", "sea_water_practical_salinity", "temperature_uncertainty")

# A route crossing the domain diagonally and descending, with arrival times deliberately off
# the coverage's hourly steps.
VERTEX_COUNT = 20


def route():
    for index in range(VERTEX_COUNT):
        fraction = index / (VERTEX_COUNT - 1)
        yield (
            -5.7 + fraction * 2.4,
            48.2 + fraction * 1.6,
            5.0 + fraction * 280.0,
            420.0 + fraction * 13500.0,
        )


def test_at01_a_four_dimensional_route_is_answered_vertex_by_vertex(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    run = open_run(entry, support.settings())

    origin = support.unix_seconds(support.TIME_ORIGIN)
    vertices = vertices_from_coordinates(
        [
            [longitude, latitude, -depth, origin + seconds]
            for longitude, latitude, depth, seconds in route()
        ],
        default_depth_metres=0.0,
    )
    coverage = TrajectoryQuery(run).sample(vertices, parameters=list(PARAMETERS))

    assert coverage["domain"]["domainType"] == "Trajectory"
    assert coverage["drogna:declined"] == []

    query_time = next(iter(route()))[3]
    report: list[str] = []
    worst_per_vertex = 0.0

    for parameter in PARAMETERS:
        returned = coverage["ranges"][parameter]["values"]
        per_vertex = [
            support.truth(parameter, seconds, depth, latitude, longitude)
            for longitude, latitude, depth, seconds in route()
        ]
        single_time = [
            support.truth(parameter, query_time, depth, latitude, longitude)
            for longitude, latitude, depth, _ in route()
        ]
        nearest_step = [
            support.truth(
                parameter,
                min(support.TIMES, key=lambda step: abs(step - seconds)),
                depth,
                latitude,
                longitude,
            )
            for longitude, latitude, depth, seconds in route()
        ]

        against_vertex = max(abs(a - b) for a, b in zip(returned, per_vertex, strict=True))
        against_single = max(abs(a - b) for a, b in zip(returned, single_time, strict=True))
        against_nearest = max(abs(a - b) for a, b in zip(returned, nearest_step, strict=True))
        worst_per_vertex = max(worst_per_vertex, against_vertex)

        report.append(
            f"    {parameter:<32} per-vertex {against_vertex:.3e}   "
            f"single-time {against_single:.3e}   nearest-step {against_nearest:.3e}"
        )
        assert against_single > against_vertex * 1e6, (
            f"{parameter}: the per-vertex answer is not separated from the single-time one, "
            f"so this test cannot tell them apart"
        )
        assert against_nearest > against_vertex * 1e6, (
            f"{parameter}: the response cannot be told from one that snapped to the nearest "
            f"coverage step"
        )

    spacing = support.grid_spacing()
    with capsys.disabled():
        print(
            f"\n  AT-01: {VERTEX_COUNT}-vertex route, {len(PARAMETERS)} parameters"
            f"\n  worst absolute error against the field, per vertex, per parameter:"
            + "\n"
            + "\n".join(report)
            + f"\n  grid spacing: {spacing['longitude_degrees']:.2f}° longitude, "
            f"{spacing['latitude_degrees']:.2f}° latitude, {spacing['depth_metres']:.0f} m "
            f"depth, {spacing['time_seconds']:.0f} s"
            f"\n  ground truth: this feature's analytic fixture field, standing in for the "
            f"environment generator's recorded manifest until the publisher writes a "
            f"generated run into a coverage store."
        )

    # Reported first, asserted second, and the bound is the arithmetic's own: the field is
    # exactly representable, so anything above a few units in the last place is a defect in
    # the sampling rather than a limit of the method.
    assert worst_per_vertex < 1e-9


def test_at01_shifting_one_vertex_s_time_moves_that_vertex_alone(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run = open_run(CoverageCatalogue(layout).current(), support.settings())
    query = TrajectoryQuery(run)
    origin = support.unix_seconds(support.TIME_ORIGIN)

    rows = [
        [longitude, latitude, -depth, origin + seconds]
        for longitude, latitude, depth, seconds in route()
    ]
    before = query.sample(
        vertices_from_coordinates(rows, default_depth_metres=0.0),
        parameters=["sea_water_temperature"],
    )["ranges"]["sea_water_temperature"]["values"]

    moved = [list(row) for row in rows]
    moved[9][3] += 350.0  # still between its neighbours, so the route stays monotonic
    after = query.sample(
        vertices_from_coordinates(moved, default_depth_metres=0.0),
        parameters=["sea_water_temperature"],
    )["ranges"]["sea_water_temperature"]["values"]

    assert after[9] != before[9]
    assert [value for index, value in enumerate(after) if index != 9] == [
        value for index, value in enumerate(before) if index != 9
    ]
