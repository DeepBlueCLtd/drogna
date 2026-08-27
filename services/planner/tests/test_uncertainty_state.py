"""What the planner believes: spread on arrival cold, spread plus observation age on loiter.

SRD FR-07 and FR-08 are two phases of one law, and the tests here are written as the two
phases rather than as two laws. Cold arrival is the case where nothing has been informed and
uncertainty is the ensemble spread alone. Loiter is the case where something has, and the
uncertainty is the spread less what the measurement removed, recovering at the local
timescale.

Two cases are here because ADR-0002 makes them the ones a planner gets wrong: a cell in open
background water outside every seeded feature, which still has a timescale and must be
scoreable without a special case; and a cell a moving feature has drifted across between two
instants, whose timescale must change because a feature's timescale advects with it.
"""

from __future__ import annotations

from math import exp

import pytest
from harness_planner.uncertainty_state import UncertaintyState
from planner_support import EPOCH_MICROS, HandField, footprint, geometry

HOUR = 3600 * 1_000_000


def constant(level: float):
    def spread(*_args: float) -> float:
        return level

    return spread


def test_a_cell_never_informed_is_at_the_published_spread() -> None:
    """Cold arrival. The absence of data is emphatically not low uncertainty."""
    grid = geometry(resolution=6, bands=1)
    state = UncertaintyState(HandField(grid=grid, spread=constant(0.7), tau=constant(7200.0)))
    cell = grid.cell_at(49.0, -4.5, 25.0)

    assert state.uncertainty(cell, EPOCH_MICROS) == pytest.approx(0.7)
    assert state.uncertainty(cell, EPOCH_MICROS + 10 * HOUR) == pytest.approx(0.7)
    assert state.last_informed(cell) is None


def test_a_cell_just_measured_carries_what_the_measurement_left() -> None:
    grid = geometry(resolution=6, bands=1)
    state = UncertaintyState(HandField(grid=grid, spread=constant(0.7), tau=constant(7200.0)))
    sensing = footprint(grid, peak_reduction=0.8, maximum_rings=0)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    state.measured(cell, EPOCH_MICROS, footprint=sensing)

    assert state.uncertainty(cell, EPOCH_MICROS) == pytest.approx(0.7 * 0.2)
    assert state.last_informed(cell) is not None


def test_loiter_is_spread_recovered_by_observation_age() -> None:
    """FR-08 written out: the deficit decays at the local timescale and at no other rate."""
    grid = geometry(resolution=6, bands=1)
    tau = 5400.0
    state = UncertaintyState(HandField(grid=grid, spread=constant(0.7), tau=constant(tau)))
    sensing = footprint(grid, peak_reduction=0.8, maximum_rings=0)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    state.measured(cell, EPOCH_MICROS, footprint=sensing)
    later = EPOCH_MICROS + HOUR
    deficit = 0.7 - 0.7 * 0.2

    assert state.uncertainty(cell, later) == pytest.approx(0.7 - deficit * exp(-3600.0 / tau))


def test_a_cell_in_open_background_water_is_scored_like_any_other() -> None:
    """ADR-0002: no special case for a cell outside every seeded feature, and no constant."""
    grid = geometry(resolution=6, bands=1)

    def background_only(latitude: float, longitude: float, _depth_m: float, _s: float) -> float:
        inside_a_feature = abs(latitude - 49.0) < 0.02 and abs(longitude + 4.5) < 0.02
        return 6000.0 if inside_a_feature else 43_200.0

    state = UncertaintyState(HandField(grid=grid, spread=constant(0.6), tau=background_only))
    sensing = footprint(grid, peak_reduction=0.9, maximum_rings=0)
    open_water = grid.cell_at(49.30, -4.90, 25.0)

    state.measured(open_water, EPOCH_MICROS, footprint=sensing)
    value = state.uncertainty(open_water, EPOCH_MICROS + HOUR)

    assert 0.0 < value < 0.6
    assert state.field.timescale(open_water, EPOCH_MICROS) == pytest.approx(43_200.0)


