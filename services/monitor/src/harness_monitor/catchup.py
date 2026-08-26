"""Starting, and starting again: warm-up and the single catch-up query.

A monitor that has just started has no window, and a monitor with no window has no
persistence evidence and therefore no honest way to raise a divergence. FR-23 gives two
ways to get one, and configuration chooses between them:

``span``
    Watch the traffic for a declared span of simulation time and publish nothing until it
    has elapsed. Costs nothing and asks nothing of the store.

``catchup``
    Issue **exactly one** query against the observation store for the span just past, fill
    the window from it, and never query again for the life of the process. One query, at
    startup, is the whole of this component's relationship with the observation store
    (FR-22): the count of queries after warm-up is zero and is asserted, not intended.

A broker reconnection is a warm-up boundary too. A dropped subscription is a gap in the
window, and a gap is not agreement — treating it as one would let a quiet period masquerade
as a period in which the forecast was right.
"""

from __future__ import annotations

from collections.abc import Sequence
from enum import StrEnum
from typing import Protocol

from harness_monitor.observations import Sounding

__all__ = ["CatchupQuery", "WarmUp", "WarmUpMode"]

_MICROS_PER_SECOND = 1_000_000


class WarmUpMode(StrEnum):
    """The two ways of acquiring a window, as configuration names them."""

    SPAN = "span"
    CATCHUP = "catchup"


class CatchupQuery(Protocol):
    """The one query the monitor makes against the observation store, at startup.

    Deliberately not dressed as a repository or a pluggable store abstraction: the
    observation store is not a port (Constitution VI, §2.1). It is a protocol here for one
    reason only, that a test can count the calls.
    """

    def soundings(self, *, since_micros: int, until_micros: int, limit: int) -> Sequence[Sounding]:
        """Soundings in the span, oldest first, at most ``limit`` of them."""
        ...


class WarmUp:
    """Whether the monitor is entitled to raise anything yet."""

    def __init__(
        self,
        *,
        mode: WarmUpMode,
        span_seconds: float,
        sample_limit: int = 1000,
        query: CatchupQuery | None = None,
    ) -> None:
        if mode is WarmUpMode.CATCHUP and query is None:
            raise ValueError(
                "warm-up is configured for a catch-up query but no observation store "
                "client was supplied; a monitor that cannot catch up must say so at "
                "startup rather than warm up silently in a different mode"
            )
        self._mode = mode
        self._span_micros = round(span_seconds * _MICROS_PER_SECOND)
        self._sample_limit = sample_limit
        self._query = query
        self._started_micros: int | None = None
        self._complete = False
        self._queries = 0

    @property
    def queries_issued(self) -> int:
        """How many times the observation store has been asked anything. Never more than one."""
        return self._queries

    @property
    def complete(self) -> bool:
        return self._complete

    @property
    def mode(self) -> WarmUpMode:
        return self._mode

    def begin(self, now_micros: int) -> Sequence[Sounding]:
        """Start warming, returning whatever the catch-up query recovered.

        In span mode nothing is recovered and nothing is asked of the store.
        """
        self._started_micros = now_micros
        self._complete = False
        if self._mode is WarmUpMode.SPAN or self._query is None:
            return ()
        self._queries += 1
        recovered = self._query.soundings(
            since_micros=now_micros - self._span_micros,
            until_micros=now_micros,
            limit=self._sample_limit,
        )
        self._complete = True
        return recovered

    def restart(self, now_micros: int, reason: str) -> str:
        """A reconnection, or anything else that puts a hole in the window.

        The query is not reissued: FR-22 allows one for the life of the process, and a
        monitor that queried the store on every reconnection would be querying it during
        normal operation by another name.
        """
        self._started_micros = now_micros
        self._complete = False
        return reason

    def observe(self, now_micros: int) -> bool:
        """Advance warm-up to this simulation instant, returning whether it is done."""
        if self._complete:
            return True
        if self._started_micros is None:
            self._started_micros = now_micros
        if now_micros - self._started_micros >= self._span_micros:
            self._complete = True
        return self._complete
