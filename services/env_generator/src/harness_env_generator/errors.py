"""How the generator refuses, and with what exit code.

A refusal is a startup or pre-write failure with a readable message. The generator never
writes half a world: every check that can be made before the first byte is made before
the first byte, and the two that cannot — the composed field breaching a physical bound,
and the sound speed equation being used outside its range — are made on the finished
arrays in memory, before anything is opened for writing.

Exit codes continue the sequence :mod:`harness_core.config` starts at 78, so a supervisor
can tell a bad configuration from a refused world without parsing text.
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "EXIT_BOUNDS_BREACHED",
    "EXIT_REFUSED",
    "BoundsBreachedError",
    "GeneratorError",
    "OutOfDomainError",
    "RefusalError",
]

EXIT_REFUSED = 82
EXIT_BOUNDS_BREACHED = 83


class GeneratorError(Exception):
    """The generator will not produce a world, and says why."""

    exit_code = EXIT_REFUSED


class RefusalError(GeneratorError):
    """A configuration that parses and validates but describes a world worth refusing.

    A feature outside the domain, or a timescale the time axis cannot express. Both are
    configuration errors and neither is silently clipped: clipping would produce a field
    whose manifest described something else.
    """


class BoundsBreachedError(GeneratorError):
    """The composed field left the stated physical bounds, so it is not written."""

    exit_code = EXIT_BOUNDS_BREACHED

    def __init__(self, message: str, *, variable: str, value: float, point: dict[str, Any]) -> None:
        super().__init__(message)
        self.variable = variable
        self.value = value
        self.point = point


class OutOfDomainError(GeneratorError):
    """A point outside the domain was asked of the evaluator.

    Explicit, rather than an extrapolated number: outside the domain the analytic form is
    still arithmetic, but it is no longer the world the manifest describes, and a consumer
    that cannot tell the difference will quote it as truth.
    """

    def __init__(self, message: str, *, axis: str, value: float) -> None:
        super().__init__(message)
        self.axis = axis
        self.value = value
