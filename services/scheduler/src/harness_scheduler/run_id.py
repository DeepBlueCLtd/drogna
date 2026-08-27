"""Run identifiers: a function of the seed and the ordinal, never of entropy or a clock.

Constitution II makes this small module load-bearing. The run identifier appears in four
control messages, in the coverage store's layout and in the collection identifiers the
query layer serves, so if it came from entropy or from a host clock then no replay could
produce the same names as the run it replays — and a replay whose outputs are identical
except for their names is not a replay anybody can diff.

So a run's name is the *n*th identifier of one named stream: replaying a scenario asks for
the same ordinals in the same order and gets the same names back.
"""

from __future__ import annotations

from harness_core.rng import RandomStreams

__all__ = ["RUN_STREAM", "run_identifier"]

RUN_STREAM = "scheduler.run"
_PREFIX = "run-"


def run_identifier(randomness: RandomStreams, ordinal: int) -> str:
    """The identifier of the ``ordinal``-th run of this scenario, counting from zero."""
    if ordinal < 0:
        raise ValueError("run ordinals count from zero")
    return _PREFIX + randomness.identifier_for(RUN_STREAM, ordinal)
