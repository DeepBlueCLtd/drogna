"""The route is reconsidered as fields are published and measurements arrive.

User Story 3's independent test, run across the seam rather than inside it: the planner is
fed a sequence of control and observation messages in the shapes the other features actually
publish, and what comes back on ``ctl/plan`` is checked as a sequence rather than one message
at a time.

Four properties, and the third is the one that makes the receding horizon worth having:

- a new uncertainty field announced on ``ctl/run-published`` produces a new recommendation,
  carrying a new identifier and the identifier of the one it replaces;
- a recommendation is never produced against a field that has been superseded — the field a
  recommendation names is the one that was current when it was computed;
- measurements arriving along the route collapse the cells they informed, so the next
  recommendation reflects what has actually been sampled rather than what was intended;
- with nothing material changed, the committed prefix is unchanged.

The clock is the deterministic fake throughout. Nothing here reads a host clock, and the
cadence that decides whether a replan is due is measured in simulation time.
"""

from __future__ import annotations

import json

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

SECOND_RUN = "run-000001-6ab42ca09e7d"


@pytest.fixture(autouse=True)
def seeded():
    configure_run(20260826)
    yield
    reset_run()


@pytest.fixture
def bench():
    clock = manual_clock()
    recorder = Recorder()
    source = OneField(Spread(0.8))
    planner = PlannerService(
        settings(),
        clock=clock,
        fields=source,
        timescales=Timescales(),
        publisher=recorder,
        config_digest="sha256:" + "0" * 64,
    )
    planner.start()
    return planner, clock, recorder, source


def announce(planner, *, run_id: str, digest: str) -> dict | None:
    message = announcement()
    message["run_id"] = run_id
    message["digests"]["uncertainty"] = digest
    return planner.handle(RUN_PUBLISHED_TOPIC, json.dumps(message).encode("utf-8"))


def test_a_new_field_produces_a_superseding_recommendation(bench) -> None:
    planner, clock, recorder, source = bench

    first = announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    assert first is not None

    clock.advance(40)
    source.field = Spread(0.6, run_id=SECOND_RUN)
    second = announce(planner, run_id=SECOND_RUN, digest="sha256:" + "c" * 64)

    assert second is not None
    assert second["plan_id"] != first["plan_id"]
    assert second["supersedes"] == first["plan_id"]
    assert second["horizon"]["start_sim_time"] > first["horizon"]["start_sim_time"]
    assert len(recorder.on(PLAN_TOPIC)) == 2


def test_a_recommendation_names_the_field_that_was_current_when_it_was_computed(bench) -> None:
    """FR-017: never emitted against a field that has already been superseded."""
    planner, clock, recorder, source = bench

    announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    clock.advance(40)
    source.field = Spread(0.6, run_id=SECOND_RUN)
    announce(planner, run_id=SECOND_RUN, digest="sha256:" + "c" * 64)

    published = recorder.on(PLAN_TOPIC)

    assert published[0]["uncertainty_field"]["run_id"] == Spread(0.8).run_id
    assert published[0]["uncertainty_field"]["digest"] == "sha256:" + "b" * 64
    assert published[1]["uncertainty_field"]["run_id"] == SECOND_RUN
    assert published[1]["uncertainty_field"]["digest"] == "sha256:" + "c" * 64


