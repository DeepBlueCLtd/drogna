"""Helpers the clock's tests share: a configuration, a recorder, and a fake host clock."""

from __future__ import annotations

import json
import socket
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from harness_clock.config import ClockConfig, load
from harness_clock.service import ClockService, open_run
from harness_core.clock_service import ClockEngine

EPOCH_ISO = "2026-01-01T00:00:00.000000Z"
TICK_INTERVAL_US = 100_000


def document(**overrides: Any) -> dict[str, Any]:
    """A valid clock configuration, in the shape both destinations ship."""
    base: dict[str, Any] = {
        "component": {
            "id": "clock",
            "description": "C-01 under test.",
            "heartbeat_interval_seconds": 5.0,
        },
        "clock": {
            "endpoint": "http://clock.invalid:8090",
            "routes": {"snapshot": "/clock/snapshot", "control": "/clock/control"},
            "mode": "accelerated",
            "stale_after_gap": 4,
            "timeout_seconds": 5.0,
        },
        "seed": {"root": 20260826, "stream": "clock"},
        "broker": {"url": "mqtt://broker.invalid:1883", "client_id": "clock"},
        "logging": {"level": "INFO"},
        "clock_service": {
            "bind": {"host": "127.0.0.1", "port": 8090},
            "epoch": EPOCH_ISO,
            "tick_interval_us": TICK_INTERVAL_US,
            "default_mode": "accelerated",
            "default_rate": 10.0,
            "rate_bounds": {"minimum": 0.0, "maximum": 100.0},
            "lockstep_deadline_seconds": 30.0,
            "idle_poll_seconds": 2.0,
            "liveness_window_seconds": 15.0,
            "run": {"id": "run-0001", "code_revision": "workspace", "code_dirty": True},
            "manifest": {"directory": "run", "file": "run-manifest.json"},
        },
    }
    for section, values in overrides.items():
        if isinstance(values, dict) and isinstance(base.get(section), dict):
            base[section] = {**base[section], **values}
        else:
            base[section] = values
    return base


def written(tmp_path: Path, **overrides: Any) -> tuple[dict[str, str], dict[str, Any]]:
    """Write a configuration under ``tmp_path`` and return the environment naming it."""
    content = document(**overrides)
    service = content["clock_service"]
    service["manifest"] = {
        **service["manifest"],
        "directory": str(tmp_path / service["manifest"]["directory"]),
    }
    path = tmp_path / "clock.json"
    path.write_text(json.dumps(content), encoding="utf-8")
    return {"HARNESS_CONFIG": str(path)}, content


def loaded(tmp_path: Path, **overrides: Any) -> ClockConfig:
    """The validated configuration, as the component itself would load it."""
    env, _ = written(tmp_path, **overrides)
    return load(env=env)


def free_port() -> int:
    """A port nothing is listening on.

    The configuration schema will not accept port zero, and rightly: a deployment that
    asked the operating system for any free port could not be reached by name. A test
    still needs one that is free, so it takes one and hands the number to the config.
    """
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


class Recorder:
    """A publisher that keeps what it was given, so a test can read the wire."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, dict[str, Any]]] = []

    def publish(self, topic: str, payload: bytes) -> None:
        self.messages.append((topic, json.loads(payload.decode("utf-8"))))

    def on(self, topic: str) -> list[dict[str, Any]]:
        return [message for name, message in self.messages if name == topic]


class HostClock:
    """A host clock a test advances by hand, so cadence is exact rather than flaky.

    The service reads real time in two places, both of them injected: the driver's
    emission pace and the heartbeat's real-time cadence. Handing both this makes a test of
    ADR-0006 a test rather than a wait.
    """

    def __init__(self) -> None:
        self.value = 0.0

    def monotonic(self) -> float:
        return self.value

    def sleep(self, seconds: float) -> None:
        self.value += max(seconds, 0.0)


def stop_after(count: int) -> Callable[[], bool]:
    """An ``until`` predicate that lets the loop turn ``count`` times."""
    turns = {"n": 0}

    def until() -> bool:
        turns["n"] += 1
        return turns["n"] > count

    return until


def instants(messages: list[dict[str, Any]]) -> list[tuple[int, str]]:
    return [(message["tick"], message["sim_time"]) for message in messages]


def is_iso_micros(value: str) -> bool:
    """ISO-8601 UTC to microsecond precision, as FR-016 requires at every boundary."""
    return value.endswith("Z") and len(value.split(".")[-1]) == len("000000Z")


def sections(content: Mapping[str, Any]) -> Mapping[str, Any]:
    return content["clock_service"]


def service_for(tmp_path: Path, **overrides: Any) -> tuple[ClockService, Recorder, HostClock]:
    """A clock service reading a scratch configuration, with both host clocks in hand.

    Real time enters this component in exactly two places — the driver's emission pace and
    the heartbeat's cadence — and both are injected, so what would otherwise be a test that
    waits is a test that asserts.
    """
    config = loaded(tmp_path, **overrides)
    section = config.settings.clock_service
    opened = open_run(section, root_seed=config.settings.seed.root)
    recorder = Recorder()
    host = HostClock()
    service = ClockService(
        ClockEngine(opened.settings, index=opened.index),
        component=config.settings.component.id,
        publisher=recorder,
        heartbeat_interval_seconds=config.settings.component.heartbeat_interval_seconds or 5.0,
        liveness_window_seconds=section.liveness_window_seconds,
        idle_poll_seconds=section.idle_poll_seconds,
        config_digest=config.digest,
        manifest=opened.writer,
        monotonic=host.monotonic,
        sleep=host.sleep,
    )
    return service, recorder, host
