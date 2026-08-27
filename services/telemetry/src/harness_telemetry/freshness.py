"""Whether a figure is still current, in simulation time.

Silent degradation is this component's failure mode, and this is the smallest machine that
prevents it: remember when a statistic was last *really* updated, and compare that instant
against the configured window whenever the statistic is published. A republished statistic
does not count as an update — that is the entire point, because a statistic that refreshed
its own timestamp by being published would be permanently fresh and permanently useless.

Simulation time throughout (Constitution I). The single real-time exemption ADR-0006
carries covers heartbeat emission and liveness evaluation, and ageing a statistic towards
``stale`` is neither. A paused clock stops the residual stream and stops the ageing with
it, which is right: nothing has gone quiet, the world has stopped.

The stale span is measured from the moment the window expired, not from the last update.
A statistic is not stale during the window — that is what the window is for — so counting
the window as part of the outage would overstate every gap by a fixed amount.
"""

from __future__ import annotations

from enum import StrEnum

__all__ = ["Freshness", "FreshnessTracker"]

_MICROS_PER_SECOND = 1_000_000


class Freshness(StrEnum):
    """The two things a figure can say about its own currency."""

    FRESH = "fresh"
    STALE = "stale"


class FreshnessTracker:
    """The last real update of one scope, and what that implies at a given instant."""

    __slots__ = ("_last_update_micros", "_stale_span_micros", "_window_micros")

    def __init__(self, window_micros: int) -> None:
        if window_micros <= 0:
            raise ValueError("a staleness window is a positive number of simulation microseconds")
        self._window_micros = window_micros
        self._last_update_micros: int | None = None
        self._stale_span_micros: int | None = None

    def updated(self, at_micros: int) -> None:
        """Record a real update at a simulation instant.

        An update arriving after the window had already expired closes an outage, and the
        span of that outage is kept so the recovery is visible as a recovery rather than as
        a figure that quietly started moving again.
        """
        previous = self._last_update_micros
        if previous is not None:
            gap = at_micros - previous
            if gap > self._window_micros:
                self._stale_span_micros = gap - self._window_micros
        self._last_update_micros = at_micros

    def state(self, now_micros: int) -> Freshness:
        """Whether the figure may still be called current at ``now_micros``.

        A scope that has never been updated is stale, not fresh. There is no value behind
        it, and calling nothing fresh is the exact error this module exists to prevent.
        """
        if self._last_update_micros is None:
            return Freshness.STALE
        if now_micros - self._last_update_micros > self._window_micros:
            return Freshness.STALE
        return Freshness.FRESH

    @property
    def last_update_micros(self) -> int | None:
        return self._last_update_micros

    @property
    def stale_span_seconds(self) -> float | None:
        """How long the most recent outage lasted, or nothing if there has not been one."""
        if self._stale_span_micros is None:
            return None
        return self._stale_span_micros / _MICROS_PER_SECOND
