"""The collapse law: a visit removes, time restores, and the threshold decides the prize.

Four functions with no state between them, so every one of these has an answer that can be
written down before the test is run. That is deliberate: this is the arithmetic every later
number in the component is a sum of, and an error here is an error nothing downstream can
detect.
"""

from __future__ import annotations

from math import exp, isclose

import pytest
from harness_planner.collapse import collapsed, excess, reduction, regrown


def test_a_cell_never_informed_sits_at_the_published_spread() -> None:
    """Cold arrival: uncertainty is ensemble spread alone, and absence of data is not low."""
    assert regrown(
        saturated=0.6,
        previous=0.6,
        previous_saturated=0.6,
        elapsed_seconds=0.0,
        timescale_seconds=3600.0,
    ) == pytest.approx(0.6)


def test_a_visit_removes_a_fraction_and_leaves_the_rest() -> None:
    assert collapsed(0.5, 0.8) == pytest.approx(0.1)
    assert collapsed(0.5, 0.0) == pytest.approx(0.5)
    assert collapsed(0.5, 1.0) == pytest.approx(0.0)


def test_a_weight_outside_its_interval_is_refused() -> None:
    with pytest.raises(ValueError, match="fraction"):
        collapsed(0.5, 1.5)


def test_uncertainty_regrows_towards_the_spread_at_the_local_timescale() -> None:
    """One e-folding recovers the stated fraction of the deficit. Written out, not asserted."""
    saturated, after, tau = 0.8, 0.1, 1800.0
    deficit = saturated - after

    at_one_timescale = regrown(
        saturated=saturated,
        previous=after,
        previous_saturated=saturated,
        elapsed_seconds=tau,
        timescale_seconds=tau,
    )

    assert at_one_timescale == pytest.approx(saturated - deficit * exp(-1.0))
    assert after < at_one_timescale < saturated


def test_a_revisit_is_worth_only_what_has_grown_back() -> None:
    """The whole of the revisit rule, in one comparison."""
    saturated, tau, weight, threshold = 0.9, 1200.0, 0.75, 0.0

    first = reduction(before=saturated, weight=weight, threshold=threshold)
    after = collapsed(saturated, weight)
    regrown_after_a_while = regrown(
        saturated=saturated,
        previous=after,
        previous_saturated=saturated,
        elapsed_seconds=0.5 * tau,
        timescale_seconds=tau,
    )
    second = reduction(before=regrown_after_a_while, weight=weight, threshold=threshold)

    assert second < first
    assert second == pytest.approx(weight * regrown_after_a_while)


def test_a_far_longer_wait_recovers_almost_the_whole_prize() -> None:
    saturated, tau = 0.9, 1200.0
    after = collapsed(saturated, 0.95)

    long_after = regrown(
        saturated=saturated,
        previous=after,
        previous_saturated=saturated,
        elapsed_seconds=20 * tau,
        timescale_seconds=tau,
    )

    assert isclose(long_after, saturated, rel_tol=1e-6)


def test_a_cell_below_the_threshold_is_worth_approximately_nothing() -> None:
    """A route gains nothing from a detour through water the harness already understands."""
    assert excess(0.09, 0.35) == 0.0
    assert reduction(before=0.09, weight=0.9, threshold=0.35) == 0.0


def test_a_cell_astride_the_threshold_is_worth_the_sliver_between() -> None:
    before, threshold, weight = 0.40, 0.35, 0.5
    assert reduction(before=before, weight=weight, threshold=threshold) == pytest.approx(0.05)


def test_a_timescale_that_is_not_a_timescale_is_refused_rather_than_defaulted() -> None:
    """ADR-0002 gives this component a defined tau everywhere. There is nothing to fall back to."""
    for bad in (0.0, -1.0, float("inf")):
        with pytest.raises(ValueError, match="ADR-0002"):
            regrown(
                saturated=0.5,
                previous=0.1,
                previous_saturated=0.5,
                elapsed_seconds=60.0,
                timescale_seconds=bad,
            )


def test_regrowth_does_not_run_backwards() -> None:
    with pytest.raises(ValueError, match="forward"):
        regrown(
            saturated=0.5,
            previous=0.1,
            previous_saturated=0.5,
            elapsed_seconds=-1.0,
            timescale_seconds=60.0,
        )


def test_a_growing_field_carries_a_collapsed_cell_up_with_it() -> None:
    """The deficit decays; the saturation it is measured against is the one at the visit."""
    at_visit, later = 0.4, 0.9
    after = collapsed(at_visit, 1.0)

    value = regrown(
        saturated=later,
        previous=after,
        previous_saturated=at_visit,
        elapsed_seconds=0.0,
        timescale_seconds=3600.0,
    )

    assert value == pytest.approx(later - at_visit)
