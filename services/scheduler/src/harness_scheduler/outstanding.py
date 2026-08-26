"""The outstanding-request register: at most one run in flight, and never for ever.

A request is outstanding from the moment it is published until the run it asked for is
announced on ``ctl/run-published`` or the configured timeout elapses in simulation time
(FR-013). Both endings matter. Without the first, a completed run would leave the scheduler
believing a run is still in flight and the loop would stop. Without the second, a run that
dies leaves the loop stopped for ever, which is worse than running twice.

The timeout is simulation time, like every other interval in this component. At an
accelerated rate a run that has genuinely stalled is abandoned sooner in host seconds, which
is right: the scenario is what the timeout is about.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = ["OutstandingRegister", "OutstandingRequest"]

_MICROS_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class OutstandingRequest:
    """A run that has been asked for and has not yet been heard about."""

    identifier: str
    requested_micros: int
    justified_by: str


class OutstandingRegister:
    """One slot. A second request while it is filled is a duplicate by definition."""

    def __init__(self, *, timeout_seconds: float) -> None:
        if timeout_seconds <= 0:
            raise ValueError("an outstanding request times out after a positive span")
        self._timeout_micros = round(timeout_seconds * _MICROS_PER_SECOND)
        self._current: OutstandingRequest | None = None
        self._abandoned = 0
        self._completed = 0

    @property
    def current(self) -> OutstandingRequest | None:
        return self._current

    @property
    def abandoned(self) -> int:
        """Requests cleared by timeout rather than by a publication. Counted, not hidden."""
        return self._abandoned

    @property
    def completed(self) -> int:
        return self._completed

    def open(self, identifier: str, *, at_micros: int, justified_by: str) -> OutstandingRequest:
        """Record a published request. Opening a second while one is held is a fault."""
        if self._current is not None:
            raise RuntimeError(
                f"a request for {self._current.identifier} is already outstanding; the "
                "policy decides whether to request, and it must not be bypassed"
            )
        self._current = OutstandingRequest(
            identifier=identifier, requested_micros=at_micros, justified_by=justified_by
        )
        return self._current

    def close(self, identifier: str) -> bool:
        """Clear the slot because this run was published. Returns whether it was ours."""
        if self._current is None or self._current.identifier != identifier:
            return False
        self._current = None
        self._completed += 1
        return True

    def expire(self, now_micros: int) -> OutstandingRequest | None:
        """Clear the slot if the timeout has elapsed, returning what was abandoned."""
        held = self._current
        if held is None:
            return None
        if now_micros - held.requested_micros < self._timeout_micros:
            return None
        self._current = None
        self._abandoned += 1
        return held
