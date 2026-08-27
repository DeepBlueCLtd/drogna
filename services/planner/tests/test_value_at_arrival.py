"""A route is valued against the field as it will be at arrival, not as it is now.

This is the test this component exists for, and it is written as a comparison rather than as
an assertion about one number, because the error it catches is invisible any other way.

Scoring every vertex against the field at the moment the recommendation is computed is the
obvious implementation, and on a field that stands still it is *exactly right*: the two
scorings agree to the last digit, every other test in this package passes, and the
recommendation looks plausible. The moment a feature drifts the two part company, and the
present-scoring planner recommends the water that used to be interesting.

So the test carries its own counterexample. :func:`scored_against_the_present` is the wrong
implementation, written out here in a dozen lines so that what is being ruled out is visible
rather than described. The three assertions are:

1. **On a static field the two agree.** That is why the error survives review.
2. **On a drifting field they disagree, and they disagree about which route to prefer.**
   Not about a decimal place — about the answer.
3. **The production scoring is the one that matches what the platform would actually
   collect**, computed independently from the field at the arrival instant.

The bench is two candidate cells and a patch of high spread that starts over the *nearer* of
them and has drifted onto the *farther* one by the time the farther one could be reached.
Which cell is nearer is worked out from the geometry rather than assumed, so the bench cannot
quietly stop meaning what it says when a distance changes. Preferring the farther cell is
then a claim about the field and not a claim about distance.
"""

from __future__ import annotations

from collections.abc import Sequence

from harness_planner.cells import PlanningCell
from harness_planner.traversal import Position
from harness_planner.uncertainty_state import UncertaintyState
from harness_planner.value import evaluate_route
from planner_support import (
    EPOCH_MICROS,
    MICROS_PER_SECOND,
    HandField,
    drifting_patch,
    footprint,
    gentle_tau,
    geometry,
    traversal,
)

# Two cells at the same nominal latitude, with the platform to the south of both.
FIRST_LONGITUDE = -4.60
SECOND_LONGITUDE = -4.40
CELL_LATITUDE = 49.00
PLATFORM = Position(latitude=48.95, longitude=-4.50, depth_m=25.0)

THRESHOLD = 0.10
BACKGROUND_SPREAD = 0.05
PATCH_AMPLITUDE = 0.60
PATCH_WIDTH_DEGREES = 0.06


def _bench(*, moving: bool):
    """The two-cell bench, with the patch either drifting or standing still.

    Returns the nearer cell and the farther one, worked out from the traversal cost, and a
    patch that sits over the nearer one now and over the farther one at the instant the
    farther one would be reached. With ``moving=False`` the same patch stands still, which is
    the control: the two scorings must then agree exactly.

    The patch is written in terms of the cells' own centres rather than the coordinates that
    named them, because an H3 cell's centre is not the point that selected it.
    """
    grid = geometry(resolution=6, bands=1)
    first = grid.cell_at(CELL_LATITUDE, FIRST_LONGITUDE, 25.0)
    second = grid.cell_at(CELL_LATITUDE, SECOND_LONGITUDE, 25.0)
    assert first != second

    cost = traversal(grid)
    reach = {cell: cost.seconds(PLATFORM, cost.position_of(cell)) for cell in (first, second)}
    near, far = sorted((first, second), key=lambda cell: reach[cell])
    assert reach[near] < reach[far], "the two cells must be at different ranges"

    near_latitude, near_longitude, _ = grid.centre(near)
    far_latitude, far_longitude, _ = grid.centre(far)

    field = HandField(
        grid=grid,
        spread=drifting_patch(
            background=BACKGROUND_SPREAD,
            amplitude=PATCH_AMPLITUDE,
            start_longitude=near_longitude,
            end_longitude=far_longitude if moving else near_longitude,
            over_seconds=reach[far],
            width_degrees=PATCH_WIDTH_DEGREES,
            latitude=0.5 * (near_latitude + far_latitude),
        ),
        tau=gentle_tau(),
    )
    return field, near, far, EPOCH_MICROS, cost, footprint(grid)


