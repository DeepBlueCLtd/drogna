"""The evaluator agrees with the stored field at every grid point, for every variable.

SC-001, and the property everything else rests on. If the manifest were not sufficient —
if anything shaping the field lived only in the generator's internal state — this is where
it would show, because the evaluator reads nothing but the manifest.

The tolerance is the manifest's own, derived from the stored width rather than chosen, so
the comparison has a stated threshold and not one picked until the test passed.
"""

from __future__ import annotations

import pytest
from harness_env_generator.evaluator import VARIABLES, Evaluator


def test_the_stored_field_is_cf_shaped(stored) -> None:
    assert stored.attributes["Conventions"].startswith("CF-")
    assert dict(stored.dimensions).keys() == {"time", "depth", "latitude", "longitude"}
    assert stored.variables["depth"]["attributes"]["positive"] == "down"
    assert stored.variables["latitude"]["attributes"]["standard_name"] == "latitude"
    assert stored.variables["time"]["attributes"]["units"].startswith("seconds since ")
    for spec in VARIABLES:
        written = stored.variables[spec.name]
        assert written["dimensions"] == ("time", "depth", "latitude", "longitude")
        assert written["attributes"]["units"] == spec.units


def test_the_stored_field_says_plainly_that_it_is_synthetic(stored) -> None:
    assert "synthetic" in stored.attributes["comment"].lower()
    assert "fake" in stored.attributes["comment"].lower()


def test_no_attribute_carries_a_creation_time_or_a_library_version(stored, manifest) -> None:
    for entry in manifest["normalised_attributes"]:
        if entry["treatment"] == "omitted":
            assert entry["name"] not in stored.attributes


def test_the_evaluator_agrees_with_the_stored_field_at_every_grid_point(manifest, stored) -> None:
    """SC-001. Every point, every variable, against the manifest's stated tolerance."""
    evaluator = Evaluator.from_manifest(manifest)
    tolerances = {entry["name"]: entry["tolerance_absolute"] for entry in manifest["variables"]}

    times = stored.variables["time"]["values"]
    depths = stored.variables["depth"]["values"]
    latitudes = stored.variables["latitude"]["values"]
    longitudes = stored.variables["longitude"]["values"]

    index = 0
    for time_s in times:
        for depth_m in depths:
            for latitude in latitudes:
                for longitude in longitudes:
                    truth = evaluator.at(latitude, longitude, depth_m, time_s).as_mapping()
                    for spec in VARIABLES:
                        written = stored.variables[spec.name]["values"][index]
                        assert written == pytest.approx(
                            truth[spec.attribute], abs=tolerances[spec.name]
                        ), (spec.name, latitude, longitude, depth_m, time_s)
                    index += 1
    assert index == len(stored.variables["sea_water_temperature"]["values"])


def test_the_axes_are_written_exactly_as_the_manifest_describes_them(manifest, stored) -> None:
    for name in ("latitude", "longitude", "depth"):
        axis = manifest["grid"][name]
        values = stored.variables[name]["values"]
        assert len(values) == axis["count"]
        assert values[0] == pytest.approx(axis["minimum"], abs=1e-12)
        assert values[-1] == pytest.approx(axis["maximum"], abs=1e-12)

    time_axis = manifest["grid"]["time"]
    times = stored.variables["time"]["values"]
    assert len(times) == time_axis["count"]
    assert times[1] - times[0] == pytest.approx(time_axis["step_seconds"], abs=1e-9)


def test_an_evaluator_refuses_a_manifest_from_a_different_analytic_form(manifest) -> None:
    """FR-015: a reader that does not understand the form refuses rather than guessing."""
    import copy

    other = copy.deepcopy(manifest)
    other["generator"]["analytic_form_version"] += 1
    with pytest.raises(ValueError, match="analytic form"):
        Evaluator.from_manifest(other)
