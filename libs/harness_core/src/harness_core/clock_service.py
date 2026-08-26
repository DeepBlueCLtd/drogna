"""The clock service's engine and its real-time driver.

The engine (:class:`ClockEngine`) holds the run's clock state and answers three
questions: what is tick ``n``, may the clock advance, and who is holding it up. It is
pure: no I/O, no host clock, no transport. The service that fronts it over HTTP owns
the sockets; this module owns the arithmetic and the barrier, so both the service and
in-process replay run the same code.

The driver (:class:`RealTimeDriver`) is the one place in drogna permitted to read a
host clock, and only to decide *when* to emit — never *what* to emit. Tick values come
from the engine's integer arithmetic and are unaffected by rate (FR-006).

Rate zero. FR-53 requires screenshot capture to pin the rate to zero, so zero is a
legitimate rate rather than an error. The spec also says a rate of zero is expressed as
a mode change, and both are honoured: :meth:`ClockEngine.set_rate` with zero stores the
rate as zero *and* moves the published mode to ``paused``, remembering the mode and rate
it came from. :meth:`ClockEngine.release` restores them. Pin and release are idempotent,
so a capture that pins twice or releases without pinning does not disturb the sequence.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from typing import Any

from harness_core.clock import (
    CLOCK_TOPIC,
    ClockControlError,
    ClockMode,
    ClockState,
    Participant,
    ParticipantRole,
    SimInstant,
    Tick,
    tick_at,
)
from harness_core.config import validate_document
from harness_core.heartbeat import MessagePublisher
from harness_core.schemas import schema

__all__ = [
    "ClockEngine",
    "ClockSamplePublisher",
    "ClockSettings",
    "LockstepStall",
    "RealTimeDriver",
]

_FREE_RUNNING = (ClockMode.REALTIME, ClockMode.ACCELERATED)


@dataclass(frozen=True)
class ClockSettings:
    """The run's clock configuration, as it appears in config and in the run manifest."""

    run_id: str
    epoch: SimInstant
    tick_interval_us: int
    mode: ClockMode = ClockMode.REALTIME
    rate: float = 1.0
    min_rate: float = 0.0
    max_rate: float = 100.0
    lockstep_deadline_seconds: float | None = None

    def __post_init__(self) -> None:
        if self.tick_interval_us <= 0:
            raise ValueError("tick interval must be a positive whole number of microseconds")
        if self.min_rate < 0:
            raise ValueError("a negative rate would run simulation time backwards")
        if self.max_rate < self.min_rate:
            raise ValueError("max_rate is below min_rate")
        if not self.min_rate <= self.rate <= self.max_rate:
            raise ValueError(
                f"initial rate {self.rate} is outside [{self.min_rate}, {self.max_rate}]"
            )

    def as_manifest_section(self) -> dict[str, Any]:
        """The clock configuration as the run manifest records it."""
        return {
            "epoch": self.epoch.iso(),
            "tick_interval_us": self.tick_interval_us,
            "mode": self.mode.value,
            "rate": self.rate,
            "min_rate": self.min_rate,
            "max_rate": self.max_rate,
        }


@dataclass(frozen=True)
class LockstepStall:
    """What the clock reports when a participant has gone quiet: never a skipped tick."""

    tick: int
    outstanding: tuple[str, ...]

    def message(self) -> str:
        return f"lockstep stalled at tick {self.tick}; outstanding: {', '.join(self.outstanding)}"


