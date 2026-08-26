"""The clock as a running component: what it publishes, and what it refuses to.

Four properties are asserted here and each is load-bearing somewhere else in drogna.

Tick values are quantised and a rate change never touches them (FR-006), which is what
makes a replay comparable. A rate of zero stops simulated time and stops nothing else
(ADR-0006), which is what keeps the shell lit through the capture FR-53 exists for.
Pinning and releasing leave the tick sequence unbroken (SC-008). And the run manifest is
enough to resume from, so a clock that restarts does not rewind time.

The lockstep barrier is tested beside them, in ``test_lockstep.py``.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from clock_support import TICK_INTERVAL_US, loaded, service_for, stop_after
from harness_clock.schemas import RUN_MANIFEST_SCHEMA, schema
from harness_clock.service import manifest_path, open_run
from harness_core.clock import CLOCK_TOPIC, ClockControlError, ClockMode, SimInstant
from harness_core.clock_service import ClockEngine
from harness_core.heartbeat import HEARTBEAT_TOPIC
from harness_core.manifest import ExitState, ManifestParticipant, read_manifest


def test_tick_values_are_epoch_plus_n_times_the_interval(tmp_path: Path) -> None:
    service, recorder, _ = service_for(tmp_path)

    service.run(ticks=4)

    epoch = SimInstant.from_iso("2026-01-01T00:00:00.000000Z")
    samples = recorder.on(CLOCK_TOPIC)
    assert [sample["tick"] for sample in samples] == [0, 1, 2, 3]
    assert [sample["sim_time"] for sample in samples] == [
        epoch.plus_micros(index * TICK_INTERVAL_US).iso() for index in range(4)
    ]


def test_a_rate_change_alters_the_pace_and_not_one_tick_value(tmp_path: Path) -> None:
    service, recorder, _ = service_for(tmp_path)

    service.run(ticks=2)
    service.command({"operation": "set_rate", "rate": 50.0})
    service.run(ticks=2)

    samples = recorder.on(CLOCK_TOPIC)
    epoch = SimInstant.from_iso("2026-01-01T00:00:00.000000Z")
    assert [sample["tick"] for sample in samples] == [0, 1, 2, 3]
    assert [sample["sim_time"] for sample in samples] == [
        epoch.plus_micros(index * TICK_INTERVAL_US).iso() for index in range(4)
    ]
    assert samples[-1]["rate"] == 50.0


def test_a_rate_of_zero_stops_simulated_time_and_stops_nothing_else(tmp_path: Path) -> None:
    """ADR-0006, and the reason Constitution I carries its exemption at all.

    Were the heartbeat keyed to ticks, a pinned clock would emit none, every liveness
    window would expire, and FR-53's capture would show an all-grey shell asserting that
    nothing was running. It is keyed to host time, so the clock keeps saying it is alive
    while saying that simulated time is stopped.
    """
    service, recorder, host = service_for(tmp_path)

    service.command({"operation": "set_rate", "rate": 0.0})
    service.run(until=stop_after(8))

    assert recorder.on(CLOCK_TOPIC) == []
    heartbeats = recorder.on(HEARTBEAT_TOPIC)
    assert len(heartbeats) > 1, "a pinned clock still has to say it is alive"
    assert {beat["status"] for beat in heartbeats} <= {"starting", "ok"}
    assert host.value > 0.0, "the heartbeats were spaced by host time, not by ticks"


def test_pinning_and_releasing_leave_the_tick_sequence_unbroken(tmp_path: Path) -> None:
    """SC-008: the tick after release is the successor of the tick before pinning."""
    service, recorder, _ = service_for(tmp_path)

    service.run(ticks=3)
    before = recorder.on(CLOCK_TOPIC)[-1]["tick"]
    service.command({"operation": "pin"})
    service.command({"operation": "pin"})
    service.run(until=stop_after(3))
    service.command({"operation": "release"})
    service.command({"operation": "release"})
    service.run(ticks=1)

    after = recorder.on(CLOCK_TOPIC)[-1]["tick"]
    assert after == before + 1


def test_a_rate_outside_the_bounds_is_refused_and_changes_nothing(tmp_path: Path) -> None:
    service, _, _ = service_for(tmp_path)

    before = service.snapshot()
    with pytest.raises(ClockControlError):
        service.command({"operation": "set_rate", "rate": 1000.0})

    assert service.snapshot() == before


def test_an_unknown_command_names_the_ones_that_exist(tmp_path: Path) -> None:
    service, _, _ = service_for(tmp_path)

    with pytest.raises(ClockControlError) as raised:
        service.command({"operation": "hurry_up"})

    assert "set_rate" in str(raised.value)


def test_the_manifest_records_the_run_and_is_checkpointed(tmp_path: Path) -> None:
    config = loaded(tmp_path)
    section = config.settings.clock_service
    opened = open_run(section, root_seed=config.settings.seed.root)

    document = read_manifest(opened.writer.path, schema=schema(RUN_MANIFEST_SCHEMA))
    assert document.run_id == "run-0001"
    assert document.root_seed == config.settings.seed.root
    assert document.exit_state is ExitState.RUNNING
    assert document.code_revision == "workspace"


def test_a_restart_resumes_the_run_rather_than_rewinding_time(tmp_path: Path) -> None:
    """The edge case the specification names: a clock that restarts must not resume at zero."""
    service, _, _ = service_for(tmp_path)
    service.run(ticks=5)
    service.close(ExitState.COMPLETED, detail="stopped")

    config = loaded(tmp_path)
    resumed = open_run(config.settings.clock_service, root_seed=config.settings.seed.root)

    assert resumed.resumed is True
    assert resumed.index == 4
    assert resumed.settings.run_id == "run-0001"

    engine = ClockEngine(resumed.settings, index=resumed.index)
    assert engine.advance().index == 5, "the successor, never a repeat and never a rewind"


def test_a_manifest_that_cannot_be_read_stops_the_clock_starting(tmp_path: Path) -> None:
    """Refusing is right: a clock that silently rewound time would corrupt every consumer."""
    config = loaded(tmp_path)
    section = config.settings.clock_service
    open_run(section, root_seed=config.settings.seed.root)
    Path(section.manifest.directory, section.manifest.file).write_text("{", encoding="utf-8")

    with pytest.raises(Exception) as raised:
        open_run(section, root_seed=config.settings.seed.root)

    assert "JSON" in str(raised.value) or "valid" in str(raised.value)


def test_a_participants_digest_reaches_the_manifest_through_its_heartbeat(
    tmp_path: Path,
) -> None:
    """FR-021: the manifest records digests, and the configuration itself never travels."""
    service, _, _ = service_for(tmp_path, clock_service={"default_mode": "lockstep"})
    service.command({"operation": "register", "participant": "sensors", "role": "lockstep"})
    service.step()

    digest = "sha256:" + "b" * 64
    recorded = service.observe_heartbeat(
        {"component": "sensors", "sim_time": "x", "status": "ok", "config_digest": digest}
    )

    assert recorded == ManifestParticipant(
        id="sensors",
        role=recorded.role,
        config_digest=digest,
        registered_tick=0,
    )
    path = manifest_path(loaded(tmp_path).settings.clock_service)
    document = read_manifest(str(path), schema=schema(RUN_MANIFEST_SCHEMA))
    assert [participant.config_digest for participant in document.participants] == [digest]


def test_a_heartbeat_from_a_stranger_is_not_recorded(tmp_path: Path) -> None:
    """The manifest lists participants of this run, not everything that made a noise."""
    service, _, _ = service_for(tmp_path)

    assert (
        service.observe_heartbeat({"component": "nobody", "config_digest": "sha256:" + "c" * 64})
        is None
    )


def test_the_mode_reaches_the_published_sample(tmp_path: Path) -> None:
    service, recorder, _ = service_for(tmp_path)
    service.command({"operation": "set_mode", "mode": ClockMode.REALTIME.value})

    service.run(ticks=1)

    assert recorder.on(CLOCK_TOPIC)[0]["mode"] == "realtime"
