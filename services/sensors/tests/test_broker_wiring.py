"""The sensors publish through the broker their configuration names, against a real one.

C-04 already built its own client, so nothing about its wiring changes here. What changes is
where that client lives: ``harness_core.broker`` rather than ``harness_sensors.broker``, so
that the nine components that now use it are not reaching across a service boundary for it.
This is the test that the move kept the behaviour — a sensor authenticating as
``drogna_sensor`` against the tracked access control list, publishing observations under
``obs/`` and its heartbeat on ``ctl/heartbeat``, and being allowed exactly that.

The sensors are the one component with no "publish nothing" state, and deliberately: a
sensor exists to publish observations, so with no broker it has no work at all. It retries
with bounded backoff spent in simulation time and then stops with a distinct exit code,
which ``test_main.py`` asserts. Every other component here has work that is not publishing
and so does not stop; ``harness_core.broker.resolve_publisher`` argues that difference.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import local_broker as lb
import pytest
import sensors_support as support
from harness_core.clock import ClockMode, ManualClock
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_sensors.__main__ import main

COMPONENT = "sensors"


@pytest.fixture
def broker(tmp_path: Path) -> Iterator[lb.LocalBroker]:
    yield from lb.start_broker(tmp_path)


def _ticks(count: int) -> list[object]:
    clock = ManualClock(
        run_id="run-broker-wiring",
        epoch=support.EPOCH,
        tick_interval_us=600_000_000,
        mode=ClockMode.LOCKSTEP,
    )
    return [clock.tick(), *(clock.advance() for _ in range(count - 1))]


@lb.skip_without_broker()
def test_the_sensors_publish_observations_and_a_heartbeat_through_a_real_broker(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """No publisher is injected, so the component builds one from its own configuration."""
    document = lb.component_configuration(COMPONENT, tmp_path, broker=broker, role=lb.SENSOR_ROLE)
    document["sensors"]["sampling"]["maximum_samples"] = 2
    env = lb.written(tmp_path, document, name=COMPONENT)

    with lb.Subscriber(broker, topic="#", role=lb.CONTROL_ROLE) as watcher:
        code = main(
            env=env,
            ticks=iter(_ticks(4)),
            field=support.LinearField(),
            stderr=io.StringIO(),
        )
        assert code == 0
        collected = watcher.wait_for(2)

    observations = [topic for topic, _ in collected.messages if topic.startswith("obs/")]
    assert observations, "the sensors published no observation on the observation branch"
    for topic in observations:
        assert len(topic.split("/")) == 3


@lb.skip_without_broker()
def test_the_sensor_announces_itself_and_the_broker_lets_it(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """The decision ADR-0015 took, asserted against a real broker and its real rules.

    Until 27 August 2026 this test asserted the opposite. ``deploy/broker/acl`` gave
    ``drogna_sensor`` ``topic write obs/#`` and nothing else, so the heartbeat this component
    publishes on ``ctl/heartbeat`` was refused — and refused silently, because Mosquitto
    denies the publish while the client's local return code stays zero. The component
    reported success, nothing heard anything, and C-04 could not light its box in the shell
    however it was wired.

    The old test carried its own replacement instruction: it failed the day the decision was
    taken. ADR-0015 took it, on the grounds that the forgery objection the ACL made was not
    held anywhere else — ``drogna_control`` carries ``readwrite ctl/#``, so nine components
    could already forge any heartbeat including a sensor's — while the cost was a permanent
    untruth in the one display whose purpose is that a box lights only when something was
    genuinely heard from.

    What is asserted here is the grant, and nothing wider than the grant. That the branch is
    still closed to this role in every other direction is
    ``tests/integration/test_topic_isolation.py``'s job, and it checks each refused topic by
    name against a running broker.
    """
    document = lb.component_configuration(COMPONENT, tmp_path, broker=broker, role=lb.SENSOR_ROLE)
    document["sensors"]["sampling"]["maximum_samples"] = 1
    env = lb.written(tmp_path, document, name=COMPONENT)

    with lb.Subscriber(broker, topic="#", role=lb.CONTROL_ROLE) as watcher:
        assert (
            main(
                env=env,
                ticks=iter(_ticks(3)),
                field=support.LinearField(),
                stderr=io.StringIO(),
            )
            == 0
        )
        collected = watcher.wait_for(1)

    assert collected.components(HEARTBEAT_TOPIC) == {COMPONENT}, (
        "the sensor heartbeat did not reach the broker. deploy/broker/acl must give "
        "drogna_sensor `topic write ctl/heartbeat` (ADR-0015); without it Mosquitto denies "
        "the publish, the client's return code is still zero, and C-04 stays dark while "
        "believing it announced itself"
    )
