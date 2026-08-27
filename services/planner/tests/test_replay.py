"""A scenario replayed from its seed produces the same ordered sequence of recommendations.

SC-012, and it is asserted on the bytes rather than on the values. Two runs that produced
equally good but differently ordered routes would pass a test on the numbers and fail the
property AT-04 is about: replaying a scenario gives byte-identical output for the same code
version.

Everything that could make two runs differ is exercised: the search's draws, the tie-breaks
between equally good insertions, the order the projection reports its regions in, and the
identifiers the recommendations carry. The clock is the deterministic fake and is advanced by
the same number of ticks in both runs, because a replay that ran at a different pace would be
testing the clock rather than the planner.
"""

from __future__ import annotations

import json
from itertools import pairwise

import pytest
from harness_core.rng import configure_run, reset_run
from harness_planner.publish import PLAN_TOPIC
from harness_planner.service import RUN_PUBLISHED_TOPIC, PlannerService
from planner_support import (
    OneField,
    Recorder,
    Spread,
    Timescales,
    announcement,
    manual_clock,
    observation,
    settings,
)


@pytest.fixture(autouse=True)
def seeded():
    configure_run(20260826)
    yield
    reset_run()


def run_scenario() -> list[bytes]:
    """One scenario: a field is announced, three observations arrive, the cadence elapses."""
    clock = manual_clock()
    recorder = Recorder()
    planner = PlannerService(
        settings(),
        clock=clock,
        fields=OneField(Spread(0.8)),
        timescales=Timescales(),
        publisher=recorder,
        config_digest="sha256:" + "0" * 64,
    )
    planner.start()
    planner.handle(RUN_PUBLISHED_TOPIC, json.dumps(announcement()).encode("utf-8"))

    for step, (latitude, longitude, depth) in enumerate(
        ((49.01, -4.48, 20.0), (49.02, -4.46, 40.0), (48.99, -4.52, 10.0))
    ):
        clock.advance(10)
        message = observation()
        message["location"] = {"latitude": latitude, "longitude": longitude, "depth_m": depth}
        message["observation_id"] = f"obs-{step:016x}"
        planner.handle("obs/platform-a/temperature", json.dumps(message).encode("utf-8"))

    clock.advance(40)
    planner.tick()

    return [payload for topic, payload in recorder.messages if topic == PLAN_TOPIC]


def test_two_replays_produce_an_identical_sequence_of_recommendations() -> None:
    first = run_scenario()
    reset_run()
    configure_run(20260826)
    second = run_scenario()

    assert first, "a replay that published nothing proves nothing"
    assert len(first) == len(second)
    assert first == second, (
        "two replays of one scenario differ in their published bytes; the difference is "
        "somewhere randomness or iteration order reached an output"
    )


def test_the_plan_identifiers_form_the_same_lineage_on_both_runs() -> None:
    first = [json.loads(payload) for payload in run_scenario()]
    reset_run()
    configure_run(20260826)
    second = [json.loads(payload) for payload in run_scenario()]

    assert [message["plan_id"] for message in first] == [message["plan_id"] for message in second]
    assert [message["supersedes"] for message in first] == [
        message["supersedes"] for message in second
    ]
    assert first[0]["supersedes"] is None
    for earlier, later in pairwise(first):
        assert later["supersedes"] == earlier["plan_id"]


def test_the_routes_and_the_projections_are_identical_run_for_run() -> None:
    first = [json.loads(payload) for payload in run_scenario()]
    reset_run()
    configure_run(20260826)
    second = [json.loads(payload) for payload in run_scenario()]

    for one, other in zip(first, second, strict=True):
        assert one["route"] == other["route"]
        assert one["projection"] == other["projection"]
        assert one["selection"] == other["selection"]
        assert one["commitment"] == other["commitment"]
