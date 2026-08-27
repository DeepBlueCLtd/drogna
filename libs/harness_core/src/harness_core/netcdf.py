"""The one NetCDF encoder: classic format, written directly, byte-identical by construction.

**Why the format is written here rather than by a library.** Two runs with one seed must
produce byte-identical files (Constitution II, AT-04), and the usual NetCDF writers stamp a
creation time and a library version into the file. Those are precisely the two things that
would break byte-identity, and the first would be a host clock reaching the output of a
component that is forbidden to read one (Constitution I). Writing the classic format
directly — it is a small, stable, published format — removes both at the source rather than
normalising them afterwards, and it removes the dependency on a library version that would
itself have to be pinned for the identity claim to mean anything.

What is written is NetCDF classic (CDF-1): a big-endian header of dimensions, global
attributes and variable definitions, followed by each variable's data at a stated offset.
Only fixed-size variables are used — there is no record dimension — so the layout is a pure
function of the header, and the header is a pure function of its arguments.

**Why it lives in harness_core.** It began in the environment generator, which was the only
component that wrote a field. The model runner became its second consumer and imported it
across a service boundary; the offload packager is the third, and a shape three components
share is a library, not a service's private detail. The alternative — a second encoder in
the third consumer — is how a repository ends up with two definitions of a file format that
agree until the day one of them is corrected.

Nothing above the encoder moved with it. What a *field* is — its normalised attributes, its
stored widths, its tolerance rule and the two-file publication dance — belongs to the
generator that decides those things, and is still in ``harness_env_generator.writer``.
"""

from __future__ import annotations

import struct
import sys
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "FORMAT_NAME",
    "NC_CHAR",
    "NC_DOUBLE",
    "NC_FLOAT",
    "NC_INT",
    "NetcdfVariable",
    "encode_netcdf",
]

_MAGIC = b"CDF\x01"

NC_CHAR = 2
NC_INT = 4
NC_FLOAT = 5
NC_DOUBLE = 6
"""The classic type codes, named so that a caller declaring a variable does not restate them.

They were private to the writer while there was one caller. Three callers restating `6` in
their own modules is the same duplication as three encoders, in miniature.
"""

_NC_DIMENSION = 10
_NC_VARIABLE = 11
_NC_ATTRIBUTE = 12
_ABSENT = struct.pack(">II", 0, 0)

FORMAT_NAME = "netcdf-classic-cdf1"
"""What a manifest calls this format when it records what it wrote."""


def _pad(length: int) -> bytes:
    return b"\x00" * ((4 - length % 4) % 4)


def _encode_name(name: str) -> bytes:
    raw = name.encode("utf-8")
    return struct.pack(">I", len(raw)) + raw + _pad(len(raw))


def _encode_attribute(name: str, value: Any) -> bytes:
    header = _encode_name(name)
    if isinstance(value, str):
        raw = value.encode("utf-8")
        return header + struct.pack(">II", NC_CHAR, len(raw)) + raw + _pad(len(raw))
    if isinstance(value, bool):
        raise TypeError("a boolean attribute has no NetCDF classic type; write a string")
    if isinstance(value, int):
        return header + struct.pack(">IIi", NC_INT, 1, value)
    return header + struct.pack(">IId", NC_DOUBLE, 1, float(value))


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
