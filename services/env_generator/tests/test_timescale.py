"""The decorrelation timescale is a field, and the blending rule behaves as ADR-0002 needs.

Four properties, each of them a requirement rather than a nicety: finite everywhere,
exactly the background where nothing overlaps, exactly a feature's own timescale at that
feature's centre, and — where two features overlap — between the shortest contributing
timescale and the background, continuously.

The exactness claims are made against purpose-built fields with well-separated features,
because "at that feature's centre" means at the centre of that feature and not at the
centre of a pile of four. The domain-wide claims are made against the world the generator
actually wrote.
"""

from __future__ import annotations

import pytest
from harness_env_generator.evaluator import Evaluator, features_from_manifest
from harness_env_generator.features.eddy import Eddy
from harness_env_generator.timescale import BLENDING_RULE, TimescaleField

BACKGROUND = 259200.0


def eddy(identifier: str, latitude: float, longitude: float, timescale: float) -> Eddy:
    return Eddy(
        identifier=identifier,
        centre_latitude=latitude,
        centre_longitude=longitude,
        radius_km=40.0,
        strength_c=1.0,
        salinity_strength_psu=0.0,
        sign=1,
        depth_centre_m=100.0,
        depth_half_thickness_m=100.0,
        timescale_seconds=timescale,
    )


def test_where_no_feature_overlaps_the_timescale_is_the_background() -> None:
    field = TimescaleField(BACKGROUND, (eddy("a", 49.0, -4.5, 21600.0),))
    assert field.evaluate(60.0, 10.0, 100.0, 0.0) == pytest.approx(BACKGROUND, rel=1e-12)


def test_at_a_features_centre_the_timescale_is_that_features_own() -> None:
    feature = eddy("a", 49.0, -4.5, 21600.0)
    field = TimescaleField(BACKGROUND, (feature,))
    assert field.evaluate(49.0, -4.5, 100.0, 0.0) == pytest.approx(21600.0, rel=1e-12)


def test_where_two_features_overlap_it_lies_between_the_shortest_and_the_background() -> None:
    """The property that makes the rule normalise rather than add without limit."""
    first = eddy("a", 49.0, -4.5, 21600.0)
    second = eddy("b", 49.05, -4.5, 43200.0)
    field = TimescaleField(BACKGROUND, (first, second))

    shortest = min(first.timescale_seconds, second.timescale_seconds)
    for latitude in (49.0, 49.01, 49.02, 49.025, 49.03, 49.04, 49.05):
        value = field.evaluate(latitude, -4.5, 100.0, 0.0)
        assert shortest - 1e-9 <= value <= BACKGROUND + 1e-9, latitude


def test_it_is_continuous_across_a_features_boundary() -> None:
    field = TimescaleField(BACKGROUND, (eddy("a", 49.0, -4.5, 21600.0),))
    step = 0.005
    previous = None
    largest = 0.0
    for index in range(400):
        value = field.evaluate(48.0 + index * step, -4.5, 100.0, 0.0)
        if previous is not None:
            largest = max(largest, abs(value - previous))
        previous = value
    # Over a fifth of a degree the field cannot move by anything like the whole span; a
    # discontinuity would show up here as a jump of the order of the span itself.
    assert largest < 0.02 * (BACKGROUND - 21600.0)


def test_two_overlapping_features_never_produce_a_timescale_shorter_than_either() -> None:
    """Coincident centres are the case the plain additive rule gets wrong."""
    first = eddy("a", 49.0, -4.5, 21600.0)
    second = eddy("b", 49.0, -4.5, 21600.0)
    field = TimescaleField(BACKGROUND, (first, second))
    assert field.evaluate(49.0, -4.5, 100.0, 0.0) == pytest.approx(21600.0, rel=1e-12)


def test_the_timescale_is_finite_and_positive_everywhere_in_the_generated_domain(
    manifest,
) -> None:
    """FR-024: quiet water must be left alone, and the planner scores every cell."""
    evaluator = Evaluator.from_manifest(manifest)
    grid = manifest["grid"]
    background = manifest["timescale"]["background_seconds"]
    shortest = min(entry["timescale_seconds"] for entry in manifest["features"])

    for latitude in _sweep(grid["latitude"], 7):
        for longitude in _sweep(grid["longitude"], 7):
            for depth_m in _sweep(grid["depth"], 5):
                for time_s in _times(grid["time"], 3):
                    value = evaluator.timescale_at(latitude, longitude, depth_m, time_s)
                    assert value == value
                    assert value > 0.0
                    assert shortest - 1e-6 <= value <= background + 1e-6


def test_the_written_field_carries_the_timescale_as_a_variable(stored, manifest) -> None:
    """FR-025: a consumer can obtain it without reading the ground-truth manifest."""
    written = stored.variables["decorrelation_timescale"]
    assert written["attributes"]["units"] == "s"
    assert "standard_name" not in written["attributes"]
    assert min(written["values"]) > 0.0
    assert max(written["values"]) <= manifest["timescale"]["background_seconds"] * 1.000001


def test_the_manifest_records_the_background_the_features_and_the_rule(manifest) -> None:
    """FR-023 and ADR-0002: both the background and every feature's timescale are ground truth."""
    section = manifest["timescale"]
    assert section["background_seconds"] > 0.0
    assert section["background_to_time_step_ratio"] > 0.0
    assert section["blending_rule"]["name"] == BLENDING_RULE
    assert section["blending_rule"]["version"] >= 1
    assert section["blending_rule"]["description"]
    assert section["blending_rule"]["parameters"] == {"normalise_above_unit_weight": True}
    assert section["membership"]["description"]

    authored = {entry["id"]: entry["timescale_seconds"] for entry in manifest["features"]}
    assert len(authored) == 4
    rebuilt = {
        feature.id: feature.timescale_seconds for feature in features_from_manifest(manifest)
    }
    assert rebuilt == authored


def _sweep(axis, count):
    step = (axis["maximum"] - axis["minimum"]) / (count - 1)
    return [axis["minimum"] + step * index for index in range(count)]


def _times(axis, count):
    span = axis["step_seconds"] * (axis["count"] - 1)
    step = span / (count - 1)
    return [axis["start_offset_seconds"] + step * index for index in range(count)]
