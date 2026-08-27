"""Commitment holds, and a departure is recorded with the margin it beat.

SRD FR-33's "single committed route" is only a commitment if something makes it costly to
abandon. With a margin of zero the prefix would be dropped for an improvement in the sixth
decimal place, and a consumer watching the recommendation change under it would learn nothing
from any single one of them.

The margin is asserted from both sides here: an improvement below it retains, an improvement
above it departs, and the departure is recorded with its figure so that a reader can see the
planner changed its mind and by how much without diffing two recommendations.
"""

from __future__ import annotations

import pytest
from harness_planner.cells import PlanningCell
from harness_planner.commitment import Trigger, committed_prefix, hold_or_depart
from harness_planner.select import Selection
from harness_planner.value import RouteValue, ValuedVertex

MINUTE = 60 * 1_000_000
START = 1_788_000_000 * 1_000_000


def vertex(sequence: int, minutes: float) -> ValuedVertex:
    return ValuedVertex(
        sequence=sequence,
        cell=PlanningCell(h3_index=f"86187{sequence:02d}07ffffff", depth_band=0),
        arrival_micros=START + round(minutes * MINUTE),
        latitude=49.0,
        longitude=-4.5,
        depth_m=25.0,
        marginal_value=1.0,
    )


def selection(value: float, vertices: tuple[ValuedVertex, ...] = ()) -> Selection:
    return Selection(
        route=RouteValue(
            vertices=vertices,
            value=value,
            consumed_seconds=600.0,
            distance_m=1000.0,
            _standalone=lambda: value,
        ),
        candidate_cell_count=20,
        restarts=4,
        empty_reason=None,
    )


def test_the_committed_prefix_is_what_falls_inside_the_window() -> None:
    vertices = (vertex(0, 5.0), vertex(1, 20.0), vertex(2, 55.0))

    prefix = committed_prefix(vertices, start_micros=START, window_seconds=1800.0)

    assert prefix == (vertices[0].cell, vertices[1].cell)


def test_a_vertex_already_in_the_past_is_not_part_of_the_commitment() -> None:
    """It has either been reached, or the platform has fallen behind. Either way it is done."""
    vertices = (vertex(0, -10.0), vertex(1, 5.0))

    prefix = committed_prefix(vertices, start_micros=START, window_seconds=1800.0)

    assert prefix == (vertices[1].cell,)


def test_a_window_of_zero_commits_to_nothing_and_says_so() -> None:
    vertices = (vertex(0, 1.0), vertex(1, 2.0))

    assert committed_prefix(vertices, start_micros=START, window_seconds=0.0) == ()


def test_an_improvement_below_the_margin_retains_the_prefix() -> None:
    """SC-006: the committed prefix does not change when nothing material has."""
    held_vertices = (vertex(0, 5.0), vertex(1, 20.0))

    outcome = hold_or_depart(
        free=selection(10.5),
        held=selection(10.0, held_vertices),
        prefix_length=2,
        window_seconds=1800.0,
        margin=2.0,
    )

    assert not outcome.departed_from_previous
    assert outcome.retained_vertex_count == 2
    assert outcome.improvement_over_retained == pytest.approx(0.5)
    assert outcome.margin == 2.0
    assert outcome.selection.route.value == 10.0


def test_an_improvement_above_the_margin_departs_and_records_by_how_much() -> None:
    free_vertices = (vertex(3, 4.0), vertex(4, 30.0))

    outcome = hold_or_depart(
        free=selection(14.0, free_vertices),
        held=selection(10.0, (vertex(0, 5.0),)),
        prefix_length=1,
        window_seconds=1800.0,
        margin=2.0,
    )

    assert outcome.departed_from_previous
    assert outcome.retained_vertex_count == 0
    assert outcome.improvement_over_retained == pytest.approx(4.0)
    assert outcome.selection.route.cells == tuple(v.cell for v in free_vertices)


def test_an_improvement_exactly_equal_to_the_margin_is_not_enough() -> None:
    """Equality retains. Commitment without hysteresis is not commitment."""
    outcome = hold_or_depart(
        free=selection(12.0),
        held=selection(10.0, (vertex(0, 5.0),)),
        prefix_length=1,
        window_seconds=1800.0,
        margin=2.0,
    )

    assert not outcome.departed_from_previous


def test_a_first_recommendation_departs_from_nothing() -> None:
    outcome = hold_or_depart(
        free=selection(9.0, (vertex(0, 5.0),)),
        held=selection(9.0, (vertex(0, 5.0),)),
        prefix_length=0,
        window_seconds=1800.0,
        margin=2.0,
    )

    assert not outcome.departed_from_previous
    assert outcome.improvement_over_retained == 0.0
    assert outcome.retained_vertex_count == 0


def test_a_negative_margin_is_refused() -> None:
    with pytest.raises(ValueError, match="not negative"):
        hold_or_depart(
            free=selection(1.0),
            held=selection(1.0),
            prefix_length=1,
            window_seconds=1800.0,
            margin=-1.0,
        )


def test_the_three_triggers_are_named_separately_because_they_mean_different_things() -> None:
    assert {trigger.value for trigger in Trigger} == {"cadence", "new-field", "measurement"}
