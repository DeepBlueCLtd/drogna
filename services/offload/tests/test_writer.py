"""The exported file: the geometry it declares, and the ragged rows it declares it with.

These are assertions about the file rather than about the writer's internals, because the
file is what a stranger opens. Every one of them is read back out of the encoded bytes by
the same reader a consumer would use.
"""

from __future__ import annotations

import pytest
from harness_core.clock import SimInstant
from harness_monitor.netcdf import read_netcdf
from harness_offload.conformance import check_conformance
from harness_offload.profiles import profiles_from_observations
from harness_offload.version import CONVENTIONS, FEATURE_TYPE
from harness_offload.writer import ExportInputs, encode_bundle
from offload_support import (
    DEFAULT_PROFILES,
    EPOCH,
    ProfileSpec,
    configuration,
    observations_for,
)


def allowlist(tmp_path) -> tuple[str, ...]:
    return tuple(configuration(tmp_path)["offload"]["attributes"]["allowlist"])


def encode(tmp_path, specs=DEFAULT_PROFILES) -> bytes:
    profiles = profiles_from_observations(observations_for(specs))
    epoch = SimInstant.from_iso(EPOCH)
    return encode_bundle(
        ExportInputs(
            bundle_id="b-0123456789abcdef",
            run_reference="0" * 32,
            epoch=epoch,
            window_start=epoch,
            window_end=epoch.plus_micros(7200 * 1_000_000),
            profiles=profiles.profiles,
            allowlist=allowlist(tmp_path),
        )
    )


def test_the_file_declares_the_conventions_and_the_geometry(tmp_path) -> None:
    document = read_netcdf(encode(tmp_path))

    assert document.attributes["Conventions"] == CONVENTIONS
    assert document.attributes["featureType"] == FEATURE_TYPE


def test_both_instance_variables_declare_their_cf_role(tmp_path) -> None:
    """Without these a CF-aware reader cannot tell which variable identifies what."""
    document = read_netcdf(encode(tmp_path))

    assert document.variables["trajectory"].attributes["cf_role"] == "trajectory_id"
    assert document.variables["profile"].attributes["cf_role"] == "profile_id"


def test_each_profile_carries_its_own_time_and_position(tmp_path) -> None:
    document = read_netcdf(encode(tmp_path))

    for name in ("time", "latitude", "longitude"):
        assert document.variables[name].axes == ("profile",)
        assert len(document.variables[name].values) == len(DEFAULT_PROFILES)
    assert document.variables["latitude"].attributes["standard_name"] == "latitude"
    assert document.variables["longitude"].attributes["units"] == "degrees_east"


def test_the_depth_coordinate_declares_which_way_is_down(tmp_path) -> None:
    """A vertical axis with an implicit direction is read upside down and looks plausible."""
    depth = read_netcdf(encode(tmp_path)).variables["depth"]

    assert depth.attributes["positive"] == "down"
    assert depth.attributes["standard_name"] == "depth"
    assert depth.attributes["units"] == "m"


def test_every_data_variable_carries_a_standard_name_and_units(tmp_path) -> None:
    document = read_netcdf(encode(tmp_path))

    for name in ("sea_water_temperature", "sea_water_practical_salinity", "sea_water_pressure"):
        assert document.variables[name].attributes["standard_name"] == name
        assert document.variables[name].attributes["units"]


# ------------------------------------------------------------------------ ragged rows


def test_profiles_of_differing_length_are_written_without_padding(tmp_path) -> None:
    """Five levels, three and one: nineteen values along one sample dimension, not fifteen.

    A rectangular array would be three profiles of five levels, so ten of the fifteen slots
    would hold a fill value that a reader could mistake for a measurement. The ragged form
    holds exactly the nine levels that were measured.
    """
    document = read_netcdf(encode(tmp_path))

    assert [round(value) for value in document.variables["row_size"].values] == [5, 3, 1]
    assert document.axes["obs"] == 9
    assert len(document.variables["depth"].values) == 9
    assert len(document.variables["sea_water_temperature"].values) == 9


