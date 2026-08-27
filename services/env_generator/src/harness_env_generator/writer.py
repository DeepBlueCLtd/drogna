"""Writing the field: what a field says about itself, and how a reader never sees half of one.

The encoder itself is no longer here. ``encode_netcdf`` is in
:mod:`harness_core.netcdf`, having acquired a third consumer — the offload packager,
after the model runner — and a file format three components write is a library rather
than this service's private detail. Why the classic format is written directly instead
of through a NetCDF library is argued there, because that is where the argument now
lives.

What stayed is everything that is a decision about *fields* rather than about the
format.

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

from harness_core.netcdf import NC_DOUBLE, NC_FLOAT

__all__ = [
    "NORMALISED_ATTRIBUTES",
    "STORED_DTYPES",
    "FieldWriter",
    "digest_of",
    "tolerance_for",
]

STORED_DTYPES: dict[str, tuple[str, int, int]] = {
    "float32": ("f", 4, NC_FLOAT),
    "float64": ("d", 8, NC_DOUBLE),
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
