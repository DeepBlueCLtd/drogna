"""Starting before the store is seeded is a normal start, and the client says so.

009 T059, as the 28 August decision leaves it. Seeding creates this component's schema and
its role, and seeding runs *after* `scripts/up.sh` — so on a bring-up from nothing this
client starts against a database that has neither. Until this it exited 72 at the first
attempt, which is why the observation profile was not in the local destination's active
profiles at all: adding it made the bring-up fail for that reason and no other.

What is asserted here is the whole of the resolution. The client keeps trying; it says on
stderr what the database said, every time, rather than swallowing it; it publishes a
heartbeat that names the reason, so a component that is waiting is visibly waiting rather
than absent; it spends the wait in simulation time out of the tick stream it already holds,
never on the host's clock; and it invents nothing — there is no connection until there is a
real connection.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from typing import Any

import harness_ingest.__main__ as entry
from harness_core.clock import SimInstant, Tick
from harness_ingest.__main__ import StoreError, connect_when_seeded

SECTION = {"dsn": "postgresql://drogna_ingest@observations/drogna", "role": "drogna_ingest"}
REFUSAL = 'password authentication failed for user "drogna_ingest"'


class _Recorder:
    """A publisher that keeps what it was given, as every other test here does."""

    def __init__(self) -> None:
        self.published: list[tuple[str, bytes]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, payload))


def _ticks(count: int = 4096) -> Iterator[Tick]:
    epoch = SimInstant.from_iso("2026-01-01T00:00:00.000000Z")
    for index in range(count):
        yield Tick(
            run_id="run-waits-for-seeding",
            index=index,
            instant=epoch.plus_micros(index * 100_000),
            rate=10.0,
            mode="accelerated",
        )


def _refusing(times: int) -> Any:
    """A store that refuses the first ``times`` attempts and then answers, like a seeded one."""
    state = {"attempts": 0}

    def connect(section: Any) -> Any:
        state["attempts"] += 1
        if state["attempts"] <= times:
            raise StoreError(f"the observation store is not reachable: FATAL:  {REFUSAL}")
        return f"connection-after-{state['attempts']}"

    connect.state = state  # type: ignore[attr-defined]
    return connect


def test_it_waits_and_connects_once_the_store_has_been_seeded(monkeypatch: Any) -> None:
    connect = _refusing(3)
    monkeypatch.setattr(entry, "connect_to_store", connect)
    out = io.StringIO()

    connection = connect_when_seeded(SECTION, _ticks(), None, out)

    assert connection == "connection-after-4"
    assert connect.state["attempts"] == 4


def test_every_attempt_reports_what_the_database_said(monkeypatch: Any) -> None:
    """Never swallowed. A client waiting on seeding and one pointed at nothing look alike
    from the outside, and stderr is what tells them apart."""
    monkeypatch.setattr(entry, "connect_to_store", _refusing(2))
    out = io.StringIO()

    connect_when_seeded(SECTION, _ticks(), None, out)

    report = out.getvalue()
    assert report.count("waiting on seeding") == 2
    assert report.count(REFUSAL) == 2


def test_it_heartbeats_while_it_waits_and_names_the_reason(monkeypatch: Any) -> None:
    """A component that is not yet ingesting is lit as starting, not left dark or claimed ok."""
    import json

    from harness_core.heartbeat import HeartbeatPublisher

    monkeypatch.setattr(entry, "connect_to_store", _refusing(2))
    recorder = _Recorder()
    heartbeat = HeartbeatPublisher(
        recorder, component="ingest", interval_seconds=0.001, monotonic=lambda: 0.0
    )

    connect_when_seeded(SECTION, _ticks(), heartbeat, io.StringIO())

    beats = [json.loads(payload) for topic, payload in recorder.published]
    assert beats, "a component that is waiting published nothing at all"
    assert {beat["status"] for beat in beats} == {"starting"}
    assert all("waiting on seeding" in beat["detail"] for beat in beats)


def test_it_gives_up_only_when_the_clock_stops(monkeypatch: Any) -> None:
    """The one thing that means no amount of waiting will help; the caller exits on it."""
    monkeypatch.setattr(entry, "connect_to_store", _refusing(1000))

    assert connect_when_seeded(SECTION, _ticks(count=3), None, io.StringIO()) is None


def test_a_store_that_is_ready_costs_no_tick_at_all(monkeypatch: Any) -> None:
    """The ordinary case, and the one lane D's trust authentication makes universal."""
    monkeypatch.setattr(entry, "connect_to_store", _refusing(0))
    ticks = _ticks()

    assert connect_when_seeded(SECTION, ticks, None, io.StringIO()) == "connection-after-1"
    assert next(ticks).index == 0, "a store that answered at once should have cost no time"
