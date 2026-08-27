"""The bounded queue, and what reaching its bound costs.

Ingest backpressure is the failure mode the SRD assigns to this component, so it is built
rather than discovered. The queue has a limit. At the limit the client stops taking
messages from the broker — it does not discard them and it does not grow — and the broker
holds the excess until the backlog drains. Reaching the bound therefore costs latency and
never data.

"Stops taking" is the whole of it. Under quality of service 1 an unacknowledged message
stays with the broker, so a client that ceases to acknowledge is a client the broker keeps
messages for. What it must not do is accept a message into memory and then drop it, which
is how an ingest client turns a busy minute into a hole in the data that nobody notices for
a week.

Broker-side loss is counted here too, from the gaps the subscriber reports. A burst large
enough to exceed the broker's own retention for the in-flight window loses messages before
this component ever sees them; that number belongs on ``ctl/telemetry`` beside the queue
depth, rather than being discovered later as a hole in the data.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass

__all__ = ["BoundedQueue", "QueueState"]


@dataclass(frozen=True)
class QueueState:
    """What the queue is doing, for the telemetry message and for a test to assert on."""

    depth: int
    bound: int
    accepting: bool
    admitted: int
    high_water: int
    refused: int = 0
    filled: int = 0

    @property
    def at_bound(self) -> bool:
        return self.depth >= self.bound


class BoundedQueue:
    """Holds received messages until they have been written. Never more than its bound.

    The item type is deliberately loose: what is queued is the raw message and whatever the
    subscriber needs to acknowledge it later. This class is about the bound, not about what
    is in it.
    """

    def __init__(self, maximum_depth: int) -> None:
        if maximum_depth < 1:
            raise ValueError("a queue that can hold nothing would stall on its first message")
        self._bound = maximum_depth
        self._items: deque[object] = deque()
        self._admitted = 0
        self._high_water = 0
        self._refused = 0
        self._filled = 0

    @property
    def bound(self) -> int:
        return self._bound

    @property
    def depth(self) -> int:
        return len(self._items)

    @property
    def accepting(self) -> bool:
        """Whether there is room. When there is not, the broker keeps its messages."""
        return len(self._items) < self._bound

    @property
    def admitted(self) -> int:
        return self._admitted

    @property
    def refused(self) -> int:
        """Offers turned away at the bound. Not losses: the broker still holds them."""
        return self._refused

    @property
    def high_water(self) -> int:
        """The deepest the queue has been. The figure SC-006 is asserted against."""
        return self._high_water

    @property
    def filled(self) -> int:
        """How many times the queue has reached its bound.

        The indicator is derived from this rather than from the instantaneous depth. A loop
        that takes and writes within one turn is almost never sampled while full, so a
        depth-only indicator would report a system under sustained backpressure as
        comfortable — which is the failure being visible was supposed to prevent.
        """
        return self._filled

    def offer(self, item: object) -> bool:
        """Take a message if there is room. Returns whether it was taken.

        A refusal is the caller's signal to stop reading from the broker. It is never a
        signal to drop the message: the caller has not acknowledged it, so it is still the
        broker's.
        """
        if not self.accepting:
            self._refused += 1
            self._filled += 1
            return False
        self._items.append(item)
        self._admitted += 1
        self._high_water = max(self._high_water, len(self._items))
        if len(self._items) >= self._bound:
            self._filled += 1
        return True

    def take(self, count: int) -> list[object]:
        """Take up to ``count`` messages, oldest first."""
        if count < 1:
            raise ValueError("taking nothing would make no progress")
        taken: list[object] = []
        while self._items and len(taken) < count:
            taken.append(self._items.popleft())
        return taken

    def drain(self) -> Iterator[object]:
        """Every held message, oldest first, leaving the queue empty."""
        while self._items:
            yield self._items.popleft()

    def state(self) -> QueueState:
        return QueueState(
            depth=len(self._items),
            bound=self._bound,
            accepting=self.accepting,
            admitted=self._admitted,
            high_water=self._high_water,
            refused=self._refused,
            filled=self._filled,
        )

    def __len__(self) -> int:
        return len(self._items)
