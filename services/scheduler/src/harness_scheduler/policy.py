"""The policy: whether this divergence is worth a run, and the record either way.

Three outcomes, and the schema of the decision record admits exactly these three:

``accepted``
    Nothing is outstanding and the minimum interval has elapsed. A run identifier is
    derived and a request is published.
``minimum-interval``
    A run started too recently. The divergence is real and is declined anyway, because the
    field the last run produced has not had a chance to be scored yet.
``duplicate-outstanding``
    A run is already in flight. A second divergence — even one in a genuinely different
    region — does not get a concurrent run: it is folded into the next scheduled one and
    recorded as such. The rule is per outstanding run, not per region, because two
    concurrent runs would race to be current.

Every divergence produces exactly one decision. The count of decisions equals the count of
divergences received, and that equality is what SC-006 asserts.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from harness_scheduler.outstanding import OutstandingRegister

__all__ = ["Decision", "RunPolicy", "Verdict"]

_MICROS_PER_SECOND = 1_000_000


class Decision(StrEnum):
    """The recorded outcome for one divergence."""

    ACCEPTED = "accepted"
    MINIMUM_INTERVAL = "minimum-interval"
    DUPLICATE_OUTSTANDING = "duplicate-outstanding"


@dataclass(frozen=True)
class Verdict:
    """What the policy decided, and enough of why for the record to stand alone."""

    decision: Decision
    detail: str

    @property
    def accepted(self) -> bool:
        return self.decision is Decision.ACCEPTED


class RunPolicy:
    """The minimum interval and the duplicate rule, in one place, in simulation time."""

    def __init__(self, register: OutstandingRegister, *, minimum_interval_seconds: float) -> None:
        if minimum_interval_seconds < 0:
            raise ValueError("the minimum interval between runs is not negative")
        self._register = register
        self._minimum_interval_micros = round(minimum_interval_seconds * _MICROS_PER_SECOND)
        self._last_requested_micros: int | None = None

    @property
    def last_requested_micros(self) -> int | None:
        return self._last_requested_micros

    def consider(self, *, now_micros: int) -> Verdict:
        """Decide, without doing anything about it. The caller publishes or does not."""
        self._register.expire(now_micros)

        held = self._register.current
        if held is not None:
            return Verdict(
                Decision.DUPLICATE_OUTSTANDING,
                f"a run requested at {held.requested_micros} microseconds of simulation "
                "time is still outstanding; this divergence folds into the next run",
            )

        if self._last_requested_micros is not None:
            elapsed = now_micros - self._last_requested_micros
            if elapsed < self._minimum_interval_micros:
                remaining = (self._minimum_interval_micros - elapsed) / _MICROS_PER_SECOND
                return Verdict(
                    Decision.MINIMUM_INTERVAL,
                    f"the minimum interval between runs has {remaining:g} seconds of "
                    "simulation time left to run",
                )

        return Verdict(Decision.ACCEPTED, "nothing outstanding and the interval has elapsed")

    def requested(self, *, now_micros: int) -> None:
        """Record that a request was published at this simulation instant."""
        self._last_requested_micros = now_micros
