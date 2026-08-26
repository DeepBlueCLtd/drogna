"""Writing the field: CF-conventions NetCDF, byte-identical, with nothing in it from a host.

**Why the format is written here rather than by a library.** Two runs with one seed must
produce byte-identical files (FR-029, AT-04), and the usual NetCDF writers stamp a
creation time and a library version into the file. Those are precisely the two things that
would break byte-identity, and the first would be a host clock reaching the output of a
component that is forbidden to read one (Constitution I). Writing the classic format
directly — it is a small, stable, published format — removes both at the source rather
than normalising them afterwards, and it removes the dependency on a library version that
would itself have to be pinned for the identity claim to mean anything.

What is written is NetCDF classic (CDF-1): a big-endian header of dimensions, global
attributes and variable definitions, followed by each variable's data at a stated offset.
Only fixed-size variables are used — there is no record dimension — so the layout is a
pure function of the header, and the header is a pure function of the manifest.

**CF conventions.** Coordinate variables carry ``standard_name``, ``units`` and ``axis``;
depth additionally carries ``positive = "down"``, because a vertical axis whose direction
is left implicit will be read upside down by somebody and the reading will look plausible.
Time carries ``units`` of seconds since the origin in simulation time. Data variables carry
``standard_name`` where CF has one and ``long_name`` where it does not.

**Attributes that are normalised.** ``history``, ``date_created`` and any library version
attribute are not written at all. The manifest declares that, in ``normalised_attributes``,
so that a comparison claiming byte-identity is not quietly excluding half the file.
"""

from __future__ import annotations

import contextlib
import hashlib
import os
import struct
import sys
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "NORMALISED_ATTRIBUTES",
    "STORED_DTYPES",
    "FieldWriter",
    "NetcdfVariable",
    "digest_of",
    "encode_netcdf",
    "tolerance_for",
]

_MAGIC = b"CDF\x01"
_NC_CHAR = 2
_NC_INT = 4
_NC_FLOAT = 5
_NC_DOUBLE = 6
_NC_DIMENSION = 10
_NC_VARIABLE = 11
_NC_ATTRIBUTE = 12
_ABSENT = struct.pack(">II", 0, 0)

FORMAT_NAME = "netcdf-classic-cdf1"

STORED_DTYPES: dict[str, tuple[str, int, int]] = {
    "float32": ("f", 4, _NC_FLOAT),
    "float64": ("d", 8, _NC_DOUBLE),
}
"""Stored width to (typecode, size in bytes, NetCDF type). Fixed by config and recorded."""

NORMALISED_ATTRIBUTES: tuple[dict[str, str], ...] = (
    {
        "name": "history",
        "treatment": "omitted",
        "reason": (
            "A history attribute carries the host time at which the file was written, "
            "which would break byte-identity and would be a host clock in the output of "
            "a component forbidden to read one."
        ),
    },
    {
        "name": "date_created",
        "treatment": "omitted",
        "reason": "Same: a creation timestamp is host time, and the generator has none.",
    },
    {
        "name": "netcdf_library_version",
        "treatment": "omitted",
        "reason": (
            "The format is written directly rather than through a library, so there is no "
            "library version to record and none to drift between two runs."
        ),
    },
    {
        "name": "Conventions",
        "treatment": "fixed",
        "reason": "Fixed to the CF version this writer targets, never derived from a tool.",
    },
)

CONVENTIONS = "CF-1.10"

_FLOAT32_ULP_FRACTION = 2.0**-23


def _pad(length: int) -> bytes:
    return b"\x00" * ((4 - length % 4) % 4)


def _encode_name(name: str) -> bytes:
    raw = name.encode("utf-8")
    return struct.pack(">I", len(raw)) + raw + _pad(len(raw))


def _encode_attribute(name: str, value: Any) -> bytes:
    header = _encode_name(name)
    if isinstance(value, str):
        raw = value.encode("utf-8")
        return header + struct.pack(">II", _NC_CHAR, len(raw)) + raw + _pad(len(raw))
    if isinstance(value, bool):
        raise TypeError("a boolean attribute has no NetCDF classic type; write a string")
    if isinstance(value, int):
        return header + struct.pack(">IIi", _NC_INT, 1, value)
    return header + struct.pack(">IId", _NC_DOUBLE, 1, float(value))


def _encode_attributes(attributes: Mapping[str, Any]) -> bytes:
    if not attributes:
        return _ABSENT
    body = b"".join(_encode_attribute(name, value) for name, value in attributes.items())
    return struct.pack(">II", _NC_ATTRIBUTE, len(attributes)) + body


@dataclass
class NetcdfVariable:
    """One variable: its name, type, dimensions, attributes and data."""

    name: str
    nc_type: int
    dimensions: tuple[str, ...]
    values: array
    attributes: dict[str, Any] = field(default_factory=dict)

    def payload(self) -> bytes:
        """The data, big-endian, padded to a four-byte boundary."""
        copy = array(self.values.typecode, self.values)
        if sys.byteorder == "little":
            copy.byteswap()
        raw = copy.tobytes()
        return raw + _pad(len(raw))


