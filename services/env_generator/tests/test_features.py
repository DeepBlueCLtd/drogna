"""Each feature is where the manifest says it is, at the scale the manifest says.

These are the parameters AT-03 reports a recovery error against, so what is checked is that
the manifest's numbers really are the field's numbers: an anomaly centred where the centre
is stated, of the amplitude stated, at the scale stated, vanishing far away — and, for the
feature that drifts, at the position its drift velocity and the elapsed simulation time put
it at.
"""

from __future__ import annotations

import math

import pytest
from harness_env_generator.evaluator import features_from_manifest
from harness_env_generator.features.kernels import KM_PER_DEGREE, LocalPlane


def by_kind(manifest):
    return {feature.kind: feature for feature in features_from_manifest(manifest)}


def entry_by_kind(manifest, kind):
    return next(entry for entry in manifest["features"] if entry["kind"] == kind)


def test_the_manifest_carries_exactly_the_four_seeded_features(manifest) -> None:
    kinds = sorted(entry["kind"] for entry in manifest["features"])
    assert kinds == ["eddy", "front", "moving", "thermocline"]
    identifiers = {entry["id"] for entry in manifest["features"]}
    assert len(identifiers) == 4


def test_the_eddy_peaks_at_its_stated_centre_with_its_stated_strength(manifest) -> None:
    eddy = by_kind(manifest)["eddy"]
    parameters = entry_by_kind(manifest, "eddy")["parameters"]
    centre = eddy.anomaly(
        parameters["centre_latitude"],
        parameters["centre_longitude"],
        parameters["depth_centre_m"],
        0.0,
    )
    assert centre.temperature_c == pytest.approx(
        parameters["sign"] * parameters["strength_c"], rel=1e-12
    )


def test_the_eddy_falls_to_the_gaussian_value_at_its_stated_radius(manifest) -> None:
    eddy = by_kind(manifest)["eddy"]
    parameters = entry_by_kind(manifest, "eddy")["parameters"]
    plane = LocalPlane(parameters["centre_latitude"])
    offset = parameters["radius_km"] / KM_PER_DEGREE
    at_radius = eddy.anomaly(
        parameters["centre_latitude"] + offset,
        parameters["centre_longitude"],
        parameters["depth_centre_m"],
        0.0,
    )
    expected = parameters["sign"] * parameters["strength_c"] * math.exp(-0.5)
    assert at_radius.temperature_c == pytest.approx(expected, rel=1e-9)
    assert plane.km_per_degree_longitude > 0.0


def test_the_eddy_vanishes_far_from_its_centre(manifest) -> None:
    eddy = by_kind(manifest)["eddy"]
    parameters = entry_by_kind(manifest, "eddy")["parameters"]
    far = eddy.anomaly(
        parameters["centre_latitude"] + 8.0 * parameters["radius_km"] / KM_PER_DEGREE,
        parameters["centre_longitude"],
        parameters["depth_centre_m"],
        0.0,
    )
    assert abs(far.temperature_c) < 1e-9


def test_the_front_is_zero_on_its_line_and_changes_sign_across_it(manifest) -> None:
    front = by_kind(manifest)["front"]
    parameters = entry_by_kind(manifest, "front")["parameters"]
    on_line = front.anomaly(parameters["anchor_latitude"], parameters["anchor_longitude"], 0.0, 0.0)
    assert on_line.temperature_c == pytest.approx(0.0, abs=1e-12)

    bearing = math.radians(parameters["bearing_degrees"])
    plane = LocalPlane(parameters["anchor_latitude"])
    step_km = parameters["sharpness_km"]
    # Step along the normal, which is the bearing turned a quarter turn clockwise.
    north = plane.latitude_at(parameters["anchor_latitude"], -step_km * math.sin(bearing))
    east = plane.longitude_at(parameters["anchor_longitude"], step_km * math.cos(bearing))
    right = front.anomaly(north, east, 0.0, 0.0)
    north_back = plane.latitude_at(parameters["anchor_latitude"], step_km * math.sin(bearing))
    east_back = plane.longitude_at(parameters["anchor_longitude"], -step_km * math.cos(bearing))
    left = front.anomaly(north_back, east_back, 0.0, 0.0)

    assert right.temperature_c > 0.0 > left.temperature_c
    assert right.temperature_c == pytest.approx(
        parameters["amplitude_c"] * math.tanh(1.0), rel=1e-9
    )
    assert right.temperature_c == pytest.approx(-left.temperature_c, rel=1e-9)


def test_the_thermocline_has_half_its_drop_at_its_stated_depth(manifest) -> None:
    thermocline = by_kind(manifest)["thermocline"]
    parameters = entry_by_kind(manifest, "thermocline")["parameters"]
    at_depth = thermocline.anomaly(49.0, -4.5, parameters["depth_m"], 0.0)
    assert at_depth.temperature_c == pytest.approx(
        -0.5 * parameters["temperature_drop_c"], rel=1e-12
    )

    deep = thermocline.anomaly(
        49.0, -4.5, parameters["depth_m"] + 20.0 * parameters["thickness_m"], 0.0
    )
    assert deep.temperature_c == pytest.approx(-parameters["temperature_drop_c"], rel=1e-9)


def test_the_moving_features_centre_is_its_drift_times_the_elapsed_simulation_time(
    manifest,
) -> None:
    """SRD FR-03: the drift velocity is ground truth, so the position must follow from it."""
    moving = by_kind(manifest)["moving"]
    parameters = entry_by_kind(manifest, "moving")["parameters"]
    plane = LocalPlane(parameters["reference_latitude"])
    elapsed = 3.0 * 3600.0
    days = elapsed / 86400.0

    latitude, longitude = moving.centre_at(elapsed)
    expected_north = parameters["drift_north_km_per_day"] * days
    expected_east = parameters["drift_east_km_per_day"] * days

    assert plane.north_km(latitude, parameters["centre_latitude"]) == pytest.approx(
        expected_north, rel=1e-12
    )
    assert plane.east_km(longitude, parameters["centre_longitude"]) == pytest.approx(
        expected_east, rel=1e-12
    )


def test_the_moving_features_anomaly_moves_with_its_centre(manifest) -> None:
    moving = by_kind(manifest)["moving"]
    parameters = entry_by_kind(manifest, "moving")["parameters"]
    elapsed = 2.0 * 3600.0
    latitude, longitude = moving.centre_at(elapsed)
    peak = moving.anomaly(latitude, longitude, parameters["depth_centre_m"], elapsed)
    assert peak.temperature_c == pytest.approx(
        parameters["sign"] * parameters["strength_c"], rel=1e-12
    )
    stale = moving.anomaly(
        parameters["centre_latitude"],
        parameters["centre_longitude"],
        parameters["depth_centre_m"],
        elapsed,
    )
    assert abs(stale.temperature_c) < abs(peak.temperature_c)


def test_the_manifest_records_how_well_the_grid_resolves_each_feature(manifest) -> None:
    """An under-resolved feature's recovery error can then be interpreted, not just reported."""
    for entry in manifest["features"]:
        resolution = entry["resolution"]
        assert resolution["ratio"] == pytest.approx(
            resolution["scale"] / resolution["grid_spacing"], rel=1e-12
        )
        assert resolution["scale_units"] in {"km", "m"}
