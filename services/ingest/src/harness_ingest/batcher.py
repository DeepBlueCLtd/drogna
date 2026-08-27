"""Batching: two bounds, both from configuration, one of them in simulation time.

A batch is written when it holds ``maximum_messages`` observations, or when
``maximum_interval_seconds`` of *simulation* time have passed since the first message in it
arrived, whichever comes first.

The time bound is in simulation time deliberately. A host-time flush interval would be a
wall-clock read in the operational path, and the whole write path would then depend on
something a replay cannot reproduce. Under an accelerated clock a simulation-time bound
flushes more often in real terms, which is the correct behaviour for a harness whose point
is to compress time: the faster the simulated world runs, the faster its observations
arrive, and the batch fills at the same rate relative to the world it describes.
"""

from __future__ import annotations

from collections.abc import Sequence

from harness_core.clock import SimInstant
from harness_types.messages.observation import DrognaObservation

__all__ = ["Batcher"]

_MICROS_PER_SECOND = 1_000_000


class Batcher:
    """Accumulates validated observations until one of its two bounds is reached."""

    def __init__(self, *, maximum_messages: int, maximum_interval_seconds: float) -> None:
        if maximum_messages < 1:
            raise ValueError("a batch holds at least one message")
        if maximum_interval_seconds <= 0:
            raise ValueError("a batch interval is a positive number of simulation seconds")
        self._maximum_messages = maximum_messages
        self._maximum_micros = round(maximum_interval_seconds * _MICROS_PER_SECOND)
        self._held: list[DrognaObservation] = []
        self._opened: SimInstant | None = None

    def __len__(self) -> int:
        return len(self._held)

    @property
    def opened(self) -> SimInstant | None:
        """When the current batch took its first message, in simulation time."""
        return self._opened

    def add(self, observation: DrognaObservation, instant: SimInstant) -> None:
        """Put one validated observation in the batch, noting when the batch opened."""
        if not self._held:
            self._opened = instant
        self._held.append(observation)

    def due(self, instant: SimInstant) -> bool:
        """Whether either bound has been reached at this simulation instant."""
        if not self._held:
            return False
        if len(self._held) >= self._maximum_messages:
            return True
        if self._opened is None:
            return False
        return (instant - self._opened) >= self._maximum_micros

    def take(self) -> Sequence[DrognaObservation]:
        """Take everything held, leaving the batch empty and closed."""
        held, self._held = self._held, []
        self._opened = None
        return tuple(held)

    def restore(self, batch: Sequence[DrognaObservation], instant: SimInstant) -> None:
        """Put a batch back, ahead of anything that arrived while it was away.

        For the one case that needs it: the store was unavailable when the batch was full.
        The batch is retained rather than abandoned, its messages are still unacknowledged
        so the broker still holds them, and it is written when the store returns. Nothing
        is lost and nothing is written twice.
        """
        if not batch:
            return
        self._held = [*batch, *self._held]
        if self._opened is None:
            self._opened = instant
