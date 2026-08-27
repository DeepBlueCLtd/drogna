"""The planner as a component: what it does when messages arrive, and what it publishes.

The wiring is thin and the tests here are about the seams rather than the arithmetic. Four
properties, each of which is a requirement somewhere:

- with no published field it says ``no-field``, emits no route, and does not invent one;
- an announcement on ``ctl/run-published`` is what makes it read a field, and reading it is
  through the coverage read port rather than by asking the query layer anything;
- an observation on ``obs/#`` collapses the cells it informed and moves the platform, and
  nothing else of the observation is kept;
- every recommendation carries the identifier of the one it supersedes, so a consumer can
  tell a replan from a first plan without keeping a history of its own.

No host clock anywhere: the clock is the deterministic fake, advanced explicitly.
"""

from __future__ import annotations

import json

import pytest
from harness_core.rng import configure_run, reset_run
from harness_planner.publish import PLAN_TOPIC, PlannerState
from harness_planner.service import RUN_PUBLISHED_TOPIC, PlannerService
from planner_support import (
    EPOCH_MICROS,
    FIELD_RUN_ID,
    HandField,
    OneField,
    Recorder,
    Spread,
    Timescales,
    announcement,
    manual_clock,
    observation,
    settings,
)

FIELD_RUN = FIELD_RUN_ID


@pytest.fixture(autouse=True)
def seeded():
    configure_run(20260826)
    yield
    reset_run()


def service(*, field: Spread | None, publisher: Recorder | None = None, **overrides):
    return PlannerService(
        settings(**overrides),
        clock=manual_clock(),
        fields=OneField(field),
        timescales=Timescales(),
        publisher=publisher,
        config_digest="sha256:" + "0" * 64,
    )


def test_with_no_published_field_it_says_so_and_recommends_nothing() -> None:
    """It does not invent a default field, and it does not go quiet either."""
    recorder = Recorder()
    planner = service(field=None, publisher=recorder)
    planner.start()

    assert planner.state is PlannerState.NO_FIELD
    assert planner.replan(trigger_for_test()) is None
    assert recorder.on(PLAN_TOPIC) == []
    assert planner.beat(force=True) is not None


def trigger_for_test():
    from harness_planner.commitment import Trigger

    return Trigger.CADENCE


def test_an_announcement_is_what_makes_it_read_a_field() -> None:
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()

    message = planner.handle(RUN_PUBLISHED_TOPIC, json.dumps(announcement()).encode("utf-8"))

    assert message is not None
    assert message["uncertainty_field"]["run_id"] == FIELD_RUN
    assert message["uncertainty_field"]["digest"] == announcement()["digests"]["uncertainty"]
    assert planner.state is PlannerState.PLANNING


def test_each_recommendation_names_the_one_it_supersedes() -> None:
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()

    first = planner.replan(trigger_for_test())
    second = planner.replan(trigger_for_test())

    assert first is not None and second is not None
    assert first["supersedes"] is None, "a first recommendation supersedes nothing"
    assert second["supersedes"] == first["plan_id"]
    assert second["plan_id"] != first["plan_id"]
    assert len(recorder.on(PLAN_TOPIC)) == 2


def test_an_observation_collapses_what_it_informed_and_moves_the_platform() -> None:
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()
    planner.replan(trigger_for_test())

    published = planner.handle("obs/platform-a/temperature", json.dumps(observation()).encode())

    assert published is not None
    assert planner.measurements == 1
    assert planner.platform.latitude == pytest.approx(49.02)
    assert planner.platform.depth_m == pytest.approx(30.0)


def test_a_message_that_does_not_parse_is_counted_rather_than_crashing() -> None:
    planner = service(field=Spread(0.8), publisher=Recorder())
    planner.start()

    assert planner.handle("obs/platform-a/temperature", b"{not json") is None
    assert planner.handle("obs/platform-a/temperature", b'{"sim_time": 1}') is None
    assert planner.unreadable == 2


def test_the_replan_cadence_is_measured_in_simulation_time() -> None:
    """Constitution I: a planner pacing itself on the host clock would plan differently
    on a fast machine, which is the failure the principle exists to prevent."""
    clock = manual_clock(tick_interval_us=60_000_000)
    planner = PlannerService(
        settings(horizon={"span_seconds": 3600.0, "replan_cadence_seconds": 1800.0}),
        clock=clock,
        fields=OneField(Spread(0.8)),
        timescales=Timescales(),
        publisher=Recorder(),
    )
    planner.start()

    assert planner.due(), "a planner that has never planned is always due"
    planner.replan(trigger_for_test())
    assert not planner.due()

    clock.advance(29)
    assert not planner.due()
    clock.advance(1)
    assert planner.due()