class ClockEngine:
    """Tick arithmetic, modes, the participant registry and the lockstep barrier."""

    def __init__(self, settings: ClockSettings, *, index: int = -1) -> None:
        self._settings = settings
        self._mode = settings.mode
        self._rate = settings.rate
        self._index = index
        self._participants: dict[str, Participant] = {}
        self._pinned_from: tuple[ClockMode, float] | None = None

    @property
    def settings(self) -> ClockSettings:
        return self._settings

    @property
    def mode(self) -> ClockMode:
        return self._mode

    @property
    def rate(self) -> float:
        return self._rate

    @property
    def index(self) -> int:
        """The index of the last emitted tick, or -1 before the first."""
        return self._index

    def tick_for(self, index: int) -> Tick:
        """Return tick ``index``: ``epoch + index * tick_interval``, exactly."""
        return tick_at(
            index,
            epoch=self._settings.epoch,
            tick_interval_us=self._settings.tick_interval_us,
            mode=self._mode,
            rate=self._rate,
            run_id=self._settings.run_id,
        )

    def current(self) -> Tick | None:
        return None if self._index < 0 else self.tick_for(self._index)

    def state(self) -> ClockState:
        return ClockState(
            run_id=self._settings.run_id,
            mode=self._mode,
            rate=self._rate,
            epoch=self._settings.epoch,
            tick_interval_us=self._settings.tick_interval_us,
            tick=self.current(),
            participants=tuple(self._participants.values()),
            outstanding=self.outstanding(),
        )

    # Participants ---------------------------------------------------------------

    def register(self, participant_id: str, role: ParticipantRole) -> Participant:
        """Register a participant under a deterministic id. Registering twice is idempotent."""
        existing = self._participants.get(participant_id)
        if existing is not None and existing.role is role:
            return existing
        participant = Participant(id=participant_id, role=role, acknowledged_tick=None)
        self._participants[participant_id] = participant
        return participant

    def participants(self) -> tuple[Participant, ...]:
        return tuple(self._participants.values())

    def acknowledge(self, participant_id: str, index: int) -> Participant:
        participant = self._participants.get(participant_id)
        if participant is None:
            raise ClockControlError(f"{participant_id!r} is not registered with the clock")
        if participant.role is not ParticipantRole.LOCKSTEP:
            raise ClockControlError(
                f"{participant_id!r} is registered as an observer and does not acknowledge ticks"
            )
        if index != self._index:
            raise ClockControlError(
                f"{participant_id!r} acknowledged tick {index}; the clock is at tick {self._index}"
            )
        updated = replace(participant, acknowledged_tick=index)
        self._participants[participant_id] = updated
        return updated

    def outstanding(self) -> tuple[str, ...]:
        """Lockstep participants that have not acknowledged the current tick."""
        if self._mode is not ClockMode.LOCKSTEP or self._index < 0:
            return ()
        return tuple(
            participant.id
            for participant in self._participants.values()
            if participant.role is ParticipantRole.LOCKSTEP
            and participant.acknowledged_tick != self._index
        )

    # Control --------------------------------------------------------------------

    def set_mode(self, mode: ClockMode) -> ClockState:
        if mode in _FREE_RUNNING and self._rate == 0.0:
            # A free-running mode at rate zero would emit nothing and still read as healthy.
            raise ClockControlError(
                f"mode {mode.value} needs a rate above zero; set a rate first or release the pin"
            )
        self._mode = mode
        if mode is not ClockMode.PAUSED:
            self._pinned_from = None
        return self.state()

    def set_rate(self, rate: float) -> ClockState:
        """Set the emission rate. Zero is legitimate: it pins the clock (FR-53)."""
        if rate != rate or rate in (float("inf"), float("-inf")):  # NaN or infinity
            raise ClockControlError(f"rate {rate!r} is not a finite number")
        if not self._settings.min_rate <= rate <= self._settings.max_rate:
            raise ClockControlError(
                f"rate {rate} is outside the configured bounds "
                f"[{self._settings.min_rate}, {self._settings.max_rate}]"
            )
        if rate == 0.0:
            if self._pinned_from is None:
                self._pinned_from = (self._mode, self._rate)
            self._rate = 0.0
            self._mode = ClockMode.PAUSED
            return self.state()
        self._rate = rate
        if self._pinned_from is not None:
            previous_mode, _ = self._pinned_from
            self._mode = previous_mode
            self._pinned_from = None
        elif self._mode is ClockMode.PAUSED:
            self._mode = ClockMode.ACCELERATED if rate != 1.0 else ClockMode.REALTIME
        return self.state()

    def pin(self) -> ClockState:
        """Hold the clock still for a screenshot. Idempotent (FR-53)."""
        return self.set_rate(0.0)

    def release(self) -> ClockState:
        """Undo a pin, restoring the mode and rate it interrupted. Idempotent (FR-53)."""
        if self._pinned_from is None:
            return self.state()
        mode, rate = self._pinned_from
        self._pinned_from = None
        self._mode = mode
        self._rate = rate
        return self.state()

    @property
    def pinned(self) -> bool:
        return self._pinned_from is not None

    # Advance --------------------------------------------------------------------

    def may_advance(self) -> bool:
        """Whether the next tick is due to be emitted, ignoring pace."""
        if self._mode is ClockMode.PAUSED or self._rate == 0.0:
            return False
        return not self.outstanding()

    def advance(self) -> Tick | None:
        """Emit the next tick, or return ``None`` with a reason available in the state.

        A refusal is never a skipped tick: the index advances only when a tick is
        emitted, so no value is ever passed over.
        """
        if not self.may_advance():
            return None
        self._index += 1
        return self.tick_for(self._index)

    def stall(self) -> LockstepStall | None:
        """The outstanding participants, if the lockstep barrier is holding the clock."""
        outstanding = self.outstanding()
        if not outstanding:
            return None
        return LockstepStall(tick=self._index, outstanding=outstanding)

    def emission_interval_seconds(self) -> float | None:
        """Host seconds between emissions at the current rate, or ``None`` when pinned."""
        if self._rate == 0.0 or self._mode is ClockMode.PAUSED:
            return None
        return (self._settings.tick_interval_us / 1_000_000) / self._rate


