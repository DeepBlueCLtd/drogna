"""A composed world outside its physical bounds is refused, and nothing is written.

SRD FR-030. The composition rule is additive and nothing in this harness stops two
anomalies summing to something unphysical, so the bound is the check that catches it. It
refuses rather than clipping, because a clipped field is one its manifest no longer
describes: the parameters would say one thing and the array another, and a recovery error
computed against it would be measuring the clip.
"""

from __future__ import annotations

import copy
import io

import pytest
from harness_env_generator.__main__ import main
from harness_env_generator.errors import BoundsBreachedError
from support import build, manual_clock, small_config, write_config


def test_a_composition_that_drives_salinity_below_zero_is_refused() -> None:
    document = small_config()
    features = document["env_generator"]["features"]
    features["eddy"]["salinity_strength_psu"] = -400.0
    document["env_generator"]["bounds"]["salinity_psu"]["minimum"] = 0.0

    with pytest.raises(BoundsBreachedError) as raised:
        build(document)
    assert raised.value.variable == "salinity_psu"
    assert "salinity_psu" in str(raised.value)
    assert raised.value.point["depth_m"] >= 0.0


def test_a_composition_outside_the_temperature_bounds_is_refused() -> None:
    document = small_config()
    document["env_generator"]["bounds"]["temperature_c"]["maximum"] = 5.0
    with pytest.raises(BoundsBreachedError) as raised:
        build(document)
    assert raised.value.variable == "temperature_c"


def test_a_refusal_leaves_no_output_file_at_all(tmp_path) -> None:
    """SC-008: the whole world is composed in memory before anything is opened for writing."""
    document = copy.deepcopy(small_config())
    document["env_generator"]["bounds"]["temperature_c"]["maximum"] = 5.0
    path, directory = write_config(tmp_path, document)

    stderr = io.StringIO()
    code = main(
        env={"HARNESS_CONFIG": str(path)},
        clock=manual_clock(),
        stderr=stderr,
    )

    assert code == BoundsBreachedError.exit_code
    assert "temperature_c" in stderr.getvalue()
    assert not directory.exists() or list(directory.iterdir()) == []
