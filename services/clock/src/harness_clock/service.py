"""The clock engine, wrapped as a component that runs.

The arithmetic is not here. :class:`harness_core.clock_service.ClockEngine` holds the run's
clock state and answers what tick ``n`` is, whether the clock may advance, and who is
holding it up; :class:`~harness_core.clock_service.RealTimeDriver` turns rate into emission
pace and is the one place in drogna permitted to read a host clock. Both are pure of
transport, and both are used here unchanged. What this module adds is everything that makes
them a component: where the ticks go, what a command from the browser does to them, what
the run manifest records, and what the loop does when nothing is due.

Three things are worth stating plainly, because each is a decision rather than a detail.

**Ticks go on the broker, not down a socket.** ADR-0009: simulation time is published on
``ctl/clock`` and consumers, the browser included, receive it by subscribing. The HTTP
interface exists for the two things a subscription cannot do — setting the rate, and
answering "what is the time now" for a component starting up or catching up. A component
polling the snapshot for time is doing the wrong thing and should be subscribing.

**Rate zero stops simulated time and stops nothing else.** ADR-0006. The loop below keeps
turning while the clock is pinned: no ticks are emitted, the heartbeat still goes out on
its real-time cadence, and the shell stays lit through the capture FR-53 exists to make
meaningful. Every branch that returns early when nothing is due beats first.

**A stalled lockstep clock is a visible failure, not a silent one.** When a registered
participant stops acknowledging, the clock does not advance and does not outrun it. Past
the configured deadline it says so — in the snapshot, and in a heartbeat whose status is
``stalled`` and whose detail names who is outstanding. A stalled run is visible; a
silently divergent one is not.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from harness_core.clock import (
    ClockControlError,
    ClockMode,
    ClockState,
    ParticipantRole,
    SimInstant,
    Tick,
)
from harness_core.clock_service import (
    ClockEngine,
    ClockSamplePublisher,
    ClockSettings,
    RealTimeDriver,
)
from harness_core.heartbeat import HeartbeatStatus, MessagePublisher
from harness_core.manifest import (
    ExitState,
    ManifestParticipant,
    ManifestWriter,
    RunManifest,
    read_manifest,
    write_manifest,
)
from harness_core.rng import DERIVATION_RULE, DERIVATION_VERSION

from harness_clock.heartbeat import ClockHeartbeat
from harness_clock.schemas import RUN_MANIFEST_SCHEMA, schema
from harness_clock.version import CLOCK_VERSION

__all__ = ["ClockService", "OpenedRun", "clock_settings_from", "manifest_path", "open_run"]

_SET_RATE = "set_rate"
_SET_MODE = "set_mode"
_PIN = "pin"
_RELEASE = "release"
_REGISTER = "register"
_ACKNOWLEDGE = "acknowledge"

OPERATIONS: tuple[str, ...] = (_SET_RATE, _SET_MODE, _PIN, _RELEASE, _REGISTER, _ACKNOWLEDGE)

# The commands that change what the clock is doing, as opposed to who is participating.
# After one of these the new rate and mode must reach subscribers; emission is how they
# normally do, and a command that stops emission is the one case emission cannot answer.
_STATE_CHANGING: tuple[str, ...] = (_SET_RATE, _SET_MODE, _PIN, _RELEASE)


class ClockService:
    """The engine, the transports it speaks over, and the loop that turns it."""

    def __init__(
        self,
        engine: ClockEngine,
        *,
        component: str,
        publisher: MessagePublisher | None = None,
        heartbeat_interval_seconds: float,
        liveness_window_seconds: float,
        idle_poll_seconds: float,
        config_digest: str | None = None,
        manifest: ManifestWriter | None = None,
        monotonic: Callable[[], float] | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self._engine = engine
        self._component = component
        self._idle_poll_seconds = idle_poll_seconds
        self._manifest = manifest
        self._lock = threading.Lock()
        self._sleep = sleep or time.sleep
        self._samples = None if publisher is None else ClockSamplePublisher(publisher)
        self._heartbeat = ClockHeartbeat(
            publisher,
            component=component,
            interval_seconds=heartbeat_interval_seconds,
            window_seconds=liveness_window_seconds,
            config_digest=config_digest,
            monotonic=monotonic,
        )
        self._driver = RealTimeDriver(
            engine, monotonic=monotonic, sleep=self._wait_without_the_lock
        )

    # Accessors --------------------------------------------------------------------

    @property
    def engine(self) -> ClockEngine:
        return self._engine

    @property
    def heartbeat(self) -> ClockHeartbeat:
        return self._heartbeat

    @property
    def publishing(self) -> bool:
        """Whether anything is actually being published. Nobody should have to guess."""
        return self._samples is not None

    def state(self) -> ClockState:
        with self._lock:
            return self._engine.state()

    def snapshot(self) -> Mapping[str, Any]:
        """What the time is now, for a component starting up or catching up."""
        return self.state().as_message()

    # Control ----------------------------------------------------------------------

    def command(self, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        """Apply one command and return the state it produced.

        A refusal raises :class:`ClockControlError` and changes nothing, which is what
        FR-005 requires of a rate outside the configured bounds: a readable error, and the
        current state left as it was.

        A command that leaves the clock not emitting — a rate of zero, a pause — is
        acknowledged with one sample on ``ctl/clock``: the tick in force, re-published
        carrying the new rate and mode. Every other change reaches subscribers on the next
        emission, and a pinned clock has no next emission: without this, the browser that
        asked for zero waits for a sample that can never arrive, and FR-012's rule that the
        rate in force comes only from ``ctl/clock`` would make the one rate a capture needs
        (FR-53) the one rate that can never be shown in force. Published under the lock so
        it cannot interleave out of order with a tick the loop is emitting.
        """
        operation = str(payload.get("operation", ""))
        with self._lock:
            state = self._apply(operation, payload)
            if operation in _STATE_CHANGING and self._engine.emission_interval_seconds() is None:
                self._emit(self._current_tick())
        return state.as_message()

    def _apply(self, operation: str, payload: Mapping[str, Any]) -> ClockState:
        if operation == _SET_RATE:
            return self._engine.set_rate(_number(payload, "rate", operation))
        if operation == _SET_MODE:
            return self._engine.set_mode(_mode(payload, operation))
        if operation == _PIN:
            return self._engine.pin()
        if operation == _RELEASE:
            return self._engine.release()
        if operation == _REGISTER:
            self._engine.register(
                _text(payload, "participant", operation), _role(payload, operation)
            )
            return self._engine.state()
        if operation == _ACKNOWLEDGE:
            self._engine.acknowledge(
                _text(payload, "participant", operation),
                _integer(payload, "tick", operation),
            )
            return self._engine.state()
        raise ClockControlError(
            f"{operation!r} is not a clock command; the clock answers {', '.join(OPERATIONS)}"
        )

    # The run manifest --------------------------------------------------------------

    def observe_heartbeat(self, message: Mapping[str, Any]) -> ManifestParticipant | None:
        """Record a participant's config digest, which reaches the clock only this way.

        A registration says who is participating; it does not say what configuration they
        were started from, and the clock must never ask for the configuration itself. The
        digest travels in the participant's own heartbeat, so the manifest records what a
        replay needs without a secret in a config file ever leaving the component that
        holds it (FR-021).
        """
        component = str(message.get("component", ""))
        digest = message.get("config_digest")
        if self._manifest is None or not component or not digest:
            return None
        with self._lock:
            known = {participant.id: participant for participant in self._engine.participants()}
            participant = known.get(component)
            if participant is None:
                return None
            index = self._engine.index
            record = ManifestParticipant(
                id=participant.id,
                role=participant.role,
                config_digest=str(digest),
                registered_tick=None if index < 0 else index,
            )
            self._manifest.add_participant(record)
        return record

    def checkpoint(self) -> None:
        """Record where the run has reached, so a restart does not rewind time.

        Written on the heartbeat's cadence rather than every tick: a manifest rewritten a
        thousand times a second would be an I/O cost paid for a resolution nothing needs.
        A restart therefore resumes from the last checkpoint, which may repeat a heartbeat
        interval's worth of ticks — that is the honest cost, and it is bounded and stated
        rather than papered over.
        """
        if self._manifest is None:
            return
        index = self._engine.index
        # RUNNING here is not a contradiction: `finalise` writes the exit state and the
        # final tick atomically, and "running, reached tick n" is exactly what a
        # checkpoint says.
        self._manifest.finalise(ExitState.RUNNING, final_tick=None if index < 0 else index)

    def close(self, state: ExitState, *, detail: str = "") -> None:
        """Finalise the manifest and say goodbye, so nothing reads the clock as alive."""
        tick = self._current_tick()
        self._heartbeat.beat(tick, status=HeartbeatStatus.STOPPING, detail=detail)
        if self._manifest is not None:
            index = self._engine.index
            self._manifest.finalise(state, final_tick=None if index < 0 else index, detail=detail)

    # The loop -----------------------------------------------------------------------

    def _current_tick(self) -> Tick:
        """The last emitted tick, or tick zero before there is one.

        Before the first tick the clock is at its epoch, which is tick zero's instant, so
        that is what a starting heartbeat carries. The status says ``starting``, so nothing
        reads it as a tick that was emitted.
        """
        return self._engine.current() or self._engine.tick_for(0)

    def _emit(self, tick: Tick) -> None:
        if self._samples is not None:
            self._samples.publish(tick)

    def _wait_without_the_lock(self, seconds: float) -> None:
        """Wait for the next tick to fall due without holding the clock still.

        The driver waits inside ``step``, which this service calls with the lock held so
        that no command lands between deciding a tick is due and emitting it. Holding the
        lock through the wait as well would make a rate change from the browser queue
        behind the very tick it was meant to change, so the lock is dropped for the wait
        and taken again after. Called only from the loop thread, and only with the lock
        held.
        """
        self._lock.release()
        try:
            self._sleep(seconds)
        finally:
            self._lock.acquire()

    def step(self) -> Tick | None:
        """Emit the next tick if one is due; return ``None`` if the clock is held."""
        with self._lock:
            return self._driver.step(self._emit)

    def beat(self, *, force: bool = False) -> Mapping[str, Any] | None:
        """Publish a heartbeat if the real-time interval has elapsed (ADR-0006)."""
        with self._lock:
            tick = self._current_tick()
            status, detail = self._condition()
        if force:
            message = self._heartbeat.beat(tick, status=status, detail=detail)
        else:
            message = self._heartbeat.maybe_beat(tick, status=status, detail=detail)
        if message is not None:
            self.checkpoint()
        return message

    def _condition(self) -> tuple[HeartbeatStatus, str]:
        if self._engine.current() is None:
            return HeartbeatStatus.STARTING, "no tick emitted yet"
        stall = self._engine.stall()
        if stall is not None and self._driver.deadline_passed():
            return HeartbeatStatus.STALLED, stall.message()
        if stall is not None:
            return HeartbeatStatus.OK, "waiting at the lockstep barrier"
        if self._engine.mode is ClockMode.PAUSED:
            return HeartbeatStatus.OK, "pinned; simulated time is stopped and nothing else is"
        return HeartbeatStatus.OK, ""

    def run(self, *, ticks: int | None = None, until: Callable[[], bool] | None = None) -> int:
        """Turn the clock until ``ticks`` have been emitted or ``until`` says stop.

        Returns the number of ticks emitted. ``ticks`` bounds a test or a scripted
        scenario; a deployed clock passes neither and runs until it is stopped.
        """
        self.beat(force=True)
        emitted = 0
        while ticks is None or emitted < ticks:
            if until is not None and until():
                break
            tick = self.step()
            if tick is None:
                # Pinned, paused, or held at the lockstep barrier. The heartbeat still
                # goes out, which is the whole of ADR-0006.
                self.beat()
                self._sleep(self._idle_poll_seconds)
                continue
            emitted += 1
            self.beat()
        return emitted


def _number(payload: Mapping[str, Any], key: str, operation: str) -> float:
    value = payload.get(key)
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise ClockControlError(f"{operation} needs a numeric {key!r}")
    return float(value)


def _integer(payload: Mapping[str, Any], key: str, operation: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        raise ClockControlError(f"{operation} needs a whole-number {key!r}")
    return value


def _text(payload: Mapping[str, Any], key: str, operation: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ClockControlError(f"{operation} needs a {key!r}")
    return value


def _mode(payload: Mapping[str, Any], operation: str) -> ClockMode:
    name = _text(payload, "mode", operation)
    try:
        return ClockMode(name)
    except ValueError as exc:
        modes = ", ".join(mode.value for mode in ClockMode)
        raise ClockControlError(f"{name!r} is not a clock mode; the modes are {modes}") from exc


def _role(payload: Mapping[str, Any], operation: str) -> ParticipantRole:
    name = _text(payload, "role", operation)
    try:
        return ParticipantRole(name)
    except ValueError as exc:
        roles = ", ".join(role.value for role in ParticipantRole)
        raise ClockControlError(
            f"{name!r} is not a participant role; the roles are {roles}"
        ) from exc


def clock_settings_from(section: Any, *, run_id: str) -> ClockSettings:
    """The run's clock, as configuration describes it."""
    return ClockSettings(
        run_id=run_id,
        epoch=SimInstant.from_iso(section.epoch),
        tick_interval_us=section.tick_interval_us,
        mode=ClockMode(section.default_mode.value),
        rate=section.default_rate,
        min_rate=section.rate_bounds.minimum,
        max_rate=section.rate_bounds.maximum,
        lockstep_deadline_seconds=section.lockstep_deadline_seconds,
    )