def scored_against_the_present(
    cells: Sequence[PlanningCell],
    *,
    state: UncertaintyState,
    start_micros: int,
    sensing,
) -> float:
    """The wrong implementation, kept here so that what is ruled out can be read.

    It walks the route and applies the collapse in traversal order — so it has the
    diminishing returns of FR-003 and would pass every test about them — but it asks the
    field what it looks like *now* at every vertex instead of at the instant that vertex is
    reached. On a field that does not move this returns exactly what the honest scoring
    returns.
    """
    scratch = state.fork()
    total = 0.0
    for cell in cells:
        total += scratch.visit(cell, start_micros, footprint=sensing, threshold=THRESHOLD)
    return total


def collected_on_arrival(
    cell: PlanningCell, *, state: UncertaintyState, arrival_micros: int, sensing
) -> float:
    """What a single visit would actually collect, evaluated at the instant it happens.

    Computed here from first principles rather than through the value function, so the third
    assertion is a comparison against the field and not a comparison of the value function
    with itself.
    """
    scratch = state.fork()
    return scratch.visit(cell, arrival_micros, footprint=sensing, threshold=THRESHOLD)


def honest(cells, *, state, start, cost, sensing):
    return evaluate_route(
        cells,
        state=state,
        start=PLATFORM,
        start_micros=start,
        traversal=cost,
        footprint=sensing,
        threshold=THRESHOLD,
    )


def test_on_a_static_field_scoring_the_present_is_indistinguishable() -> None:
    """The error is invisible here. That is the whole reason it needs its own test."""
    field, near, far, start, cost, sensing = _bench(moving=False)
    state = UncertaintyState(field)

    for cell in (near, far):
        walked = honest([cell], state=state, start=start, cost=cost, sensing=sensing)
        wrong = scored_against_the_present([cell], state=state, start_micros=start, sensing=sensing)
        assert walked.value == wrong, (
            "on a field that does not move the two scorings must agree exactly, or this "
            "bench proves nothing about the field that does move"
        )

    near_value = honest([near], state=state, start=start, cost=cost, sensing=sensing).value
    far_value = honest([far], state=state, start=start, cost=cost, sensing=sensing).value

    assert near_value > far_value, "the patch sits over the nearer cell and does not move"


def test_on_a_drifting_field_scoring_the_present_prefers_the_wrong_cell() -> None:
    """The patch is over the near cell now and over the far one by the time it is reached."""
    field, near, far, start, cost, sensing = _bench(moving=True)
    state = UncertaintyState(field)

    wrong_near = scored_against_the_present(
        [near], state=state, start_micros=start, sensing=sensing
    )
    wrong_far = scored_against_the_present([far], state=state, start_micros=start, sensing=sensing)
    assert wrong_near > wrong_far, (
        "a planner scoring the present prefers the nearer cell, because that is where the "
        "uncertainty is at the moment it is asked"
    )

    honest_near = honest([near], state=state, start=start, cost=cost, sensing=sensing)
    honest_far = honest([far], state=state, start=start, cost=cost, sensing=sensing)

    assert honest_far.value > honest_near.value, (
        "by the time the farther cell can be reached the patch is over it, so that is the "
        "route worth recommending; a value function scoring the field at the moment the "
        "recommendation is computed gets this backwards, and gets it backwards silently"
    )

    truth_near = collected_on_arrival(
        near, state=state, arrival_micros=honest_near.vertices[0].arrival_micros, sensing=sensing
    )
    truth_far = collected_on_arrival(
        far, state=state, arrival_micros=honest_far.vertices[0].arrival_micros, sensing=sensing
    )
    assert honest_near.value == truth_near
    assert honest_far.value == truth_far
    assert truth_far > truth_near

    margin = (honest_far.value - honest_near.value) / honest_far.value
    assert margin > 0.2, (
        "the two routes must differ by more than rounding for this bench to mean anything; "
        f"they differ by {margin:.1%}"
    )


def test_the_arrival_instants_are_the_ones_the_route_reports() -> None:
    """A reader has to be able to reproduce the scoring, so the instants must be published."""
    field, near, far, start, cost, sensing = _bench(moving=True)
    state = UncertaintyState(field)

    valued = honest([near, far], state=state, start=start, cost=cost, sensing=sensing)

    assert [vertex.sequence for vertex in valued.vertices] == [0, 1]
    assert valued.vertices[0].arrival_micros > start
    assert valued.vertices[1].arrival_micros > valued.vertices[0].arrival_micros
    elapsed = (valued.vertices[1].arrival_micros - start) / MICROS_PER_SECOND
    assert abs(elapsed - valued.consumed_seconds) < 1e-6, (
        "the consumption a route reports and the instants it reports must be the same walk"
    )
