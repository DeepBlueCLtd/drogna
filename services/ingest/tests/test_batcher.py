"""Two bounds, and the second one is in simulation time.

The time bound is the one worth testing carefully. If it were host time, this test could
only be written with a sleep in it, which is the tell: an interval nobody can advance
deterministically is an interval a replay cannot reproduce.
"""

from __future__ import annotations

import ingest_support as support
import pytest
from harness_ingest.batcher import Batcher
from harness_types.messages.observation import DrognaObservation


def observation(ordinal: int) -> DrognaObservation:
    return DrognaObservation.model_validate(support.observation(ordinal))


def test_the_count_bound_makes_a_batch_due() -> None:
    clock = support.clock()
    batcher = Batcher(maximum_messages=3, maximum_interval_seconds=3600.0)
    for ordinal in range(2):
        batcher.add(observation(ordinal), clock.now())
    assert not batcher.due(clock.now())
    batcher.add(observation(2), clock.now())
    assert batcher.due(clock.now())


def test_the_time_bound_makes_a_batch_due_without_the_count_being_reached() -> None:
    clock = support.clock(tick_interval_us=30_000_000)
    batcher = Batcher(maximum_messages=500, maximum_interval_seconds=60.0)
    batcher.add(observation(0), clock.now())
    assert not batcher.due(clock.advance().instant)
    assert batcher.due(clock.advance().instant)


def test_an_empty_batch_is_never_due() -> None:
    clock = support.clock()
    batcher = Batcher(maximum_messages=1, maximum_interval_seconds=1.0)
    assert not batcher.due(clock.now())


def test_taking_a_batch_closes_it() -> None:
    clock = support.clock()
    batcher = Batcher(maximum_messages=2, maximum_interval_seconds=60.0)
    batcher.add(observation(0), clock.now())
    batcher.add(observation(1), clock.now())
    taken = batcher.take()
    assert len(taken) == 2
    assert len(batcher) == 0
    assert batcher.opened is None


def test_a_restored_batch_keeps_its_place_at_the_front() -> None:
    """The store was unavailable. The batch is retained, not abandoned, and written first."""
    clock = support.clock()
    batcher = Batcher(maximum_messages=10, maximum_interval_seconds=60.0)
    batcher.add(observation(0), clock.now())
    held = batcher.take()
    batcher.add(observation(1), clock.now())
    batcher.restore(held, clock.now())
    assert [entry.tick for entry in batcher.take()] == [0, 1]


def test_bounds_that_would_never_flush_are_refused() -> None:
    with pytest.raises(ValueError, match="at least one message"):
        Batcher(maximum_messages=0, maximum_interval_seconds=60.0)
    with pytest.raises(ValueError, match="positive number of simulation seconds"):
        Batcher(maximum_messages=1, maximum_interval_seconds=0.0)
