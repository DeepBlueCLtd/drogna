"""Truth between grid nodes, outside the domain, and without ever opening the field.

AT-01 checks values along a four-dimensional route whose vertices will not land on grid
nodes. That is the case this file is about: the evaluator answers at an arbitrary point by
evaluating the analytic form, not by interpolating an array, and it never opens the field
file to do it.
"""

from __future__ import annotations

import builtins

import pytest
from harness_env_generator.errors import OutOfDomainError
from harness_env_generator.evaluator import Evaluator


def midpoints(manifest):
    grid = manifest["grid"]
    return (
        grid["latitude"]["minimum"] + 0.5 * grid["latitude"]["spacing"],
        grid["longitude"]["minimum"] + 0.5 * grid["longitude"]["spacing"],
        grid["depth"]["minimum"] + 0.5 * grid["depth"]["spacing"],
        grid["time"]["start_offset_seconds"] + 0.5 * grid["time"]["step_seconds"],
    )


def test_a_point_between_grid_nodes_is_finite_and_physical(manifest) -> None:
    evaluator = Evaluator.from_manifest(manifest)
    truth = evaluator.at(*midpoints(manifest))
    for name, value in truth.as_mapping().items():
        assert value == value, name  # not a NaN
        assert abs(value) < float("inf"), name
    assert truth.salinity_psu > 0.0
    assert truth.decorrelation_timescale_s > 0.0
    assert 1400.0 < truth.sound_speed_m_s < 1600.0


def test_the_field_is_continuous_across_a_grid_cell(manifest) -> None:
    """A halving of the step halves the change, which is what continuity looks like here."""
    evaluator = Evaluator.from_manifest(manifest)
    latitude, longitude, depth_m, time_s = midpoints(manifest)
    base = evaluator.at(latitude, longitude, depth_m, time_s)

    coarse = evaluator.at(latitude + 0.02, longitude, depth_m, time_s)
    fine = evaluator.at(latitude + 0.01, longitude, depth_m, time_s)
    coarse_change = abs(coarse.temperature_c - base.temperature_c)
    fine_change = abs(fine.temperature_c - base.temperature_c)
    assert fine_change <= coarse_change + 1e-12
    assert fine_change == pytest.approx(0.5 * coarse_change, rel=0.2)


def test_the_evaluator_opens_no_file(manifest) -> None:
    """FR-017: it evaluates the analytic form the manifest describes, and reads nothing."""
    evaluator = Evaluator.from_manifest(manifest)
    opened: list[object] = []
    original = builtins.open

    def record(*arguments, **keywords):
        opened.append(arguments[0] if arguments else None)
        return original(*arguments, **keywords)

    builtins.open = record
    try:
        for _ in range(50):
            evaluator.at(*midpoints(manifest))
    finally:
        builtins.open = original
    assert opened == []


def test_a_point_outside_the_domain_gets_an_explicit_refusal_not_a_number(manifest) -> None:
    evaluator = Evaluator.from_manifest(manifest)
    latitude, longitude, depth_m, time_s = midpoints(manifest)
    beyond = manifest["grid"]["depth"]["maximum"] + 1.0

    assert not evaluator.contains(latitude, longitude, beyond, time_s)
    with pytest.raises(OutOfDomainError) as raised:
        evaluator.at(latitude, longitude, beyond, time_s)
    assert raised.value.axis == "depth"
    assert raised.value.value == beyond

    with pytest.raises(OutOfDomainError) as raised:
        evaluator.at(
            latitude, longitude, depth_m, manifest["grid"]["time"]["start_offset_seconds"] - 1.0
        )
    assert raised.value.axis == "time"


def test_the_evaluator_offers_nothing_about_which_feature_a_point_belongs_to(manifest) -> None:
    """ADR-0002: consumers see the evaluated field, never the authored per-feature form."""
    evaluator = Evaluator.from_manifest(manifest)
    truth = evaluator.at(*midpoints(manifest))
    assert set(truth.as_mapping()) == {
        "temperature_c",
        "salinity_psu",
        "pressure_dbar",
        "sound_speed_m_s",
        "decorrelation_timescale_s",
    }
    assert not hasattr(truth, "membership")
    assert not hasattr(truth, "features")