def manifest_path(section: Any) -> Path:
    """Where the run manifest lives, from configuration and from nowhere else."""
    return Path(section.manifest.directory) / section.manifest.file


class OpenedRun:
    """A run that is ready to turn: its manifest, its clock, and where it left off."""

    def __init__(
        self,
        writer: ManifestWriter,
        settings: ClockSettings,
        *,
        root_seed: int,
        index: int,
        resumed: bool,
    ) -> None:
        self.writer = writer
        self.settings = settings
        self.root_seed = root_seed
        self.index = index
        self.resumed = resumed


def open_run(section: Any, *, root_seed: int, streams: Sequence[str] = ()) -> OpenedRun:
    """Start a run, or resume the one whose manifest is already there.

    The edge case this exists for: the clock service restarts mid-run. It must not resume
    at tick zero. Run identity, the root seed, the clock configuration and the last
    recorded tick all come from the manifest, and if the manifest is present but cannot be
    read or does not validate, the failure propagates and the service refuses to start.
    Refusing is the correct behaviour: a clock that silently rewound time would corrupt
    every consumer that had already keyed work to a tick value.
    """
    document = schema(RUN_MANIFEST_SCHEMA)
    path = manifest_path(section)
    if path.exists():
        manifest = read_manifest(str(path), schema=document)
        settings = ClockSettings(**manifest.clock_settings())
        writer = ManifestWriter(str(path), manifest, schema=document)
        writer.start()
        return OpenedRun(
            writer,
            settings,
            root_seed=manifest.root_seed,
            index=-1 if manifest.final_tick is None else manifest.final_tick,
            resumed=True,
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    settings = clock_settings_from(section, run_id=section.run.id)
    manifest = RunManifest(
        run_id=settings.run_id,
        root_seed=root_seed,
        seed_rule=DERIVATION_RULE,
        seed_rule_version=DERIVATION_VERSION,
        clock=settings.as_manifest_section(),
        code_revision=section.run.code_revision or CLOCK_VERSION,
        code_dirty=bool(section.run.code_dirty),
        streams=tuple(sorted(set(streams))),
    )
    write_manifest(str(path), manifest, schema=document)
    writer = ManifestWriter(str(path), manifest, schema=document)
    return OpenedRun(writer, settings, root_seed=root_seed, index=-1, resumed=False)
