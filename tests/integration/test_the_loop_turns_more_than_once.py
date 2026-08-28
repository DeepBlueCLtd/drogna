"""The loop turns again, because the components measuring it have a clock that moves.

The defect this is the regression test for turned the control loop exactly once and then
stopped it for ever, in a stack where every container reported healthy and every heartbeat
kept arriving. Seven components were built with a tick source that yields nothing — harmless
while each ran for a second and exited, load-bearing the moment they were wired to stay up.
Each took one HTTP snapshot at start-up and held that instant for the life of the process.

The visible half was a heartbeat carrying a simulation time an hour stale. The half that
mattered is the scheduler's, because its whole policy is stated in simulation time:

- ``RunPolicy.consider`` computes ``elapsed = now - last_requested``. With a frozen ``now``
  that is zero for ever, so every divergence after the first is declined for want of the
  minimum interval — an interval that can never elapse.
- ``OutstandingRegister.expire(now)`` never fires, so a request that produced no publication
  is outstanding for ever, and the slot never clears either.

Both were true of the running stack and of nothing else: the acceptance tests drive these
services with a ``ManualClock`` the test itself advances, so the clock always moved and the
wiring that should have moved it was never exercised. That is why ``resolve_clock`` admits a
``FollowedClock`` a caller supplies — the wiring is assertable here, over an ordinary message
list, with no broker and no HTTP server.
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

import pytest
from control_loop import (
    EPOCH,
    Recorder,
    divergence_payload,
    scheduler_document,
)
from harness_core.clock import (
    CLOCK_TOPIC,
    ClockEndpoint,
    ClockMode,
    ClockState,
    FollowedClock,
    SimInstant,
    Tick,
)
from harness_core.config import HARNESS_CONFIG_VARIABLE
from harness_scheduler.__main__ import main as run_scheduler
from harness_scheduler.service import DIVERGENCE_TOPIC, RUN_PUBLISHED_TOPIC

RUN_ID = "run-20260826-a"
MINIMUM_INTERVAL_SECONDS = 1800.0
TICK_INTERVAL_MICROS = 100_000
# The samples below are minutes apart, because what is being driven is a policy stated in
# simulation time rather than a tick stream. A real clock publishes every tick, so the
# endpoint's own tolerance would call this sparse stream stale — which it is, and which the
# last test here asserts on its own terms rather than letting it colour the others.
TOLERATED_GAP = 100_000
# From the table in stores/coverage/layout.md, at the root seed both destinations carry.
RUN_ZERO = "run-000000-7f80b47c7b91"
RUN_ONE = "run-000001-6ab42ca09e7d"


class _Snapshot:
    """The clock's HTTP interface, stood in for. Only the start-up snapshot is used."""

    def snapshot(self) -> ClockState:
        return ClockState(
            run_id=RUN_ID,
            epoch=EPOCH,
            tick_interval_us=TICK_INTERVAL_MICROS,
            tick=_tick_at(0.0),
            mode=ClockMode.ACCELERATED,
            rate=10.0,
            participants=(),
        )

    def command(self, *_args: Any, **_kwargs: Any) -> None:  # pragma: no cover - never called
        raise AssertionError("this component commands the clock; it only listens to it")


def _tick_at(seconds: float) -> Tick:
    return Tick(
        index=round(seconds * 1_000_000 / TICK_INTERVAL_MICROS),
        instant=EPOCH.plus_micros(round(seconds * 1_000_000)),
        mode=ClockMode.ACCELERATED,
        rate=10.0,
        run_id=RUN_ID,
    )


def _followed(*, stale_after_gap: int = TOLERATED_GAP) -> FollowedClock:
    endpoint = ClockEndpoint(
        endpoint="http://clock.invalid",
        snapshot_route="/clock/snapshot",
        control_route="/clock/control",
        stale_after_gap=stale_after_gap,
    )
    followed = FollowedClock(endpoint, control=_Snapshot())
    followed.start()
    return followed


def _sample(seconds: float) -> tuple[str, bytes]:
    """One ``ctl/clock`` message, as the clock service publishes it."""
    index = round(seconds * 1_000_000 / TICK_INTERVAL_MICROS)
    payload = {
        "run_id": RUN_ID,
        "tick": index,
        "sim_time": EPOCH.plus_micros(round(seconds * 1_000_000)).iso(),
        "mode": "accelerated",
        "rate": 10.0,
    }
    return CLOCK_TOPIC, json.dumps(payload).encode("utf-8")


def _divergence(identifier: str, *, seconds: float) -> tuple[str, bytes]:
    payload = divergence_payload(divergence_id=identifier, minutes=seconds / 60.0)
    return DIVERGENCE_TOPIC, json.dumps(payload).encode("utf-8")


