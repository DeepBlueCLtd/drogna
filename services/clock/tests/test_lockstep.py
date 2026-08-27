"""Lockstep: the mode in which drogna claims reproducibility of interleaving.

ADR-0009 added this mode beyond the two the SRD names, and was explicit about its cost: a
participant that dies stalls the clock rather than being outrun. That is the correct
failure for a replay mode — a stalled run is visible, a silently divergent one is not — and
it is what these tests assert. No tick is skipped, no participant is guessed at, and the
snapshot names whoever is holding the clock up (FR-010, FR-011).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from clock_support import service_for, stop_after
from harness_core.clock import CLOCK_TOPIC, ClockControlError
from harness_core.heartbeat import HEARTBEAT_TOPIC


def test_lockstep_waits_for_every_participant_and_names_who_is_holding_it(
    tmp_path: Path,
) -> None:
    """FR-010 and FR-011: no tick is skipped, and a silent participant is visible."""
    service, recorder, _ = service_for(tmp_path, clock_service={"default_mode": "lockstep"})

    service.command({"operation": "register", "participant": "sensors", "role": "lockstep"})
    service.command({"operation": "register", "participant": "ingest", "role": "lockstep"})

    assert service.step() is not None, "the first tick has nothing to wait for"
    assert service.step() is None, "tick 1 waits for both acknowledgements"

    state = service.snapshot()
    assert sorted(state["outstanding"]) == ["ingest", "sensors"]

    service.command({"operation": "acknowledge", "participant": "sensors", "tick": 0})
    assert service.step() is None, "one acknowledgement is not both"
    service.command({"operation": "acknowledge", "participant": "ingest", "tick": 0})
    assert service.step() is not None

    assert [sample["tick"] for sample in recorder.on(CLOCK_TOPIC)] == [0, 1]


def test_an_unregistered_participant_cannot_acknowledge(tmp_path: Path) -> None:
    service, _, _ = service_for(tmp_path, clock_service={"default_mode": "lockstep"})
    service.step()

    with pytest.raises(ClockControlError):
        service.command({"operation": "acknowledge", "participant": "nobody", "tick": 0})


def test_a_stalled_barrier_reports_stalled_once_the_deadline_passes(tmp_path: Path) -> None:
    service, recorder, _ = service_for(
        tmp_path,
        clock_service={"default_mode": "lockstep", "lockstep_deadline_seconds": 1.0},
    )
    service.command({"operation": "register", "participant": "sensors", "role": "lockstep"})
    service.step()

    service.run(until=stop_after(12))

    statuses = [beat["status"] for beat in recorder.on(HEARTBEAT_TOPIC)]
    assert "stalled" in statuses
    stalled = [beat for beat in recorder.on(HEARTBEAT_TOPIC) if beat["status"] == "stalled"]
    assert "sensors" in stalled[0]["detail"]
    assert [sample["tick"] for sample in recorder.on(CLOCK_TOPIC)] == [0]