class RealTimeDriver:
    """Turns rate into emission pace. The only host-clock reader in drogna.

    Constitution I permits exactly this: the clock service's own real-time driver. It
    reads a monotonic host counter to decide when the next tick is due and sleeps until
    then. It never computes a tick value — those come from :class:`ClockEngine` — so a
    replay is unaffected by how fast or slow this loop happens to run.
    """

    def __init__(
        self,
        engine: ClockEngine,
        *,
        monotonic: Callable[[], float] | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._engine = engine
        # harness:allow-wallclock the clock service's real-time driver (Constitution I, FR-009)
        self._monotonic = monotonic or time.monotonic
        self._sleep = sleep or time.sleep
        self._due: float | None = None
        self._stalled_since: float | None = None

    def step(self, emit: Callable[[Tick], None]) -> Tick | None:
        """Wait until the next tick is due, then emit it if the engine permits.

        Returns the emitted tick, or ``None`` when the clock is pinned, paused or held
        by the lockstep barrier. The caller decides whether to keep stepping.
        """
        interval = self._engine.emission_interval_seconds()
        if interval is None:
            self._due = None
            return None

        now = self._monotonic()
        if self._due is None:
            self._due = now
        if self._due > now:
            self._sleep(self._due - now)

        tick = self._engine.advance()
        if tick is None:
            self._note_stall(self._monotonic())
            return None

        self._stalled_since = None
        self._due = (self._due or now) + interval
        emit(tick)
        return tick

    def _note_stall(self, now: float) -> None:
        if self._stalled_since is None:
            self._stalled_since = now

    def stalled_for(self) -> float | None:
        """Host seconds the lockstep barrier has been holding, if it is holding."""
        if self._stalled_since is None:
            return None
        return self._monotonic() - self._stalled_since

    def deadline_passed(self) -> bool:
        """Whether a stalled lockstep barrier has outlasted the configured deadline."""
        deadline = self._engine.settings.lockstep_deadline_seconds
        waited = self.stalled_for()
        if deadline is None or waited is None:
            return False
        return waited > deadline

    def run(self, emit: Callable[[Tick], None], *, ticks: int) -> int:
        """Emit up to ``ticks`` ticks, stopping early if the clock stops advancing."""
        emitted = 0
        while emitted < ticks:
            tick = self.step(emit)
            if tick is not None:
                emitted += 1
                continue
            interval = self._engine.emission_interval_seconds()
            if interval is None:
                return emitted  # pinned or paused: nothing is due
            if self._engine.stall() is None:
                return emitted
            deadline = self._engine.settings.lockstep_deadline_seconds
            if deadline is None or self.deadline_passed():
                # Without a deadline there is nothing this loop can wait for, so it
                # reports rather than spins. Either way the tick is not skipped.
                return emitted
            # Acknowledgements arrive from elsewhere; wait a poll interval for them.
            self._sleep(min(interval, deadline))
        return emitted


class ClockSamplePublisher:
    """Publishes simulation time on ``ctl/clock``, validated against the message schema.

    ADR-0009: consumers receive time by subscribing to the control namespace. This is the
    publishing half of that, and it validates before it publishes because a malformed
    clock sample would be worse than a missing one — every consumer keys its work to it.
    """

    def __init__(self, publisher: MessagePublisher, *, topic: str = CLOCK_TOPIC) -> None:
        self._publisher = publisher
        self._topic = topic

    @property
    def topic(self) -> str:
        return self._topic

    def publish(self, tick: Tick) -> Mapping[str, Any]:
        message = tick.as_message()
        validate_document(message, schema("clock.schema.json"), source=self._topic)
        self._publisher.publish(self._topic, json.dumps(message, sort_keys=True).encode("utf-8"))
        return message
