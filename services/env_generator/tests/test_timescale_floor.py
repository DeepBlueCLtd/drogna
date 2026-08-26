"""A timescale the time axis cannot express is refused, and the ratio is recorded either way.

FR-031. A decorrelation timescale shorter than a configured multiple of the time step
cannot be represented by the field at all, and a timescale the field cannot represent will
silently mislead the revisit cadence of FR-08. The refusal is at authoring time, before
anything is written.
"""

from __future__ import annotations

import copy
import io

import pytest
from harness_env_generator.__main__ import main
from harness_env_generator.errors import RefusalError
from support import build, manual_clock, small_config, write_config


def test_a_feature_timescale_below_the_floor_is_refused() -> None:
    document = small_config()
    section = document["env_generator"]
    step = section["grid"]["time"]["step_seconds"]
    section["timescale"]["floor_ratio"] = 4.0
    section["features"]["moving"]["timescale_seconds"] = step * 1.5
    section["features"]["moving"]["jitter"]["timescale_fraction"] = 0.0

    with pytest.raises(RefusalError) as raised:
        build(document)
    message = str(raised.value)
    assert "drifter_a" in message
    assert "1.5" in message  # the ratio, so a reader can see how far under it fell
    assert "FR-08" in message


def test_a_background_timescale_below_the_floor_is_refused() -> None:
    document = small_config()
    section = document["env_generator"]
    section["timescale"]["background_seconds"] = section["grid"]["time"]["step_seconds"]
    section["timescale"]["floor_ratio"] = 2.0
    with pytest.raises(RefusalError, match="background"):
        build(document)


def test_the_ratio_is_recorded_in_the_manifest_when_it_passes(manifest) -> None:
    step = manifest["grid"]["time"]["step_seconds"]
    floor = manifest["timescale"]["floor_ratio"]
    assert manifest["timescale"]["background_to_time_step_ratio"] == pytest.approx(
        manifest["timescale"]["background_seconds"] / step, rel=1e-12
    )
    for entry in manifest["features"]:
        ratio = entry["timescale_to_time_step_ratio"]
        assert ratio == pytest.approx(entry["timescale_seconds"] / step, rel=1e-12)
        assert ratio >= floor


def test_a_refusal_writes_nothing(tmp_path) -> None:
    document = copy.deepcopy(small_config())
    section = document["env_generator"]
    section["timescale"]["floor_ratio"] = 100.0
    path, directory = write_config(tmp_path, document)

    stderr = io.StringIO()
    code = main(env={"HARNESS_CONFIG": str(path)}, clock=manual_clock(), stderr=stderr)

    assert code == RefusalError.exit_code
    assert "floor" in stderr.getvalue()
    assert not directory.exists() or list(directory.iterdir()) == []
