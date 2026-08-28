"""Simulation time: the value types, the port implementations, and the tick transport.

Simulation time is quantised. The instant of tick ``n`` is ``epoch + n * tick_interval``
computed in exact integer microseconds, so a tick value is fixed by the run's clock
configuration and is unaffected by the rate at which ticks are emitted. Changing the
rate changes pace, never values; that is what makes a replay comparable.

Three implementations of the clock port exist in drogna, and a fourth needs an ADR
(Constitution VI):

- :class:`RemoteClock` — the network client of the clock service (C-01), used by every
  component.
- :class:`ManualClock` — the deterministic fake, advanced only by explicit calls, used
  by tests and by in-process replay.
- the clock service's own engine, :class:`harness_core.clock_service.ClockEngine`.

None of them reads a host clock, and none of them interpolates between ticks.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from queue import Queue
from typing import IO, Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from harness_core.ports import Clock  # re-exported: components name harness_core.clock.Clock

CLOCK_TOPIC = "ctl/clock"
"""Simulation time is published here, on the control namespace of the broker (ADR-0009)."""

__all__ = [
    "CLOCK_TOPIC",
    "BrokerTickSource",
    "Clock",
    "ClockControl",
    "ClockControlError",
    "ClockEndpoint",
    "ClockError",
    "ClockMode",
    "ClockStaleError",
    "ClockState",
    "ClockStatus",
    "FollowedClock",
    "HttpClockControl",
    "ManualClock",
    "Participant",
    "ParticipantRole",
    "RemoteClock",
    "SimInstant",
    "Tick",
    "TickNotReachedError",
    "TickSource",
    "resolve_clock",
    "tick_at",
]

_UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_MICROS_PER_SECOND = 1_000_000
_MICROS_PER_DAY = 86_400 * _MICROS_PER_SECOND


class ClockError(Exception):
    """Base class for every failure the clock port reports."""


class ClockStaleError(ClockError):
    """The clock has not been heard from, so no operational work may proceed.

    Carries the last tick observed and the size of the gap, because a component that
    stops has to be able to say where it stopped.
    """

    def __init__(self, message: str, *, last_tick: Tick | None, gap: int) -> None:
        super().__init__(message)
        self.last_tick = last_tick
        self.gap = gap


class TickNotReachedError(ClockError):
    """A tick was awaited that the clock has not reached and cannot reach unaided."""


class ClockControlError(ClockError):
    """A control request was refused: out of bounds, unknown mode, or unregistered."""


class ClockMode(StrEnum):
    """The four modes of the simulation clock.

    ``realtime`` and ``accelerated`` are free-running and differ only in rate.
    ``paused`` emits nothing. ``lockstep`` advances only when every registered
    participant has acknowledged the current tick, and is the mode in which drogna
    claims byte-identical replay.
    """

    REALTIME = "realtime"
    ACCELERATED = "accelerated"
    PAUSED = "paused"
    LOCKSTEP = "lockstep"


class ParticipantRole(StrEnum):
    """What the clock service expects of a participant."""

    OBSERVER = "observer"
    LOCKSTEP = "lockstep"


@dataclass(frozen=True, order=True)
class SimInstant:
    """A point in simulation time: exact integer microseconds, UTC.

    Microseconds are counted from the Unix epoch so that rendering to ISO-8601 is
    unambiguous. The run's simulation epoch is itself a :class:`SimInstant`, given by
    configuration; nothing here reads a host clock.
    """

    micros: int

    def __post_init__(self) -> None:
        if isinstance(self.micros, bool) or not isinstance(self.micros, int):
            raise TypeError(
                "SimInstant takes integer microseconds; "
                f"{type(self.micros).__name__} would lose exactness"
            )

    @classmethod
    def from_iso(cls, text: str) -> SimInstant:
        """Parse an ISO-8601 UTC timestamp. A missing or non-UTC offset is refused."""
        candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError as exc:
            raise ValueError(f"not an ISO-8601 timestamp: {text!r}") from exc
        if parsed.tzinfo is None:
            raise ValueError(f"timestamp carries no offset, so its instant is unknown: {text!r}")
        if parsed.utcoffset() != timedelta(0):
            raise ValueError(f"simulation time crosses boundaries in UTC only: {text!r}")
        delta = parsed - _UNIX_EPOCH
        return cls(
            delta.days * _MICROS_PER_DAY + delta.seconds * _MICROS_PER_SECOND + delta.microseconds
        )

    def iso(self) -> str:
        """Render as ISO-8601 UTC with microsecond precision, always six digits."""
        rendered = _UNIX_EPOCH + timedelta(microseconds=self.micros)
        return rendered.strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"

    def plus_micros(self, micros: int) -> SimInstant:
        """Return the instant ``micros`` microseconds later."""
        if isinstance(micros, bool) or not isinstance(micros, int):
            raise TypeError("simulation time advances in whole microseconds")
        return SimInstant(self.micros + micros)

    def __sub__(self, other: SimInstant) -> int:
        """Return the interval to ``other`` in microseconds."""
        return self.micros - other.micros

    def __str__(self) -> str:
        return self.iso()


@dataclass(frozen=True)
class Tick:
    """An indexed advance of the simulation clock: the unit of causality in drogna."""

    index: int
    instant: SimInstant
    mode: ClockMode
    rate: float
    run_id: str

    def __post_init__(self) -> None:
        if isinstance(self.index, bool) or not isinstance(self.index, int):
            raise TypeError("tick index is an integer")
        if self.index < 0:
            raise ValueError("tick indices start at zero and increase")

    def as_message(self) -> dict[str, Any]:
        """Render for a boundary crossing: ISO-8601 UTC alongside the tick index."""
        return {
            "run_id": self.run_id,
            "tick": self.index,
            "sim_time": self.instant.iso(),
            "mode": self.mode.value,
            "rate": self.rate,
        }

    @classmethod
    def from_message(cls, payload: Mapping[str, Any]) -> Tick:
        """Rebuild a tick from its wire form."""
        try:
            return cls(
                index=int(payload["tick"]),
                instant=SimInstant.from_iso(str(payload["sim_time"])),
                mode=ClockMode(str(payload["mode"])),
                rate=float(payload["rate"]),
                run_id=str(payload["run_id"]),
            )
        except KeyError as exc:
            raise ValueError(f"tick message is missing {exc.args[0]!r}") from exc


@dataclass(frozen=True)
class Participant:
    """A component the clock service knows by a deterministic id."""

    id: str
    role: ParticipantRole
    acknowledged_tick: int | None = None

    def as_message(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role.value,
            "acknowledged_tick": self.acknowledged_tick,
        }

    @classmethod
    def from_message(cls, payload: Mapping[str, Any]) -> Participant:
        acknowledged = payload.get("acknowledged_tick")
        return cls(
            id=str(payload["id"]),
            role=ParticipantRole(str(payload["role"])),
            acknowledged_tick=None if acknowledged is None else int(acknowledged),
        )


@dataclass(frozen=True)
class ClockState:
    """What the snapshot endpoint publishes: everything a joiner needs to catch up."""

    run_id: str
    mode: ClockMode
    rate: float
    epoch: SimInstant
    tick_interval_us: int
    tick: Tick | None = None
    participants: tuple[Participant, ...] = ()
    outstanding: tuple[str, ...] = ()

    def as_message(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "mode": self.mode.value,
            "rate": self.rate,
            "epoch": self.epoch.iso(),
            "tick_interval_us": self.tick_interval_us,
            "tick": None if self.tick is None else self.tick.index,
            "sim_time": None if self.tick is None else self.tick.instant.iso(),
            "participants": [participant.as_message() for participant in self.participants],
            "outstanding": list(self.outstanding),
        }

    @classmethod
    def from_message(cls, payload: Mapping[str, Any]) -> ClockState:
        run_id = str(payload["run_id"])
        mode = ClockMode(str(payload["mode"]))
        rate = float(payload["rate"])
        tick_index = payload.get("tick")
        tick = None
        if tick_index is not None:
            tick = Tick(
                index=int(tick_index),
                instant=SimInstant.from_iso(str(payload["sim_time"])),
                mode=mode,
                rate=rate,
                run_id=run_id,
            )
        return cls(
            run_id=run_id,
            mode=mode,
            rate=rate,
            epoch=SimInstant.from_iso(str(payload["epoch"])),
            tick_interval_us=int(payload["tick_interval_us"]),
            tick=tick,
            participants=tuple(
                Participant.from_message(item) for item in payload.get("participants", ())
            ),
            outstanding=tuple(str(item) for item in payload.get("outstanding", ())),
        )


@dataclass(frozen=True)
class ClockStatus:
    """What a component asks before doing operational work."""

    last_tick: Tick | None
    stale: bool
    gap: int = 0
    reason: str = ""


def tick_at(
    index: int,
    *,
    epoch: SimInstant,
    tick_interval_us: int,
    mode: ClockMode,
    rate: float,
    run_id: str,
) -> Tick:
    """Return tick ``index`` by exact integer arithmetic.

    The one place tick values are computed. Rate and mode are carried on the tick but
    take no part in the arithmetic, which is what FR-006 requires.
    """
    if tick_interval_us <= 0:
        raise ValueError("tick interval must be a positive whole number of microseconds")
    return Tick(
        index=index,
        instant=epoch.plus_micros(index * tick_interval_us),
        mode=mode,
        rate=rate,
        run_id=run_id,
    )


class FollowedClock:
    """A remote clock, and the ``ctl/clock`` messages a component's own loop hands it.

    ADR-0009 makes simulation time a subscription for every component, and this is how a
    component whose loop already reads one subscription gets it: the loop recognises a clock
    sample, hands it here, and the clock takes it. No second connection, no second thread,
    and the tick a component reports is the tick it has actually been told about.

    **What its absence cost, which is why this class exists rather than a comment.** Seven
    components were built with a tick source that yields nothing — a placeholder that was
    harmless while each of them ran for one second and exited, and became load-bearing the
    moment they were wired to stay up. Each took one HTTP snapshot at start-up and then held
    that instant for the life of the process. The visible half was a heartbeat carrying a
    simulation time an hour stale. The half that mattered was the scheduler's, whose whole
    policy is stated in simulation time: with a frozen ``now``, an outstanding run request
    can never time out and the minimum interval between runs can never elapse, so the
    control loop turned exactly once and then declined every divergence for ever.

    A stale clock becomes reportable here for the first time in these components: a gap wider
    than the endpoint's ``stale_after_gap`` marks the clock stale, which is a fact about the
    subscription rather than a comparison against a host clock (Constitution I). Until now
    there was no subscription for a gap to appear in.
    """

    def __init__(self, endpoint: ClockEndpoint, control: ClockControl | None = None) -> None:
        self._payloads: Queue[bytes | str | Mapping[str, Any]] = Queue()
        self.clock = RemoteClock(
            BrokerTickSource(self._handed_in()),
            HttpClockControl(endpoint) if control is None else control,
            endpoint,
        )

    def _handed_in(self) -> Iterator[bytes | str | Mapping[str, Any]]:
        """The payloads the loop has handed over, in the order it handed them over.

        A queue rather than a direct call because ``BrokerTickSource`` reads an iterable and
        ``RemoteClock`` pulls from it: the loop pushes, the clock pulls, and the queue is the
        one-element seam between the two. It is never read except by ``take`` below, which
        has just put something in it, so it never blocks in practice.
        """
        while True:
            yield self._payloads.get()

    def start(self) -> ClockState | None:
        """Catch up from the HTTP snapshot, then follow. The snapshot is the startup path."""
        return self.clock.start()

    def take(self, payload: bytes | str | Mapping[str, Any]) -> Tick:
        """Take one ``ctl/clock`` message. The clock is current from here until the next."""
        self._payloads.put(payload)
        return self.clock.receive()


def resolve_clock(
    supplied: Clock | FollowedClock | None,
    document: Mapping[str, Any],
) -> tuple[Clock, FollowedClock | None]:
    """Settle which clock a component runs on, and whether its own loop keeps it current.

    The mirror of ``resolve_publisher`` and ``resolve_subscriber`` in
    :mod:`harness_core.broker`, and it has the same three states:

    1. *A caller supplied a plain clock.* Taken as given — a ``ManualClock`` in every test
       here. It decides its own time, so a clock sample reaching the loop is ignored rather
       than routed into a port that was not built to be pumped.
    2. *A caller supplied a followed clock.* Taken as given, and the loop hands it every
       ``ctl/clock`` sample it receives. This state exists so that the wiring can be asserted
       without a broker and without an HTTP server, which is the whole reason its absence
       went unnoticed: the only thing that ever exercised it was a running container.
    3. *Nobody supplied one.* One is built from this component's own configuration, catches
       up from the HTTP snapshot, and follows ``ctl/clock`` from there (ADR-0009).

    Raises whatever the snapshot raises. Every caller already treats a clock it cannot reach
    as a startup failure with its own exit code, because a component with no simulation time
    has nothing it may honestly do.
    """
    if isinstance(supplied, FollowedClock):
        return supplied.clock, supplied
    if supplied is not None:
        return supplied, None
    followed = FollowedClock(ClockEndpoint.from_config(document["clock"]))
    followed.start()
    return followed.clock, followed


class ManualClock:
    """The deterministic fake: simulation time moves when, and only when, told to.

    Used by unit tests and by in-process replay. It computes tick values with the same
    arithmetic as the service, so a test that passes against it is testing the same
    quantisation the network path delivers.
    """

    def __init__(
        self,
        *,
        run_id: str,
        epoch: SimInstant,
        tick_interval_us: int,
        mode: ClockMode = ClockMode.LOCKSTEP,
        rate: float = 1.0,
        index: int = 0,
    ) -> None:
        self._run_id = run_id
        self._epoch = epoch
        self._tick_interval_us = tick_interval_us
        self._mode = mode
        self._rate = rate
        self._index = index

    def _tick_at(self, index: int) -> Tick:
        return tick_at(
            index,
            epoch=self._epoch,
            tick_interval_us=self._tick_interval_us,
            mode=self._mode,
            rate=self._rate,
            run_id=self._run_id,
        )

    def advance(self, ticks: int = 1) -> Tick:
        """Advance by ``ticks`` and return the new current tick."""
        if ticks < 1:
            raise ValueError("a manual clock advances forwards, by at least one tick")
        self._index += ticks
        return self.tick()

    def set_mode(self, mode: ClockMode) -> None:
        self._mode = mode

    def set_rate(self, rate: float) -> None:
        self._rate = rate

    def now(self) -> SimInstant:
        return self._tick_at(self._index).instant

    def tick(self) -> Tick:
        return self._tick_at(self._index)

    def status(self) -> ClockStatus:
        return ClockStatus(last_tick=self.tick(), stale=False)

    def await_tick(self, index: int) -> Tick:
        if index > self._index:
            raise TickNotReachedError(
                f"manual clock is at tick {self._index}; tick {index} needs an explicit advance"
            )
        return self._tick_at(index)

    def await_sim_time(self, instant: SimInstant) -> Tick:
        if instant > self.now():
            raise TickNotReachedError(
                f"manual clock is at {self.now().iso()}; {instant.iso()} needs an explicit advance"
            )
        return self.tick()


class TickSource:
    """Where ticks come from: a subscription to ``ctl/clock`` on the broker.

    ADR-0009: the clock publishes simulation time on the control namespace, and
    consumers — the browser included — receive time by subscribing. There is one
    transport for control traffic. Declared as a class rather than a Protocol so that a
    test can subclass it and so the rules that bind an implementation sit in one place.
    """

    def ticks(self) -> Iterator[Tick]:
        """Yield ticks as the clock publishes them. Ends when the subscription drops."""
        raise NotImplementedError


class ClockControl:
    """The clock's small HTTP interface: the two things a subscription cannot do.

    Setting the rate is a command from the browser (FR-10). Asking what the time is now
    is for a component starting up or catching up after a restart. It is not a way to
    read time in a loop: a component polling this is doing the wrong thing and should be
    subscribing (ADR-0009).
    """

    def snapshot(self) -> ClockState:
        """What the time is now, for a component that has just started or restarted."""
        raise NotImplementedError

    def command(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        """Send a command. Refusals are raised as :class:`ClockControlError`."""
        raise NotImplementedError


class BrokerTickSource(TickSource):
    """Ticks from ``ctl/clock`` messages, decoded and checked for order.

    Takes an iterable of raw payloads rather than a broker client, so the component owns
    its own subscription and this class stays testable without a broker. A payload that
    is not a clock sample is a fault in the sender, and is raised rather than skipped.
    """

    def __init__(self, messages: Iterable[bytes | str | Mapping[str, Any]]) -> None:
        self._messages = messages

    def ticks(self) -> Iterator[Tick]:
        for message in self._messages:
            if isinstance(message, Mapping):
                payload: Mapping[str, Any] = message
            else:
                raw = message.decode("utf-8") if isinstance(message, bytes) else message
                payload = json.loads(raw)
            yield Tick.from_message(payload)


@dataclass(frozen=True)
class ClockEndpoint:
    """Where the clock's HTTP interface is, and how it is addressed.

    Every field arrives from the ``clock`` section of the component's config file. No
    URL, host, port or route appears in this module's source: the routes are part of the
    clock's published interface, so they are configuration, not code (Constitution IV).
    """

    endpoint: str
    snapshot_route: str
    control_route: str
    stale_after_gap: int = 0
    timeout_seconds: float | None = None

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> ClockEndpoint:
        routes = section["routes"]
        timeout = section.get("timeout_seconds")
        return cls(
            endpoint=str(section["endpoint"]),
            snapshot_route=str(routes["snapshot"]),
            control_route=str(routes["control"]),
            stale_after_gap=int(section.get("stale_after_gap", 0)),
            timeout_seconds=None if timeout is None else float(timeout),
        )

    def url_for(self, route: str) -> str:
        return urljoin(self.endpoint, route)


Opener = Callable[[Request], IO[bytes]]


class HttpClockControl(ClockControl):
    """The clock's HTTP interface over urllib. The opener is injectable for tests."""

    def __init__(self, endpoint: ClockEndpoint, *, opener: Opener | None = None) -> None:
        self._endpoint = endpoint
        self._opener = opener or self._default_opener

    def _default_opener(self, request: Request) -> IO[bytes]:
        if self._endpoint.timeout_seconds is None:
            return urlopen(request)
        return urlopen(request, timeout=self._endpoint.timeout_seconds)

    def snapshot(self) -> ClockState:
        request = Request(self._endpoint.url_for(self._endpoint.snapshot_route))
        with self._opener(request) as response:
            return ClockState.from_message(json.loads(response.read().decode("utf-8")))

    def command(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        body = json.dumps({"operation": operation, **payload}).encode("utf-8")
        request = Request(
            self._endpoint.url_for(self._endpoint.control_route),
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self._opener(request) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


class RemoteClock:
    """The clock port as a subscriber to ``ctl/clock``, with commands over HTTP.

    It holds the last tick it was given and nothing else. Between ticks ``now()`` returns
    the same instant, because interpolating would be computing simulation time locally,
    which ADR-0009 forbids in the port and which would reintroduce host time by the back
    door. The one exemption in drogna is the client's render path (ADR-0007), which never
    produces an operational value.

    Staleness is detected structurally — the subscription ended, or a tick index arrived
    with a gap larger than the configured tolerance — never by comparing against a host
    clock, which the port has no access to.
    """

    def __init__(
        self,
        source: TickSource,
        control: ClockControl | None = None,
        endpoint: ClockEndpoint | None = None,
        *,
        participant_id: str | None = None,
        role: ParticipantRole = ParticipantRole.OBSERVER,
    ) -> None:
        self._source = source
        self._control = control
        self._stale_after_gap = 0 if endpoint is None else endpoint.stale_after_gap
        self._participant_id = participant_id
        self._role = role
        self._last: Tick | None = None
        self._state: ClockState | None = None
        self._stale = False
        self._gap = 0
        self._reason = ""
        self._stream: Iterator[Tick] | None = None

    @property
    def participant_id(self) -> str | None:
        return self._participant_id

    def _require_control(self) -> ClockControl:
        if self._control is None:
            raise ClockControlError(
                "this clock port has no command interface configured; "
                "it can subscribe to time but not command the clock"
            )
        return self._control

    def start(self) -> ClockState | None:
        """Catch up from the snapshot if there is one, register, and open the subscription.

        The snapshot is the startup and restart path only. Time after that arrives by
        subscription.
        """
        state = None
        if self._control is not None:
            state = self._control.snapshot()
            self._state = state
            if state.tick is not None:
                self._last = state.tick
            if self._participant_id is not None:
                self._control.command(
                    "register", {"participant": self._participant_id, "role": self._role.value}
                )
        self._stream = self._source.ticks()
        return state

    def _require_stream(self) -> Iterator[Tick]:
        if self._stream is None:
            self._stream = self._source.ticks()
        return self._stream

    def _mark_stale(self, reason: str, gap: int = 0) -> None:
        self._stale = True
        self._reason = reason
        self._gap = gap

    def receive(self) -> Tick:
        """Take the next tick from the subscription, or report the clock stale."""
        stream = self._require_stream()
        try:
            tick = next(stream)
        except StopIteration:
            self._mark_stale("clock subscription ended")
            raise ClockStaleError(
                "clock subscription ended; no operational work may proceed",
                last_tick=self._last,
                gap=0,
            ) from None
        except OSError as exc:
            self._mark_stale(f"clock subscription failed: {exc}")
            raise ClockStaleError(
                f"clock subscription failed: {exc}; no operational work may proceed",
                last_tick=self._last,
                gap=0,
            ) from exc

        gap = 0 if self._last is None else tick.index - self._last.index - 1
        self._last = tick
        self._gap = max(gap, 0)
        if gap > self._stale_after_gap:
            self._mark_stale(f"missed {gap} tick(s)", gap)
        else:
            self._stale = False
            self._reason = ""
        return tick

    def follow(self, *, acknowledge: bool = False) -> Iterator[Tick]:
        """Yield ticks as they arrive, optionally acknowledging each once processed."""
        while True:
            try:
                tick = self.receive()
            except ClockStaleError:
                return
            yield tick
            if acknowledge:
                self.acknowledge(tick.index)

    def now(self) -> SimInstant:
        return self.tick().instant

    def tick(self) -> Tick:
        if self._last is None:
            raise ClockStaleError(
                "no tick has been observed; the clock has not been started",
                last_tick=None,
                gap=0,
            )
        return self._last

    def status(self) -> ClockStatus:
        return ClockStatus(
            last_tick=self._last, stale=self._stale, gap=self._gap, reason=self._reason
        )

    def require_fresh(self) -> Tick:
        """Return the current tick, or refuse to let operational work proceed."""
        tick = self.tick()
        if self._stale:
            raise ClockStaleError(
                f"clock is stale ({self._reason}); last tick {tick.index}",
                last_tick=tick,
                gap=self._gap,
            )
        return tick

    def await_tick(self, index: int) -> Tick:
        while self._last is None or self._last.index < index:
            self.receive()
        return self._last

    def await_sim_time(self, instant: SimInstant) -> Tick:
        while self._last is None or self._last.instant < instant:
            self.receive()
        return self._last

    def acknowledge(self, index: int | None = None) -> None:
        """Acknowledge a tick. Only a registered lockstep participant may do this."""
        if self._participant_id is None or self._role is not ParticipantRole.LOCKSTEP:
            raise ClockControlError(
                "only a registered lockstep participant acknowledges ticks; "
                f"this clock is registered as {self._role.value}"
            )
        tick_index = self.tick().index if index is None else index
        self._require_control().command(
            "acknowledge", {"participant": self._participant_id, "tick": tick_index}
        )

    def set_rate(self, rate: float) -> Mapping[str, Any]:
        """Ask the clock to change rate. A rate of zero pins it (FR-53)."""
        return self._require_control().command("set_rate", {"rate": rate})

    def set_mode(self, mode: ClockMode) -> Mapping[str, Any]:
        return self._require_control().command("set_mode", {"mode": mode.value})
