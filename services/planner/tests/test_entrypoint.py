"""The process starts in the order Constitution IV requires, or it does not start.

One environment variable names one file; that file is read and validated before the clock is
reached, before the coverage store is looked at, before the ground-truth manifest is opened,
and before a single message is consumed. The failures are distinguished by exit code rather
than collapsed, because "no configuration", "no simulation time" and "no timescale field" are
three different things to go and fix.

A planner with no timescale field is a startup failure rather than a cell-by-cell fallback.
ADR-0002 gives this component the right to assume a defined tau everywhere; the price of that
right is that the field has to be there.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from harness_core.config import EXIT_CONFIG_INVALID, EXIT_NO_CONFIG_VARIABLE
from harness_planner.__main__ import main
from harness_planner.publish import PLAN_TOPIC
from planner_support import (
    OneField,
    Recorder,
    Spread,
    Timescales,
    announcement,
    configuration,
    manual_clock,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


def written(tmp_path: Path, document: dict) -> str:
    path = tmp_path / "planner.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return str(path)


def test_no_configuration_variable_stops_the_process_before_anything_else() -> None:
    """The exit is the process exiting, not a value returned: nothing after this may run."""
    stderr = io.StringIO()

    with pytest.raises(SystemExit) as raised:
        main(env={}, stderr=stderr)

    assert raised.value.code == EXIT_NO_CONFIG_VARIABLE
    assert "HARNESS_CONFIG" in stderr.getvalue()


def test_an_invalid_configuration_stops_the_process_with_a_readable_line(tmp_path: Path) -> None:
    stderr = io.StringIO()
    path = written(tmp_path, {"component": {"id": "planner"}})

    with pytest.raises(SystemExit) as raised:
        main(env={"HARNESS_CONFIG": path}, stderr=stderr)

    assert raised.value.code == EXIT_CONFIG_INVALID
    assert path in stderr.getvalue()


def test_a_run_with_a_supplied_clock_field_and_timescale_publishes_a_recommendation(
    tmp_path: Path,
) -> None:
    stderr = io.StringIO()
    recorder = Recorder()

    code = main(
        env={"HARNESS_CONFIG": written(tmp_path, configuration())},
        clock=manual_clock(),
        publisher=recorder,
        fields=OneField(Spread(0.8)),
        timescales=Timescales(),
        messages=[("ctl/run-published", json.dumps(announcement()).encode("utf-8"))],
        stderr=stderr,
    )

    assert code == 0
    published = recorder.on(PLAN_TOPIC)
    assert len(published) == 1
    assert published[0]["kind"] == "sampling-recommendation"


def test_a_run_with_no_publisher_says_so_and_lights_nothing_up(tmp_path: Path) -> None:
    """Constitution VII: publishing nothing is truthful, not a degradation."""
    stderr = io.StringIO()

    code = main(
        env={"HARNESS_CONFIG": written(tmp_path, configuration())},
        clock=manual_clock(),
        fields=OneField(Spread(0.8)),
        timescales=Timescales(),
        stderr=stderr,
    )

    assert code == 0
    assert "no publisher was supplied" in stderr.getvalue()


def test_no_timescale_field_is_a_startup_failure_rather_than_a_fallback(tmp_path: Path) -> None:
    """ADR-0002: there is no constant in this component to substitute for tau."""
    stderr = io.StringIO()
    document = configuration(environment={"directory": str(tmp_path / "absent")})

    code = main(
        env={"HARNESS_CONFIG": written(tmp_path, document)},
        clock=manual_clock(),
        publisher=Recorder(),
        fields=OneField(Spread(0.8)),
        stderr=stderr,
    )

    assert code == 71
    assert "ADR-0002" in stderr.getvalue()
