"""C-09 announces itself while it serves, which it had never done.

The heartbeat was written with feature 008 — ``query/plugins/heartbeat.py``, with a careful
docstring about being lit because it is heard from and for nothing else — and nothing ever
constructed it. No caller, no test, and a grey box in the client for the life of every stack
while the component behind it answered every request put to it. Grep is the whole finding:

    $ grep -rn "QueryLayerHeartbeat" query/ | grep -v heartbeat.py
    (nothing)

That is the untruth Constitution VII exists to prevent, produced by the one component whose
whole job is answering truthfully. `pygeoapi serve` owns the process for its lifetime, so
there was nowhere to announce from; `query/serve.py` is the missing caller, and starts the
heartbeat inside the process that answers rather than beside it.

Time reaches this component over HTTP and these tests hold it to that. Every other component
takes it by subscription (ADR-0009) and the query role cannot: ``deploy/broker/acl`` gives
``drogna_query`` one write and no read at all, and argues for it — a read-only query surface
able to subscribe to the control namespace is the cross-contamination C-03 owns as its
failure mode. The clock's snapshot endpoint is the only route to time its role permits.
"""

from __future__ import annotations

import io
import json
import sys
import threading
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from harness_core.clock import ClockMode, ClockState, SimInstant, Tick  # noqa: E402
from plugins.heartbeat import QueryLayerHeartbeat  # noqa: E402
from serve import beat_until_stopped, start_heartbeat  # noqa: E402

EPOCH = SimInstant.from_iso("2026-08-26T00:00:00.000000Z")
# The heartbeat master requires a real digest shape, which is the schema doing its job.
DIGEST = "sha256:" + "ab" * 32
RUN_ID = "run-20260826-a"


class _Recorder:
    """A publisher that keeps what it was given, as every other test here does."""

    def __init__(self) -> None:
        self.published: list[dict[str, Any]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append({"topic": topic, **json.loads(payload)})


class _Snapshots:
    """The clock's HTTP interface. Each call is a fresh read, as the real one is."""

    def __init__(self, *, ticks: list[Tick | None], failing: Exception | None = None) -> None:
        self._ticks = ticks
        self._failing = failing
        self.calls = 0

    def snapshot(self) -> ClockState:
        self.calls += 1
        if self._failing is not None:
            raise self._failing
        tick = self._ticks[min(self.calls - 1, len(self._ticks) - 1)]
        return ClockState(
            run_id=RUN_ID,
            epoch=EPOCH,
            tick_interval_us=100_000,
            tick=tick,
            mode=ClockMode.ACCELERATED,
            rate=10.0,
            participants=(),
        )


def _tick(seconds: float) -> Tick:
    return Tick(
        index=round(seconds * 10),
        instant=EPOCH.plus_micros(round(seconds * 1_000_000)),
        mode=ClockMode.ACCELERATED,
        rate=10.0,
        run_id=RUN_ID,
    )


class _StopsAfter(threading.Event):
    """Stops the beating loop after a stated number of waits, so a test is not a race."""

    def __init__(self, waits: int) -> None:
        super().__init__()
        self._left = waits

    def wait(self, timeout: float | None = None) -> bool:  # type: ignore[override]
        self._left -= 1
        if self._left <= 0:
            self.set()
        return self.is_set()


def _beat(snapshots: _Snapshots, *, waits: int = 3, report: Any = None) -> _Recorder:
    recorder = _Recorder()
    heartbeat = QueryLayerHeartbeat(
        recorder, component="query", interval_seconds=0.000001, config_digest=DIGEST
    )
    beat_until_stopped(
        heartbeat,
        snapshots,
        interval_seconds=0.000001,
        stop=_StopsAfter(waits),
        report=report or io.StringIO(),
    )
    return recorder


def test_it_announces_itself_while_it_serves() -> None:
    """The whole of what was missing: a message on ctl/heartbeat naming this component."""
    recorder = _beat(_Snapshots(ticks=[_tick(0.0), _tick(60.0), _tick(120.0)]))

    assert recorder.published, "the query layer published nothing at all"
    assert {beat["topic"] for beat in recorder.published} == {"ctl/heartbeat"}
    assert {beat["component"] for beat in recorder.published} == {"query"}


def test_the_first_beat_says_starting_and_the_rest_say_serving() -> None:
    recorder = _beat(_Snapshots(ticks=[_tick(0.0), _tick(60.0), _tick(120.0)]))

    assert recorder.published[0]["status"] == "starting"
    assert [beat["status"] for beat in recorder.published[1:]] == ["ok", "ok"]


def test_each_beat_carries_the_time_the_clock_reports_then() -> None:
    """Read fresh every beat, because a snapshot taken once would freeze like the loop's did."""
    snapshots = _Snapshots(ticks=[_tick(0.0), _tick(60.0), _tick(120.0)])

    recorder = _beat(snapshots)

    assert [beat["sim_time"] for beat in recorder.published] == [
        EPOCH.iso(),
        EPOCH.plus_micros(60_000_000).iso(),
        EPOCH.plus_micros(120_000_000).iso(),
    ]
    assert snapshots.calls == 3


def test_a_clock_it_cannot_read_skips_the_beat_and_says_so() -> None:
    """Greyed out, truthfully. Every message this component publishes carries a simulation
    time, and one it invented would be worse than none."""
    report = io.StringIO()

    recorder = _beat(_Snapshots(ticks=[], failing=OSError("connection refused")), report=report)

    assert recorder.published == []
    assert "no simulation time to report" in report.getvalue()
    assert "connection refused" in report.getvalue()


def test_a_clock_that_has_not_ticked_yet_is_not_reported_as_a_time() -> None:
    """The snapshot answers with no tick before the clock has run; that is not an instant."""
    recorder = _beat(_Snapshots(ticks=[None]))

    assert recorder.published == []


def test_a_configuration_naming_no_broker_announces_nothing_and_says_so() -> None:
    """Constitution VII: no stub, and the silence has exactly one stated reason."""
    report = io.StringIO()
    document = {
        "component": {"id": "query", "heartbeat_interval_seconds": 5.0},
        "clock": {
            "endpoint": "http://clock.invalid",
            "routes": {"snapshot": "/clock/snapshot", "control": "/clock/control"},
        },
    }

    stop = start_heartbeat(document, None, report)

    assert not stop.is_set()
    assert "greyed out in the client rather than falsely lit" in report.getvalue()
