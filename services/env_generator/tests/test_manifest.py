"""The manifest carries everything FR-012 asks for, and validates against its schema.

This is the document AT-01 and AT-03 score against. A missing field here is not an untidy
document; it is a claim about recovery that cannot be checked.
"""

from __future__ import annotations

import hashlib
import json

import pytest
from harness_core.config import ConfigInvalidError, validate_document
from harness_core.rng import DERIVATION_RULE
from harness_env_generator.manifest import serialise
from harness_env_generator.schemas import MANIFEST_SCHEMA, schema
from harness_env_generator.version import (
    ANALYTIC_FORM_VERSION,
    GENERATOR_NAME,
    GENERATOR_VERSION,
)


def test_the_manifest_validates_against_its_schema(manifest, manifest_schema) -> None:
    validate_document(manifest, manifest_schema, source="manifest")


def test_the_packaged_schemas_match_their_masters_in_contracts() -> None:
    from harness_env_generator import schemas as packaged
    from support import SCHEMA_DIR

    directory = __import__("pathlib").Path(packaged.__file__).parent
    for name in (
        packaged.MANIFEST_SCHEMA,
        packaged.CONFIG_SCHEMA,
        packaged.COMMON_CONFIG_SCHEMA,
    ):
        assert (directory / name).read_bytes() == (SCHEMA_DIR / name).read_bytes()


def test_it_records_the_generator_and_the_analytic_form(manifest) -> None:
    assert manifest["generator"] == {
        "name": GENERATOR_NAME,
        "version": GENERATOR_VERSION,
        "analytic_form_version": ANALYTIC_FORM_VERSION,
    }


def test_it_records_the_seed_the_stream_and_the_order_of_the_draws(manifest, config) -> None:
    seed = manifest["seed"]
    assert seed["root"] == config["seed"]["root"]
    assert seed["stream"] == config["env_generator"]["rng"]["stream"]
    assert seed["derivation"]["rule"] == DERIVATION_RULE
    assert int(seed["derived_entropy"], 16) > 0
    # The order is load-bearing: reordering it changes every world without changing a
    # parameter, so it is recorded rather than left to be inferred from a diff.
    assert len(seed["draw_order"]) == len(set(seed["draw_order"]))
    assert seed["draw_order"][0].endswith("centre_north_km")


def test_it_records_every_section_fr_012_requires(manifest) -> None:
    for section in (
        "schema_version",
        "generator",
        "run_id",
        "config_digest",
        "seed",
        "generated_at",
        "grid",
        "variables",
        "background",
        "pressure_relation",
        "sound_speed",
        "composition",
        "features",
        "timescale",
        "outputs",
        "normalised_attributes",
        "tolerance",
    ):
        assert section in manifest, section

    for axis in ("latitude", "longitude", "depth", "time"):
        assert axis in manifest["grid"]
    assert manifest["grid"]["depth"]["direction"] == "down"
    assert manifest["generated_at"]["sim_time"].endswith("Z")


def test_it_records_each_feature_with_its_parameters_and_its_timescale(manifest) -> None:
    for entry in manifest["features"]:
        assert entry["parameters"]
        assert entry["timescale_seconds"] > 0.0
        assert entry["timescale_to_time_step_ratio"] > 0.0

    eddy = next(entry for entry in manifest["features"] if entry["kind"] == "eddy")
    for name in ("centre_latitude", "centre_longitude", "radius_km", "strength_c"):
        assert name in eddy["parameters"], name

    front = next(entry for entry in manifest["features"] if entry["kind"] == "front")
    for name in ("anchor_latitude", "anchor_longitude", "bearing_degrees", "sharpness_km"):
        assert name in front["parameters"], name

    thermocline = next(entry for entry in manifest["features"] if entry["kind"] == "thermocline")
    assert "depth_m" in thermocline["parameters"]

    moving = next(entry for entry in manifest["features"] if entry["kind"] == "moving")
    assert "drift_east_km_per_day" in moving["parameters"]
    assert "drift_north_km_per_day" in moving["parameters"]


def test_it_records_the_variables_with_units_standard_names_and_tolerances(manifest) -> None:
    names = {entry["name"] for entry in manifest["variables"]}
    assert names == {
        "sea_water_temperature",
        "sea_water_practical_salinity",
        "sea_water_pressure",
        "speed_of_sound_in_sea_water",
        "decorrelation_timescale",
    }
    for entry in manifest["variables"]:
        assert entry["units"]
        assert entry["dtype"] == "float32"
        assert entry["tolerance_absolute"] > 0.0
    timescale = next(
        entry for entry in manifest["variables"] if entry["name"] == "decorrelation_timescale"
    )
    # CF has no standard name for this. Null is stated rather than a name invented.
    assert timescale["standard_name"] is None


def test_it_records_the_digest_of_the_field_that_was_written(manifest, world) -> None:
    digest = "sha256:" + hashlib.sha256(world.field_payload).hexdigest()
    assert manifest["outputs"]["field"]["sha256"] == digest
    assert manifest["outputs"]["manifest"]["name"].endswith("json")


def test_it_declares_the_attributes_normalised_for_reproducibility(manifest) -> None:
    normalised = {entry["name"]: entry for entry in manifest["normalised_attributes"]}
    assert "history" in normalised
    assert normalised["history"]["treatment"] == "omitted"
    for entry in normalised.values():
        assert entry["reason"]


def test_a_manifest_missing_a_required_section_is_refused(manifest, manifest_schema) -> None:
    broken = json.loads(json.dumps(manifest))
    del broken["features"]
    with pytest.raises(ConfigInvalidError):
        validate_document(broken, manifest_schema, source="manifest")


def test_serialisation_is_stable(manifest) -> None:
    assert serialise(manifest) == serialise(json.loads(json.dumps(manifest)))
    assert serialise(manifest).endswith(b"\n")
    assert schema(MANIFEST_SCHEMA)["$id"].endswith("manifest.schema.json")
