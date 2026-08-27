"""The sensor loop: follow simulation time, sample when it is due, publish, beat.

Three places in this component would reach for the host clock if left alone, and all three
take the simulation clock instead: the observation's phenomenon time, the interval between
samples, and the wait before a reconnection attempt. The heartbeat is the single exception
and it is real time by ADR-0006, marked as such in ``harness_core.heartbeat`` where the
emission happens.

The loop takes ticks rather than a clock. In the deployed component they come from the
clock port's subscription to ``ctl/clock``; in a test they come from a
:class:`~harness_core.clock.ManualClock`. Either way the loop advances only when simulation
time does, which is the property that makes the behaviour the same in both.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass

from harness_core.clock import ClockStaleError, SimInstant, Tick
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus

from harness_sensors.publisher import ObservationPublisher
from harness_sensors.sensor import SensorArray

__all__ = ["SensorRun", "SensorService", "backoff_seconds", "wait_simulation_seconds"]

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class SensorRun:
    """What a run of the loop did, for a caller that wants to reconcile counts."""

    events: int
    published: int
    last_tick: int | None
    stopped_because: str


def backoff_seconds(attempt: int, *, initial: float, maximum: float) -> float:
    """The wait before attempt ``attempt``, doubling and then held at the ceiling.

    Bounded so that a component whose broker is absent keeps trying at a steady rate
    rather than backing off into silence. Measured in simulation seconds: the wait is
    spent consuming ticks, so a paused clock pauses the retry too, which is correct — the
    simulated world is not going anywhere either.
    """
    if attempt < 1:
        raise ValueError("attempts are counted from one")
    if initial <= 0 or maximum <= 0:
        raise ValueError("a backoff is a positive number of simulation seconds")
    return min(initial * (2 ** (attempt - 1)), maximum)


def wait_simulation_seconds(ticks: Iterator[Tick], seconds: float) -> Tick | None:
    """Consume ticks until ``seconds`` of simulation time have passed, or they run out."""
    first: Tick | None = None
    for tick in ticks:
        if first is None:
            first = tick
            continue
        if (tick.instant - first.instant) >= round(seconds * _MICROS_PER_SECOND):
            return tick
    return None


class SensorService:
    """Samples on a simulation-time interval and publishes what it samples."""

    def __init__(
        self,
        *,
        array: SensorArray,
        publisher: ObservationPublisher,
        interval_seconds: float,
        heartbeat: HeartbeatPublisher | None = None,
        maximum_samples: int | None = None,
    ) -> None:
        if interval_seconds <= 0:
            raise ValueError("a sampling interval is a positive number of simulation seconds")
        self._array = array
        self._publisher = publisher
        self._interval_micros = round(interval_seconds * _MICROS_PER_SECOND)
        self._heartbeat = heartbeat
        self._maximum_samples = maximum_samples
        self._next_due: SimInstant | None = None
        self._events = 0
        self._published = 0

    @property
    def published(self) -> int:
        return self._published

    @property
    def events(self) -> int:
        return self._events

    def due(self, instant: SimInstant) -> bool:
        """Whether a sample is due at this simulation instant."""
        return self._next_due is None or instant >= self._next_due

    def sample_now(self, tick: Tick) -> int:
        """Take one sampling event and publish it. Returns how many messages went out."""
        observations = self._array.sample(tick)
        for observation in observations:
            self._publisher.publish(observation)
        self._events += 1
        self._published += len(observations)
        self._next_due = tick.instant.plus_micros(self._interval_micros)
        return len(observations)

    def on_tick(self, tick: Tick) -> int:
        """Handle one tick: sample if due, and beat if the real-time interval has elapsed."""
        published = self.sample_now(tick) if self.due(tick.instant) else 0
        if self._heartbeat is not None:
            self._heartbeat.maybe_publish(tick, status=HeartbeatStatus.OK)
        return published

    def finished(self) -> bool:
        """Whether the configured sample count, if there is one, has been reached."""
        return self._maximum_samples is not None and self._events >= self._maximum_samples

    def run(self, ticks: Iterable[Tick]) -> SensorRun:
        """Follow the clock until it stops or the configured sample count is reached."""
        stopped = "the clock subscription ended"
        last: Tick | None = None
        source = iter(ticks)
        while True:
            try:
                tick = next(source)
            except StopIteration:
                break
            except ClockStaleError:
                stopped = "the clock went stale"
                break
            last = tick
            self.on_tick(tick)
            if self.finished():
                stopped = "the configured sample count was reached"
                break
        if self._heartbeat is not None and last is not None:
            self._heartbeat.publish(last, status=HeartbeatStatus.STOPPING, detail=stopped)
        return SensorRun(
            events=self._events,
            published=self._published,
            last_tick=None if last is None else last.index,
            stopped_because=stopped,
        )
