"""The generator connects to the broker its configuration names, and lights a box.

The three states this entry point can start in, each asserted against a real broker started
from ``deploy/broker/mosquitto.conf`` and ``deploy/broker/acl``. Nothing is mocked: the
component authenticates as a real role, the tracked access control list decides whether it
may publish on ``ctl/``, and what it published is read back by a subscriber that is refused
permission to publish anything at all.

Before this feature nothing supplied a publisher, so this component published nothing in
every configuration and the client showed nothing lit. The three states are separated here
because collapsing any two of them is how that went unnoticed.

The generator is the batch component of the set: it starts, sweeps one world and stops, so
what a subscriber sees is a ``starting`` and a ``stopping`` rather than a steady pulse. That
it then goes dark is correct and is argued in ``harness_env_generator.heartbeat``.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import local_broker as lb
import pytest
import support
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_env_generator.__main__ import main

COMPONENT = "env_generator"


@pytest.fixture
def broker(tmp_path: Path) -> Iterator[lb.LocalBroker]:
    yield from lb.start_broker(tmp_path)


def _run(
    tmp_path: Path,
    broker: lb.LocalBroker | None,
    *,
    stderr: object = None,
    unreachable: bool = False,
) -> int:
    document = support.small_config()
    if unreachable:
        document["broker"] = lb.unreachable_broker(COMPONENT)
    elif broker is None:
        document.pop("broker", None)
    else:
        document["broker"] = {**document["broker"], "url": broker.url(lb.CONTROL_ROLE)}
    path, _directory = support.write_config(tmp_path, document)
    return main(
        env={"HARNESS_CONFIG": str(path)},
        clock=support.manual_clock(),
        stderr=stderr or io.StringIO(),
    )


@lb.skip_without_broker()
def test_it_publishes_to_the_broker_its_configuration_names(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """Nobody injects a publisher, so the component builds one from its own configuration."""
    collected = lb.observed(broker, lambda: _run(tmp_path, broker))
    assert COMPONENT in collected.components(HEARTBEAT_TOPIC)
    assert {beat["status"] for beat in collected.on(HEARTBEAT_TOPIC)} & {"starting", "stopping"}


def test_a_configuration_naming_no_broker_publishes_nothing_and_says_so(tmp_path: Path) -> None:
    """Constitution VII: no stub, no demo mode. Nothing lights up, which is true."""
    stderr = io.StringIO()
    assert _run(tmp_path, None, stderr=stderr) == 0
    assert "nothing lights up" in stderr.getvalue()


def test_a_named_broker_that_cannot_be_reached_is_reported_and_the_world_is_still_written(
    tmp_path: Path,
) -> None:
    """Reported in full, never swallowed, and never confused with having no broker at all."""
    stderr = io.StringIO()
    assert _run(tmp_path, None, stderr=stderr, unreachable=True) == 0
    report = stderr.getvalue()
    assert "the broker is not reachable" in report
    assert "greyed out in the client rather than falsely lit" in report
    assert "wrote" in report