def test_the_heartbeat_carries_the_state_the_plan_carries() -> None:
    """Constitution VII: a reader of either can say why a route is empty."""
    recorder = Recorder()
    planner = service(field=Spread(0.02), publisher=recorder, uncertainty={"usable_threshold": 0.5})
    planner.start()
    message = planner.replan(trigger_for_test())

    assert message is not None
    assert message["state"] == "nothing-worth-sampling"
    assert message["empty_reason"] == "nothing-worth-sampling"
    assert message["route"]["vertices"] == []

    beat = planner.beat(force=True)
    assert beat is not None
    assert beat["detail"] == "nothing-worth-sampling"


def test_a_plan_is_published_with_sorted_keys_so_two_replays_produce_the_same_bytes() -> None:
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()
    planner.replan(trigger_for_test())

    payload = next(payload for topic, payload in recorder.messages if topic == PLAN_TOPIC)
    assert payload == json.dumps(json.loads(payload), sort_keys=True).encode("utf-8")


def test_the_published_plan_validates_against_its_master() -> None:
    from pathlib import Path

    from harness_core.config import validate_document

    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()
    planner.replan(trigger_for_test())

    root = Path(__file__).resolve().parents[3]
    master = json.loads(
        (root / "contracts" / "schemas" / "plan.schema.json").read_text(encoding="utf-8")
    )
    validate_document(recorder.on(PLAN_TOPIC)[0], master, source=PLAN_TOPIC)


def test_the_field_the_state_was_rebased_on_is_the_one_the_plan_names() -> None:
    """FR-017: a recommendation is never produced against a field that has been superseded."""
    recorder = Recorder()
    source = OneField(Spread(0.8))
    planner = PlannerService(
        settings(),
        clock=manual_clock(),
        fields=source,
        timescales=Timescales(),
        publisher=recorder,
    )
    planner.start()
    planner.replan(trigger_for_test())

    source.field = Spread(0.9, run_id="run-000001-6ab42ca09e7d")
    planner.handle(RUN_PUBLISHED_TOPIC, json.dumps(announcement()).encode("utf-8"))

    published = recorder.on(PLAN_TOPIC)
    assert published[0]["uncertainty_field"]["run_id"] == FIELD_RUN
    assert published[-1]["uncertainty_field"]["run_id"] == "run-000001-6ab42ca09e7d"


def test_a_hand_built_field_and_the_service_agree_about_a_cell() -> None:
    """The service's own indexing is the one the tests elsewhere in this package use."""
    planner = service(field=Spread(0.8), publisher=Recorder())
    planner.start()

    cell = planner.geometry.cell_at(49.0, -4.5, 25.0)
    hand = HandField(grid=planner.geometry, spread=lambda *_: 0.8, tau=lambda *_: 5400.0)

    assert hand.saturated(cell, EPOCH_MICROS) == pytest.approx(0.8)


def test_one_sounding_is_one_measurement_however_many_observations_carry_it() -> None:
    """Three observations at one place and one instant collapse the cell once, not three times."""
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()
    planner.replan(trigger_for_test())
    published = len(recorder.on(PLAN_TOPIC))

    for observed_property in ("temperature", "salinity", "pressure"):
        message = observation()
        message["observed_property"] = observed_property
        message["observation_id"] = f"obs-{observed_property:0>16}"
        planner.handle("obs/platform-a/" + observed_property, json.dumps(message).encode())

    assert planner.measurements == 3, "all three observations arrived and were counted"
    assert len(recorder.on(PLAN_TOPIC)) == published + 1, (
        "one sounding is one fact about the water, so it produces one recommendation"
    )


def test_a_second_sounding_at_the_same_place_a_moment_later_is_a_new_measurement() -> None:
    """Coalescing is per place and instant, not a lock on the cell."""
    recorder = Recorder()
    planner = service(field=Spread(0.8), publisher=recorder)
    planner.start()
    planner.replan(trigger_for_test())
    published = len(recorder.on(PLAN_TOPIC))

    for sim_time in ("2026-09-01T00:10:00.000000Z", "2026-09-01T00:20:00.000000Z"):
        message = observation()
        message["sim_time"] = sim_time
        planner.handle("obs/platform-a/temperature", json.dumps(message).encode())

    assert len(recorder.on(PLAN_TOPIC)) == published + 2
