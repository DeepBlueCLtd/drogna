"""The queue holds its bound, and refuses rather than discards.

The distinction the whole failure mode turns on: a refused offer is not a lost message. The
caller has not acknowledged it, so it is still the broker's, and the only cost is latency.
A queue that grew instead would run the process out of memory; a queue that dropped instead
would leave a hole in the data that nobody notices for a week.
"""

from __future__ import annotations

import pytest
from harness_ingest.backpressure import BoundedQueue


def test_the_queue_never_exceeds_its_bound() -> None:
    queue = BoundedQueue(4)
    accepted = [queue.offer(index) for index in range(10)]
    assert accepted.count(True) == 4
    assert queue.depth == 4
    assert queue.high_water == 4


def test_a_refusal_is_counted_and_is_not_a_loss() -> None:
    queue = BoundedQueue(2)
    for index in range(5):
        queue.offer(index)
    assert queue.refused == 3
    assert queue.admitted == 2


def test_the_queue_stops_accepting_at_its_bound_and_accepts_again_once_drained() -> None:
    queue = BoundedQueue(2)
    queue.offer("a")
    queue.offer("b")
    assert not queue.accepting
    assert queue.take(1) == ["a"]
    assert queue.accepting


def test_messages_come_back_in_the_order_they_arrived() -> None:
    queue = BoundedQueue(8)
    for index in range(5):
        queue.offer(index)
    assert list(queue.drain()) == [0, 1, 2, 3, 4]
    assert queue.depth == 0


def test_the_high_water_mark_survives_the_queue_draining() -> None:
    queue = BoundedQueue(8)
    for index in range(6):
        queue.offer(index)
    list(queue.drain())
    assert queue.high_water == 6
    assert queue.state().depth == 0


def test_the_state_reports_the_bound_as_reached() -> None:
    queue = BoundedQueue(2)
    queue.offer("a")
    assert not queue.state().at_bound
    queue.offer("b")
    assert queue.state().at_bound


def test_a_queue_that_can_hold_nothing_is_refused() -> None:
    with pytest.raises(ValueError, match="stall on its first message"):
        BoundedQueue(0)
