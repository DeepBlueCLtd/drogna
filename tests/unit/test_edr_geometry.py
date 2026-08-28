"""The geometry the new query types select by, scored against closed forms.

Everything asserted here has an expectation from arithmetic rather than from a second
implementation of the same code: a degree of latitude is pi*R/180 kilometres by the
module's own stated radius, membership of a unit square is decidable by eye, and an
offset of a due-east route goes due north. The refusals are asserted to name their cause,
because a distance in a misread unit or a ring with two vertices would otherwise select a
plausible wrong neighbourhood with nothing in the response to say so.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT / "query") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "query"))

from plugins.edr_geometry import (  # noqa: E402
    EARTH_RADIUS_KM,
    KM_PER_DEGREE_LATITUDE,
    displace_km,
    haversine_km,
    parse_distance_km,
    perpendicular_offsets,
    point_in_ring,
)
from plugins.errors import QueryLayerError  # noqa: E402

UNIT_SQUARE = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)]


class TestHaversine:
    def test_one_degree_of_latitude_is_the_stated_radius_times_pi_over_180(self) -> None:
        expected = math.pi * EARTH_RADIUS_KM / 180.0
        assert haversine_km(0.0, 0.0, 0.0, 1.0) == pytest.approx(expected, rel=1e-12)
        assert pytest.approx(expected, rel=1e-12) == KM_PER_DEGREE_LATITUDE

    def test_one_degree_of_longitude_on_the_equator_is_the_same(self) -> None:
        assert haversine_km(0.0, 0.0, 1.0, 0.0) == pytest.approx(KM_PER_DEGREE_LATITUDE, rel=1e-12)

    def test_distance_is_symmetric_and_zero_at_coincidence(self) -> None:
        there = haversine_km(-4.5, 49.0, -5.2, 48.8)
        back = haversine_km(-5.2, 48.8, -4.5, 49.0)
        assert there == pytest.approx(back, rel=1e-12)
        assert haversine_km(-4.5, 49.0, -4.5, 49.0) == 0.0


class TestRingMembership:
    def test_inside_outside_and_boundary(self) -> None:
        assert point_in_ring(0.0, 0.0, UNIT_SQUARE)
        assert not point_in_ring(2.0, 0.0, UNIT_SQUARE)
        # A point on an edge, and a point on a vertex: the caller drew a boundary, and a
        # point on it is not beyond it.
        assert point_in_ring(1.0, 0.0, UNIT_SQUARE)
        assert point_in_ring(1.0, 1.0, UNIT_SQUARE)

    def test_an_open_and_a_closed_ring_are_the_same_ring(self) -> None:
        closed = [*UNIT_SQUARE, UNIT_SQUARE[0]]
        assert point_in_ring(0.5, 0.5, closed) == point_in_ring(0.5, 0.5, UNIT_SQUARE)
        assert point_in_ring(3.0, 0.5, closed) == point_in_ring(3.0, 0.5, UNIT_SQUARE)

    def test_a_concave_ring_excludes_its_notch(self) -> None:
        # An L-shape: the notch at the top right is outside.
        ring = [(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (1.0, 1.0), (1.0, 2.0), (0.0, 2.0)]
        assert point_in_ring(0.5, 1.5, ring)
        assert not point_in_ring(1.5, 1.5, ring)

    def test_a_degenerate_ring_is_refused_with_the_count(self) -> None:
        with pytest.raises(QueryLayerError, match="at least three"):
            point_in_ring(0.0, 0.0, [(0.0, 0.0), (1.0, 1.0)])
        # Closing a two-vertex "ring" does not smuggle it past the rule.
        with pytest.raises(QueryLayerError, match="at least three"):
            point_in_ring(0.0, 0.0, [(0.0, 0.0), (1.0, 1.0), (0.0, 0.0)])


class TestDistanceParsing:
    def test_kilometres_and_metres_are_served(self) -> None:
        assert parse_distance_km("12.5", "km", name="within") == pytest.approx(12.5)
        assert parse_distance_km("500", "m", name="within") == pytest.approx(0.5)
        assert parse_distance_km("3", None, name="within") == pytest.approx(3.0)

    def test_a_missing_distance_names_the_parameter(self) -> None:
        with pytest.raises(QueryLayerError, match="within"):
            parse_distance_km(None, "km", name="within")
        with pytest.raises(QueryLayerError, match="corridor-width"):
            parse_distance_km("", "km", name="corridor-width")

    def test_a_wrong_unit_is_refused_with_the_unit_named(self) -> None:
        with pytest.raises(QueryLayerError, match="'mi'"):
            parse_distance_km("10", "mi", name="within")

    def test_a_non_number_and_a_non_positive_distance_are_refused(self) -> None:
        with pytest.raises(QueryLayerError, match="not a number"):
            parse_distance_km("wide", "km", name="within")
        with pytest.raises(QueryLayerError, match="positive"):
            parse_distance_km("0", "km", name="within")


class TestDisplacement:
    def test_a_kilometre_north_is_a_known_fraction_of_a_degree(self) -> None:
        longitude, latitude = displace_km(-4.5, 49.0, east_km=0.0, north_km=KM_PER_DEGREE_LATITUDE)
        assert longitude == pytest.approx(-4.5)
        assert latitude == pytest.approx(50.0, abs=1e-12)

    def test_eastward_kilometres_shrink_with_latitude(self) -> None:
        km_per_degree_at_60 = KM_PER_DEGREE_LATITUDE * math.cos(math.radians(60.0))
        longitude, latitude = displace_km(0.0, 60.0, east_km=km_per_degree_at_60, north_km=0.0)
        assert longitude == pytest.approx(1.0, abs=1e-12)
        assert latitude == pytest.approx(60.0)


class TestPerpendicularOffsets:
    def test_left_of_a_due_east_route_on_the_equator_is_due_north(self) -> None:
        route = [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)]
        displaced = perpendicular_offsets(route, KM_PER_DEGREE_LATITUDE)
        for (longitude, latitude), (original_longitude, _) in zip(displaced, route, strict=True):
            assert longitude == pytest.approx(original_longitude, abs=1e-9)
            assert latitude == pytest.approx(1.0, abs=1e-9)

    def test_a_negative_offset_is_the_starboard_side(self) -> None:
        route = [(0.0, 0.0), (1.0, 0.0)]
        displaced = perpendicular_offsets(route, -KM_PER_DEGREE_LATITUDE)
        assert all(latitude == pytest.approx(-1.0, abs=1e-9) for _, latitude in displaced)

    def test_a_zero_offset_is_the_route_itself(self) -> None:
        route = [(-4.5, 49.0), (-4.2, 49.1)]
        assert perpendicular_offsets(route, 0.0) == route

    def test_a_single_vertex_route_is_refused(self) -> None:
        with pytest.raises(QueryLayerError, match="no direction"):
            perpendicular_offsets([(0.0, 0.0)], 1.0)

    def test_coincident_neighbours_are_refused_with_the_vertex_named(self) -> None:
        with pytest.raises(QueryLayerError, match="vertex 0"):
            perpendicular_offsets([(0.0, 0.0), (0.0, 0.0), (1.0, 0.0)], 1.0)
