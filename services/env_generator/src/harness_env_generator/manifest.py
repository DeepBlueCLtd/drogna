"""The ground-truth manifest: the document that makes recovery scoreable.

SRD section 10 calls this what turns drogna from a toy into evidence, and it is not
rhetoric. AT-01 checks values along a four-dimensional route and AT-03 reports an eddy
recovery error; both subtract from what this document says. Constitution IX allows no claim
of recovery that is not measured against it. A field without a scoreable manifest is what
SRD section 4 calls unverifiable truth, and producing one is the failure this component
owns.

So the rule the builder follows is blunt: **if a number shapes the field, it is in here.**
Not the configuration it came from — the resolved value, after jitter, in the units the
field uses. The manifest names the grid on all four axes with the direction of the
vertical; the background and its parameters; the pressure relation and its coefficient; the
sound speed equation and the one module that implements it; the composition rule; the four
features with their kind, identifier and every parameter; the decorrelation timescale
background, each feature's timescale, and the rule that blends them; the seed, the stream,
the derived entropy and the exact order the draws were taken in; the generator version and
the analytic form version; the configuration digest; the simulation time of generation; the
digest of the field that was written; and the attributes normalised to make two runs
identical.

Two refusals live here, because both are properties of the authored world rather than of
the arrays:

- **A feature outside the domain.** An eddy centred outside the horizontal extent, or a
  thermocline below the deepest level, is a configuration error. It is rejected, not
  clipped: a clipped feature is one the manifest describes and the field does not contain.
  The moving feature is exempt after time zero — it is *allowed* to drift out, and the
  manifest keeps its position computable — but its initial centre must be inside.
- **A timescale the time axis cannot express.** A decorrelation timescale shorter than the
  configured multiple of the time step cannot be represented by the field, and would
  silently mislead the revisit cadence of FR-08. The ratio is recorded in the manifest
  whether it passes or fails, because a ratio close to the floor is worth seeing.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_core.config import validate_document
from harness_core.rng import DERIVATION_RULE, DERIVATION_VERSION
from harness_core.soundspeed import EQUATION, VALIDITY

from harness_env_generator.background import Background
from harness_env_generator.compose import Bounds, composition_manifest
from harness_env_generator.errors import RefusalError
from harness_env_generator.evaluator import VARIABLES
from harness_env_generator.features.base import Draws, Feature
from harness_env_generator.features.eddy import Eddy
from harness_env_generator.features.front import Front
from harness_env_generator.features.moving import MovingFeature
from harness_env_generator.features.thermocline import Thermocline
from harness_env_generator.grid import Axis, Grid, PressureRelation, TimeAxis
from harness_env_generator.timescale import TimescaleField
from harness_env_generator.version import (
    ANALYTIC_FORM_VERSION,
    GENERATOR_NAME,
    GENERATOR_VERSION,
    MANIFEST_SCHEMA_VERSION,
)
from harness_env_generator.writer import (
    FORMAT_NAME,
    NORMALISED_ATTRIBUTES,
    tolerance_for,
)

__all__ = [
    "SOUND_SPEED_IMPLEMENTATION",
    "UNWRITTEN_FIELD_DIGEST",
    "World",
    "author_world",
    "build_manifest",
    "serialise",
    "validate_manifest",
]

SOUND_SPEED_IMPLEMENTATION = "harness_core.soundspeed"
"""ADR-0005: the single implementation in drogna, named so a residual can cite it."""

UNWRITTEN_FIELD_DIGEST = "sha256:" + "0" * 64
"""Stands in while the field does not exist yet. A document carrying it is never written.

