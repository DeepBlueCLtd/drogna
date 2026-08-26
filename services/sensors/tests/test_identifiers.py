"""Identifiers are a function of seed and position, and of nothing else.

If this is wrong, AT-04 is wrong: two runs from one root seed would produce stores that
differ in their keys, and redelivery under at-least-once would produce duplicate rows
rather than a no-op. Both failures are silent, which is why they are tested here rather
than trusted.
"""

from __future__ import annotations

import pytest
from harness_core.rng import configure_run, reset_run
from harness_sensors.identifiers import feature_of_interest_id, observation_id

STREAM = "sensors"
ROOT_SEED = 20260826


@pytest.fixture(autouse=True)
def _seeded() -> None:
    configure_run(ROOT_SEED)
    yield
    reset_run()


def test_the_same_seed_and_position_give_the_same_identifier() -> None:
    first = observation_id(STREAM, 41)
    configure_run(ROOT_SEED)
    assert observation_id(STREAM, 41) == first


def test_a_different_root_seed_gives_a_different_identifier() -> None:
    first = observation_id(STREAM, 41)
    configure_run(ROOT_SEED + 1)
    assert observation_id(STREAM, 41) != first


def test_identifiers_do_not_repeat_across_positions() -> None:
    seen = {observation_id(STREAM, ordinal) for ordinal in range(2000)}
    assert len(seen) == 2000


def test_an_identifier_is_shaped_as_the_message_schema_requires() -> None:
    identifier = observation_id(STREAM, 0)
    assert identifier.startswith("obs-")
    assert identifier.replace("obs-", "").isalnum()


def test_a_location_keeps_one_identifier_across_revisits() -> None:
    """Two samples of the same place share a FeatureOfInterest, which is what it means."""
    first = feature_of_interest_id(STREAM, 2, 1, 3)
    assert feature_of_interest_id(STREAM, 2, 1, 3) == first


def test_position_and_depth_do_not_collide() -> None:
    identifiers = {
        feature_of_interest_id(STREAM, position, depth, 3)
        for position in range(8)
        for depth in range(3)
    }
    assert len(identifiers) == 24


def test_a_depth_outside_the_configured_ones_is_refused() -> None:
    with pytest.raises(ValueError, match="outside the 3 configured depths"):
        feature_of_interest_id(STREAM, 0, 3, 3)


def test_drawing_without_a_seed_is_refused() -> None:
    """No fallback to an unseeded generator: a component with no seed has nothing to draw."""
    reset_run()
    with pytest.raises(RuntimeError, match="no root seed has been configured"):
        observation_id(STREAM, 0)
