"""The one NetCDF encoder and the one reader that matches it: classic format, written and
read directly, byte-identical by construction.

**Why the format is written here rather than by a library.** Two runs with one seed must
produce byte-identical files (Constitution II, AT-04), and the usual NetCDF writers stamp a
creation time and a library version into the file. Those are precisely the two things that
would break byte-identity, and the first would be a host clock reaching the output of a
component that is forbidden to read one (Constitution I). Writing the classic format
directly — it is a small, stable, published format — removes both at the source rather than
normalising them afterwards, and it removes the dependency on a library version that would
itself have to be pinned for the identity claim to mean anything.

**Why the reader is here too.** Reading the file back is the other half of that decision
rather than a separate one: a component that reads through a library to check what was
written without one is checking two formats and comparing the answers. The reader is not a
second writer and never becomes one. It parses a header — dimensions, attributes, variable
definitions and their data offsets — and hands back the arrays, in the order the file
declares them.

What is written is NetCDF classic (CDF-1): a big-endian header of dimensions, global
attributes and variable definitions, followed by each variable's data at a stated offset.
Only fixed-size variables are used — there is no record dimension — so the layout is a pure
function of the header, and the header is a pure function of its arguments. The reader
supports exactly that and refuses anything else by name, because a reader that guesses at a
construct it does not understand returns numbers that look usable.

**Why both live in harness_core.** The encoder began in the environment generator, which was
the only component that wrote a field. The model runner became its second consumer and
imported it across a service boundary; the offload packager is the third, and a shape three
components share is a library, not a service's private detail. The reader arrived by the
same road from the other direction: it began in the divergence monitor, which was the only
component that read a field, and then the offload packager's conformance check and the
planner's spread reader each imported it — from a *service* package, which is the shape this
repository does not have, because a service that other services import is a library wearing
a component's name. ``scripts/check_service_dependencies.py`` is the gate that says so. The
alternative — a second encoder or a second parser in the third consumer — is how a
repository ends up with two definitions of a file format that agree until the day one of
them is corrected.

Nothing above either of them moved with them, and the line is the same in both directions:
what is about the *format* is here, and what is a decision about *fields* is not. What a
field written by the generator is — its normalised attributes, its stored widths, its
tolerance rule and the two-file publication dance — is still in
``harness_env_generator.writer``. What a *coverage* field read by the monitor is — which
axes and variables it must carry, which global attributes it must declare, how it is sampled
and how sound speed is derived from it — is still in ``harness_monitor.coverage``. This
module knows that a file has variables; it does not know that one of them ought to be called
``temperature``.

One naming note, because the two halves meet here. :class:`NetcdfVariable` is what a caller
hands the *encoder*: a name, a type, dimensions and data to write. :class:`Variable` is what
the *reader* hands back: the axes a variable was defined on, its attributes and its values.
They are not the same shape and neither is derivable from the other — the reader has no use
for a type code it has already decoded, and the encoder has no use for an axis length it is
told separately.
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
    "NetcdfError",
    "NetcdfFile",
    "NetcdfVariable",
    "Variable",
    "encode_netcdf",
    "read_netcdf",
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

# The two classic types the encoder never emits. The reader accepts them because the format
# defines them and a file it did not write may carry one; they stay private so that a caller
# declaring a variable is not offered a type this module has no encoding path for.
_NC_BYTE = 1
_NC_SHORT = 3

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


_TYPECODES: dict[int, tuple[str, int]] = {
    _NC_BYTE: ("b", 1),
    _NC_SHORT: ("h", 2),
    NC_INT: ("i", 4),
    NC_FLOAT: ("f", 4),
    NC_DOUBLE: ("d", 8),
}


class NetcdfError(ValueError):
    """The bytes are not a classic NetCDF file this reader understands."""


@dataclass(frozen=True)
class Variable:
    """One variable as read: the axes it is defined on, its attributes, and its values."""

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
        if nc_type == NC_CHAR:
            raw = self._payload[self._at : self._at + count]
            self._at += count + (-count % 4)
            return raw.decode("utf-8")
        try:
            typecode, size = _TYPECODES[nc_type]
        except KeyError:
            raise NetcdfError(f"unsupported NetCDF type {nc_type}") from None
        block = array(typecode)
        block.frombytes(self._payload[self._at : self._at + count * size])
        if sys.byteorder == "little":
            block.byteswap()
        self._at += count * size + (-(count * size) % 4)
        return list(block)


def _decode_attributes(cursor: _Cursor) -> dict[str, Any]:
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

    attributes = _decode_attributes(cursor)

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
            variable_attributes = _decode_attributes(cursor)
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
        typecode = "d" if nc_type == NC_DOUBLE else "f"
        values = array(typecode, raw) if not isinstance(raw, str) else array("f")
        variables[name] = Variable(axes=dimensions, attributes=variable_attributes, values=values)
    return NetcdfFile(axes=axes, attributes=attributes, variables=variables)
