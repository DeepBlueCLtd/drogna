"""Reading the classic NetCDF the coverage store holds.

The harness writes NetCDF classic directly rather than through a library, because two runs
from one seed must produce byte-identical files and the usual writers stamp a creation time
and a library version into the header (feature 004's writer says so at length). Reading it
back is the other half of that decision and is what this module is: a small reader over the
same small, published, stable format.

It is a reader and not a second writer. There is one encoder in the repository and this
module does not become another; what it does is parse a header — dimensions, attributes,
variable definitions and their data offsets — and hand back the arrays, in the order the
file declares them.

Only what the coverage store actually contains is supported: fixed-size variables of float,
double, int and char, with no record dimension. Anything else raises, because a reader that
guesses at a construct it does not understand returns numbers that look usable.
"""

from __future__ import annotations

import struct
from array import array
from dataclasses import dataclass
from typing import Any

__all__ = ["NetcdfError", "NetcdfFile", "Variable", "read_netcdf"]

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

_TYPECODES: dict[int, tuple[str, int]] = {
    _NC_BYTE: ("b", 1),
    _NC_SHORT: ("h", 2),
    _NC_INT: ("i", 4),
    _NC_FLOAT: ("f", 4),
    _NC_DOUBLE: ("d", 8),
}


class NetcdfError(ValueError):
    """The bytes are not a classic NetCDF file this reader understands."""


@dataclass(frozen=True)
class Variable:
    """One variable: the axes it is defined on, its attributes, and its values."""

    axes: tuple[str, ...]
    attributes: dict[str, Any]
    values: array


@dataclass(frozen=True)
class NetcdfFile:
    """A parsed file: its axes with their lengths, its global attributes, its variables."""

    axes: dict[str, int]
    attributes: dict[str, Any]
    variables: dict[str, Variable]

    def shape_of(self, name: str) -> tuple[int, ...]:
        return tuple(self.axes[axis] for axis in self.variables[name].axes)


class _Cursor:
    """A position in the header. Classic NetCDF pads every field to four bytes."""

    def __init__(self, payload: bytes) -> None:
        self._payload = payload
        self._at = 0

    def seek(self, position: int) -> _Cursor:
        """Move to a stated offset: a variable's data begins where its header says."""
        self._at = position
        return self

    def uint(self) -> int:
        (value,) = struct.unpack_from(">I", self._payload, self._at)
        self._at += 4
        return value

    def name(self) -> str:
        length = self.uint()
        raw = self._payload[self._at : self._at + length]
        self._at += length + (-length % 4)
        return raw.decode("utf-8")

    def values(self, nc_type: int, count: int) -> Any:
        if nc_type == _NC_CHAR:
            raw = self._payload[self._at : self._at + count]
            self._at += count + (-count % 4)
            return raw.decode("utf-8")
        try:
            typecode, size = _TYPECODES[nc_type]
        except KeyError:
            raise NetcdfError(f"unsupported NetCDF type {nc_type}") from None
        block = array(typecode)
        block.frombytes(self._payload[self._at : self._at + count * size])
        if _little_endian():
            block.byteswap()
        self._at += count * size + (-(count * size) % 4)
        return list(block)


def _little_endian() -> bool:
    import sys

    return sys.byteorder == "little"


def _attributes(cursor: _Cursor) -> dict[str, Any]:
    tag = cursor.uint()
    count = cursor.uint()
    if tag == 0 and count == 0:
        return {}
    if tag != _NC_ATTRIBUTE:
        raise NetcdfError("expected an attribute list")
    attributes: dict[str, Any] = {}
    for _ in range(count):
        name = cursor.name()
        nc_type = cursor.uint()
        length = cursor.uint()
        value = cursor.values(nc_type, length)
        attributes[name] = value if isinstance(value, str) or length != 1 else value[0]
    return attributes


def read_netcdf(payload: bytes) -> NetcdfFile:
    """Parse a classic NetCDF file. Every failure names what was expected."""
    if not payload.startswith(_MAGIC):
        raise NetcdfError("not a classic NetCDF file: the magic number does not match")
    cursor = _Cursor(payload)
    cursor.values(_NC_BYTE, 4)  # the magic, consumed
    if cursor.uint() != 0:
        raise NetcdfError("this reader handles fixed-size variables only; there is no record")

    axes: dict[str, int] = {}
    tag = cursor.uint()
    count = cursor.uint()
    if tag == _NC_DIMENSION:
        for _ in range(count):
            # Read in two statements, not one: in `axes[cursor.name()] = cursor.uint()`
            # Python evaluates the right-hand side first and the file is read backwards.
            axis = cursor.name()
            axes[axis] = cursor.uint()
    elif tag != 0 or count != 0:
        raise NetcdfError("expected a dimension list")

    attributes = _attributes(cursor)

    variables: dict[str, Variable] = {}
    definitions: list[tuple[str, tuple[str, ...], dict[str, Any], int, int, int]] = []
    tag = cursor.uint()
    count = cursor.uint()
    if tag == _NC_VARIABLE:
        names = list(axes)
        for _ in range(count):
            name = cursor.name()
            rank = cursor.uint()
            dimensions = tuple(names[cursor.uint()] for _ in range(rank))
            variable_attributes = _attributes(cursor)
            nc_type = cursor.uint()
            vsize = cursor.uint()
            begin = cursor.uint()
            definitions.append((name, dimensions, variable_attributes, nc_type, vsize, begin))
    elif tag != 0 or count != 0:
        raise NetcdfError("expected a variable list")

    for name, dimensions, variable_attributes, nc_type, _vsize, begin in definitions:
        length = 1
        for axis in dimensions:
            length *= axes[axis]
        raw = _Cursor(payload).seek(begin).values(nc_type, length)
        typecode = "d" if nc_type == _NC_DOUBLE else "f"
        values = array(typecode, raw) if not isinstance(raw, str) else array("f")
        variables[name] = Variable(axes=dimensions, attributes=variable_attributes, values=values)
    return NetcdfFile(axes=axes, attributes=attributes, variables=variables)
