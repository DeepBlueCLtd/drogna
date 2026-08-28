"""The model runner connects to the broker its configuration names, and lights a box.

The three states this entry point can start in, each asserted against a real broker started
from ``deploy/broker/mosquitto.conf`` and ``deploy/broker/acl``. Nothing is mocked: the
component authenticates as a real role, the tracked access control list decides whether it
may publish on ``ctl/``, and what it published is read back by a subscriber that is refused
permission to publish anything at all.

Before this feature nothing supplied a publisher, so this component published nothing in
every configuration and the client showed nothing lit. The three states are separated here
because collapsing any two of them is how that went unnoticed.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path

import local_broker as lb
import pytest
import runner_support as support
from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_model_runner.__main__ import main

COMPONENT = "model_runner"


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
    document = lb.component_configuration(COMPONENT, tmp_path, broker=broker)
    if unreachable:
        document["broker"] = lb.unreachable_broker(COMPONENT)
    return main(
        env=lb.written(tmp_path, document, name=COMPONENT),
        clock=_clock(),
        ground_truth=support.ground_truth(),
        # An empty source, supplied deliberately. What these three tests are about is the
        # publishing half — the component connects as a real role and its heartbeat is read
        # back — and a component left to subscribe from its own configuration would block on
        # the broker for the life of the process, which is correct for a service and fatal
        # for a test that asserts an exit code. The subscribing half is asserted where it can
        # be: `libs/harness_core/tests/test_broker_subscription.py` for the transport, and
        # `tests/integration/test_idle_turns_keep_the_loop_alive.py` for the loops it drives.
        messages=(),
        stderr=stderr or io.StringIO(),
    )


def _clock() -> ManualClock:
    return ManualClock(
        run_id="run-broker-wiring",
        epoch=SimInstant.from_iso("2026-01-01T00:00:00.000000Z"),
        tick_interval_us=1_000_000,
        mode=ClockMode.LOCKSTEP,
    )


@lb.skip_without_broker()
def test_it_publishes_to_the_broker_its_configuration_names(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """Nobody injects a publisher, so the component builds one from its own configuration."""
    collected = lb.observed(broker, lambda: _run(tmp_path, broker))
    assert COMPONENT in collected.components(HEARTBEAT_TOPIC)


def test_a_configuration_naming_no_broker_publishes_nothing_and_says_so(tmp_path: Path) -> None:
    """Constitution VII: no stub, no demo mode. Nothing lights up, which is true."""
    stderr = io.StringIO()
    assert _run(tmp_path, None, stderr=stderr) == 0
    assert "nothing lights up" in stderr.getvalue()


def test_a_named_broker_that_cannot_be_reached_is_reported_and_the_run_continues(
    tmp_path: Path,
) -> None:
    """Reported in full, never swallowed, and never confused with having no broker at all."""
    stderr = io.StringIO()
    assert _run(tmp_path, None, stderr=stderr, unreachable=True) == 0
    report = stderr.getvalue()
    assert "the broker is not reachable" in report
    assert "greyed out in the client rather than falsely lit" in report
