"""The planning cell, the vertical index, and the cover over a domain.

The index is not interesting in itself; what it has to deliver is that two visits to the same
water are the same visit, that every sequence comes back in the same order in every process,
and that a domain is covered in full or refused. Each of those is asserted here rather than
trusted, because each of them is silently assumed by everything downstream.
"""

from __future__ import annotations

import pytest
from harness_planner.cells import (
    CellGeometry,
    DepthBand,
    GridBounds,
    PlanningCell,
    band_centre_m,
    band_contains,
    depth_bands_from,
)
from planner_support import geometry


def bounds(**overrides: float) -> GridBounds:
    values = {
        "minimum_latitude": 48.8,
        "maximum_latitude": 49.2,
        "minimum_longitude": -4.8,
        "maximum_longitude": -4.2,
        "minimum_depth_m": 0.0,
        "maximum_depth_m": 150.0,
    }
    values.update(overrides)
    return GridBounds(**values)


def test_two_positions_in_the_same_water_are_the_same_cell() -> None:
    grid = geometry(resolution=6, bands=2)

    first = grid.cell_at(49.0000, -4.5000, 10.0)
    second = grid.cell_at(49.0001, -4.5001, 12.0)

    assert first == second


def test_a_depth_band_owns_its_shallow_edge_and_not_its_deep_one() -> None:
    band = DepthBand(index=0, minimum_depth_m=0.0, maximum_depth_m=50.0)

    assert band_contains(band, 0.0)
    assert band_contains(band, 49.999)
    assert not band_contains(band, 50.0)
    assert band_centre_m(band) == pytest.approx(25.0)


def test_a_depth_below_the_deepest_edge_lands_in_the_deepest_band() -> None:
    grid = geometry(resolution=6, bands=2, band_thickness_m=50.0)

    assert grid.band_for(999.0) == 1
    assert grid.band_for(0.0) == 0
    assert grid.band_for(75.0) == 1


class _Entry:
    def __init__(self, minimum: float, maximum: float) -> None:
        self.minimum_depth_m = minimum
        self.maximum_depth_m = maximum


def test_a_vertical_index_is_built_shallowest_first_and_numbered() -> None:
    bands = depth_bands_from([_Entry(0.0, 50.0), _Entry(50.0, 150.0)])

    assert [band.index for band in bands] == [0, 1]
    assert bands[1].minimum_depth_m == 50.0


def test_overlapping_bands_are_a_startup_failure_rather_than_a_double_count() -> None:
    """One visit informing the same water twice is the failure the whole component avoids."""
    with pytest.raises(ValueError, match="overlap"):
        depth_bands_from([_Entry(0.0, 50.0), _Entry(40.0, 150.0)])


def test_an_inverted_band_is_refused() -> None:
    with pytest.raises(ValueError, match="deep edge"):
        depth_bands_from([_Entry(50.0, 10.0)])


def test_a_vertical_index_with_no_bands_indexes_nothing() -> None:
    with pytest.raises(ValueError, match="no bands"):
        depth_bands_from([])


def test_a_resolution_outside_h3s_range_is_refused() -> None:
    with pytest.raises(ValueError, match="between 0 and 15"):
        CellGeometry(resolution=16, bands=depth_bands_from([_Entry(0.0, 50.0)]))


def test_the_cover_is_sorted_and_covers_the_whole_domain() -> None:
    grid = geometry(resolution=5, bands=1)

    cover = grid.cover(bounds(), maximum_cells=4096)

    assert cover == tuple(sorted(cover))
    assert len(cover) == len(set(cover))
    for latitude in (48.85, 49.0, 49.15):
        for longitude in (-4.75, -4.5, -4.25):
            assert grid.cell_at(latitude, longitude, 0.0).h3_index in cover


def test_a_cover_larger_than_its_bound_is_refused_rather_than_truncated() -> None:
    """A truncated cover would plan over part of a domain the projection claimed to cover."""
    grid = geometry(resolution=8, bands=1)

    with pytest.raises(ValueError, match="above the configured bound"):
        grid.cover(bounds(), maximum_cells=8)


def test_a_domain_smaller_than_one_cell_is_still_indexed() -> None:
    grid = geometry(resolution=4, bands=1)

    cover = grid.cover(
        bounds(
            minimum_latitude=49.0,
            maximum_latitude=49.001,
            minimum_longitude=-4.5,
            maximum_longitude=-4.499,
        ),
        maximum_cells=16,
    )

    assert len(cover) >= 1


def test_an_inverted_domain_is_refused() -> None:
    grid = geometry(resolution=5, bands=1)

    with pytest.raises(ValueError, match="northern edge"):
        grid.cover(bounds(minimum_latitude=49.2, maximum_latitude=48.8), maximum_cells=64)


def test_the_planning_cells_are_the_product_of_the_two_indices_in_order() -> None:
    grid = geometry(resolution=6, bands=2)
    cover = grid.cover(bounds(), maximum_cells=8192)

    cells = grid.cells(cover)

    assert len(cells) == 2 * len(cover)
    assert cells == tuple(sorted(cells))
    assert cells[0] == PlanningCell(h3_index=min(cover), depth_band=0)


def test_a_neighbourhood_contains_the_cell_itself_and_comes_back_sorted() -> None:
    grid = geometry(resolution=6, bands=1)
    index = grid.cell_at(49.0, -4.5, 0.0).h3_index

    neighbours = grid.neighbourhood(index, 1)

    assert index in neighbours
    assert len(neighbours) == 7
    assert neighbours == tuple(sorted(neighbours))


def test_a_cell_is_no_distance_from_itself_and_some_distance_from_its_neighbour() -> None:
    grid = geometry(resolution=6, bands=1)
    index = grid.cell_at(49.0, -4.5, 0.0).h3_index
    neighbour = next(other for other in grid.neighbourhood(index, 1) if other != index)

    assert grid.horizontal_distance_m(index, index) == 0.0
    assert grid.horizontal_distance_m(index, neighbour) > 0.0
    assert grid.horizontal_distance_m(index, neighbour) == pytest.approx(
        grid.horizontal_distance_m(neighbour, index)
    )
