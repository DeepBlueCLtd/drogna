"""What this component calls itself, and the version its exports record.

The format version is part of the reproducibility claim rather than decoration.
Constitution II claims byte-identity for a fixed code and library version, and the
version that fixes an export's bytes is this one: the layout of dimensions, the order of
variables and the set of attributes are all decided here and recorded in every sidecar
manifest, so a bundle can say which writer made it without saying anything about the
machine that ran it.
"""

from __future__ import annotations

__all__ = [
    "CONVENTIONS",
    "FEATURE_TYPE",
    "FORMAT_VERSION",
    "MANIFEST_SCHEMA_VERSION",
    "PACKAGER_NAME",
    "PACKAGER_VERSION",
]

PACKAGER_NAME = "offload"
PACKAGER_VERSION = "0.1.0"

FORMAT_VERSION = "drogna-trajectory-profile-1"
"""Bumped when anything that changes an export's bytes changes."""

FEATURE_TYPE = "trajectoryProfile"
"""The discrete sampling geometry the export declares.

A series of vertical profiles taken at successive positions along a sampling path is
precisely what CF calls a trajectory of profiles. The trajectory in the file is the
ordering of the profiles and nothing else: no identity is carried between them, and there
is no heading, speed or platform anywhere in the export (Constitution V)."""

CONVENTIONS = "CF-1.10"
"""The convention version the writer targets. Configuration pins the same value and the
conformance check refuses to run against any other, so the file, the check and the
configuration cannot come to disagree quietly."""

MANIFEST_SCHEMA_VERSION = 1