def test_measurements_collapse_the_cells_they_informed_before_the_next_recommendation(
    bench,
) -> None:
    """The plan reflects what has been sampled rather than what was intended."""
    planner, clock, recorder, _ = bench

    first = announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    assert first is not None
    route = first["route"]["vertices"]
    assert route, "the bench needs a route for the platform to sample along"

    for step, vertex in enumerate(route[:3]):
        clock.advance(10)
        message = observation()
        message["observation_id"] = f"obs-{step:016x}"
        message["location"] = {
            "latitude": vertex["latitude"],
            "longitude": vertex["longitude"],
            "depth_m": vertex["depth_m"],
        }
        planner.handle("obs/platform-a/temperature", json.dumps(message).encode("utf-8"))

    latest = recorder.on(PLAN_TOPIC)[-1]
    sampled = {(vertex["h3_index"], vertex["depth_band"]) for vertex in route[:3]}
    recommended_again = {
        (vertex["h3_index"], vertex["depth_band"]) for vertex in latest["route"]["vertices"]
    }

    assert not sampled & recommended_again, (
        "a cell just measured has had its uncertainty collapsed, so recommending it again "
        "immediately would mean the measurement had not reached the planner"
    )
    assert planner.measurements == 3


def test_the_platform_position_a_recommendation_plans_from_is_where_it_was_last_reported(
    bench,
) -> None:
    planner, clock, recorder, _ = bench
    announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)

    clock.advance(10)
    message = observation()
    message["location"] = {"latitude": 49.03, "longitude": -4.44, "depth_m": 60.0}
    planner.handle("obs/platform-a/temperature", json.dumps(message).encode("utf-8"))

    latest = recorder.on(PLAN_TOPIC)[-1]

    assert latest["platform"] == {"latitude": 49.03, "longitude": -4.44, "depth_m": 60.0}


def test_with_nothing_material_changed_the_committed_prefix_holds(bench) -> None:
    """SC-006: the recommendation does not churn for an improvement nobody could name."""
    planner, clock, _recorder, _ = bench
    first = announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    assert first is not None
    assert first["commitment"]["departed_from_previous"] is False

    clock.advance(30)
    second = planner.tick()

    assert second is not None
    assert second["commitment"]["departed_from_previous"] is False
    assert second["commitment"]["retained_vertex_count"] >= 1
    assert second["commitment"]["improvement_over_retained"] <= second["commitment"]["margin"]

    held = second["commitment"]["retained_vertex_count"]
    assert [vertex["h3_index"] for vertex in second["route"]["vertices"][:held]] == [
        vertex["h3_index"] for vertex in first["route"]["vertices"][:held]
    ]


def test_every_published_recommendation_stays_inside_its_budget(bench) -> None:
    """SC-003 over a whole sequence: the count of budget-exceeding plans is zero."""
    planner, clock, recorder, source = bench

    announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    clock.advance(40)
    source.field = Spread(0.9, run_id=SECOND_RUN)
    announce(planner, run_id=SECOND_RUN, digest="sha256:" + "c" * 64)
    clock.advance(40)
    planner.tick()

    published = recorder.on(PLAN_TOPIC)
    assert len(published) >= 3
    exceeded = [
        message
        for message in published
        if message["route"]["consumed_seconds"] > message["route"]["budget_seconds"] + 1e-9
    ]

    assert exceeded == []


def test_every_recommendation_covers_every_region_in_the_domain(bench) -> None:
    """SC-007 over a sequence, because a projection that lapsed would lapse quietly."""
    planner, clock, recorder, _ = bench
    announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    clock.advance(40)
    planner.tick()

    published = recorder.on(PLAN_TOPIC)
    expected = len(planner.geometry.cover(Spread(0.8).bounds(), maximum_cells=4096))

    for message in published:
        assert message["projection"]["region_count"] == expected
        assert len(message["projection"]["regions"]) == expected
        indices = [region["h3_index"] for region in message["projection"]["regions"]]
        assert indices == sorted(indices)


def test_a_replan_is_not_due_until_the_cadence_has_elapsed_in_simulation_time(bench) -> None:
    planner, clock, recorder, _ = bench
    announce(planner, run_id=Spread(0.8).run_id, digest="sha256:" + "b" * 64)
    published = len(recorder.on(PLAN_TOPIC))

    clock.advance(5)
    assert planner.tick() is None
    assert len(recorder.on(PLAN_TOPIC)) == published

    clock.advance(30)
    assert planner.tick() is not None
