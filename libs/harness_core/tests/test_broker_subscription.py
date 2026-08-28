"""The receiving half: what a subscription yields, and what it yields when nothing arrives.

``PahoSubscription`` is the sibling of ``PahoPublisher`` and the thing seven components were
missing. Its transport is paho and needs a broker, which these tests do not have; what they
exercise is everything above the transport — the queue, the idle interval, and the three
states ``resolve_subscriber`` settles a component into — by standing in for ``connect`` and
nothing else.

The idle turn is the part worth testing rather than reading. Before it, a component's loop
woke only when a message arrived, so one watching a quiet branch published a single heartbeat
at start-up and then went silent: alive, working, and greyed out in the client. The test that
matters is therefore the one that asserts something is yielded when *nothing* was published.
"""

from __future__ import annotations

import io
import time  # harness:allow-wallclock ADR-0006, this test measures a real-time cadence
from typing import Any

import pytest
from harness_core.broker import (
    FROM_CONFIGURATION_MESSAGES,
    IDLE,
    BrokerEndpoint,
    PahoSubscription,
    idle_interval,
    resolve_subscriber,
)

IDLE_SECONDS = 0.05
ENDPOINT = BrokerEndpoint(host="127.0.0.1", port=1883, client_id="test")


class _Standing(PahoSubscription):
    """The real subscription with the one method that needs a broker stood in for."""

    def connect(self) -> None:
        self._client = object()

    def deliver(self, topic: str, payload: bytes) -> None:
        self._messages.put((topic, payload))


def _subscription() -> _Standing:
    return _Standing(ENDPOINT, topic="ctl/#")


def test_a_message_is_yielded_as_the_topic_and_payload_it_arrived_as() -> None:
    subscription = _subscription()
    subscription.deliver("ctl/divergence", b"{}")
    assert next(subscription.messages(idle_seconds=IDLE_SECONDS)) == ("ctl/divergence", b"{}")


def test_an_idle_stretch_yields_the_idle_turn_rather_than_waiting_on() -> None:
    """The bug this repairs: a quiet branch used to mean a loop that never turned again."""
    subscription = _subscription()
    began = time.monotonic()
    assert next(subscription.messages(idle_seconds=IDLE_SECONDS)) == IDLE
    assert time.monotonic() - began >= IDLE_SECONDS


def test_the_idle_turn_carries_no_topic_so_no_message_can_be_mistaken_for_one() -> None:
    """MQTT forbids a zero-length topic name, which is what makes the sentinel unambiguous."""
    assert IDLE[0] == ""


def test_without_an_idle_interval_a_subscription_yields_only_what_arrives() -> None:
    subscription = _subscription()
    subscription.deliver("ctl/run-published", b"{}")
    stream = subscription.messages()
    assert next(stream) == ("ctl/run-published", b"{}")


def test_a_supplied_source_is_taken_as_given_and_nothing_is_opened() -> None:
    """Case 1: every test in this repository drives a component this way, empty tuple included."""
    supplied = [("ctl/divergence", b"{}")]
    source, opened = resolve_subscriber(
        supplied, {"broker": {}}, component="scheduler", topic="ctl/#", report=io.StringIO()
    )
    assert list(source) == supplied
    assert opened is None


def test_a_configuration_naming_no_broker_subscribes_to_nothing_and_says_so() -> None:
    """Case 2, Constitution VII: no stub, and the silence has exactly one stated reason."""
    report = io.StringIO()
    source, opened = resolve_subscriber(
        FROM_CONFIGURATION_MESSAGES, {}, component="scheduler", topic="ctl/#", report=report
    )
    assert list(source) == []
    assert opened is None
    assert "reacts to nothing" in report.getvalue()


def test_a_named_broker_that_cannot_be_reached_is_reported_and_is_not_fatal() -> None:
    """Case 3 failing: reported in full, never swallowed, never confused with case 2."""
    report = io.StringIO()
    document: dict[str, Any] = {
        "broker": {"url": "mqtt://role:secret@127.0.0.1:1", "client_id": "scheduler"}
    }
    source, opened = resolve_subscriber(
        FROM_CONFIGURATION_MESSAGES,
        document,
        component="scheduler",
        topic="ctl/#",
        report=report,
    )
    assert list(source) == []
    assert opened is None
    assert "the broker is not reachable" in report.getvalue()


def test_the_idle_interval_is_half_the_declared_heartbeat_cadence() -> None:
    """So a heartbeat is never missed by a whole cadence for want of a turn to publish it in."""
    assert idle_interval(5.0) == 2.5
    assert idle_interval(None) == 2.5
    assert idle_interval(0.0) == 2.5
    with pytest.raises(ValueError, match="positive number of host seconds"):
        idle_interval(-1.0)
