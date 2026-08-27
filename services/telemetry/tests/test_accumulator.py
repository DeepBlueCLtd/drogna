"""The incremental aggregate agrees with the offline computation, and admits what it cannot.

Two properties are asserted here and they pull in opposite directions. The first is that
the running figures equal the ones a reader would get from the whole sequence in hand: an
accumulator that is merely cheap and slightly wrong is worse than no accumulator, because
it is believed. The second is that an aggregate fed a producer's interval summary reports
null for the moments a summary cannot carry, rather than a number that looks like one.
"""

from __future__ import annotations

import math

import pytest
from harness_telemetry.accumulator import Basis, RunningStatistic


def offline(values: list[float]) -> dict[str, float]:
    """The same figures, computed the obvious way over the whole sequence."""
    count = len(values)
    return {
        "count": count,
        "mean": sum(values) / count,
        "mean_absolute": sum(abs(value) for value in values) / count,
        "root_mean_square": math.sqrt(sum(value * value for value in values) / count),
        "minimum": min(values),
        "maximum": max(values),
    }


SEQUENCES = [
    [1.0],
    [-2.0, 2.0],
    [0.5, -0.25, 3.5, -1.75, 0.125],
    [1.0e6 + index * 1.0e-3 for index in range(200)],
    [7.5] * 50,
]


@pytest.mark.parametrize("values", SEQUENCES)
def test_every_moment_matches_the_offline_computation(values: list[float]) -> None:
    statistic = RunningStatistic()
    for value in values:
        statistic.add_sample(value)

    expected = offline(values)

    assert statistic.count == expected["count"]
    assert statistic.mean_m_per_s == pytest.approx(expected["mean"], rel=1e-12, abs=1e-12)
    assert statistic.mean_absolute_m_per_s == pytest.approx(expected["mean_absolute"], rel=1e-12)
    assert statistic.root_mean_square_m_per_s == pytest.approx(
        expected["root_mean_square"], rel=1e-9
    )
    assert statistic.minimum_m_per_s == expected["minimum"]
    assert statistic.maximum_m_per_s == expected["maximum"]
    assert statistic.basis is Basis.SAMPLES


def test_an_empty_aggregate_reports_nothing_rather_than_zero() -> None:
    statistic = RunningStatistic()

    assert statistic.count == 0
    assert statistic.basis is Basis.NONE
    assert statistic.mean_m_per_s is None
    assert statistic.mean_absolute_m_per_s is None
    assert statistic.root_mean_square_m_per_s is None
    assert statistic.minimum_m_per_s is None
    assert statistic.maximum_m_per_s is None
    assert statistic.implausible_reason is None


def test_a_summary_supports_a_count_and_a_mean_magnitude_and_nothing_else() -> None:
    statistic = RunningStatistic()
    statistic.add_summary(10, 2.0)
    statistic.add_summary(30, 4.0)

    assert statistic.count == 40
    assert statistic.basis is Basis.SUMMARIES
    assert statistic.mean_absolute_m_per_s == pytest.approx((10 * 2.0 + 30 * 4.0) / 40)
    assert statistic.mean_m_per_s is None
    assert statistic.root_mean_square_m_per_s is None
    assert statistic.minimum_m_per_s is None
    assert statistic.maximum_m_per_s is None


def test_one_summary_costs_the_moments_of_every_sample_beside_it() -> None:
    """Mixing is reported, not averaged away: a partial second moment is not a second moment."""
    statistic = RunningStatistic()
    statistic.add_sample(1.0)
    statistic.add_sample(-1.0)
    statistic.add_summary(3, 2.0)

    assert statistic.basis is Basis.MIXED
    assert statistic.count == 5
    assert statistic.mean_absolute_m_per_s == pytest.approx((1.0 + 1.0 + 3 * 2.0) / 5)
    assert statistic.root_mean_square_m_per_s is None


def test_an_empty_summary_changes_nothing_at_all() -> None:
    statistic = RunningStatistic()
    statistic.add_sample(3.0)
    statistic.add_summary(0, 0.0)

    assert statistic.count == 1
    assert statistic.basis is Basis.SAMPLES
    assert statistic.root_mean_square_m_per_s == pytest.approx(3.0)


def test_an_identically_zero_stream_is_reported_as_zero_and_flagged() -> None:
    statistic = RunningStatistic()
    for _ in range(20):
        statistic.add_sample(0.0)

    assert statistic.root_mean_square_m_per_s == 0.0
    assert statistic.implausible_reason is not None
    assert "constant" in statistic.implausible_reason


def test_a_stream_with_any_spread_is_not_flagged() -> None:
    statistic = RunningStatistic()
    statistic.add_sample(0.0)
    statistic.add_sample(1e-9)

    assert statistic.implausible_reason is None