def test_the_row_sizes_sum_to_the_sample_dimension(tmp_path) -> None:
    """The property that makes the ragged form readable at all."""
    document = read_netcdf(encode(tmp_path))

    assert (
        sum(round(value) for value in document.variables["row_size"].values)
        == (document.axes["obs"])
    )


def test_the_row_count_variable_names_the_dimension_it_counts(tmp_path) -> None:
    row_size = read_netcdf(encode(tmp_path)).variables["row_size"]

    assert row_size.attributes["sample_dimension"] == "obs"


def test_a_level_missing_one_property_is_dropped_rather_than_filled(tmp_path) -> None:
    """FR-003 in its sharpest form: there is no value to write, so nothing is written."""
    specs = (ProfileSpec(0, 50.0, -4.0, (0.0, 10.0, 20.0), omit=((10.0, "salinity"),)),)
    document = read_netcdf(encode(tmp_path, specs))

    assert [round(value) for value in document.variables["row_size"].values] == [2]
    assert [round(value) for value in document.variables["depth"].values] == [0, 20]


# ----------------------------------------------------------------------- boundary cases


def test_a_bundle_of_one_profile_is_a_bundle(tmp_path) -> None:
    specs = (ProfileSpec(0, 50.0, -4.0, (0.0, 10.0)),)
    document = read_netcdf(encode(tmp_path, specs))

    assert document.axes["profile"] == 1
    assert check_conformance(encode(tmp_path, specs), allowlist=allowlist(tmp_path)) == []


def test_a_profile_of_one_level_is_a_profile(tmp_path) -> None:
    specs = (ProfileSpec(0, 50.0, -4.0, (12.5,)),)
    payload = encode(tmp_path, specs)
    document = read_netcdf(payload)

    assert document.axes["obs"] == 1
    assert [round(value) for value in document.variables["row_size"].values] == [1]
    assert check_conformance(payload, allowlist=allowlist(tmp_path)) == []


def test_a_window_with_no_profiles_writes_nothing_at_all(tmp_path) -> None:
    """Not an empty file: a reader cannot tell an empty bundle from a run that sampled none."""
    epoch = SimInstant.from_iso(EPOCH)

    with pytest.raises(ValueError, match="no profiles"):
        encode_bundle(
            ExportInputs(
                bundle_id="b-0123456789abcdef",
                run_reference="0" * 32,
                epoch=epoch,
                window_start=epoch,
                window_end=epoch.plus_micros(3600 * 1_000_000),
                profiles=(),
                allowlist=allowlist(tmp_path),
            )
        )


# --------------------------------------------------------------------------- time


def test_the_time_axis_is_referenced_to_the_simulation_epoch(tmp_path) -> None:
    """FR-004: the units string of a CF time coordinate is where a host clock would arrive.

    It reaches the numbers in the file while looking like metadata, which is why it is
    asserted against the manifest's epoch and not merely checked for being parseable.
    """
    time = read_netcdf(encode(tmp_path)).variables["time"]

    assert time.attributes["units"] == f"seconds since {EPOCH}"
    assert [round(value) for value in time.values] == [0, 1800, 3600]


def test_no_value_in_the_file_could_be_a_host_clock(tmp_path) -> None:
    """Every time in the file is a small offset from the epoch, not a Unix timestamp.

    A host time leaking in as seconds-since-1970 would be of the order of 1.7e9. The
    profiles span two hours, so anything above a day is not simulation time in this run.
    """
    document = read_netcdf(encode(tmp_path))

    assert all(0 <= value <= 86_400 for value in document.variables["time"].values)
    for name, value in document.attributes.items():
        if name.startswith("time_coverage"):
            assert str(value).startswith("2026-09-01T")


# --------------------------------------------------------------------- conformance


def test_the_produced_bundle_passes_the_conformance_check(tmp_path) -> None:
    assert check_conformance(encode(tmp_path), allowlist=allowlist(tmp_path)) == []


def test_the_check_refuses_a_file_declaring_another_convention_version(tmp_path) -> None:
    """A conformance claim without a version is a claim about nothing."""
    faults = check_conformance(
        encode(tmp_path), allowlist=allowlist(tmp_path), convention_version="CF-1.8"
    )

    assert any("CF-1.8" in fault for fault in faults)
