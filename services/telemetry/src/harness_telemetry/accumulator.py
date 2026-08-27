"""The incremental aggregate: constant time per residual, constant memory per scope.

FR-003 is the whole design brief. A statistic that held its samples would make memory a
function of scenario length, and a scenario ten times longer would cost ten times the
footprint for a report that is the same eight numbers either way. So nothing is retained:
each residual updates a fixed set of counters and is forgotten.

The mean and the second moment are maintained by Welford's recurrence rather than by
summing and dividing at the end. The two agree to floating-point tolerance on benign data
and diverge on long streams of similar values, which is exactly the stream this component
sees.

Two update paths, and the difference between them is reported rather than hidden. A
per-residual sample carries the signed difference, so it supports every moment: bias,
root mean square, and the extremes. A producer's own interval summary carries a count and
a mean of *magnitudes*, which supports a count and a mean magnitude and nothing else — a
mean of magnitudes is not a bias, and a second moment cannot be recovered from a first.
An aggregate that has been fed any summary therefore reports null for the moments it
cannot honestly claim, and says through :class:`Basis` why. That is FR-002 met as far as
the inputs allow and no further, which is the only way it can honestly be met: the
alternative is publishing a zero where a number is unknown, and this component exists to
refuse that.
"""

from __future__ import annotations

import math
from enum import StrEnum

__all__ = ["Basis", "RunningStatistic"]


class Basis(StrEnum):
    """Which inputs an aggregate was built from, and so which figures it can support."""

    NONE = "none"
    SAMPLES = "samples"
    SUMMARIES = "summaries"
    MIXED = "mixed"


class RunningStatistic:
    """Count, bias, root mean square and extremes of one scope's residuals.

    Every attribute is a scalar. The object's size does not depend on how many residuals
    have passed through it, which is the property SC-002 measures.
    """

    __slots__ = (
        "_absolute_mean",
        "_count",
        "_maximum",
        "_mean",
        "_minimum",
        "_second_moment",
        "_signed_count",
        "_summary_count",
    )

    def __init__(self) -> None:
        self._count = 0
        self._signed_count = 0
        self._summary_count = 0
        self._mean = 0.0
        self._second_moment = 0.0
        self._absolute_mean = 0.0
        self._minimum: float | None = None
        self._maximum: float | None = None

    # ------------------------------------------------------------------ updates

    def add_sample(self, residual_m_per_s: float) -> None:
        """Fold in one signed residual. Constant time, and nothing is kept."""
        value = float(residual_m_per_s)
        self._count += 1
        self._signed_count += 1
        difference = value - self._mean
        self._mean += difference / self._signed_count
        self._second_moment += difference * (value - self._mean)
        self._fold_absolute(abs(value), 1)
        self._minimum = value if self._minimum is None else min(self._minimum, value)
        self._maximum = value if self._maximum is None else max(self._maximum, value)

    def add_summary(self, count: int, mean_absolute_m_per_s: float) -> None:
        """Fold in a producer's interval summary: a count and a mean of magnitudes.

        A summary reporting no scored samples changes nothing, including the basis: an
        interval in which the monitor scored nothing is not evidence about the residuals,
        and letting it degrade the aggregate's basis would lose the moments for free.
        """
        if count <= 0:
            return
        self._count += count
        self._summary_count += count
        self._fold_absolute(abs(float(mean_absolute_m_per_s)), count)

    def _fold_absolute(self, magnitude: float, weight: int) -> None:
        """Weighted incremental mean of magnitudes, which both update paths support."""
        total = self._count
        self._absolute_mean += (magnitude - self._absolute_mean) * weight / total

    # ------------------------------------------------------------------ reading

    @property
    def count(self) -> int:
        """Residuals folded in, from either kind of input."""
        return self._count

    @property
    def basis(self) -> Basis:
        if self._count == 0:
            return Basis.NONE
        if self._summary_count == 0:
            return Basis.SAMPLES
        if self._signed_count == 0:
            return Basis.SUMMARIES
        return Basis.MIXED

    @property
    def complete(self) -> bool:
        """Whether every residual folded in carried its sign, and so its higher moments."""
        return self._count > 0 and self._count == self._signed_count

    @property
    def mean_absolute_m_per_s(self) -> float | None:
        """Mean residual magnitude, or nothing when no residual has arrived."""
        return None if self._count == 0 else self._absolute_mean

    @property
    def mean_m_per_s(self) -> float | None:
        """The signed mean, which is the bias. Nothing unless every input was a sample."""
        return self._mean if self.complete else None

    @property
    def root_mean_square_m_per_s(self) -> float | None:
        """Root mean square, or nothing when the inputs did not carry the second moment.

        Derived from the mean and the sum of squared deviations rather than from a running
        sum of squares: mean-square equals variance plus the square of the mean, and the
        deviation form does not lose precision when the residuals are small and the mean
        is not.
        """
        if not self.complete:
            return None
        variance = self._second_moment / self._signed_count
        return math.sqrt(max(variance + self._mean * self._mean, 0.0))

    @property
    def minimum_m_per_s(self) -> float | None:
        return self._minimum if self.complete else None

    @property
    def maximum_m_per_s(self) -> float | None:
        return self._maximum if self.complete else None

    @property
    def implausible_reason(self) -> str | None:
        """Why these figures are arithmetically fine and physically suspect, if they are.

        A root mean square of exactly zero in a harness with seeded noise almost certainly
        means the residual stream is a constant rather than a measurement. It is reported
        as zero and flagged, never suppressed: the flag is for a reader, not a filter.
        """
        root = self.root_mean_square_m_per_s
        if root is None or self._count == 0:
            return None
        if root != 0.0:
            return None
        return (
            "every residual folded into this scope is exactly zero. In a harness with "
            "seeded observation noise that is far more likely to mean the residual "
            "stream is a constant than that the forecast is perfect"
        )
