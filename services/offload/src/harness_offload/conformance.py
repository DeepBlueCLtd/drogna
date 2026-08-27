"""The CF conformance check, run over every bundle this repository produces.

**Why the check is here and not a package.** The obvious move is an off-the-shelf CF
compliance checker, and the specification assumed one. Two things rule it out. The checkers
worth having read the file through a NetCDF library, and this repository writes the classic
format directly and on purpose (:mod:`harness_core.netcdf`) so that byte-identity does not
depend on a library version — adding the library back to check the file would reintroduce
exactly the dependency the writer exists to avoid. And the standard checkers resolve the CF
standard-name table over the network at run time, which FR-016 forbids and which would make
a build gate depend on the internet.

So the check is written here, over the conventions this export actually claims, and it is
deliberately narrow: it examines the file, not CF in general. What it examines is every rule
the primer says the file follows, which is the property that matters — the check and the
documentation are two statements of one list, and a test asserts they agree. A checker that
covered all of CF and none of what this file claims would pass a file that was wrong in the
way this file can be wrong.

The convention version is not a decoration on this module. It comes from configuration,
:mod:`harness_offload.config` refuses to start if it disagrees with what the writer emits,
and the check refuses to run against a file declaring anything else. A conformance claim
without a version is a claim about nothing.

**What it checks.** The declared conventions and feature type; that both instance variables
declare their ``cf_role``; that the profile instance variables are on the profile dimension
and the sample variables on the sample dimension; that ``row_size`` declares its
``sample_dimension`` and that the row sizes sum to the length of that dimension, which is
what makes the ragged representation readable at all; that ``trajectory_index`` declares its
``instance_dimension``; that the depth coordinate declares ``positive``; that the time
coordinate's units name a reference instant; that every data variable carries a
``standard_name``, ``units`` and a ``coordinates`` attribute naming variables that exist;
and that no attribute anywhere in the file is off the allow-list.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from harness_core.netcdf import NetcdfError, NetcdfFile, read_netcdf

from harness_offload.attributes import offending_value
from harness_offload.version import CONVENTIONS, FEATURE_TYPE
from harness_offload.writer import (
    EXPORTED_VARIABLES,
    PROFILE_DIMENSION,
    SAMPLE_DIMENSION,
    TRAJECTORY_DIMENSION,
)

__all__ = ["check_conformance"]

_PROFILE_INSTANCE_VARIABLES = ("time", "latitude", "longitude")


def check_conformance(
    payload: bytes, *, allowlist: Iterable[str], convention_version: str = CONVENTIONS
) -> list[str]:
    """Every way this file fails to be what it claims. An empty list is conformance."""
    faults: list[str] = []
    try:
        document = read_netcdf(payload)
    except NetcdfError as exc:
        return [f"the bundle is not a readable classic NetCDF file: {exc}"]

    permitted = frozenset(allowlist)

    declared = str(document.attributes.get("Conventions", ""))
    if declared != convention_version:
        faults.append(
            f"the file declares Conventions {declared!r}; the check is pinned to "
            f"{convention_version!r} and will not examine a claim the file does not make"
        )
    if str(document.attributes.get("featureType", "")) != FEATURE_TYPE:
        faults.append(
            f"the file declares featureType {document.attributes.get('featureType')!r}, "
            f"not {FEATURE_TYPE!r}"
        )

    faults.extend(_attribute_faults(document, permitted))
    faults.extend(_structure_faults(document))
    faults.extend(_ragged_faults(document))
    faults.extend(_data_variable_faults(document))
    return faults


def _attribute_faults(document: NetcdfFile, permitted: frozenset[str]) -> list[str]:
    faults: list[str] = []
    scopes: list[tuple[str, dict]] = [("the global attributes", document.attributes)]
    for name, variable in document.variables.items():
        scopes.append((f"variable {name!r}", variable.attributes))
    for where, attributes in scopes:
        for name, value in attributes.items():
            if name not in permitted:
                faults.append(f"{where}: {name!r} is not on the attribute allow-list")
            shape = offending_value(value)
            if shape is not None:
                faults.append(f"{where}: the value of {name!r} contains what looks like {shape}")
    return faults


def _structure_faults(document: NetcdfFile) -> list[str]:
    faults: list[str] = []
    variables = document.variables
    axes = document.axes

    for name, role, dimension in (
        ("trajectory", "trajectory_id", TRAJECTORY_DIMENSION),
        ("profile", "profile_id", PROFILE_DIMENSION),
    ):
        variable = variables.get(name)
        if variable is None:
            faults.append(f"the geometry needs an instance variable {name!r} and there is none")
            continue
        if variable.attributes.get("cf_role") != role:
            faults.append(f"variable {name!r} must declare cf_role = {role!r}")
        if variable.axes != (dimension,):
            faults.append(f"variable {name!r} must be defined on the {dimension!r} dimension")

    for name in _PROFILE_INSTANCE_VARIABLES:
        variable = variables.get(name)
        if variable is None:
            faults.append(f"the geometry needs a per-profile {name!r} and there is none")
            continue
        if variable.axes != (PROFILE_DIMENSION,):
            faults.append(f"variable {name!r} must be one value per profile")
        if "standard_name" not in variable.attributes:
            faults.append(f"variable {name!r} carries no standard_name")
        if "units" not in variable.attributes:
            faults.append(f"variable {name!r} carries no units")

    time = variables.get("time")
    if time is not None:
        units = str(time.attributes.get("units", ""))
        if " since " not in units:
            faults.append(
                "the time coordinate's units must name the instant it is referenced to, as "
                f"'<interval> since <instant>'; it says {units!r}"
            )

    depth = variables.get("depth")
    if depth is None:
        faults.append("the geometry needs a depth coordinate and there is none")
    else:
        if depth.axes != (SAMPLE_DIMENSION,):
            faults.append(f"variable 'depth' must be defined on the {SAMPLE_DIMENSION!r} dimension")
        if depth.attributes.get("positive") not in ("down", "up"):
            faults.append(
                "the depth coordinate must declare its sign convention with positive = "
                "'down' or 'up'; a vertical axis whose direction is implicit is read "
                "upside down by somebody and the reading looks plausible"
            )
    for dimension in (TRAJECTORY_DIMENSION, PROFILE_DIMENSION, SAMPLE_DIMENSION):
        if dimension not in axes:
            faults.append(f"the file declares no {dimension!r} dimension")
    return faults


def _ragged_faults(document: NetcdfFile) -> list[str]:
    faults: list[str] = []
    variables = document.variables
    axes = document.axes

    row_size = variables.get("row_size")
    if row_size is None:
        faults.append(
            "a contiguous ragged representation needs an explicit row-count variable and "
            "there is none; without it the profiles cannot be told apart at all"
        )
    else:
        if row_size.attributes.get("sample_dimension") != SAMPLE_DIMENSION:
            faults.append(
                f"variable 'row_size' must declare sample_dimension = {SAMPLE_DIMENSION!r}"
            )
        if row_size.axes != (PROFILE_DIMENSION,):
            faults.append("variable 'row_size' must be one count per profile")
        total = sum(round(value) for value in row_size.values)
        expected = axes.get(SAMPLE_DIMENSION)
        if expected is not None and total != expected:
            faults.append(
                f"the row sizes sum to {total} but the {SAMPLE_DIMENSION!r} dimension is "
                f"{expected}; a reader walking the rows would run off the end or stop short"
            )
        if any(round(value) < 1 for value in row_size.values):
            faults.append("a profile with no levels is not a profile; every row size is at least 1")

    index = variables.get("trajectory_index")
    if index is None:
        faults.append("the geometry needs a trajectory_index and there is none")
    elif index.attributes.get("instance_dimension") != TRAJECTORY_DIMENSION:
        faults.append(
            f"variable 'trajectory_index' must declare instance_dimension = "
            f"{TRAJECTORY_DIMENSION!r}"
        )
    return faults


def _data_variable_faults(document: NetcdfFile) -> list[str]:
    faults: list[str] = []
    variables = document.variables
    names: Sequence[str] = tuple(name for name, _, _ in EXPORTED_VARIABLES)
    for name in names:
        variable = variables.get(name)
        if variable is None:
            faults.append(f"the export declares {name!r} and the file does not carry it")
            continue
        if variable.axes != (SAMPLE_DIMENSION,):
            faults.append(f"data variable {name!r} must be defined on {SAMPLE_DIMENSION!r}")
        for required in ("standard_name", "units"):
            if required not in variable.attributes:
                faults.append(f"data variable {name!r} carries no {required}")
        coordinates = str(variable.attributes.get("coordinates", ""))
        if not coordinates:
            faults.append(f"data variable {name!r} carries no coordinates attribute")
            continue
        for coordinate in coordinates.split():
            if coordinate not in variables:
                faults.append(
                    f"data variable {name!r} names coordinate {coordinate!r}, which the file "
                    "does not carry"
                )
    return faults
