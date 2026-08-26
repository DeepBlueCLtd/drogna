"""C-02, the synthetic environment generator, and the ground truth it writes beside it.

The field is the easy half. The manifest is the half that matters: SRD section 10 calls it
what turns drogna from a toy into evidence, and AT-01 and AT-03 both score against it. So
the shape of this package follows from one decision — the field is analytic, and the
manifest carries the whole analytic form. :class:`~harness_env_generator.evaluator.
Evaluator` takes that manifest and a point, on the grid or between grid nodes, and returns
the truth there without loading the field and without the generator running.

Three rules bind everything here, and each is a constitution principle rather than a
preference. Time comes from the clock port. Randomness comes from ``rng_for``, in a fixed
order recorded in the manifest. Configuration arrives in one named file and is validated
before any other I/O. What follows from them is the property AT-04 checks: the same
configuration and the same seed produce byte-identical output.
"""

from harness_env_generator.errors import (
    BoundsBreachedError,
    GeneratorError,
    OutOfDomainError,
    RefusalError,
)
from harness_env_generator.evaluator import VARIABLES, Evaluator, Truth
from harness_env_generator.generate import GeneratedWorld, generate
from harness_env_generator.scoring import (
    ErrorFigure,
    RecoveryReport,
    score_eddy_recovery,
    score_point_recovery,
)
from harness_env_generator.version import (
    ANALYTIC_FORM_VERSION,
    GENERATOR_NAME,
    GENERATOR_VERSION,
)

__all__ = [
    "ANALYTIC_FORM_VERSION",
    "GENERATOR_NAME",
    "GENERATOR_VERSION",
    "VARIABLES",
    "BoundsBreachedError",
    "ErrorFigure",
    "Evaluator",
    "GeneratedWorld",
    "GeneratorError",
    "OutOfDomainError",
    "RecoveryReport",
    "RefusalError",
    "Truth",
    "generate",
    "score_eddy_recovery",
    "score_point_recovery",
]
