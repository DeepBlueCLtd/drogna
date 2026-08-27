"""The export: a CF ``trajectoryProfile`` file, ragged, deterministic, and reticent.

**Why this geometry.** The data is a series of vertical profiles taken at successive
positions along a sampling path. CF's discrete sampling geometries name that exactly:
``trajectoryProfile`` is a trajectory of profiles, where the trajectory is the ordering of
the profiles and nothing more. It is the geometry that fits, and choosing ``profile`` alone
would throw away the ordering while choosing a gridded representation would claim a
regularity the sampling does not have.

The trajectory here is an ordering of measurements. It is not an entity, it carries no
identity between profiles, and there is no heading, speed or platform in the file
(Constitution V). The primer says so in those words, because "trajectory" is a word a
reader can arrive at with the wrong expectation.

**Why ragged.** Bathymetry truncates the deeper profiles, so profiles differ in length. A
rectangular ``profile x level`` array would need a fill value everywhere the seabed came
first, and a fill value is a number: a reader who misses the ``_FillValue`` attribute reads
it as a measurement, and the reading looks plausible. The contiguous ragged representation
stores every level once, end to end along a single sample dimension, with an explicit
``row_size`` per profile. Nothing is padded because there is nothing to pad.

**Why the bytes are stable.** The encoder is a pure function of its arguments
(:mod:`harness_core.netcdf`), so byte-identity is settled by this module writing the same
arguments twice: the dimensions in a fixed order, the variables in a fixed order, the
attributes in a fixed order, and every value derived from the run manifest and the
observations rather than from the environment. No creation time, no library version, no
identifier drawn from entropy. Constitution II's claim is for a fixed code and format
version, and :data:`harness_offload.version.FORMAT_VERSION` is the version it names.

**What the time axis is referenced to.** Seconds since the run's simulation epoch, taken
from the run manifest. Not since 1970, and emphatically not since anything a host clock
supplied: the units string of a CF time coordinate is the one place a host clock reaches
the numbers in a file while looking like metadata (Constitution I, FR-004).
"""

from __future__ import annotations

from array import array
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_core.clock import SimInstant
from harness_core.netcdf import NC_DOUBLE, NC_INT, NetcdfVariable, encode_netcdf

from harness_offload.attributes import checked
from harness_offload.profiles import EXPORTED_PROPERTIES, Profile
from harness_offload.version import CONVENTIONS, FEATURE_TYPE, FORMAT_VERSION

__all__ = [
    "DIMENSIONS",
    "EXPORTED_VARIABLES",
    "VARIABLE_ORDER",
    "ExportInputs",
    "encode_bundle",
]

TRAJECTORY_DIMENSION = "trajectory"
PROFILE_DIMENSION = "profile"
SAMPLE_DIMENSION = "obs"

DIMENSIONS: tuple[str, ...] = (TRAJECTORY_DIMENSION, PROFILE_DIMENSION, SAMPLE_DIMENSION)

_MICROS_PER_SECOND = 1_000_000

# standard_name, units, and the long_name used where CF has no standard name. The order is
# the order the variables are written in, and it is fixed here rather than derived from a
# dictionary iteration so that byte-identity does not depend on insertion order somewhere
# else.
EXPORTED_VARIABLES: tuple[tuple[str, str, str], ...] = (
    ("sea_water_temperature", "sea_water_temperature", "degree_Celsius"),
    ("sea_water_practical_salinity", "sea_water_practical_salinity", "1"),
    ("sea_water_pressure", "sea_water_pressure", "dbar"),
)

VARIABLE_ORDER: tuple[str, ...] = (
    "trajectory",
    "profile",
    "trajectory_index",
    "row_size",
    "time",
    "latitude",
    "longitude",
    "depth",
    *(name for name, _, _ in EXPORTED_VARIABLES),
)


@dataclass(frozen=True)
class ExportInputs:
    """Everything the file is a function of. Nothing else is in scope while writing one."""

    bundle_id: str
    run_reference: str
    epoch: SimInstant
    window_start: SimInstant
    window_end: SimInstant
    profiles: tuple[Profile, ...]
    allowlist: tuple[str, ...]


def _seconds_since(epoch: SimInstant, instant: SimInstant) -> float:
    """Simulation seconds from the epoch, exact in microseconds before the division."""
    return (instant - epoch) / _MICROS_PER_SECOND


def _global_attributes(inputs: ExportInputs) -> dict[str, Any]:
    """What the file says about itself: eight facts, every one of them about the data.

    ``run_reference`` is the only thing here that points outside the file, and it is an
    opaque derivation of the run manifest digest: enough to tie the bundle to a run for
    someone who holds the manifest, and useless to anyone who does not (FR-017).
    """
    return {
        "Conventions": CONVENTIONS,
        "featureType": FEATURE_TYPE,
        "title": "Simulated water-column profiles along a sampling path",
        "summary": (
            "Synthetic data from a learning harness. The numerics are deliberately fake "
            "and the values are produced from a seed; nothing here was measured and "
            "nothing here is advice."
        ),
        "format_version": FORMAT_VERSION,
        "bundle_id": inputs.bundle_id,
        "run_reference": inputs.run_reference,
        "time_coverage_start": inputs.window_start.iso(),
        "time_coverage_end": inputs.window_end.iso(),
    }


