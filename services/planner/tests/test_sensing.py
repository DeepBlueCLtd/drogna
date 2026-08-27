"""The sensing footprint: an explicit configured model, not an accident of the resolution.

SRD FR-32 requires the footprint to be configured rather than implied, and the reason shows
up in the last test here: the same reach in metres informs the same water whatever resolution
the domain happens to be indexed at. A footprint that was "the cell you are in" would make a
route's value a function of a configuration key that is supposed to control granularity, and
two recommendations at different resolutions would not be comparable at all.

The hand-computed values below are the model written out — peak times two exponentials — so
a change to the model fails here with the arithmetic visible rather than somewhere downstream
with a route that merely looks different.
"""

from __future__ import annotations

from math import exp

import pytest
from harness_planner.cells import PlanningCell
from planner_support import footprint, geometry


def test_the_visited_cell_gets_the_configured_peak() -> None:
    grid = geometry(resolution=6, bands=2)
    sensing = footprint(grid, peak_reduction=0.8)
    cell = grid.cell_at(49.0, -4.5, 10.0)

    assert sensing.weight_between(cell, cell) == pytest.approx(0.8)


def test_the_weight_is_the_product_of_two_decays_written_out() -> None:
    grid = geometry(resolution=6, bands=2, band_thickness_m=50.0)
    sensing = footprint(grid, horizontal_decay_m=8000.0, vertical_decay_m=40.0, peak_reduction=0.75)
    visited = grid.cell_at(49.0, -4.5, 10.0)
    neighbour_index = next(
        index for index in grid.neighbourhood(visited.h3_index, 1) if index != visited.h3_index
    )
    informed = PlanningCell(h3_index=neighbour_index, depth_band=1)

    horizontal = grid.horizontal_distance_m(visited.h3_index, neighbour_index)
    expected = 0.75 * exp(-horizontal / 8000.0) * exp(-50.0 / 40.0)

    assert sensing.weight_between(visited, informed) == pytest.approx(expected)


def test_the_footprint_is_symmetric() -> None:
    """A route's value must be a function of the geometry, not of the evaluation order."""
    grid = geometry(resolution=6, bands=2)
    sensing = footprint(grid)
    first = grid.cell_at(49.0, -4.5, 10.0)
    second = grid.cell_at(49.06, -4.42, 60.0)

    assert sensing.weight_between(first, second) == pytest.approx(
        sensing.weight_between(second, first)
    )


def test_weight_falls_away_with_horizontal_distance() -> None:
    grid = geometry(resolution=6, bands=1)
    sensing = footprint(grid, maximum_rings=2)
    visited = grid.cell_at(49.0, -4.5, 10.0)

    influences = sensing.influences(visited)
    by_distance = sorted(
        influences,
        key=lambda influence: grid.horizontal_distance_m(visited.h3_index, influence.cell.h3_index),
    )

    weights = [influence.weight for influence in by_distance]
    assert weights == sorted(weights, reverse=True)
    assert weights[0] == pytest.approx(sensing.peak_reduction)


def test_the_extent_is_configured_rather_than_left_to_a_tolerance() -> None:
    grid = geometry(resolution=6, bands=3, band_thickness_m=50.0)

    one_ring = footprint(grid, maximum_rings=1, maximum_band_separation=0)
    two_rings = footprint(grid, maximum_rings=2, maximum_band_separation=1)
    visited = grid.cell_at(49.0, -4.5, 60.0)

    assert len(one_ring.influences(visited)) == 7
    assert len(two_rings.influences(visited)) == 19 * 3


def test_two_nearby_objectives_share_informed_cells() -> None:
    """The overlap is the whole of the diminishing return; without it there is none."""
    grid = geometry(resolution=6, bands=1)
    sensing = footprint(grid, maximum_rings=2)
    near = grid.cell_at(49.00, -4.50, 10.0)
    far = grid.cell_at(49.03, -4.46, 10.0)

    informed_by_near = {influence.cell for influence in sensing.influences(near)}
    informed_by_far = {influence.cell for influence in sensing.influences(far)}

    assert informed_by_near & informed_by_far


def test_the_reach_is_metres_and_not_cells() -> None:
    """The same decay length reaches the same water at two different resolutions."""
    coarse = geometry(resolution=5, bands=1)
    fine = geometry(resolution=7, bands=1)

    for grid in (coarse, fine):
        sensing = footprint(grid, horizontal_decay_m=9000.0, peak_reduction=0.9)
        visited = grid.cell_at(49.0, -4.5, 10.0)
        neighbour = next(
            index for index in grid.neighbourhood(visited.h3_index, 1) if index != visited.h3_index
        )
        distance = grid.horizontal_distance_m(visited.h3_index, neighbour)
        weight = sensing.weight_between(visited, PlanningCell(h3_index=neighbour, depth_band=0))
        assert weight == pytest.approx(0.9 * exp(-distance / 9000.0))


def test_a_footprint_that_claims_to_resolve_a_cell_exactly_is_allowed_and_named() -> None:
    grid = geometry(resolution=6, bands=1)
    sensing = footprint(grid, peak_reduction=1.0)
    cell = grid.cell_at(49.0, -4.5, 10.0)

    assert sensing.weight_between(cell, cell) == pytest.approx(1.0)


def test_an_impossible_footprint_is_refused_at_construction() -> None:
    grid = geometry(resolution=6, bands=1)

    with pytest.raises(ValueError, match="at most one"):
        footprint(grid, peak_reduction=1.5)
    with pytest.raises(ValueError, match="positive distance"):
        footprint(grid, horizontal_decay_m=0.0)
    with pytest.raises(ValueError, match="whole number"):
        footprint(grid, maximum_rings=-1)
