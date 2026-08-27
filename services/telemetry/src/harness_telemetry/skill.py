"""Forecast skill against a persistence reference, and the refusal to flatter it.

Constitution IX is the whole of this module. Skill is *always* measured against the claim
that conditions stay the same; a model that cannot beat that claim is not earning its
compute, and the harness says so. So the reduction here is deliberately small and
deliberately public: two mean-square errors and a count go out with every score, the
formula travels in the message beside them, and a reader can recompute the figure instead
of believing it.

The two errors are over the same samples. That is what makes the ratio meaningful: each
measurement is scored against the current forecast and against the held reference, and a
measurement that cannot be scored against both is scored against neither.

Four ways there is no score, and each says which:

``insufficient-samples``
    fewer scored measurements than the configuration requires. No default, no zero and no
    carried-forward previous value — those are the three ways a quality figure becomes a
    decoration, and all three are refused.
``insufficient-reference``
    only one field has ever been published, so there is nothing prior to hold constant.
``reference-without-error``
    the reference reproduced every measurement exactly, so the formula's denominator is
    zero. An infinity is not a score.
``no-forecast``
    nothing has been published at all.

And exactly one way the figure is unflattering, which is to publish it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

__all__ = ["FORMULA", "SkillAccumulator", "SkillReport", "SkillState", "assess"]

FORMULA = "1 - model_mean_square_error / persistence_mean_square_error"
"""The stated formula, carried in every message so the arithmetic checked is the one done."""


class SkillState(StrEnum):
    """What the skill report is: a score, or a named reason there is none."""

    BEATING_PERSISTENCE = "beating-persistence"
    NOT_BEATING_PERSISTENCE = "not-beating-persistence"
    INSUFFICIENT_SAMPLES = "insufficient-samples"
    INSUFFICIENT_REFERENCE = "insufficient-reference"
    REFERENCE_WITHOUT_ERROR = "reference-without-error"
    NO_FORECAST = "no-forecast"


class SkillAccumulator:
    """Both mean-square errors over the same samples, in constant memory.

    Sums of squares rather than Welford, because the quantity wanted is the second moment
    about zero and not about the mean: an error's mean is not being subtracted, and
    subtracting it would turn a mean-square error into a variance and quietly forgive a
    bias.
    """

    __slots__ = ("_count", "_model_squares", "_persistence_squares")

    def __init__(self) -> None:
        self._count = 0
        self._model_squares = 0.0
        self._persistence_squares = 0.0

    def add(self, *, model_error: float, persistence_error: float) -> None:
        """Fold in one measurement scored against both fields."""
        self._count += 1
        self._model_squares += float(model_error) * float(model_error)
        self._persistence_squares += float(persistence_error) * float(persistence_error)

    def reset(self) -> None:
        """Start again, which is what a change of reference field requires."""
        self._count = 0
        self._model_squares = 0.0
        self._persistence_squares = 0.0

    @property
    def count(self) -> int:
        return self._count

    @property
    def model_mean_square_error(self) -> float | None:
        return None if self._count == 0 else self._model_squares / self._count

    @property
    def persistence_mean_square_error(self) -> float | None:
        return None if self._count == 0 else self._persistence_squares / self._count


@dataclass(frozen=True)
class SkillReport:
    """One assessment: the state, the words that go with it, and the evidence."""

    state: SkillState
    statement: str
    skill_score: float | None
    model_mean_square_error: float | None
    persistence_mean_square_error: float | None
    sample_count: int
    minimum_sample_count: int


def assess(
    *,
    count: int,
    minimum_sample_count: int,
    model_mean_square_error: float | None,
    persistence_mean_square_error: float | None,
    has_forecast: bool,
    has_reference: bool,
) -> SkillReport:
    """Turn the two errors into a state, a statement and — where there is one — a score.

    The order of the refusals is the order of the questions a reader would ask: is there a
    forecast at all, is there something to compare it with, have enough measurements been
    scored, and is the comparison arithmetically possible. Only past all four is a number
    published, and past all four it is published whatever it says.
    """
    if not has_forecast:
        return _unscored(
            SkillState.NO_FORECAST,
            "no forecast has been published, so there is nothing to score",
            count,
            minimum_sample_count,
        )
    if not has_reference:
        return _unscored(
            SkillState.INSUFFICIENT_REFERENCE,
            "only one forecast has been published, so there is no prior field to hold "
            "constant as a persistence reference and no skill score to give",
            count,
            minimum_sample_count,
        )
    if count < minimum_sample_count:
        return _unscored(
            SkillState.INSUFFICIENT_SAMPLES,
            f"{count} samples have been scored against both fields and "
            f"{minimum_sample_count} are required, so no skill score is published",
            count,
            minimum_sample_count,
        )
    if model_mean_square_error is None or persistence_mean_square_error is None:
        return _unscored(
            SkillState.INSUFFICIENT_SAMPLES,
            f"{count} samples have been scored against both fields and "
            f"{minimum_sample_count} are required, so no skill score is published",
            count,
            minimum_sample_count,
        )
    if persistence_mean_square_error == 0.0:
        return _unscored(
            SkillState.REFERENCE_WITHOUT_ERROR,
            "the persistence reference reproduced every one of the "
            f"{count} scored measurements exactly, so the skill formula divides by zero "
            "and there is no score to publish",
            count,
            minimum_sample_count,
        )

    score = 1.0 - model_mean_square_error / persistence_mean_square_error
    beating = model_mean_square_error < persistence_mean_square_error
    state = SkillState.BEATING_PERSISTENCE if beating else SkillState.NOT_BEATING_PERSISTENCE
    return SkillReport(
        state=state,
        statement=_statement(state, model_mean_square_error, persistence_mean_square_error, count),
        skill_score=score,
        model_mean_square_error=model_mean_square_error,
        persistence_mean_square_error=persistence_mean_square_error,
        sample_count=count,
        minimum_sample_count=minimum_sample_count,
    )


def _statement(state: SkillState, model: float, persistence: float, count: int) -> str:
    """The plain-language sentence, composed here so every consumer says the same thing."""
    if state is SkillState.BEATING_PERSISTENCE:
        return (
            f"the forecast is beating persistence: its mean square error of {model} "
            f"(m/s)^2 over {count} samples is below the persistence reference's "
            f"{persistence} (m/s)^2"
        )
    return (
        f"the forecast is not beating persistence: its mean square error of {model} "
        f"(m/s)^2 over {count} samples is not below the persistence reference's "
        f"{persistence} (m/s)^2, so this run is not earning its compute"
    )


def _unscored(state: SkillState, statement: str, count: int, minimum: int) -> SkillReport:
    """No score, and every figure that would imply one withheld with it."""
    return SkillReport(
        state=state,
        statement=statement,
        skill_score=None,
        model_mean_square_error=None,
        persistence_mean_square_error=None,
        sample_count=count,
        minimum_sample_count=minimum,
    )