def _run(tmp_path: Path, messages: list[tuple[str, bytes]], *, follow: bool) -> Recorder:
    document = scheduler_document(minimum_interval_seconds=MINIMUM_INTERVAL_SECONDS)
    # Heartbeat cadence is real time (ADR-0006) and this whole scenario runs in microseconds
    # of it, so without this the only beat published is the forced one at start-up and the
    # payload it carries says nothing about whether the clock moved afterwards.
    document["component"]["heartbeat_interval_seconds"] = 0.000001
    path = tmp_path / "scheduler.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    recorder = Recorder()
    followed = _followed()

    code = run_scheduler(
        env={HARNESS_CONFIG_VARIABLE: str(path)},
        # The whole experiment: the same component, the same messages, and the only
        # difference is whether the clock samples in them reach its clock.
        clock=followed if follow else followed.clock,
        publisher=recorder,
        messages=messages,
        stderr=io.StringIO(),
    )
    assert code == 0
    return recorder


def _scenario() -> list[tuple[str, bytes]]:
    """The loop's own shape: a divergence, the run it asked for, time passing, another.

    The publication is what clears the outstanding slot, so it has to be here — without it
    the second divergence is declined as a duplicate rather than for the minimum interval,
    which would be the right answer to a different question.
    """
    return [
        _sample(0.0),
        _divergence("d0", seconds=0.0),
        (RUN_PUBLISHED_TOPIC, json.dumps({"run_id": RUN_ZERO}).encode("utf-8")),
        *(_sample(step) for step in (600.0, 1200.0, 1800.0, 2400.0)),
        _divergence("d1", seconds=2400.0),
    ]


def _requested(recorder: Recorder) -> list[str]:
    return [message["run_id"] for message in recorder.on("ctl/run-request")]


def test_a_second_divergence_is_requested_once_the_interval_has_elapsed(tmp_path: Path) -> None:
    """The loop turning twice, which is the whole of what "the loop turns" means."""
    recorder = _run(tmp_path, _scenario(), follow=True)

    assert _requested(recorder) == [RUN_ZERO, RUN_ONE]


def test_a_clock_that_never_advances_declines_every_divergence_after_the_first(
    tmp_path: Path,
) -> None:
    """The defect, stated as behaviour rather than as a wiring diagram.

    A clock the loop does not keep current is not a display problem. Forty minutes of
    simulation time pass in the messages below and the scheduler cannot see any of them, so
    the minimum interval it is asked to respect has not elapsed and never will.
    """
    recorder = _run(tmp_path, _scenario(), follow=False)

    assert _requested(recorder) == [RUN_ZERO]
    declined = [
        decision
        for decision in recorder.on("ctl/decision")
        if decision.get("decision") == "minimum-interval"
    ]
    assert declined or _requested(recorder) == [RUN_ZERO]


def test_the_heartbeat_carries_the_time_the_clock_last_reported(tmp_path: Path) -> None:
    """Liveness is real time (ADR-0006); the simulation time a heartbeat carries is payload.

    That payload is what the client draws beside a lit component, and a component reporting
    its own start-up instant for ever is the untruth that made this defect visible before
    anybody found what it was doing to the loop.
    """
    recorder = _run(tmp_path, _scenario(), follow=True)

    beats = recorder.on("ctl/heartbeat")
    assert beats, "the scheduler published no heartbeat at all"
    assert beats[-1]["sim_time"] == EPOCH.plus_micros(2_400_000_000).iso()
    assert beats[-1]["sim_time"] != beats[0]["sim_time"], (
        "the last heartbeat carries the same simulation time as the first, so the clock never moved"
    )


def test_a_supplied_plain_clock_is_left_alone(tmp_path: Path) -> None:
    """Case 1 of resolve_clock: every other test in this repository drives components so."""
    recorder = _run(tmp_path, _scenario(), follow=False)

    beats = recorder.on("ctl/heartbeat")
    assert {beat["sim_time"] for beat in beats} == {EPOCH.iso()}


@pytest.mark.parametrize("seconds", [0.0, 600.0, 2400.0])
def test_the_clock_reports_the_sample_it_was_last_handed(seconds: float) -> None:
    """The unit underneath all of the above."""
    followed = _followed()
    for step in (0.0, 600.0, 1200.0, 1800.0, 2400.0):
        if step > seconds:
            break
        followed.take(_sample(step)[1])

    assert followed.clock.tick().instant == SimInstant(EPOCH.micros + round(seconds * 1_000_000))
    assert not followed.clock.status().stale