The generator needs a manifest before it has a field, because it fills the grid *through*
the evaluator, and the evaluator reads a manifest. That order is deliberate: it makes the
sufficiency of the manifest (FR-013) structural rather than aspirational, since anything
missing from the document would be missing from the field as well.
"""

_MANIFEST_FORMAT = "json"
_TOLERANCE_BASIS = (
    "one unit in the last place of the stored width, at the variable's largest magnitude"
)
_TOLERANCE_DESCRIPTION = (
    "The evaluator computes in double precision and the field stores the configured "
    "width, so the whole of the disagreement between them is the rounding of the final "
    "value. The tolerance is derived from that width, not chosen, which is what entitles "
    "a comparison to use it."
)


@dataclass(frozen=True)
class World:
    """Everything the manifest describes, in the form the generator holds it."""

    grid: Grid
    background: Background
    pressure: PressureRelation
    features: tuple[Feature, ...]
    timescale: TimescaleField
    bounds: Bounds
    stored_dtype: str
    floor_ratio: float
    draw_order: tuple[str, ...]


def author_world(
    section: Mapping[str, Any],
    *,
    origin_sim_time: str,
    draws: Draws,
) -> World:
    """Build the world from configuration, drawing jitter in one fixed, recorded order.

    The order is: eddy, front, thermocline, moving. Within a feature it is the order its
    own module documents. Changing either changes every world without changing any
    parameter, which is why the order is recorded in the manifest rather than left to be
    inferred from a diff.
    """
    grid_section = section["grid"]
    grid = Grid(
        latitude=Axis.from_config(
            grid_section["latitude"], units="degrees_north", direction="north"
        ),
        longitude=Axis.from_config(
            grid_section["longitude"], units="degrees_east", direction="east"
        ),
        depth=Axis.from_config(grid_section["depth"], units="m", direction="down"),
        time=TimeAxis.from_config(grid_section["time"], origin_sim_time=origin_sim_time),
    )

    features_section = section["features"]
    features: tuple[Feature, ...] = (
        Eddy.author(features_section["eddy"], draws),
        Front.author(features_section["front"], draws),
        Thermocline.author(features_section["thermocline"], draws),
        MovingFeature.author(features_section["moving"], draws),
    )

    timescale_section = section["timescale"]
    timescale = TimescaleField(
        background_seconds=float(timescale_section["background_seconds"]),
        features=features,
    )

    world = World(
        grid=grid,
        background=Background.from_config(section["background"]),
        pressure=PressureRelation.from_config(section["pressure"]),
        features=features,
        timescale=timescale,
        bounds=Bounds.from_config(section["bounds"]),
        stored_dtype=str(section["stored_dtype"]),
        floor_ratio=float(timescale_section["floor_ratio"]),
        draw_order=draws.order,
    )
    _refuse_features_outside_domain(world)
    _refuse_timescales_below_floor(world)
    return world


def _refuse_features_outside_domain(world: World) -> None:
    grid = world.grid
    for feature in world.features:
        for axis, value, extent in _placements(feature, grid):
            if extent.contains(value):
                continue
            raise RefusalError(
                f"feature {feature.id!r} is placed at {axis} {value:.6g}, outside "
                f"[{extent.minimum:.6g}, {extent.maximum:.6g}]. This is a configuration "
                "error and is refused rather than clipped, because a clipped feature is "
                "one the manifest describes and the field does not contain"
            )


def _placements(feature: Feature, grid: Grid) -> Sequence[tuple[str, float, Any]]:
    if isinstance(feature, Eddy):
        # MovingFeature is an Eddy; only its position at the time origin is checked,
        # because drifting out of the domain during the run is allowed and recorded.
        return (
            ("latitude", feature.centre_latitude, grid.latitude),
            ("longitude", feature.centre_longitude, grid.longitude),
            ("depth", feature.depth_centre_m, grid.depth),
        )
    if isinstance(feature, Front):
        return (
            ("latitude", feature.anchor_latitude, grid.latitude),
            ("longitude", feature.anchor_longitude, grid.longitude),
        )
    if isinstance(feature, Thermocline):
        return (("depth", feature.depth_m, grid.depth),)
    return ()


def _refuse_timescales_below_floor(world: World) -> None:
    step = world.grid.time.step_seconds
    floor = world.floor_ratio
    candidates: list[tuple[str, float]] = [
        ("the domain background", world.timescale.background_seconds)
    ]
    candidates.extend(
        (f"feature {feature.id!r}", feature.timescale_seconds) for feature in world.features
    )
    for name, timescale in candidates:
        ratio = timescale / step
        if ratio >= floor:
            continue
        raise RefusalError(
            f"the decorrelation timescale of {name} is {timescale:.6g} s, which is "
            f"{ratio:.4g} times the time step of {step:.6g} s and below the configured "
            f"floor of {floor:.4g}. The field cannot express it, and a timescale the "
            "field cannot express will silently mislead the revisit cadence of FR-08"
        )


def build_manifest(
    world: World,
    *,
    run_id: str,
    config_digest: str,
    root_seed: int,
    stream: str,
    derived_entropy: int,
    generated_at_sim_time: str,
    generated_at_tick: int,
    field_name: str,
    manifest_name: str,
    field_digest: str,
    outside_validity: Mapping[str, Any],
    magnitudes: Mapping[str, float] | None = None,
) -> dict[str, Any]:
    """Assemble the manifest document. Validate it before believing it."""
    largest = dict(magnitudes or {})
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "generator": {
            "name": GENERATOR_NAME,
            "version": GENERATOR_VERSION,
            "analytic_form_version": ANALYTIC_FORM_VERSION,
        },
        "run_id": run_id,
        "config_digest": config_digest,
        "seed": {
            "root": root_seed,
            "stream": stream,
            "derived_entropy": f"{derived_entropy:x}",
            "derivation": {"rule": DERIVATION_RULE, "version": DERIVATION_VERSION},
            "draw_order": list(world.draw_order),
        },
        "generated_at": {"sim_time": generated_at_sim_time, "tick": generated_at_tick},
        "grid": world.grid.as_manifest(),
        "variables": [
            {
                "name": spec.name,
                "standard_name": spec.standard_name,
                "long_name": spec.long_name,
                "units": spec.units,
                "dtype": world.stored_dtype,
                "tolerance_absolute": tolerance_for(
                    largest.get(spec.name, 1.0), world.stored_dtype
                ),
            }
            for spec in VARIABLES
        ],
        "background": world.background.as_manifest(),
        "pressure_relation": world.pressure.as_manifest(),
        "sound_speed": {
            "method": EQUATION,
            "implementation": SOUND_SPEED_IMPLEMENTATION,
            "validity": {
                "min_temperature_c": VALIDITY.min_temperature_c,
                "max_temperature_c": VALIDITY.max_temperature_c,
                "min_salinity_psu": VALIDITY.min_salinity_psu,
                "max_salinity_psu": VALIDITY.max_salinity_psu,
                "min_depth_m": VALIDITY.min_depth_m,
                "max_depth_m": VALIDITY.max_depth_m,
            },
            "outside_validity": dict(outside_validity),
        },
        "composition": composition_manifest(),
        "features": [
            feature.as_manifest(
                resolution=_resolution(feature, world.grid),
                time_step_seconds=world.grid.time.step_seconds,
            )
            for feature in world.features
        ],
        "timescale": world.timescale.as_manifest(
            time_step_seconds=world.grid.time.step_seconds,
            floor_ratio=world.floor_ratio,
        ),
        "outputs": {
            "field": {"name": field_name, "format": FORMAT_NAME, "sha256": field_digest},
            "manifest": {"name": manifest_name, "format": _MANIFEST_FORMAT},
        },
        "normalised_attributes": [dict(entry) for entry in NORMALISED_ATTRIBUTES],
        "tolerance": {
            "basis": _TOLERANCE_BASIS,
            "stored_dtype": world.stored_dtype,
            "description": _TOLERANCE_DESCRIPTION,
        },
    }


def _resolution(feature: Feature, grid: Grid) -> dict[str, Any]:
    scale, units = feature.characteristic_scale()
    spacing = grid.horizontal_spacing_km if units == "km" else grid.vertical_spacing_m
    return {
        "scale": scale,
        "scale_units": units,
        "grid_spacing": spacing,
        "ratio": scale / spacing,
    }


def validate_manifest(
    document: Mapping[str, Any], schema: Mapping[str, Any], *, source: str
) -> None:
    """Validate before writing. A manifest that would not validate never replaces one that did."""
    validate_document(document, schema, source=source)


def serialise(document: Mapping[str, Any]) -> bytes:
    """Stable bytes: sorted keys, fixed indent, trailing newline. Two runs must match."""
    return (json.dumps(document, indent=2, sort_keys=True) + "\n").encode("utf-8")
