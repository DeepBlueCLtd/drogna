"""Generating one world: author it, describe it, evaluate it, then write it.

The order is the argument. The manifest is built *before* the field, and the field is
filled by evaluating that manifest through :class:`~harness_env_generator.evaluator.
Evaluator`. Nothing writes an array by one route and describes it by another. So the
sufficiency FR-013 asks for is not a claim anybody has to remember to keep true: if a
parameter that shapes the field were missing from the document, the field would not have
it either, and the test that compares the two at every grid point would have nothing to
catch — because there would be no second implementation to disagree.

Two things are known only after the sweep and so appear in the manifest afterwards: the
digest of the bytes that were written, and whether the sound speed equation was used
outside its stated range. Neither shapes the field, and neither is read by the evaluator.

Nothing is opened for writing until the whole world is in memory and has passed its bounds
check. A refusal therefore leaves no file behind at all, which is what SC-008 asks for.
"""

from __future__ import annotations

from array import array
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from harness_core.netcdf import NetcdfVariable, encode_netcdf
from harness_core.rng import entropy_for, rng_for
from harness_core.soundspeed import within_validity

from harness_env_generator.evaluator import VARIABLES, Evaluator
from harness_env_generator.features.base import Draws
from harness_env_generator.manifest import (
    UNWRITTEN_FIELD_DIGEST,
    author_world,
    build_manifest,
    validate_manifest,
)
from harness_env_generator.schemas import MANIFEST_SCHEMA, schema
from harness_env_generator.version import ANALYTIC_FORM_VERSION, GENERATOR_NAME, GENERATOR_VERSION
from harness_env_generator.writer import (
    CONVENTIONS,
    STORED_DTYPES,
    digest_of,
)

__all__ = ["GeneratedWorld", "generate"]

_SYNTHETIC = (
    "Synthetic data from a learning harness. The numerics are deliberately fake and the "
    "world is generated from a seed; nothing here was measured and nothing here is "
    "advice. The manifest named in this file records every parameter that produced it."
)
_TITLE = "drogna synthetic environment field"
_PROGRESS_INTERVAL = 4096
"""Points between progress calls. The caller decides whether a heartbeat is due."""
_SUMMARY = (
    "Temperature, salinity and pressure over latitude, longitude, depth and time, with "
    "sound speed derived from them and the decorrelation timescale evaluated as a field."
)


@dataclass(frozen=True)
class GeneratedWorld:
    """A finished world: the bytes of the field, its digest, and the manifest for it."""

    manifest: dict[str, Any]
    field_payload: bytes
    field_digest: str


def generate(
    document: Mapping[str, Any],
    *,
    run_id: str,
    config_digest: str,
    root_seed: int,
    sim_time: str,
    tick: int,
    progress: Callable[[], None] | None = None,
) -> GeneratedWorld:
    """Produce one world from a validated configuration document."""
    section = document["env_generator"]
    stream = str(section["rng"]["stream"])
    draws = Draws(rng_for(stream))
    world = author_world(section, origin_sim_time=sim_time, draws=draws)

    output = section["output"]
    field_name = str(output["field_file"])
    manifest_name = str(output["manifest_file"])
    manifest_schema = schema(MANIFEST_SCHEMA)

    def assemble(
        field_digest: str,
        outside: Mapping[str, Any],
        magnitudes: Mapping[str, float] | None,
    ) -> dict[str, Any]:
        return build_manifest(
            world,
            run_id=run_id,
            config_digest=config_digest,
            root_seed=root_seed,
            stream=stream,
            derived_entropy=entropy_for(stream),
            generated_at_sim_time=sim_time,
            generated_at_tick=tick,
            field_name=field_name,
            manifest_name=manifest_name,
            field_digest=field_digest,
            outside_validity=dict(outside),
            magnitudes=magnitudes,
        )

    unwritten = {"count": 0, "first_point": None}
    draft = assemble(UNWRITTEN_FIELD_DIGEST, unwritten, None)
    validate_manifest(draft, manifest_schema, source=manifest_name)

    evaluator = Evaluator.from_manifest(draft)
    columns, magnitudes, outside = _sweep(evaluator, world, progress)

    payload = encode_netcdf(
        _dimensions(world),
        _global_attributes(
            document,
            world,
            run_id=run_id,
            config_digest=config_digest,
            manifest_name=manifest_name,
            sim_time=sim_time,
        ),
        _variables(world, columns),
    )
    field_digest = digest_of(payload)

    final = assemble(field_digest, outside, magnitudes)
    validate_manifest(final, manifest_schema, source=manifest_name)
    return GeneratedWorld(manifest=final, field_payload=payload, field_digest=field_digest)


