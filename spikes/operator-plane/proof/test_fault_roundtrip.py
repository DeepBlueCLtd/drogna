"""A requested impairment reaches a real heartbeat, and cannot be used to conceal one.

Spike code, grafted to ``libs/harness_core/tests/test_fault_roundtrip.py`` by
``spikes/operator-plane/run.sh`` and removed afterwards.

What makes this a proof rather than a demonstration: every heartbeat asserted on here is
composed by the repository's own :class:`HeartbeatPublisher` and validated against the
repository's own heartbeat schema. Nothing constructs a message by hand, so a shape the
contract would refuse fails here rather than passing quietly.
"""

from __future__ import annotations

import json

import pytest
from harness_core.clock import ClockMode, SimInstant, Tick
from harness_core.fault import INJECTED, Acceptance, FaultRequest, FaultState, Impairment
from harness_core.heartbeat import HeartbeatPublisher, HeartbeatStatus, validate_heartbeat


class Recorder:
    """A publisher that keeps what it was given. The transport is not what is under test."""

    def __init__(self) -> None:
        self.published: list[tuple[str, dict[str, object]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.published.append((topic, json.loads(payload.decode("utf-8"))))


@pytest.fixture(name="component")
def _component() -> str:
    return "planner"


def tick(index: int) -> Tick:
    """A tick, built as `libs/harness_core/tests/test_heartbeat.py` builds one."""
    return Tick(
        index=index,
        instant=SimInstant.from_iso("2026-01-01T00:00:00.000000Z").plus_micros(index * 100_000),
        mode=ClockMode.REALTIME,
        rate=1.0,
        run_id="run-0001",
    )


def emit(
    publisher: HeartbeatPublisher,
    faults: FaultState,
    index: int,
    *,
    natural: HeartbeatStatus = HeartbeatStatus.OK,
    natural_detail: str = "",
) -> bool:
    """One component's heartbeat step, with the fault state consulted as a component would.

    This is the whole of the integration being proposed: three calls, in the component's
    own publish path, and no way for anything outside the component to reach the message.
    """
    faults.expire(index)
    if not faults.publishes():
        return False
    publisher.publish(
        tick(index),
        status=faults.status_for(natural),
        detail=faults.detail_for(natural_detail),
    )
    return True


def last(recorder: Recorder) -> dict[str, object]:
    message = recorder.published[-1][1]
    validate_heartbeat(message)  # the real validator, against the real master
    return message


def publisher_for(component: str, recorder: Recorder) -> HeartbeatPublisher:
    # Cadence is not what is under test, so the interval is short and every publish is
    # explicit rather than left to `maybe_publish` and a host counter.
    return HeartbeatPublisher(recorder, component=component, interval_seconds=1.0)


class TestAcceptance:
    def test_a_request_for_another_component_is_refused(self, component: str) -> None:
        faults = FaultState(component)
        decision = faults.request(
            FaultRequest(component="scheduler", impairment=Impairment.DEGRADE, reason="demo"),
            tick=0,
        )
        assert decision == Acceptance(
            accepted=False, in_force=Impairment.NONE, detail="this is planner, not scheduler"
        )

    def test_a_request_with_no_reason_is_refused(self, component: str) -> None:
        faults = FaultState(component)
        decision = faults.request(
            FaultRequest(component=component, impairment=Impairment.DEGRADE, reason=""), tick=0
        )
        assert not decision.accepted
        assert faults.in_force is Impairment.NONE

    def test_an_expiry_that_is_not_a_future_tick_is_refused(self, component: str) -> None:
        faults = FaultState(component)
        decision = faults.request(
            FaultRequest(
                component=component,
                impairment=Impairment.DEGRADE,
                reason="demo",
                expires_after_ticks=0,
            ),
            tick=5,
        )
        assert not decision.accepted


class TestTheHeartbeatItChanges:
    def test_an_unimpaired_component_publishes_what_it_would_have(self, component: str) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        assert emit(publisher, FaultState(component), 1)
        assert last(recorder)["status"] == "ok"

    @pytest.mark.parametrize(
        ("impairment", "expected"),
        [(Impairment.DEGRADE, "degraded"), (Impairment.STALL, "stalled")],
    )
    def test_a_requested_impairment_is_what_the_component_reports(
        self, component: str, impairment: Impairment, expected: str
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=impairment, reason="showing a failure"),
            tick=0,
        )
        assert emit(publisher, faults, 1)
        message = last(recorder)
        assert message["status"] == expected
        assert INJECTED in str(message["detail"])
        assert "showing a failure" in str(message["detail"])

    def test_silence_publishes_nothing_at_all(self, component: str) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=Impairment.SILENCE, reason="gone quiet"),
            tick=0,
        )
        assert not emit(publisher, faults, 1)
        assert recorder.published == []

    def test_throttle_does_not_change_what_the_component_says_about_its_health(
        self, component: str
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=Impairment.THROTTLE, reason="slow it"),
            tick=0,
        )
        assert emit(publisher, faults, 1)
        message = last(recorder)
        assert message["status"] == "ok"  # slow is not sick
        assert INJECTED in str(message["detail"])


class TestTruthIsMonotoneDownward:
    def test_a_console_cannot_talk_a_degraded_component_into_reporting_ok(
        self, component: str
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=Impairment.NONE, reason="all better now"),
            tick=0,
        )
        # The planner's own state says degraded — `no-field`, as services/planner does.
        assert emit(publisher, faults, 1, natural=HeartbeatStatus.DEGRADED)
        assert last(recorder)["status"] == "degraded"

    def test_a_degrade_request_cannot_soften_a_component_that_is_already_stalled(
        self, component: str
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=Impairment.DEGRADE, reason="demo"), tick=0
        )
        assert emit(publisher, faults, 1, natural=HeartbeatStatus.STALLED)
        assert last(recorder)["status"] == "stalled"

    @pytest.mark.parametrize("lifecycle", [HeartbeatStatus.STARTING, HeartbeatStatus.STOPPING])
    def test_a_lifecycle_status_is_left_alone(
        self, component: str, lifecycle: HeartbeatStatus
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(component=component, impairment=Impairment.DEGRADE, reason="demo"), tick=0
        )
        assert emit(publisher, faults, 1, natural=lifecycle)
        assert last(recorder)["status"] == lifecycle.value


class TestExpiryIsSimulationTime:
    def test_an_impairment_lapses_at_the_tick_it_was_given(self, component: str) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(
                component=component,
                impairment=Impairment.DEGRADE,
                reason="two ticks of trouble",
                expires_after_ticks=2,
            ),
            tick=10,
        )
        assert emit(publisher, faults, 11)
        assert last(recorder)["status"] == "degraded"

        assert emit(publisher, faults, 12)
        assert last(recorder)["status"] == "ok"
        assert faults.in_force is Impairment.NONE

    def test_a_silenced_component_comes_back_when_its_impairment_lapses(
        self, component: str
    ) -> None:
        recorder = Recorder()
        publisher = publisher_for(component, recorder)
        faults = FaultState(component)
        faults.request(
            FaultRequest(
                component=component,
                impairment=Impairment.SILENCE,
                reason="a gap in the record",
                expires_after_ticks=3,
            ),
            tick=0,
        )
        assert not emit(publisher, faults, 1)
        assert not emit(publisher, faults, 2)
        assert emit(publisher, faults, 3)
        assert last(recorder)["status"] == "ok"
