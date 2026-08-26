"""The spatial kernels a feature's anomaly and its timescale membership both use.

One geometry per feature, used twice. The anomaly says how much a feature changes the
water; the membership says how much of that location belongs to the feature, and it is
what the decorrelation timescale is blended by. They are derived from the same kernel and
the same parameters, so a feature's temperature signature and its timescale signature
cannot drift apart — which they would, quietly, if each were written separately.

Two kernel families are enough for the four features of SRD FR-03.

**Gaussian.** ``exp(-(d/s)^2 / 2)`` for a distance ``d`` and a scale ``s``. Peaks at the
centre and decays smoothly. The eddy and the moving feature use it radially and again in
depth; the membership *is* the kernel, so it is one at the centre and zero far away.

**Hyperbolic tangent.** ``tanh(x/s)`` across a transition of half-width ``s``. The front
uses it horizontally and the thermocline vertically. Its anomaly is odd across the
transition — one sign on each side — so the kernel itself is zero exactly where the
feature is most itself, and cannot serve as a membership weight. The membership is its
envelope, ``1 - tanh(x/s)^2``, which is the derivative of the step up to a constant: one
on the transition, zero away from it, and a function of the same ``x/s`` as the anomaly.

Distances are computed on a local plane about a stated reference latitude
(:class:`LocalPlane`). Over a domain of a couple of degrees the error against a great
circle is well under a percent, and drogna's numerics are deliberately fake (SRD 1.1):
the point is the seam, not the geodesy. What the approximation buys is worth having — the
map from degrees to kilometres is affine and exactly invertible, so a drift velocity in
kilometres per day integrates to a position in degrees with no iteration, and a consumer
holding only the manifest can reproduce it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

__all__ = [
    "KM_PER_DEGREE",
    "LocalPlane",
    "depth_decay",
    "gaussian",
    "tanh_envelope",
    "tanh_step",
]

KM_PER_DEGREE = math.pi * 6371.0087714 / 180.0
"""Kilometres per degree of latitude on a sphere of the IUGG mean radius."""

_OVERFLOW_GUARD = 350.0
"""Beyond this many half-widths ``cosh`` overflows; the envelope is zero long before."""


@dataclass(frozen=True)
class LocalPlane:
    """An affine map between degrees and kilometres about one reference latitude.

    The reference latitude is a parameter of the feature, not of the point being
    evaluated, so the map is a constant. That is what makes it invertible and what lets
    an advecting feature's position be stated in the manifest as an initial centre plus a
    velocity, rather than as a path somebody has to integrate.
    """

    reference_latitude: float

    @property
    def km_per_degree_longitude(self) -> float:
        return KM_PER_DEGREE * math.cos(math.radians(self.reference_latitude))

    def east_km(self, longitude: float, origin_longitude: float) -> float:
        return (longitude - origin_longitude) * self.km_per_degree_longitude

    def north_km(self, latitude: float, origin_latitude: float) -> float:
        return (latitude - origin_latitude) * KM_PER_DEGREE

    def longitude_at(self, origin_longitude: float, east_km: float) -> float:
        return origin_longitude + east_km / self.km_per_degree_longitude

    def latitude_at(self, origin_latitude: float, north_km: float) -> float:
        return origin_latitude + north_km / KM_PER_DEGREE


def gaussian(distance: float, scale: float) -> float:
    """``exp(-(distance/scale)^2 / 2)``: one at zero distance, decaying smoothly."""
    ratio = distance / scale
    return math.exp(-0.5 * ratio * ratio)


def tanh_step(offset: float, half_width: float) -> float:
    """``tanh(offset/half_width)``: minus one on one side, plus one on the other."""
    return math.tanh(offset / half_width)


def tanh_envelope(offset: float, half_width: float) -> float:
    """``1 - tanh(offset/half_width)^2``: one on the transition, zero away from it.

    The membership weight for a feature whose anomaly is a step. Same argument, same
    half-width, so the weight and the anomaly describe one geometry.
    """
    scaled = offset / half_width
    if abs(scaled) > _OVERFLOW_GUARD:
        return 0.0
    return 1.0 / math.cosh(scaled) ** 2


def depth_decay(depth_m: float, scale_m: float) -> float:
    """``exp(-depth/scale)``: a surface-intensified feature fading with depth."""
    return math.exp(-depth_m / scale_m)