def _variable(
    name: str,
    nc_type: int,
    dimensions: tuple[str, ...],
    values: array,
    attributes: Mapping[str, Any],
    *,
    allowlist: Iterable[str],
) -> NetcdfVariable:
    return NetcdfVariable(
        name=name,
        nc_type=nc_type,
        dimensions=dimensions,
        values=values,
        attributes=checked(attributes, allowlist=allowlist, where=f"variable {name!r}"),
    )


def _variables(inputs: ExportInputs) -> list[NetcdfVariable]:
    profiles = inputs.profiles
    allow = inputs.allowlist
    epoch = inputs.epoch

    depths = array("d")
    columns = [array("d") for _ in EXPORTED_PROPERTIES]
    for profile in profiles:
        for level in profile.levels:
            depths.append(level.depth_m)
            for column, value in zip(columns, level.values, strict=True):
                column.append(value)

    variables = [
        _variable(
            "trajectory",
            NC_INT,
            (TRAJECTORY_DIMENSION,),
            array("i", [0]),
            {
                "cf_role": "trajectory_id",
                "long_name": "identifier of the sampling path these profiles are ordered along",
            },
            allowlist=allow,
        ),
        _variable(
            "profile",
            NC_INT,
            (PROFILE_DIMENSION,),
            array("i", range(len(profiles))),
            {
                "cf_role": "profile_id",
                "long_name": "index of the profile within this bundle",
            },
            allowlist=allow,
        ),
        _variable(
            "trajectory_index",
            NC_INT,
            (PROFILE_DIMENSION,),
            array("i", [0] * len(profiles)),
            {
                "long_name": "which sampling path each profile belongs to",
                "instance_dimension": TRAJECTORY_DIMENSION,
            },
            allowlist=allow,
        ),
        _variable(
            "row_size",
            NC_INT,
            (PROFILE_DIMENSION,),
            array("i", [profile.level_count for profile in profiles]),
            {
                "long_name": "number of depth levels in each profile",
                "sample_dimension": SAMPLE_DIMENSION,
            },
            allowlist=allow,
        ),
        _variable(
            "time",
            NC_DOUBLE,
            (PROFILE_DIMENSION,),
            array("d", [_seconds_since(epoch, profile.when) for profile in profiles]),
            {
                "standard_name": "time",
                "units": f"seconds since {epoch.iso()}",
                "axis": "T",
                "long_name": "simulation time at which the profile was sampled",
            },
            allowlist=allow,
        ),
        _variable(
            "latitude",
            NC_DOUBLE,
            (PROFILE_DIMENSION,),
            array("d", [profile.latitude for profile in profiles]),
            {"standard_name": "latitude", "units": "degrees_north", "axis": "Y"},
            allowlist=allow,
        ),
        _variable(
            "longitude",
            NC_DOUBLE,
            (PROFILE_DIMENSION,),
            array("d", [profile.longitude for profile in profiles]),
            {"standard_name": "longitude", "units": "degrees_east", "axis": "X"},
            allowlist=allow,
        ),
        _variable(
            "depth",
            NC_DOUBLE,
            (SAMPLE_DIMENSION,),
            depths,
            {
                "standard_name": "depth",
                "units": "m",
                "axis": "Z",
                # Without this a reader has to guess which way the axis runs, and half of
                # them will guess the other way and plot a plausible upside-down profile.
                "positive": "down",
            },
            allowlist=allow,
        ),
    ]
    coordinates = "time latitude longitude depth"
    for (name, standard_name, units), column in zip(EXPORTED_VARIABLES, columns, strict=True):
        variables.append(
            _variable(
                name,
                NC_DOUBLE,
                (SAMPLE_DIMENSION,),
                column,
                {
                    "standard_name": standard_name,
                    "units": units,
                    "coordinates": coordinates,
                },
                allowlist=allow,
            )
        )
    return variables


def encode_bundle(inputs: ExportInputs) -> bytes:
    """Encode one bundle's NetCDF file. A pure function of :class:`ExportInputs`."""
    if not inputs.profiles:
        raise ValueError(
            "a window with no profiles produces no bundle at all; an empty file would be a "
            "bundle a reader could not distinguish from a run that sampled nothing"
        )
    profiles = inputs.profiles
    dimensions: Sequence[tuple[str, int]] = (
        (TRAJECTORY_DIMENSION, 1),
        (PROFILE_DIMENSION, len(profiles)),
        (SAMPLE_DIMENSION, sum(profile.level_count for profile in profiles)),
    )
    variables = _variables(inputs)
    if [variable.name for variable in variables] != list(VARIABLE_ORDER):
        raise RuntimeError(
            "the writer's variable order and the order it declares in VARIABLE_ORDER have "
            "diverged; the declared order is what the conformance check and the sidecar "
            "manifest are written from, so the two cannot be allowed to drift apart"
        )
    return encode_netcdf(
        dimensions,
        checked(
            _global_attributes(inputs),
            allowlist=inputs.allowlist,
            where="the global attributes",
        ),
        variables,
    )
