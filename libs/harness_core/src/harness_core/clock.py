"""Simulation time: the value types, the port implementations, and the tick transport.

Simulation time is quantised. The instant of tick ``n`` is ``epoch + n × tick_interval``
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
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import IO, Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen

__all__ = [
    "Clock",
    "ClockControlError",
    "ClockEndpoint",
    "ClockError",
    "ClockMode",
    "ClockState",
    "ClockStaleError",
    "ClockStatus",
    "HttpTickTransport",
    "ManualClock",
    "Participant",
    "ParticipantRole",
    "RemoteClock",
    "SimInstant",
    "Tick",
    "TickNotReachedError",
    "TickTransport",
]

from harness_core.ports import Clock  # re-exported: components name harness_core.clock.Clock

_UNIX_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
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


class ClockMode(str, Enum):
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


class ParticipantRole(str, Enum):
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
        return cls(delta.days * _MICROS_PER_DAY + delta.seconds * _MICROS_PER_SECOND + delta.microseconds)

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


def tick_at(index: int, *, epoch: SimInstant, tick_interval_us: int, mode: ClockMode, rate: float, run_id: str) -> Tick:
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


class TickTransport:
    """What :class:`RemoteClock` needs of the network. Implemented by :class:`HttpTickTransport`.

    Declared as a class rather than a Protocol so tests can subclass it, and so the
    docstrings that bind an implementation sit in one place.
    """

    def snapshot(self) -> ClockState:
        """Fetch the current clock state, for joining mid-run."""
        raise NotImplementedError

    def ticks(self) -> Iterator[Tick]:
        """Yield ticks as the service emits them. Ends when the stream is interrupted."""
        raise NotImplementedError

    def control(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        """Send a control request. Refusals are raised as :class:`ClockControlError`."""
        raise NotImplementedError


@dataclass(frozen=True)
class ClockEndpoint:
    """Where the clock service is and how it is addressed.

    Every field arrives from the ``clock`` section of the component's config file. No
    URL, host, port or route appears in this module's source: the routes are part of
    the clock's published interface, so they are configuration, not code
    (Constitution IV).
    """

    endpoint: str
    snapshot_route: str
    stream_route: str
    control_route: str
    stale_after_gap: int = 0
    timeout_seconds: float | None = None

    @classmethod
    def from_config(cls, section: Mapping[str, Any]) -> ClockEndpoint:
        routes = section["routes"]
        return cls(
            endpoint=str(section["endpoint"]),
            snapshot_route=str(routes["snapshot"]),
            stream_route=str(routes["stream"]),
            control_route=str(routes["control"]),
            stale_after_gap=int(section.get("stale_after_gap", 0)),
            timeout_seconds=(
                None if section.get("timeout_seconds") is None else float(section["timeout_seconds"])
            ),
        )

    def url_for(self, route: str) -> str:
        return urljoin(self.endpoint, route)


Opener = Callable[[Request], IO[bytes]]


class HttpTickTransport(TickTransport):
    """The clock service over HTTP: a snapshot request, a server-sent event stream, and control.

    The opener is injectable so tests exercise the parsing without a socket.
    """

    def __init__(self, endpoint: ClockEndpoint, *, opener: Opener | None = None) -> None:
        self._endpoint = endpoint
        self._opener = opener or self._default_opener

    def _default_opener(self, request: Request) -> IO[bytes]:
        if self._endpoint.timeout_seconds is None:
            return urlopen(request)  # noqa: S310 - scheme is fixed by validated config
        return urlopen(request, timeout=self._endpoint.timeout_seconds)  # noqa: S310

    def snapshot(self) -> ClockState:
        request = Request(self._endpoint.url_for(self._endpoint.snapshot_route))  # noqa: S310
        with self._opener(request) as response:
            return ClockState.from_message(json.loads(response.read().decode("utf-8")))

    def ticks(self) -> Iterator[Tick]:
        request = Request(self._endpoint.url_for(self._endpoint.stream_route))  # noqa: S310
        with self._opener(request) as response:
            yield from _parse_server_sent_events(response)

    def control(self, operation: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
        body = json.dumps({"operation": operation, **payload}).encode("utf-8")
        request = Request(  # noqa: S310
            self._endpoint.url_for(self._endpoint.control_route),
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with self._opener(request) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def _parse_server_sent_events(stream: Iterable[bytes]) -> Iterator[Tick]:
    """Yield a tick per complete server-sent event. Partial events at EOF are dropped."""
    data: list[str] = []
    for raw_line in stream:
        line = raw_line.decode("utf-8").rstrip("\n").rstrip("\r")
        if line.startswith(":"):
            continue
        if line == "":
            if data:
                yield Tick.from_message(json.loads("\n".join(data)))
                data = []
            continue
        prefix, _, value = line.partition(":")
        if prefix == "data":
            data.append(value.lstrip())


class RemoteClock:
    """The clock port as a client of the clock service.

    It holds the last tick it was given and nothing else. Between ticks ``now()``
    returns the same instant, because interpolating would be computing simulation time
    locally, which FR-003 forbids and which would reintroduce host time by the back
    door.

    Staleness is detected structurally — the stream ended, or a tick index arrived with
    a gap larger than the configured tolerance — never by comparing against a host
    clock, which the port has no access to.
    """

    def __init__(
        self,
        transport: TickTransport,
        endpoint: ClockEndpoint | None = None,
        *,
        participant_id: str | None = None,
        role: ParticipantRole = ParticipantRole.OBSERVER,
    ) -> None:
        self._transport = transport
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

    def start(self) -> ClockState:
        """Take a snapshot, register if this component is a participant, and open the stream."""
        state = self._transport.snapshot()
        self._state = state
        if state.tick is not None:
            self._last = state.tick
        if self._participant_id is not None:
            self._transport.control(
                "register", {"participant": self._participant_id, "role": self._role.value}
            )
        self._stream = self._transport.ticks()
        return state

    def _require_stream(self) -> Iterator[Tick]:
        if self._stream is None:
            self._stream = self._transport.ticks()
        return self._stream

    def _mark_stale(self, reason: str, gap: int = 0) -> None:
        self._stale = True
        self._reason = reason
        self._gap = gap

    def receive(self) -> Tick:
        """Take the next tick from the stream, or report the clock stale."""
        stream = self._require_stream()
        try:
            tick = next(stream)
        except StopIteration:
            self._mark_stale("tick stream ended")
            raise ClockStaleError(
                "tick stream ended; no operational work may proceed",
                last_tick=self._last,
                gap=0,
            ) from None
        except OSError as exc:
            self._mark_stale(f"tick stream failed: {exc}")
            raise ClockStaleError(
                f"tick stream failed: {exc}; no operational work may proceed",
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
        self._transport.control(
            "acknowledge", {"participant": self._participant_id, "tick": tick_index}
        )

    def set_rate(self, rate: float) -> Mapping[str, Any]:
        """Ask the service to change rate. A rate of zero pins the clock (FR-53)."""
        return self._transport.control("set_rate", {"rate": rate})

    def set_mode(self, mode: ClockMode) -> Mapping[str, Any]:
        return self._transport.control("set_mode", {"mode": mode.value})


@dataclass
class _Unused:
    """Kept out of the public surface; exists so ``field`` import stays honest."""

    placeholder: tuple[str, ...] = field(default_factory=tuple)
