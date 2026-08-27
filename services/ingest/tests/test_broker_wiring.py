"""C-05 already had a broker client, and this is the test that it lights a box in the shell.

The ingest client is the one component in this feature's list that was not wired to nothing:
it opens its own subscription on ``obs/#`` and publishes its heartbeat and its telemetry back
over that same connection, so it was already capable of being seen. It was also the one
component nothing asserted that about — every test of it either injected a source or needed a
container — so "already correct" was a claim about the code rather than an observation of it.

The broker here is a real one, started from ``deploy/broker/mosquitto.conf`` and
``deploy/broker/acl``. The client authenticates as ``drogna_ingest``, which the tracked access
control list allows to write ``ctl/heartbeat`` and ``ctl/telemetry`` and nothing else — so a
heartbeat that arrives has been permitted by the real list, not by a test's arrangement.

The observation store is the one thing that is stood in for. It has no bearing on whether the
component can publish, it needs a database this container has not got, and the writer is
tested against a real PostGIS instance in ``tests/integration/``. The stand-in is a connection
that is never used, because with no observations delivered nothing is ever written.
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import local_broker as lb
import pytest
from harness_core.clock import ClockMode, ManualClock, SimInstant
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_ingest.__main__ import main

COMPONENT = "ingest"


class _UnusedConnection:
    """The store, stood in for. Nothing is delivered, so nothing is ever written."""

    def cursor(self) -> Any:  # pragma: no cover - reached only if something is written
        raise AssertionError("nothing was delivered, so nothing should have been written")

    def commit(self) -> None:  # pragma: no cover - as above
        raise AssertionError("nothing was delivered, so nothing should have been committed")

    def rollback(self) -> None:  # pragma: no cover - as above
        raise AssertionError("nothing was delivered, so nothing should have been rolled back")


@pytest.fixture
def broker(tmp_path: Path) -> Iterator[lb.LocalBroker]:
    yield from lb.start_broker(tmp_path)


def _ticks(count: int) -> Iterator[Any]:
    clock = ManualClock(
        run_id="run-broker-wiring",
        epoch=SimInstant.from_iso("2026-01-01T00:00:00.000000Z"),
        tick_interval_us=1_000_000,
        mode=ClockMode.LOCKSTEP,
    )
    return iter([clock.tick(), *(clock.advance() for _ in range(count - 1))])


@lb.skip_without_broker()
def test_the_ingest_client_publishes_its_heartbeat_over_its_own_subscription(
    broker: lb.LocalBroker, tmp_path: Path
) -> None:
    """No source is injected, so the component opens the broker its configuration names."""
    document = lb.component_configuration(COMPONENT, tmp_path, broker=broker, role="drogna_ingest")
    env = lb.written(tmp_path, document, name=COMPONENT)

    with lb.Subscriber(broker, topic="ctl/#") as watcher:
        code = main(
            env=env,
            ticks=_ticks(3),
            connection=_UnusedConnection(),
            stderr=io.StringIO(),
        )
        assert code == 0
        collected = watcher.wait_for(1)

    assert COMPONENT in collected.components(HEARTBEAT_TOPIC)
