"""Deterministic identifiers for observations and for the locations they pertain to.

Constitution II: an identifier that appears in a stored record or a published message is a
function of the run's root seed and the record's logical position. Never entropy, never a
host clock, never arrival order, never a database sequence. That is what makes two runs
from one root seed produce byte-identical stores — identifiers included — and it is also
what makes redelivery under at-least-once delivery a no-op: the second copy of a message
carries the key the first one was stored under, so the insert finds a row already there.

The logical position of an observation is its ordinal in the sampling order the array
walks: sampling event, then depth, then instrument. Nothing about that ordering depends on
when a message was sent or in what order the broker delivered it.

The logical position of a FeatureOfInterest is its place in the sampled grid — which
configured position, at which configured depth — so two observations of the same place a
day apart share one FeatureOfInterest, which is what SensorThings means by the entity.
"""

from __future__ import annotations

from harness_core.rng import identifier_for

__all__ = [
    "FEATURE_PREFIX",
    "OBSERVATION_PREFIX",
    "feature_of_interest_id",
    "feature_stream",
    "observation_id",
    "observation_stream",
]

OBSERVATION_PREFIX = "obs"
FEATURE_PREFIX = "foi"

_OBSERVATION_LENGTH = 16
_FEATURE_LENGTH = 12


def observation_stream(prefix: str) -> str:
    """The stream observation identifiers are drawn from, named ``<component>.<purpose>``."""
    return f"{prefix}.observations"


def feature_stream(prefix: str) -> str:
    """The stream FeatureOfInterest identifiers are drawn from."""
    return f"{prefix}.features"


def observation_id(prefix: str, ordinal: int) -> str:
    """The identifier of the ``ordinal``-th observation this component publishes."""
    digest = identifier_for(observation_stream(prefix), ordinal, length=_OBSERVATION_LENGTH)
    return f"{OBSERVATION_PREFIX}-{digest}"


def feature_of_interest_id(prefix: str, position_index: int, depth_index: int, depths: int) -> str:
    """The identifier of the sampled location at a configured position and depth.

    ``depths`` is how many depths each position is sampled at, so the pair collapses to one
    logical position without the two indices being able to collide.
    """
    if depths < 1:
        raise ValueError("a position is sampled at at least one depth")
    if not 0 <= depth_index < depths:
        raise ValueError(f"depth index {depth_index} is outside the {depths} configured depths")
    ordinal = position_index * depths + depth_index
    digest = identifier_for(feature_stream(prefix), ordinal, length=_FEATURE_LENGTH)
    return f"{FEATURE_PREFIX}-{digest}"
