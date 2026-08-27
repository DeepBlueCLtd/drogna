"""Reading a coverage file: NetCDF classic, decoded here rather than by a library.

The environment generator writes NetCDF classic (CDF-1) directly, for reasons its
``writer`` module sets out: byte-identical output, and no library stamping a host clock into
the file. This is the matching reader, and it is written here for a narrower reason. The
query layer's image installs pygeoapi, which pins a Pydantic major version the repository's
type-generation chain cannot use, so the workspace that runs these tests carries neither
pygeoapi nor an array stack. A reader with no dependencies is one that can be tested by the
same command that tests everything else.

What is supported is what the harness writes: fixed-size variables, no record dimension,
big-endian, the five classic types. A file using anything else is refused by name rather
than half-read, because a coverage silently missing a variable is a response that looks
complete.

The coverage output is a genuine port — NetCDF today, Zarr plausibly later — so this module
is deliberately the only one that knows the format. Everything above it sees axes, variable
names and a value-at-index function.
"""

from __future__ import annotations

import struct
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from plugins.errors import CoverageStoreError

__all__ = ["NetcdfDataset", "NetcdfVariableData", "read_netcdf"]

_MAGIC = b"CDF\x01"
_NC_BYTE = 1
_NC_CHAR = 2
_NC_SHORT = 3
_NC_INT = 4
_NC_FLOAT = 5
_NC_DOUBLE = 6
_NC_DIMENSION = 10
_NC_VARIABLE = 11
_NC_ATTRIBUTE = 12

# NetCDF type to (struct format character, width in bytes). The two-byte types are here
# because the format has them, not because the harness writes them.
_TYPES: dict[int, tuple[str, int]] = {
    _NC_BYTE: ("b", 1),
    _NC_CHAR: ("c", 1),
    _NC_SHORT: ("h", 2),
    _NC_INT: ("i", 4),
    _NC_FLOAT: ("f", 4),
    _NC_DOUBLE: ("d", 8),
}


@dataclass(frozen=True)
class NetcdfVariableData:
    """One variable: its dimensions, its attributes and its values in row-major order."""

    name: str
    dimensions: tuple[str, ...]
    attributes: Mapping[str, Any]
    values: Sequence[float]
    shape: tuple[int, ...]

    def at(self, index: Sequence[int]) -> float:
        """The value at a multidimensional index, row-major."""
        offset = 0
        for extent, position in zip(self.shape, index, strict=True):
            offset = offset * extent + position
        return float(self.values[offset])


@dataclass(frozen=True)
class NetcdfDataset:
    """A whole file: its dimensions, its global attributes and its variables."""

    dimensions: Mapping[str, int]
    attributes: Mapping[str, Any]
    variables: Mapping[str, NetcdfVariableData]

    def require(self, name: str, *, source: str) -> NetcdfVariableData:
        """A variable by name, or a refusal naming the file and what it holds instead."""
        try:
            return self.variables[name]
        except KeyError:
            present = ", ".join(sorted(self.variables)) or "nothing"
            raise CoverageStoreError(
                f"{source} carries no variable named {name!r}; it holds {present}"
            ) from None

    def axis(self, name: str, *, source: str) -> list[float]:
        """A one-dimensional coordinate variable's values, checked for being one."""
        variable = self.require(name, source=source)
        if len(variable.shape) != 1:
            raise CoverageStoreError(
                f"{source}: {name!r} is used as an axis but has "
                f"{len(variable.shape)} dimensions, not one"
            )
        return [float(value) for value in variable.values]


class _Cursor:
    """A read position in the header. Every read is bounds-checked and says where it was."""

    def __init__(self, payload: bytes, source: str) -> None:
        self._payload = payload
        self._source = source
        self.offset = 0

    def take(self, count: int) -> bytes:
        end = self.offset + count
        if end > len(self._payload):
            raise CoverageStoreError(
                f"{self._source}: the header ends at byte {len(self._payload)} but a field "
                f"beginning at {self.offset} needs {count} bytes; the file is truncated"
            )
        chunk = self._payload[self.offset : end]
        self.offset = end
        return chunk

    def uint32(self) -> int:
        return int(struct.unpack(">I", self.take(4))[0])

    def padded(self, length: int) -> bytes:
        raw = self.take(length)
        self.take((4 - length % 4) % 4)
        return raw

    def name(self) -> str:
        return self.padded(self.uint32()).decode("utf-8")


