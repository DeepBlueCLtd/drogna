"""The decorrelation timescale, as a field (ADR-0002, SRD FR-05).

Something has to govern how fast a location loses memory of a measurement. ADR-0002
settles what that something is: not a property of a feature, and not a static map over
regions, but a field ``tau(latitude, longitude, depth, time)`` — *authored* per feature
over a domain-wide background, and *evaluated* per location. Quiet water has a timescale,
because FR-08 requires quiet water to be left alone and that is a statement about the
background. A feature that drifts carries its timescale with it, because the fast patch
belongs to the water the feature is in and not to the coordinates it started at.

The blending rule
-----------------

ADR-0002 leaves the rule between the background and overlapping features open, and
requires it to be stated explicitly here and recorded in the manifest, since two features
may overlap. It is stated here.

Work in *rates* — inverse timescales — rather than timescales. A rate is how fast memory
is lost, and losses compose by adding; timescales do not, and averaging two timescales
would give a location inside two fast features a slower answer than either of them, which
is the wrong direction. With ``w_f`` the membership weight of feature ``f`` at a location
(:mod:`.features.kernels`), ``W`` their sum, and ``r`` for ``1/tau``::

    W <= 1:   r = (1 - W) * r_background + sum_f  w_f * r_f
    W  > 1:   r =                          sum_f (w_f / W) * r_f
    tau = 1 / r

The first line is the additive form: the background's rate, plus for each feature its
weight times the difference between that feature's rate and the background's. The second
normalises the weights where they would sum above one, which happens only where features
overlap strongly. The two agree exactly at ``W = 1``, so the field is continuous.

Four properties follow, and each is a requirement rather than a nicety:

- **Defined everywhere.** Every weight is finite, every rate is positive, so ``tau`` is
  finite and positive at every point of the domain — including open background water,
  which the planner scores like any other cell (FR-024, SRD FR-32, FR-34).
- **Reduces to the background.** Where no feature overlaps, ``W`` is zero and ``tau`` is
  the background timescale exactly.
- **Reduces to the feature.** At a feature's centre its weight is one; where no other
  feature overlaps, ``W`` is one and ``tau`` is that feature's authored timescale exactly.
- **Bounded where features overlap.** Both branches are convex combinations, so the
  blended rate lies between the smallest and largest of the contributing rates and the
  background's. The timescale where two features overlap therefore lies between the
  shortest contributing timescale and the background, and never outside them.

The last property is why the rule normalises rather than adding without limit. The
specification's assumption recorded the additive form alone, and the additive form alone
can drive the timescale *below* the shortest contributing one where two weights are both
near one — which its own acceptance scenario forbids. Normalisation is the smallest change
that keeps both, and it changes nothing anywhere ``W <= 1``, which is most of the domain.
An alternative rule replaces this one by name in the manifest, without a schema change.

Authoring is not evaluation
---------------------------

ADR-0002's last consequence: the generator must not leak the authored per-feature
representation to consumers, who see only the evaluated field. So the only thing this
module offers a consumer is :meth:`TimescaleField.evaluate` — a number at a point. The
per-feature weights are private. The manifest does record the background and the
per-feature timescales, because ADR-0002 makes both ground truth and Constitution IX
requires ground truth to be scorable; what it does not do is hand anybody a rule for
deciding which feature a location "is in".
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from harness_env_generator.features.base import Feature

__all__ = [
    "BLENDING_RULE",
    "BLENDING_RULE_VERSION",
    "MEMBERSHIP_RULE",
    "TimescaleField",
]

BLENDING_RULE = "additive-rate-blend-normalised"
BLENDING_RULE_VERSION = 1

_BLENDING_DESCRIPTION = (
    "Inverse timescales blend, not timescales. Where the feature weights sum to at most "
    "one, the rate is the background's plus, for each feature, its weight times the "
    "difference between that feature's rate and the background's. Where they sum above "
    "one, the weights are normalised by their sum and the background drops out. Both "
    "branches are convex combinations and they agree at a total weight of one, so the "
    "field is continuous, equals the background where nothing overlaps, equals a "
    "feature's own timescale at its centre, and where features overlap lies between the "
    "shortest contributing timescale and the background."
)

MEMBERSHIP_RULE = "shared-anomaly-kernel"
_MEMBERSHIP_DESCRIPTION = (
    "A feature's weight at a location comes from the same spatial kernel and the same "
    "parameters as its anomaly: the kernel itself where the anomaly peaks at the centre, "
    "and the kernel's envelope where the anomaly is a step and so vanishes exactly where "
    "the feature is most itself. One geometry per feature, so a timescale and the anomaly "
    "it belongs to cannot drift apart. A moving feature's weight is evaluated about its "
    "position at the time asked for, which is how its timescale advects with it."
)


@dataclass(frozen=True)
class TimescaleField:
    """tau over the four axes: a background, the features that disturb it, and the rule."""

    background_seconds: float
    features: tuple[Feature, ...]

    @classmethod
    def from_manifest(
        cls, document: Mapping[str, Any], features: Sequence[Feature]
    ) -> TimescaleField:
        return cls(
            background_seconds=float(document["background_seconds"]),
            features=tuple(features),
        )

    def evaluate(self, latitude: float, longitude: float, depth_m: float, time_s: float) -> float:
        """The decorrelation timescale in seconds at one point. The only public answer."""
        background_rate = 1.0 / self.background_seconds
        total_weight = 0.0
        weighted_rate = 0.0
        for feature in self.features:
            weight = feature.membership(latitude, longitude, depth_m, time_s)
            total_weight += weight
            weighted_rate += weight / feature.timescale_seconds
        if total_weight > 1.0:
            return total_weight / weighted_rate
        rate = (1.0 - total_weight) * background_rate + weighted_rate
        return 1.0 / rate

    def as_manifest(self, *, time_step_seconds: float, floor_ratio: float) -> dict[str, Any]:
        return {
            "background_seconds": self.background_seconds,
            "background_to_time_step_ratio": self.background_seconds / time_step_seconds,
            "floor_ratio": floor_ratio,
            "blending_rule": {
                "name": BLENDING_RULE,
                "version": BLENDING_RULE_VERSION,
                "description": _BLENDING_DESCRIPTION,
                "parameters": {"normalise_above_unit_weight": True},
            },
            "membership": {"rule": MEMBERSHIP_RULE, "description": _MEMBERSHIP_DESCRIPTION},
        }
