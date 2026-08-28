"""Two toy lockstep participants whose output is a pure function of the run manifest.

Each draws from a named RNG stream through :func:`harness_core.rng.rng_for` — the single
route Constitution II admits — and keys every output record to the tick's *values*: its
index and its simulation instant, both read from the tick itself. Neither participant
counts what it has received. That distinction is what T042 exists to demonstrate: under
lockstep a tick can be redelivered (a broker retries, a subscriber reconnects), and a
participant that numbered its records by receipt count would drift from one that numbered
them by tick value — silently, and only on the runs where the redelivery happened.

So each participant remembers the last tick index it acted on. A tick it has already
acted on is re-acknowledged and changes nothing: no second draw, no second record. A tick
that skips forward is refused loudly, because the lockstep barrier promises it cannot
happen and a participant that papered over it would be hiding a broken clock.
"""

from __future__ import annotations

import json
from pathlib import Path

from harness_core.clock import Tick
from harness_core.rng import rng_for

__all__ = ["DriftingFloat", "NoisySampler", "TickOrderError"]


class TickOrderError(Exception):
    """A tick arrived out of order, which the lockstep barrier exists to make impossible."""


class _TickKeyedParticipant:
    """The shared discipline: act once per tick value, however often the tick arrives."""

    def __init__(self, participant_id: str) -> None:
        self.participant_id = participant_id
        self.stream = f"participants.{participant_id}"
        self._last_index = -1
        self._lines: list[str] = []

    def receive(self, tick: Tick) -> None:
        """Act on a tick exactly once, keyed to its value and not to its arrival."""
        if tick.index == self._last_index:
            return  # a redelivery of the tick already acted on: acknowledge, change nothing
        if tick.index != self._last_index + 1:
            raise TickOrderError(
                f"{self.participant_id} saw tick {tick.index} after tick {self._last_index}; "
                "the lockstep barrier never skips, so this run is not a lockstep run"
            )
        record = self._record()
        record["tick"] = tick.index
        record["sim_time"] = tick.instant.iso()
        self._lines.append(json.dumps(record, sort_keys=True))
        self._last_index = tick.index

    def _record(self) -> dict[str, object]:
        raise NotImplementedError

    def write_output(self, path: Path) -> Path:
        """Write every record, one JSON document per line, with a trailing newline."""
        path.write_text("\n".join(self._lines) + "\n", encoding="utf-8")
        return path


class DriftingFloat(_TickKeyedParticipant):
    """A toy platform wandering from a fixed origin, one seeded step per tick."""

    def __init__(self, participant_id: str = "alpha") -> None:
        super().__init__(participant_id)
        self._latitude = 49.0
        self._longitude = -4.5

    def _record(self) -> dict[str, object]:
        step = rng_for(self.stream)
        self._latitude += (step.random() - 0.5) * 0.01
        self._longitude += (step.random() - 0.5) * 0.01
        return {"latitude": self._latitude, "longitude": self._longitude}


class NoisySampler(_TickKeyedParticipant):
    """A toy instrument reporting a seeded noisy reading per tick."""

    def __init__(self, participant_id: str = "beta") -> None:
        super().__init__(participant_id)

    def _record(self) -> dict[str, object]:
        noise = rng_for(self.stream)
        return {"reading": 10.0 + noise.gauss(0.0, 0.5)}