def _values(cursor: _Cursor, nc_type: int, count: int, source: str) -> Any:
    try:
        code, width = _TYPES[nc_type]
    except KeyError:
        raise CoverageStoreError(
            f"{source}: NetCDF type {nc_type} is not one this reader decodes"
        ) from None
    raw = cursor.padded(count * width)
    if nc_type == _NC_CHAR:
        return raw.decode("utf-8")
    decoded = array(code)
    decoded.frombytes(raw)
    decoded.byteswap()  # the format is big-endian; every host this runs on is not
    return list(decoded)


def _attributes(cursor: _Cursor, source: str) -> dict[str, Any]:
    tag = cursor.uint32()
    count = cursor.uint32()
    if tag == 0 and count == 0:
        return {}
    if tag != _NC_ATTRIBUTE:
        raise CoverageStoreError(f"{source}: expected an attribute list, found tag {tag}")
    attributes: dict[str, Any] = {}
    for _ in range(count):
        name = cursor.name()
        nc_type = cursor.uint32()
        length = cursor.uint32()
        decoded = _values(cursor, nc_type, length, source)
        attributes[name] = decoded if isinstance(decoded, str) or length != 1 else decoded[0]
    return attributes


def _dimensions(cursor: _Cursor, source: str) -> list[tuple[str, int]]:
    tag = cursor.uint32()
    count = cursor.uint32()
    if tag == 0 and count == 0:
        return []
    if tag != _NC_DIMENSION:
        raise CoverageStoreError(f"{source}: expected a dimension list, found tag {tag}")
    dimensions: list[tuple[str, int]] = []
    for _ in range(count):
        name = cursor.name()
        extent = cursor.uint32()
        if extent == 0:
            raise CoverageStoreError(
                f"{source}: dimension {name!r} is the record dimension, which this reader "
                f"does not decode; the harness writes fixed-size variables only"
            )
        dimensions.append((name, extent))
    return dimensions


def read_netcdf(payload: bytes, *, source: str) -> NetcdfDataset:
    """Decode a classic NetCDF file. ``source`` names the file in any refusal."""
    if payload[:4] != _MAGIC:
        raise CoverageStoreError(
            f"{source}: not a classic NetCDF file — the first four bytes are "
            f"{payload[:4]!r}, not {_MAGIC!r}"
        )
    cursor = _Cursor(payload, source)
    cursor.take(4)
    if cursor.uint32() != 0:
        raise CoverageStoreError(f"{source}: declares record variables, which are not decoded")

    dimensions = _dimensions(cursor, source)
    extents = dict(dimensions)
    order = [name for name, _ in dimensions]
    global_attributes = _attributes(cursor, source)

    tag = cursor.uint32()
    count = cursor.uint32()
    if tag == 0 and count == 0:
        return NetcdfDataset(extents, global_attributes, {})
    if tag != _NC_VARIABLE:
        raise CoverageStoreError(f"{source}: expected a variable list, found tag {tag}")

    variables: dict[str, NetcdfVariableData] = {}
    for _ in range(count):
        name = cursor.name()
        rank = cursor.uint32()
        identifiers = [cursor.uint32() for _ in range(rank)]
        attributes = _attributes(cursor, source)
        nc_type = cursor.uint32()
        cursor.uint32()  # vsize, recomputed from the shape rather than trusted
        begin = cursor.uint32()

        try:
            names = tuple(order[identifier] for identifier in identifiers)
        except IndexError:
            raise CoverageStoreError(
                f"{source}: variable {name!r} names a dimension that is not declared"
            ) from None
        shape = tuple(extents[dimension] for dimension in names)
        length = 1
        for extent in shape:
            length *= extent

        code, width = _TYPES.get(nc_type, ("", 0))
        if not code or nc_type == _NC_CHAR:
            raise CoverageStoreError(
                f"{source}: variable {name!r} has NetCDF type {nc_type}, which is not a "
                f"numeric type this reader decodes"
            )
        end = begin + length * width
        if end > len(payload):
            raise CoverageStoreError(
                f"{source}: variable {name!r} claims data to byte {end} but the file is "
                f"{len(payload)} bytes; it is truncated"
            )
        decoded = array(code)
        decoded.frombytes(payload[begin:end])
        decoded.byteswap()
        variables[name] = NetcdfVariableData(
            name=name,
            dimensions=names,
            attributes=attributes,
            values=decoded,
            shape=shape,
        )

    return NetcdfDataset(extents, global_attributes, variables)
