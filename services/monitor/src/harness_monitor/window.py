"""The rolling window: bounded in simulation time and in samples, and never in the store.

FR-22 is the requirement and the constraint at once. The monitor subscribes to observation
traffic directly and holds what it needs in process memory; it does not query the
observation store during normal operation, and the window it holds must not grow with the
length of the scenario.

So the window is bounded twice, and the two bounds answer different questions. The
simulation-time span answers "how far back is worth scoring", and it is the bound that
carries meaning: evidence older than the span is not evidence about the current forecast.
The sample count answers "how much memory may this process use", and it is the bound that
holds at a high clock rate, where a span can contain arbitrarily many samples. Eviction is
by simulation time — oldest first — under both.

Nothing here reads a host clock. The window is advanced by the simulation instants of the
samples put into it and by the clock the service passes in, and by nothing else.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterator

from harness_monitor.observations import Sounding

__all__ = ["RollingWindow"]


class RollingWindow:
    """Recent soundings, oldest evicted first, bounded by span and by count."""

    def __init__(self, *, span_seconds: float, maximum_samples: int) -> None:
        if span_seconds <= 0:
            raise ValueError("a window spans a positive number of simulation seconds")
        if maximum_samples < 1:
            raise ValueError("a window holds at least one sample")
        self._span_micros = round(span_seconds * 1_000_000)
        self._maximum_samples = maximum_samples
        self._samples: deque[Sounding] = deque()
        self._evicted_by_span = 0
        self._evicted_by_count = 0

    def __len__(self) -> int:
        return len(self._samples)

    def __iter__(self) -> Iterator[Sounding]:
        return iter(self._samples)

    @property
    def span_micros(self) -> int:
        return self._span_micros

    @property
    def evicted_by_span(self) -> int:
        return self._evicted_by_span

    @property
    def evicted_by_count(self) -> int:
        """Samples dropped because the count bound bit before the span did.

        Counted separately because the two evictions mean different things: by span is the
        window working, and by count is the window too small for the rate it is being fed,
        which is a fact about the scenario worth seeing rather than absorbing.
        """
        return self._evicted_by_count

    @property
    def oldest(self) -> Sounding | None:
        return self._samples[0] if self._samples else None

    @property
    def newest(self) -> Sounding | None:
        return self._samples[-1] if self._samples else None

    def occupied_micros(self) -> int:
        """Simulation-time span from the oldest held sample to the newest."""
        if not self._samples:
            return 0
        return self._samples[-1].sim_micros - self._samples[0].sim_micros

    def add(self, sounding: Sounding) -> None:
        """Add a sounding and evict whatever the two bounds no longer admit.

        A sounding older than the newest held is kept in order rather than appended, so
        that out-of-order arrival — normal on a broker — does not corrupt the span
        arithmetic. The window is small and late arrivals are rare, so a linear insertion
        is the right shape here.
        """
        if self._samples and sounding.sim_micros < self._samples[-1].sim_micros:
            ordered = sorted([*self._samples, sounding], key=lambda item: item.sim_micros)
            self._samples = deque(ordered)
        else:
            self._samples.append(sounding)
        self.evict(sounding.sim_micros)

    def evict(self, now_micros: int) -> None:
        """Drop everything the bounds no longer admit, given the current simulation time."""
        horizon = now_micros - self._span_micros
        while self._samples and self._samples[0].sim_micros < horizon:
            self._samples.popleft()
            self._evicted_by_span += 1
        while len(self._samples) > self._maximum_samples:
            self._samples.popleft()
            self._evicted_by_count += 1
