"""Radius and area: only the geometry's nodes, scored against the analytic field.

The store is built by the environment generator's own writer and the field is multilinear,
so the expected value at any grid node is closed form (`tests/query_layer_support.py`).
What is asserted here is what a schema check would miss: that the selection is exactly the
geometry's nodes — a node just outside the circle is absent, not null — that the values
are the field's, and that every refusal names its cause and its limit.
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
from plugins.edr_region import RegionQuery  # noqa: E402
from plugins.errors import QueryLayerError, RequestTooLargeError  # noqa: E402

# The grid the fixture store carries: 0.6 deg longitude, 0.5 deg latitude spacing. At
# latitude 49 a longitude step is about 43.8 km and a latitude step 55.6 km, so a 60 km
# circle around a node selects the node and its four axis neighbours and excludes every
# diagonal (about 70.7 km away). The membership expectation is arithmetic, not a rerun of
# the code under test.
CENTRE = (-4.8, 49.0)
CROSS = {(-4.8, 49.0), (-4.2, 49.0), (-5.4, 49.0), (-4.8, 49.5), (-4.8, 48.5)}

SQUARE = [(-5.0, 48.4), (-4.0, 48.4), (-4.0, 49.6), (-5.0, 49.6)]
SQUARE_NODES = {
    (longitude, latitude) for longitude in (-4.8, -4.2) for latitude in (48.5, 49.0, 49.5)
}

WINDOW = "2026-09-01T00:00:00.000000Z/2026-09-01T02:00:00.000000Z"


def region(tmp_path: Path, **limits: int) -> RegionQuery:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    return RegionQuery(open_run(entry, support.settings(**limits)))


def test_a_radius_selects_exactly_the_nodes_inside_the_circle(tmp_path: Path) -> None:
    document = region(tmp_path).radius(
        longitude=CENTRE[0],
        latitude=CENTRE[1],
        within_km=60.0,
        z="0",
        datetime_="2026-09-01T01:00:00.000000Z",
        parameters=["sea_water_temperature"],
    )
    axes = document["domain"]["axes"]
    assert document["domain"]["domainType"] == "MultiPointSeries"
    selected = {(x, y) for x, y, _ in axes["composite"]["values"]}
    assert selected == CROSS
    # The diagonal neighbour is absent, not null: absence and refusal-to-extrapolate
    # stay two different facts.
    assert (-4.2, 49.5) not in selected

    block = document["ranges"]["sea_water_temperature"]
    assert block["shape"] == [1, len(CROSS)]
    for position, value in zip(axes["composite"]["values"], block["values"], strict=True):
        longitude, latitude, depth = position
        expected = support.truth("sea_water_temperature", 3600.0, depth, latitude, longitude)
        assert value == pytest.approx(expected, abs=1e-9)


def test_an_area_selects_exactly_the_nodes_inside_the_polygon(tmp_path: Path) -> None:
    document = region(tmp_path).area(
        ring=SQUARE,
        z="0/200",
        datetime_=WINDOW,
        parameters=["sea_water_temperature", "temperature_uncertainty"],
    )
    axes = document["domain"]["axes"]
    nodes = {(x, y) for x, y, _ in axes["composite"]["values"]}
    assert nodes == SQUARE_NODES
    depths = sorted({z for _, _, z in axes["composite"]["values"]})
    assert depths == [0.0, 100.0, 200.0]
    assert axes["t"]["values"] == [
        "2026-09-01T00:00:00.000000Z",
        "2026-09-01T01:00:00.000000Z",
        "2026-09-01T02:00:00.000000Z",
    ]

    positions = axes["composite"]["values"]
    for name in ("sea_water_temperature", "temperature_uncertainty"):
        block = document["ranges"][name]
        assert block["shape"] == [3, len(positions)]
        assert block["axisNames"] == ["t", "composite"]
        # Values are time-major: the value for time index 1, position index 2 sits at
        # 1 * len(positions) + 2. Scored against the closed form, spot and corner alike.
        for time_index, time_seconds in enumerate((0.0, 3600.0, 7200.0)):
            for position_index, (longitude, latitude, depth) in enumerate(positions):
                value = block["values"][time_index * len(positions) + position_index]
                expected = support.truth(name, time_seconds, depth, latitude, longitude)
                assert value == pytest.approx(expected, abs=1e-9)


def test_an_over_budget_area_is_refused_with_the_count_and_the_limit(tmp_path: Path) -> None:
    with pytest.raises(RequestTooLargeError) as caught:
        region(tmp_path, area_maximum_cells=100).area(ring=SQUARE)
    message = str(caught.value)
    # All depths and the default (whole valid-time) window: 5 times x 4 depths x 6 nodes.
    assert "120 cells" in message
    assert "area_maximum_cells is 100" in message
    assert "truncated" in message


def test_an_over_budget_radius_is_refused_with_the_count_and_the_limit(tmp_path: Path) -> None:
    with pytest.raises(RequestTooLargeError) as caught:
        region(tmp_path, radius_maximum_cells=50).radius(
            longitude=CENTRE[0], latitude=CENTRE[1], within_km=60.0
        )
    message = str(caught.value)
    assert "100 cells" in message  # 5 times x 4 depths x 5 nodes
    assert "radius_maximum_cells is 50" in message


def test_an_empty_selection_is_refused_naming_the_domain(tmp_path: Path) -> None:
    with pytest.raises(QueryLayerError, match="selects no grid node") as caught:
        region(tmp_path).radius(longitude=10.0, latitude=10.0, within_km=5.0)
    assert "domain" in str(caught.value)

    with pytest.raises(QueryLayerError, match="selects no grid node"):
        region(tmp_path).area(ring=[(10.0, 10.0), (11.0, 10.0), (11.0, 11.0)])


def test_a_boundary_node_is_inside_the_drawn_polygon(tmp_path: Path) -> None:
    # A ring with the node at (-4.8, 49.0) as one of its own vertices: the caller drew
    # a boundary, and a point on it is not beyond it.
    ring = [(-4.8, 49.0), (-4.6, 49.0), (-4.6, 49.2), (-4.8, 49.2)]
    document = region(tmp_path).area(ring=ring, z="0", datetime_="2026-09-01T00:00:00.000000Z")
    nodes = {(x, y) for x, y, _ in document["domain"]["axes"]["composite"]["values"]}
    assert nodes == {(-4.8, 49.0)}


class _Ring:
    def __init__(self, coords):
        self.coords = coords


class _StubPolygon:
    geom_type = "Polygon"

    def __init__(self, exterior, interiors=()):
        self.exterior = _Ring(exterior)
        self.interiors = list(interiors)


class _StubPoint:
    geom_type = "Point"

    def __init__(self, x, y):
        self.x = x
        self.y = y


class _StubMultiPolygon:
    geom_type = "MultiPolygon"


def test_the_provider_reads_a_single_ring_polygon_and_refuses_the_rest() -> None:
    """T009: the shape refusals, against the Shapely API shape pygeoapi hands over.

    Duck-typed stubs, because the workspace carries no geometry library; the duck-typing
    is the point — these helpers touch only geom_type, exterior.coords and interiors,
    which is what lets them be tested where the provider itself cannot be constructed.
    """
    from plugins.edr_composer import point_from_geometry, ring_from_polygon

    ring = ring_from_polygon(_StubPolygon([(-5.0, 48.4), (-4.0, 48.4), (-4.0, 49.6)]))
    assert ring == [(-5.0, 48.4), (-4.0, 48.4), (-4.0, 49.6)]

    with pytest.raises(QueryLayerError, match="MultiPolygon"):
        ring_from_polygon(_StubMultiPolygon())
    with pytest.raises(QueryLayerError, match="1 interior ring"):
        ring_from_polygon(
            _StubPolygon(
                [(-5.0, 48.4), (-4.0, 48.4), (-4.0, 49.6)],
                interiors=[_Ring([(-4.6, 48.8), (-4.4, 48.8), (-4.5, 49.0)])],
            )
        )
    with pytest.raises(QueryLayerError, match="POLYGON"):
        ring_from_polygon(_StubPoint(-4.5, 49.0))

    assert point_from_geometry(_StubPoint(-4.5, 49.0)) == (-4.5, 49.0)
    with pytest.raises(QueryLayerError, match="POINT"):
        point_from_geometry(_StubPolygon([(-5.0, 48.4), (-4.0, 48.4), (-4.0, 49.6)]))
