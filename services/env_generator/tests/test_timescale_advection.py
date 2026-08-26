"""The moving feature carries its timescale with it (ADR-0002, SC-005).

The point of the decision recorded in ADR-0002 is that a static map over regions cannot
follow FR-03's drifting feature: the fast-decorrelating patch would stay put while the
water it describes moved away, and the revisit cadence of FR-08 would then be applied to
the wrong water. So what is checked here is displacement — where the shortest timescale is
at one time against where it is at another — and not merely that the field varies with time.

Two settings. First a world in which the drifting feature is the only one with a timescale
that differs from the background, so the shortest timescale is unambiguously its own and
its absolute position can be checked. Then the world the generator actually wrote, where
three other features are also pulling on the field, and what is checked is that the minimum
*moves* by the drift velocity times the elapsed simulation time.
"""

from __future__ import annotations

import copy

import pytest
from harness_env_generator.evaluator import Evaluator, features_from_manifest
from harness_env_generator.features.kernels import LocalPlane
from support import build, small_config

ELAPSED = 3.0 * 3600.0


def isolated_world():
    """A configuration in which only the drifting feature disturbs the timescale field.

    Giving the other three the background timescale is not enough on its own, which is
    worth stating because it is the kind of thing a reader will otherwise try again.
    Membership and timescale are separate: a feature's weight comes from its spatial
    kernel and is unaffected by what timescale it carries. Where the weights sum above
    one the blend normalises by their sum and the background drops out, so a feature
    holding the background timescale still pulls the blend towards itself and still
    moves the minimum. Neutralising the value without neutralising the weight leaves
    the argument of the minimum displaced by the geometry of features that were meant
    to have been taken out of the picture.

    So the eddy and the front are also shrunk to a kilometre and put in the far corner
    of the domain, which is as close to absent as the generator allows — it refuses a
    feature placed outside the domain rather than clipping it, on the ground that a
    clipped feature is one the manifest describes and the field does not contain. The
    thermocline needs no such treatment: its weight is a function of depth alone, so it
    dilutes the field uniformly and cannot displace a horizontal minimum.
    """
    document = copy.deepcopy(small_config())
    section = document["env_generator"]
    background = section["timescale"]["background_seconds"]
    for kind in ("eddy", "front", "thermocline"):
        section["features"][kind]["timescale_seconds"] = background
        section["features"][kind]["jitter"]["timescale_fraction"] = 0.0

    corner_latitude = section["grid"]["latitude"]["minimum"] + 0.1
    corner_longitude = section["grid"]["longitude"]["minimum"] + 0.1

    eddy = section["features"]["eddy"]
    eddy["centre_latitude"] = corner_latitude
    eddy["centre_longitude"] = corner_longitude
    eddy["radius_km"] = 1.0
    eddy["jitter"]["centre_km"] = 0.0

    front = section["features"]["front"]
    front["anchor_latitude"] = corner_latitude
    front["anchor_longitude"] = corner_longitude
    front["sharpness_km"] = 1.0
    front["jitter"]["anchor_km"] = 0.0

    return build(document).manifest


def shortest_timescale_location(evaluator, manifest, time_s, depth_m, *, steps=120):
    grid = manifest["grid"]
    latitudes = _axis(grid["latitude"], steps)
    longitudes = _axis(grid["longitude"], steps)
    best = None
    for latitude in latitudes:
        for longitude in longitudes:
            value = evaluator.timescale_at(latitude, longitude, depth_m, time_s)
            if best is None or value < best[0]:
                best = (value, latitude, longitude)
    return best[1], best[2]


def _axis(axis, steps):
    span = axis["maximum"] - axis["minimum"]
    return [axis["minimum"] + span * index / steps for index in range(steps + 1)]


def moving_entry(manifest):
    return next(entry for entry in manifest["features"] if entry["kind"] == "moving")


def test_the_shortest_timescale_sits_on_the_drifting_feature_and_moves_with_it() -> None:
    manifest = isolated_world()
    evaluator = Evaluator.from_manifest(manifest)
    parameters = moving_entry(manifest)["parameters"]
    depth_m = parameters["depth_centre_m"]
    feature = next(f for f in features_from_manifest(manifest) if f.kind == "moving")

    search_step_km = _search_step_km(manifest)
    for time_s in (0.0, ELAPSED):
        found = shortest_timescale_location(evaluator, manifest, time_s, depth_m)
        expected = feature.centre_at(time_s)
        assert _separation_km(expected, found) <= search_step_km


def test_between_two_times_the_minimum_moves_by_the_drift_times_the_elapsed_time(
    manifest,
) -> None:
    """SC-005, in the world the generator actually wrote, features and all."""
    evaluator = Evaluator.from_manifest(manifest)
    parameters = moving_entry(manifest)["parameters"]
    depth_m = parameters["depth_centre_m"]

    first = shortest_timescale_location(evaluator, manifest, 0.0, depth_m)
    second = shortest_timescale_location(evaluator, manifest, ELAPSED, depth_m)

    plane = LocalPlane(parameters["reference_latitude"])
    days = ELAPSED / 86400.0
    observed_north = plane.north_km(second[0], first[0])
    observed_east = plane.east_km(second[1], first[1])

    cell_km = max(
        manifest["grid"]["latitude"]["spacing"] * 111.19,
        manifest["grid"]["longitude"]["spacing"] * 111.19 * 0.66,
    )
    assert observed_east == pytest.approx(parameters["drift_east_km_per_day"] * days, abs=cell_km)
    assert observed_north == pytest.approx(parameters["drift_north_km_per_day"] * days, abs=cell_km)


def test_the_timescale_at_a_fixed_point_changes_as_the_feature_passes(manifest) -> None:
    """A static map over regions could not do this, which is why ADR-0002 rejected one."""
    evaluator = Evaluator.from_manifest(manifest)
    parameters = moving_entry(manifest)["parameters"]
    depth_m = parameters["depth_centre_m"]
    at_start = evaluator.timescale_at(
        parameters["centre_latitude"], parameters["centre_longitude"], depth_m, 0.0
    )
    later = evaluator.timescale_at(
        parameters["centre_latitude"], parameters["centre_longitude"], depth_m, ELAPSED
    )
    assert later > at_start


def _search_step_km(manifest, steps=120):
    grid = manifest["grid"]
    north = (grid["latitude"]["maximum"] - grid["latitude"]["minimum"]) / steps * 111.19
    east = (grid["longitude"]["maximum"] - grid["longitude"]["minimum"]) / steps * 111.19 * 0.66
    return max(north, east) * 1.5


def _separation_km(first, second):
    plane = LocalPlane(first[0])
    north = plane.north_km(second[0], first[0])
    east = plane.east_km(second[1], first[1])
    return (north**2 + east**2) ** 0.5