def _encode_variable(
    variable: NetcdfVariable, dimension_ids: Mapping[str, int], vsize: int, begin: int
) -> bytes:
    identifiers = b"".join(struct.pack(">I", dimension_ids[name]) for name in variable.dimensions)
    return (
        _encode_name(variable.name)
        + struct.pack(">I", len(variable.dimensions))
        + identifiers
        + _encode_attributes(variable.attributes)
        + struct.pack(">III", variable.nc_type, vsize, begin)
    )


def encode_netcdf(
    dimensions: Sequence[tuple[str, int]],
    global_attributes: Mapping[str, Any],
    variables: Sequence[NetcdfVariable],
) -> bytes:
    """Encode a complete classic NetCDF file. A pure function of its arguments.

    Purity is the point: the same arguments give the same bytes on any host, on any day,
    which is what makes the reproducibility claim of AT-04 checkable rather than hopeful.
    """
    dimension_ids = {name: index for index, (name, _) in enumerate(dimensions)}
    payloads = [variable.payload() for variable in variables]
    sizes = [len(payload) for payload in payloads]

    def header(offsets: Sequence[int]) -> bytes:
        parts = [_MAGIC, struct.pack(">I", 0)]
        if dimensions:
            parts.append(struct.pack(">II", _NC_DIMENSION, len(dimensions)))
            parts.extend(_encode_name(name) + struct.pack(">I", size) for name, size in dimensions)
        else:
            parts.append(_ABSENT)
        parts.append(_encode_attributes(global_attributes))
        if variables:
            parts.append(struct.pack(">II", _NC_VARIABLE, len(variables)))
            parts.extend(
                _encode_variable(variable, dimension_ids, size, offset)
                for variable, size, offset in zip(variables, sizes, offsets, strict=True)
            )
        else:
            parts.append(_ABSENT)
        return b"".join(parts)

    # The header's length does not depend on the offsets it carries — each is a fixed four
    # bytes — so one measuring pass is enough to place the data.
    length = len(header([0] * len(variables)))
    offsets: list[int] = []
    cursor = length
    for size in sizes:
        offsets.append(cursor)
        cursor += size
    return header(offsets) + b"".join(payloads)


def digest_of(payload: bytes) -> str:
    """The SHA-256 digest as the manifest records it."""
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def tolerance_for(magnitude: float, stored_dtype: str) -> float:
    """The absolute tolerance a stored value of this magnitude is entitled to.

    Derived, not chosen. The evaluator computes in double precision and the field stores
    the configured width, so the whole of the disagreement is the rounding of the final
    value: half a unit in the last place at that magnitude, taken here as a whole unit for
    the comparison to have somewhere to stand.
    """
    typecode, _, _ = STORED_DTYPES[stored_dtype]
    if typecode == "d":
        return 0.0
    # A float32 mantissa carries 24 bits, so a unit in the last place at a magnitude x is
    # at most 2**-23 * x. Half of that bounds the rounding; the whole of it is quoted, so
    # a comparison has a little room and no argument about the halving.
    return _FLOAT32_ULP_FRACTION * max(abs(magnitude), 1.0)


class FieldWriter:
    """Writes the field and its manifest so that a reader never sees an inconsistent pair.

    The sequence is: write both documents to sibling partial files and flush them; remove
    any manifest left by a previous run, so no reader can find an old manifest beside a new
    field; rename the field into place; rename the manifest into place. The manifest is
    therefore the completion marker, and the only window that remains is a field with no
    manifest yet — which is the safe direction, because a field with no manifest cannot be
    scored and a reader will wait rather than believe it.
    """

    partial_suffix = ".partial"

    def __init__(self, directory: str, *, field_name: str, manifest_name: str) -> None:
        self.directory = directory
        self.field_name = field_name
        self.manifest_name = manifest_name

    @property
    def field_path(self) -> str:
        return os.path.join(self.directory, self.field_name)

    @property
    def manifest_path(self) -> str:
        return os.path.join(self.directory, self.manifest_name)

    def publish(self, field_payload: bytes, manifest_payload: bytes) -> tuple[str, str]:
        """Write both, then make them visible. Returns the two paths."""
        os.makedirs(self.directory, exist_ok=True)
        field_partial = self.field_path + self.partial_suffix
        manifest_partial = self.manifest_path + self.partial_suffix
        try:
            _write_durably(field_partial, field_payload)
            _write_durably(manifest_partial, manifest_payload)
            # A manifest from a previous run must not survive beside this run's field for
            # even an instant: it would describe a world that is no longer there.
            _remove_if_present(self.manifest_path)
            os.replace(field_partial, self.field_path)
            os.replace(manifest_partial, self.manifest_path)
        finally:
            _remove_if_present(field_partial)
            _remove_if_present(manifest_partial)
        return self.field_path, self.manifest_path


def _write_durably(path: str, payload: bytes) -> None:
    with open(path, "wb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())


def _remove_if_present(path: str) -> None:
    with contextlib.suppress(FileNotFoundError):
        os.remove(path)