def _sweep(
    evaluator: Evaluator, world: Any, progress: Callable[[], None] | None = None
) -> tuple[dict[str, array], dict[str, float], dict[str, Any]]:
    """Fill every variable over the grid, checking bounds and the equation's range as it goes."""
    typecode, _, _ = STORED_DTYPES[world.stored_dtype]
    columns = {spec.name: array(typecode) for spec in VARIABLES}
    magnitudes = {spec.name: 0.0 for spec in VARIABLES}
    outside_count = 0
    first_outside: dict[str, float] | None = None

    for index, (latitude, longitude, depth_m, time_s) in enumerate(world.grid.points()):
        if progress is not None and index % _PROGRESS_INTERVAL == 0:
            progress()
        truth = evaluator.at(latitude, longitude, depth_m, time_s)
        point = {
            "latitude": latitude,
            "longitude": longitude,
            "depth_m": depth_m,
            "time_seconds": time_s,
        }
        world.bounds.check(
            temperature_c=truth.temperature_c,
            salinity_psu=truth.salinity_psu,
            pressure_dbar=truth.pressure_dbar,
            point=point,
        )
        if not within_validity(truth.temperature_c, truth.salinity_psu, depth_m):
            outside_count += 1
            if first_outside is None:
                first_outside = point
        values = truth.as_mapping()
        for spec in VARIABLES:
            value = values[spec.attribute]
            columns[spec.name].append(value)
            if abs(value) > magnitudes[spec.name]:
                magnitudes[spec.name] = abs(value)

    return columns, magnitudes, {"count": outside_count, "first_point": first_outside}


def _dimensions(world: Any) -> list[tuple[str, int]]:
    grid = world.grid
    return [
        ("time", grid.time.count),
        ("depth", grid.depth.count),
        ("latitude", grid.latitude.count),
        ("longitude", grid.longitude.count),
    ]


def _global_attributes(
    document: Mapping[str, Any],
    world: Any,
    *,
    run_id: str,
    config_digest: str,
    manifest_name: str,
    sim_time: str,
) -> dict[str, Any]:
    """What the file says about itself. Nothing here is read from a host or a clock."""
    return {
        "Conventions": CONVENTIONS,
        "title": _TITLE,
        "summary": _SUMMARY,
        "comment": _SYNTHETIC,
        "source": f"{GENERATOR_NAME} {GENERATOR_VERSION}",
        "drogna_component": str(document["component"]["id"]),
        "drogna_run_id": run_id,
        "drogna_config_digest": config_digest,
        "drogna_manifest": manifest_name,
        "drogna_analytic_form_version": ANALYTIC_FORM_VERSION,
        "drogna_generated_sim_time": sim_time,
        "drogna_stored_dtype": world.stored_dtype,
    }


def _variables(world: Any, columns: Mapping[str, array]) -> list[NetcdfVariable]:
    grid = world.grid
    _, _, nc_type = STORED_DTYPES[world.stored_dtype]
    field_dimensions = ("time", "depth", "latitude", "longitude")
    variables = [
        NetcdfVariable(
            name="time",
            nc_type=6,
            dimensions=("time",),
            values=array("d", grid.time.values()),
            attributes={
                "standard_name": "time",
                "long_name": "simulation time",
                "units": f"seconds since {grid.time.origin_sim_time}",
                "axis": "T",
            },
        ),
        NetcdfVariable(
            name="depth",
            nc_type=6,
            dimensions=("depth",),
            values=array("d", grid.depth.values()),
            attributes={
                "standard_name": "depth",
                "long_name": "depth below sea surface",
                "units": grid.depth.units,
                "positive": "down",
                "axis": "Z",
            },
        ),
        NetcdfVariable(
            name="latitude",
            nc_type=6,
            dimensions=("latitude",),
            values=array("d", grid.latitude.values()),
            attributes={
                "standard_name": "latitude",
                "long_name": "latitude",
                "units": grid.latitude.units,
                "axis": "Y",
            },
        ),
        NetcdfVariable(
            name="longitude",
            nc_type=6,
            dimensions=("longitude",),
            values=array("d", grid.longitude.values()),
            attributes={
                "standard_name": "longitude",
                "long_name": "longitude",
                "units": grid.longitude.units,
                "axis": "X",
            },
        ),
    ]
    for spec in VARIABLES:
        attributes: dict[str, Any] = {"long_name": spec.long_name, "units": spec.units}
        if spec.standard_name is not None:
            attributes["standard_name"] = spec.standard_name
        attributes["coordinates"] = "time depth latitude longitude"
        variables.append(
            NetcdfVariable(
                name=spec.name,
                nc_type=nc_type,
                dimensions=field_dimensions,
                values=columns[spec.name],
                attributes=attributes,
            )
        )
    return variables
