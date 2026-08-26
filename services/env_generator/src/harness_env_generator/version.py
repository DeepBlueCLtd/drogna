"""What produced a field, so a manifest never describes a field it could not have made.

Two numbers, not one. ``GENERATOR_VERSION`` moves for any change to this component.
``ANALYTIC_FORM_VERSION`` moves only when the shape of the field changes — a new kernel,
a different composition rule, a changed blending rule — and it is the number a reader
must understand before it may reconstruct a field from a manifest. A reader that meets a
form version it does not know refuses, rather than reconstructing something else and
reporting the difference as a recovery error (FR-015).
"""

from __future__ import annotations

__all__ = [
    "ANALYTIC_FORM_VERSION",
    "GENERATOR_NAME",
    "GENERATOR_VERSION",
    "MANIFEST_SCHEMA_VERSION",
]

GENERATOR_NAME = "env_generator"
GENERATOR_VERSION = "1.0.0"
ANALYTIC_FORM_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