def test_a_moving_feature_changes_the_timescale_of_the_cell_it_drifts_across() -> None:
    """A moving feature's timescale advects with it, so tau is re-evaluated and never cached."""
    grid = geometry(resolution=6, bands=1)
    cell = grid.cell_at(49.0, -4.5, 25.0)
    centre_latitude, centre_longitude, _ = grid.centre(cell)

    def drifting(latitude: float, longitude: float, _depth_m: float, seconds: float) -> float:
        """A fast-decorrelating feature that crosses this cell four hours in."""
        feature_longitude = centre_longitude - 0.30 + (0.30 / (4 * 3600.0)) * seconds
        inside = (
            abs(latitude - centre_latitude) < 0.10 and abs(longitude - feature_longitude) < 0.10
        )
        return 1800.0 if inside else 43_200.0

    field = HandField(grid=grid, spread=constant(0.6), tau=drifting)
    state = UncertaintyState(field)

    assert field.timescale(cell, EPOCH_MICROS) == pytest.approx(43_200.0), (
        "the cell is quiet water before the feature reaches it"
    )
    assert field.timescale(cell, EPOCH_MICROS + 4 * HOUR) == pytest.approx(1800.0), (
        "and is inside the feature once it has drifted across, without the cell moving"
    )

    sensing = footprint(grid, peak_reduction=0.9, maximum_rings=0)
    state.measured(cell, EPOCH_MICROS + 4 * HOUR, footprint=sensing)

    quiet = UncertaintyState(HandField(grid=grid, spread=constant(0.6), tau=constant(43_200.0)))
    quiet.measured(cell, EPOCH_MICROS + 4 * HOUR, footprint=sensing)

    inside_the_feature = state.uncertainty(cell, EPOCH_MICROS + 5 * HOUR)
    in_quiet_water = quiet.uncertainty(cell, EPOCH_MICROS + 5 * HOUR)

    assert inside_the_feature > in_quiet_water, (
        "water inside a fast feature regrows sooner than quiet water, and it is the "
        "feature's arrival rather than the cell's coordinates that decides which this is"
    )


def test_a_fork_leaves_the_state_it_came_from_alone() -> None:
    grid = geometry(resolution=6, bands=1)
    state = UncertaintyState(HandField(grid=grid, spread=constant(0.6), tau=constant(7200.0)))
    sensing = footprint(grid, maximum_rings=0)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    scratch = state.fork()
    scratch.visit(cell, EPOCH_MICROS, footprint=sensing, threshold=0.0)

    assert state.informed_cells() == ()
    assert scratch.informed_cells() == (cell,)


def test_a_new_field_replaces_the_spread_and_keeps_what_has_been_sampled() -> None:
    """A new field says what the ensemble thinks; it does not undo what the platform measured."""
    grid = geometry(resolution=6, bands=1)
    first = HandField(grid=grid, spread=constant(0.6), tau=constant(7200.0))
    sensing = footprint(grid, peak_reduction=0.9, maximum_rings=0)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    state = UncertaintyState(first)
    state.measured(cell, EPOCH_MICROS, footprint=sensing)

    second = HandField(
        grid=grid, spread=constant(0.9), tau=constant(7200.0), run_id="run-000001-abcdefabcdef"
    )
    rebased = state.rebased(second)

    assert rebased.last_informed(cell) == state.last_informed(cell)
    assert rebased.field.run_id == "run-000001-abcdefabcdef"
    assert rebased.uncertainty(cell, EPOCH_MICROS + HOUR) > state.uncertainty(
        cell, EPOCH_MICROS + HOUR
    )


def test_the_excess_above_the_threshold_is_the_prize_and_not_the_uncertainty() -> None:
    grid = geometry(resolution=6, bands=1)
    state = UncertaintyState(HandField(grid=grid, spread=constant(0.40), tau=constant(7200.0)))
    cell = grid.cell_at(49.0, -4.5, 25.0)

    assert state.uncertainty(cell, EPOCH_MICROS) == pytest.approx(0.40)
    assert state.excess(cell, EPOCH_MICROS, 0.35) == pytest.approx(0.05)
    assert state.excess(cell, EPOCH_MICROS, 0.50) == 0.0


def test_the_state_reads_the_field_at_the_instant_it_was_asked_about() -> None:
    """The discipline the whole component rests on, asserted rather than assumed."""
    grid = geometry(resolution=6, bands=1)
    field = HandField(grid=grid, spread=constant(0.6), tau=constant(7200.0))
    state = UncertaintyState(field)
    cell = grid.cell_at(49.0, -4.5, 25.0)

    asked_about = EPOCH_MICROS + 5 * HOUR
    state.uncertainty(cell, asked_about)

    assert field.reads[-1] == (cell, asked_about)
