"""The small HTTP interface: two routes, and what happens to everything else.

ADR-0009 makes this interface deliberately small — setting the rate, and answering "what
is the time now" for a component starting up or catching up. What is tested here is that
it does those two things, that it refuses the rest legibly, and that the clock port in
``harness_core`` talks to it without either side knowing anything about the other beyond
the configured routes.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest
from clock_support import HostClock, Recorder, free_port, loaded
from harness_clock.http import ClockHTTPServer, serve
from harness_clock.service import ClockService, open_run
from harness_core.clock import (
    ClockEndpoint,
    ClockMode,
    HttpClockControl,
    ParticipantRole,
    RemoteClock,
    TickSource,
)
from harness_core.clock_service import ClockEngine

SNAPSHOT = "/clock/snapshot"
CONTROL = "/clock/control"


class _NoSubscription(TickSource):
    """A port that commands the clock without following its samples."""

    def ticks(self) -> Iterator[Any]:
        return iter(())


@pytest.fixture
def running(tmp_path: Path) -> Iterator[tuple[ClockHTTPServer, ClockService, Recorder]]:
    config = loaded(tmp_path)
    section = config.settings.clock_service
    opened = open_run(section, root_seed=config.settings.seed.root)
    recorder = Recorder()
    host = HostClock()
    service = ClockService(
        ClockEngine(opened.settings, index=opened.index),
        component=config.settings.component.id,
        publisher=recorder,
        heartbeat_interval_seconds=5.0,
        liveness_window_seconds=15.0,
        idle_poll_seconds=section.idle_poll_seconds,
        config_digest=config.digest,
        manifest=opened.writer,
        monotonic=host.monotonic,
        sleep=host.sleep,
    )
    server = serve(
        service,
        host="127.0.0.1",
        port=free_port(),
        snapshot_route=SNAPSHOT,
        control_route=CONTROL,
    )
    # socketserver's shutdown waits for the next poll; a short interval keeps the
    # fixture's teardown from dominating the suite's runtime.
    thread = threading.Thread(target=server.serve_forever, args=(0.02,), daemon=True)
    thread.start()
    try:
        yield server, service, recorder
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _get(server: ClockHTTPServer, route: str) -> dict[str, Any]:
    with urlopen(f"http://127.0.0.1:{server.port}{route}") as response:
        return json.loads(response.read().decode("utf-8"))


def _post(server: ClockHTTPServer, route: str, payload: Any) -> dict[str, Any]:
    request = Request(
        f"http://127.0.0.1:{server.port}{route}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def test_the_snapshot_reports_everything_a_joiner_needs(running) -> None:
    server, service, _ = running
    service.run(ticks=2)

    state = _get(server, SNAPSHOT)

    assert state["run_id"] == "run-0001"
    assert state["tick"] == 1
    assert state["epoch"] == "2026-01-01T00:00:00.000000Z"
    assert state["tick_interval_us"] == 100_000
    assert state["mode"] == "accelerated"
    assert state["sim_time"] == "2026-01-01T00:00:00.100000Z"


def test_the_snapshot_before_the_first_tick_says_so_rather_than_guessing(running) -> None:
    server, _, _ = running

    state = _get(server, SNAPSHOT)

    assert state["tick"] is None
    assert state["sim_time"] is None


def test_setting_the_rate_is_reflected_in_the_state(running) -> None:
    server, _, _ = running

    state = _post(server, CONTROL, {"operation": "set_rate", "rate": 25.0})

    assert state["rate"] == 25.0
    assert _get(server, SNAPSHOT)["rate"] == 25.0


def test_pinning_to_zero_is_a_mode_change_and_releasing_undoes_it(running) -> None:
    """FR-53: a capture holds the whole system still, and both halves are idempotent."""
    server, _, _ = running

    pinned = _post(server, CONTROL, {"operation": "pin"})
    assert pinned["mode"] == "paused"
    assert pinned["rate"] == 0.0
    assert _post(server, CONTROL, {"operation": "pin"})["mode"] == "paused"

    released = _post(server, CONTROL, {"operation": "release"})
    assert released["mode"] == "accelerated"
    assert released["rate"] == 10.0
    assert _post(server, CONTROL, {"operation": "release"})["rate"] == 10.0


def test_a_rate_outside_the_bounds_is_refused_and_the_state_is_unchanged(running) -> None:
    server, _, _ = running
    before = _get(server, SNAPSHOT)

    with pytest.raises(HTTPError) as raised:
        _post(server, CONTROL, {"operation": "set_rate", "rate": -3.0})

    assert raised.value.code == 400
    assert "bounds" in json.loads(raised.value.read().decode("utf-8"))["error"]
    assert _get(server, SNAPSHOT) == before


def test_a_command_that_is_not_json_is_refused_legibly(running) -> None:
    server, _, _ = running
    request = Request(f"http://127.0.0.1:{server.port}{CONTROL}", data=b"{", method="POST")

    with pytest.raises(HTTPError) as raised:
        urlopen(request)

    assert raised.value.code == 400
    assert "JSON" in json.loads(raised.value.read().decode("utf-8"))["error"]


def test_the_snapshot_route_does_not_take_commands(running) -> None:
    """Read and control are separate routes so the proxy can apply policy by prefix."""
    server, _, _ = running

    with pytest.raises(HTTPError) as raised:
        _post(server, SNAPSHOT, {"operation": "pin"})

    assert raised.value.code == 405


def test_an_unknown_route_is_not_part_of_the_interface(running) -> None:
    server, _, _ = running

    with pytest.raises(HTTPError) as raised:
        _get(server, "/clock/ticks")

    assert raised.value.code == 404


def test_no_host_timestamp_is_stamped_on_a_response(running) -> None:
    """The standard library would stamp a Date header. Nothing here needs one."""
    server, _, _ = running

    with urlopen(f"http://127.0.0.1:{server.port}{SNAPSHOT}") as response:
        assert response.headers.get("Date") is None


def test_the_clock_port_catches_up_and_commands_over_this_interface(running) -> None:
    """The port and the service meet through configured routes and nothing else."""
    server, service, _ = running
    service.run(ticks=3)

    endpoint = ClockEndpoint(
        endpoint=f"http://127.0.0.1:{server.port}",
        snapshot_route=SNAPSHOT,
        control_route=CONTROL,
    )
    port = RemoteClock(
        _NoSubscription(),
        HttpClockControl(endpoint),
        endpoint,
        participant_id="sensors",
        role=ParticipantRole.LOCKSTEP,
    )

    state = port.start()

    assert state is not None
    assert state.tick is not None and state.tick.index == 2
    assert port.tick().index == 2
    assert [participant.id for participant in service.state().participants] == ["sensors"]

    port.set_mode(ClockMode.LOCKSTEP)
    port.set_rate(0.0)
    assert service.state().rate == 0.0

    port.acknowledge(2)
    assert service.state().participants[0].acknowledged_tick == 2
