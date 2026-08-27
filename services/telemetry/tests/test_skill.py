"""Skill against persistence, including — especially — when the model loses.

A skill figure that can only ever look good is not telemetry, it is decoration. The tests
that matter most here are the ones that hand the component a genuinely poor run and demand
that it say so: a model whose error exceeds the reference's must come back
``not-beating-persistence``, with a negative score, and with the plain-language sentence
attached rather than left for a display to compose.

Every scored assertion also recomputes the score by hand from the two mean-square errors
and the sample count carried in the same report, which is SC-004 stated as a test: a figure
a reader cannot check is a figure a reader must believe.
"""

from __future__ import annotations

import pytest
from harness_telemetry.skill import FORMULA, SkillAccumulator, SkillState, assess


def test_the_accumulator_reduces_to_the_two_mean_square_errors() -> None:
    errors = SkillAccumulator()
    errors.add(model_error=2.0, persistence_error=1.0)
    errors.add(model_error=-4.0, persistence_error=3.0)

    assert errors.count == 2
    assert errors.model_mean_square_error == pytest.approx((4.0 + 16.0) / 2)
    assert errors.persistence_mean_square_error == pytest.approx((1.0 + 9.0) / 2)


def test_a_model_that_loses_says_so_in_a_state_and_in_words() -> None:
    """The whole point of the feature: a poor run produces a poor, published, figure."""
    report = assess(
        count=40,
        minimum_sample_count=4,
        model_mean_square_error=1.9,
        persistence_mean_square_error=1.2,
        has_forecast=True,
        has_reference=True,
    )

    assert report.state is SkillState.NOT_BEATING_PERSISTENCE
    assert report.skill_score is not None
    assert report.skill_score < 0
    assert report.skill_score == pytest.approx(1.0 - 1.9 / 1.2)
    assert "not beating persistence" in report.statement
    assert "1.9" in report.statement and "1.2" in report.statement


def test_a_model_exactly_matching_the_reference_is_not_beating_it() -> None:
    report = assess(
        count=40,
        minimum_sample_count=4,
        model_mean_square_error=2.0,
        persistence_mean_square_error=2.0,
        has_forecast=True,
        has_reference=True,
    )

    assert report.state is SkillState.NOT_BEATING_PERSISTENCE
    assert report.skill_score == pytest.approx(0.0)


def test_a_model_that_wins_reports_a_positive_score() -> None:
    report = assess(
        count=40,
        minimum_sample_count=4,
        model_mean_square_error=0.5,
        persistence_mean_square_error=2.0,
        has_forecast=True,
        has_reference=True,
    )

    assert report.state is SkillState.BEATING_PERSISTENCE
    assert report.skill_score == pytest.approx(0.75)


def test_the_reported_figures_are_enough_to_recompute_the_score() -> None:
    report = assess(
        count=97,
        minimum_sample_count=4,
        model_mean_square_error=3.25,
        persistence_mean_square_error=2.5,
        has_forecast=True,
        has_reference=True,
    )

    assert report.model_mean_square_error is not None
    assert report.persistence_mean_square_error is not None
    recomputed = 1.0 - report.model_mean_square_error / report.persistence_mean_square_error

    assert report.skill_score == pytest.approx(recomputed)
    assert FORMULA == "1 - model_mean_square_error / persistence_mean_square_error"


def test_below_the_minimum_count_there_is_no_score_at_all() -> None:
    report = assess(
        count=3,
        minimum_sample_count=4,
        model_mean_square_error=1.0,
        persistence_mean_square_error=2.0,
        has_forecast=True,
        has_reference=True,
    )

    assert report.state is SkillState.INSUFFICIENT_SAMPLES
    assert report.skill_score is None
    assert report.model_mean_square_error is None
    assert report.persistence_mean_square_error is None
    assert "3" in report.statement and "4" in report.statement


def test_no_forecast_is_its_own_state() -> None:
    report = assess(
        count=0,
        minimum_sample_count=4,
        model_mean_square_error=None,
        persistence_mean_square_error=None,
        has_forecast=False,
        has_reference=False,
    )

    assert report.state is SkillState.NO_FORECAST
    assert report.skill_score is None


def test_a_first_publication_has_nothing_to_hold_constant() -> None:
    report = assess(
        count=40,
        minimum_sample_count=4,
        model_mean_square_error=1.0,
        persistence_mean_square_error=None,
        has_forecast=True,
        has_reference=False,
    )

    assert report.state is SkillState.INSUFFICIENT_REFERENCE
    assert report.skill_score is None


def test_a_reference_with_no_error_yields_no_ratio_and_no_infinity() -> None:
    """The denominator is zero. An infinity is not a score, and neither is a zero."""
    report = assess(
        count=40,
        minimum_sample_count=4,
        model_mean_square_error=1.0,
        persistence_mean_square_error=0.0,
        has_forecast=True,
        has_reference=True,
    )

    assert report.state is SkillState.REFERENCE_WITHOUT_ERROR
    assert report.skill_score is None
