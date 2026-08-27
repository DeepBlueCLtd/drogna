"""Freshness: the property that stops a dead input reading as good news.

The failure this component owns is silent degradation, and this state machine is where it
is refused. A statistic whose residuals have stopped keeps its last value — it is still the
last thing that was true — but it stops calling that value current, and it says when it was
last really updated so a reader can see the gap for themselves.

Every interval here is simulation time. A staleness window measured in host seconds would
age a statistic while the clock was paused, which is a component that has stopped saying
anything about a world that has stopped moving.
"""

from __future__ import annotations

import pytest
from harness_telemetry.freshness import Freshness, FreshnessTracker

SECOND = 1_000_000
WINDOW = 600 * SECOND


def test_a_tracker_that_has_never_been_updated_is_not_fresh() -> None:
    tracker = FreshnessTracker(WINDOW)

    assert tracker.last_update_micros is None
    assert tracker.state(0) is Freshness.STALE


def test_a_statistic_updated_within_the_window_is_fresh() -> None:
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(100 * SECOND)

    assert tracker.state(100 * SECOND) is Freshness.FRESH
    assert tracker.state(100 * SECOND + WINDOW) is Freshness.FRESH
    assert tracker.last_update_micros == 100 * SECOND


def test_a_statistic_goes_stale_once_the_window_has_passed() -> None:
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(100 * SECOND)

    assert tracker.state(100 * SECOND + WINDOW + 1) is Freshness.STALE


def test_the_last_update_time_does_not_move_when_nothing_arrives() -> None:
    """This is what makes staleness detectable at all."""
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(100 * SECOND)

    for now in range(100 * SECOND, 100 * SECOND + 4 * WINDOW, WINDOW // 4):
        tracker.state(now)

    assert tracker.last_update_micros == 100 * SECOND


def test_a_recovery_records_the_span_it_was_stale_for() -> None:
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(100 * SECOND)
    revived = 100 * SECOND + WINDOW + 900 * SECOND
    tracker.updated(revived)

    assert tracker.state(revived) is Freshness.FRESH
    assert tracker.stale_span_seconds == pytest.approx(900.0)


def test_a_gap_inside_the_window_is_not_a_stale_span() -> None:
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(100 * SECOND)
    tracker.updated(100 * SECOND + WINDOW)

    assert tracker.stale_span_seconds is None


def test_the_span_reported_is_the_most_recent_one() -> None:
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(0)
    tracker.updated(WINDOW + 100 * SECOND)
    tracker.updated(WINDOW + 100 * SECOND + WINDOW + 50 * SECOND)

    assert tracker.stale_span_seconds == pytest.approx(50.0)


def test_no_statistic_is_ever_fresh_with_an_update_older_than_the_window() -> None:
    """SC-007 stated directly: the count of such messages must be zero."""
    tracker = FreshnessTracker(WINDOW)
    tracker.updated(0)

    offending = [
        now
        for now in range(0, 10 * WINDOW, WINDOW // 8)
        if tracker.state(now) is Freshness.FRESH and now - 0 > WINDOW
    ]

    assert offending == []
