"""Every region in the domain appears in every projection. Omission is not permitted.

SC-007, and the reason it is a requirement rather than a nicety is in one line of FR-020: an
absent region reads as a healthy one. A projection that listed only the regions in trouble
would be indistinguishable, to a reader, from a projection that had lost track of the rest.

So the count is published beside the list — a truncated message is then detectable rather
than merely shorter — and every region carries a named state, including the boring one.
"""

from __future__ import annotations

from harness_planner.cells import GridBounds, PlanningCell
from harness_planner.projection import ALREADY_LAPSED, CROSSING, NO_CROSSING, project
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, geometry

STATES = {CROSSING, ALREADY_LAPSED, NO_CROSSING}


def mixed_domain():
    """A domain deliberately containing all three outcomes at once."""
    grid = geometry(resolution=6, bands=2, band_thickness_m=50.0)
    bounds = GridBounds(
        minimum_latitude=48.90,
        maximum_latitude=49.10,
        minimum_longitude=-4.65,
        maximum_longitude=-4.35,
        minimum_depth_m=0.0,
        maximum_depth_m=100.0,
    )
    indices = grid.cover(bounds, maximum_cells=4096)

    def spread(latitude: float, _longitude: float, depth_m: float, _seconds: float) -> float:
        if latitude > 49.04:
            return 0.90  # already above the threshold
        if latitude > 48.96:
            return 0.50 if depth_m > 50.0 else 0.45  # will cross
        return 0.10  # never crosses

    def tau(_latitude: float, _longitude: float, depth_m: float, _seconds: float) -> float:
        return 2400.0 + 30.0 * depth_m

    return grid, indices, HandField(grid=grid, spread=spread, tau=tau)


def projected():
    """The three outcomes, with the middle band brought about by an actual measurement.

    A region that has never been measured sits at its published spread, so a region whose
    spread is above the threshold is *already* lapsed rather than about to be. A crossing in
    the future is the state of water that was resolved and is losing its memory of it, which
    is why this bench collapses the middle band before it projects.
    """
    grid, indices, field = mixed_domain()
    state = UncertaintyState(field)
    sensing = footprint(
        grid,
        peak_reduction=0.95,
        vertical_decay_m=200.0,
        maximum_rings=0,
        maximum_band_separation=1,
    )
    for index in indices:
        latitude, _, _ = grid.centre(PlanningCell(h3_index=index, depth_band=0))
        if 48.96 < latitude <= 49.04:
            state.measured(
                PlanningCell(h3_index=index, depth_band=0), EPOCH_MICROS, footprint=sensing
            )
    return indices, project(
        indices,
        state=state,
        geometry=grid,
        micros=EPOCH_MICROS,
        step_seconds=120.0,
        horizon_seconds=7200.0,
        threshold=0.35,
    )


def test_every_region_in_the_domain_appears_exactly_once() -> None:
    indices, regions = projected()

    reported = [region.h3_index for region in regions]

    assert len(reported) == len(indices)
    assert set(reported) == set(indices)
    assert len(set(reported)) == len(reported)


def test_the_regions_come_back_in_index_order_so_two_replays_produce_the_same_bytes() -> None:
    _, regions = projected()

    reported = [region.h3_index for region in regions]

    assert reported == sorted(reported)


def test_every_region_carries_a_named_state_including_the_boring_one() -> None:
    _, regions = projected()

    for region in regions:
        assert region.state in STATES
        if region.state == NO_CROSSING:
            assert region.crossing_micros is None
        else:
            assert region.crossing_micros is not None


def test_the_domain_exercises_all_three_outcomes_at_once() -> None:
    """Otherwise the coverage claim would be a claim about one easy case."""
    _, regions = projected()

    assert {region.state for region in regions} == STATES


def test_a_region_that_never_lapses_is_present_rather_than_absent() -> None:
    """The whole of FR-020: healthy regions are stated, not inferred from silence."""
    _, regions = projected()

    enduring = [region for region in regions if region.state == NO_CROSSING]

    assert enduring
    for region in enduring:
        assert region.saturated_uncertainty < 0.35
        assert region.timescale_seconds > 0.0


def test_the_count_matches_the_list_so_a_truncated_message_is_detectable() -> None:
    indices, regions = projected()

    assert len(regions) == len(indices)


def test_two_projections_of_the_same_field_are_identical() -> None:
    """No dictionary iteration order anywhere in the answer (Constitution II)."""
    _, first = projected()
    _, second = projected()

    assert first == second
