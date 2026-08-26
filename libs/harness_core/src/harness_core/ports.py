"""Port protocols for drogna.

Two of the four ports the constitution recognises as genuine live here: the clock and
the RNG. They are protocols rather than base classes so that an implementation is
whatever satisfies the shape — a network client, a deterministic fake, or the clock
service's own engine.

Two rules bind every implementation of :class:`Clock`, and they are the reason the port
exists at all:

1. No implementation may read a host clock. Simulation time is received, never
   measured. The single exception in drogna is the clock service's real-time driver
   (:mod:`harness_core.clock_service`), which carries an inline
   ``# harness:allow-wallclock`` marker and drives emission pace only, never tick
   values.
2. No implementation may interpolate between ticks. Between tick ``n`` and tick
   ``n+1`` the current simulation instant is the instant of tick ``n``. Interpolation
   would smuggle host time back in through arithmetic, which is exactly the failure
   Constitution I exists to prevent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:  # pragma: no cover - import cycle avoidance, not behaviour
    from random import Random

    from harness_core.clock import ClockStatus, SimInstant, Tick

__all__ = ["Clock", "RandomStreams"]


@runtime_checkable
class Clock(Protocol):
    """The source of simulation time for every component.

    An implementation reports what it has been told, and reports staleness rather than
    guessing when it has been told nothing recently.
    """

    def now(self) -> SimInstant:
        """Return the simulation instant of the most recently observed tick.

        Never interpolates: repeated calls between ticks return the same instant.
        """
        ...

    def tick(self) -> Tick:
        """Return the most recently observed tick."""
        ...

    def status(self) -> ClockStatus:
        """Return the last observed tick, whether it is stale, and any observed gap."""
        ...

    def await_tick(self, index: int) -> Tick:
        """Return tick ``index`` once it has been observed.

        Raises if the clock cannot reach that tick — a fake that is not advanced, or a
        stream that broke. It never fabricates the tick.
        """
        ...

    def await_sim_time(self, instant: SimInstant) -> Tick:
        """Return the first observed tick whose instant is at or after ``instant``."""
        ...


@runtime_checkable
class RandomStreams(Protocol):
    """The source of every stochastic choice in drogna.

    Generators are derived from the run's root seed and a stream name by a versioned
    rule, so a run's choices are a function of its manifest. Nothing may reach for a
    module-level or global generator, and no identifier may come from entropy.
    """

    @property
    def root_seed(self) -> int:
        """The run's root seed, as recorded in the run manifest."""
        ...

    def rng_for(self, stream: str) -> Random:
        """Return the generator for ``stream``, cached so one name means one sequence."""
        ...

    def entropy_for(self, stream: str) -> int:
        """Return the derived entropy for ``stream``, for third-party generators."""
        ...

    def identifier_for(self, stream: str, position: int) -> str:
        """Return a stable identifier derived from the seed and a logical position."""
        ...
