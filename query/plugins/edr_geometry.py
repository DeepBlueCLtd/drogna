"""Pure geometry for the grown EDR query types: distance, membership, offsets, units.

Everything here is arithmetic over plain numbers — no geometry library, no framework, no
I/O — so the rules the new query types select by can be tested in the workspace, which
does not carry pygeoapi or Shapely. The one place a Shapely geometry is read is the
provider that receives it, and it hands sequences of floats down to here.

Two approximations are used, and both are stated because a response does not show them:

**Distance is great-circle, on a sphere.** :func:`haversine_km` uses the IUGG mean Earth
radius. The harness's ocean is synthetic and its numerics deliberately fake, so an
ellipsoid would be precision the data underneath does not carry — but the choice is
written down, and the same radius is the basis of every kilometre in this module, so a
radius query and a corridor offset cannot disagree about how long a kilometre is.

**Offsets are local-tangent-plane.** :func:`displace_km` converts kilometres to degrees at
the point being displaced (one degree of latitude is pi*R/180 km; a degree of longitude is
that times cos(latitude)). Over the tens of kilometres a corridor is wide the error is far
below the grid spacing the selection then snaps to.

**Membership includes the boundary.** A grid node exactly on the drawn ring or exactly on
the circle's edge is inside, for the same reason the interpolation treats the first and
last node of an axis as inside the domain: the caller drew a boundary, and a point on it
is not beyond it.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from plugins.errors import QueryLayerError

__all__ = [
    "EARTH_RADIUS_KM",
    "KM_PER_DEGREE_LATITUDE",
    "displace_km",
    "haversine_km",
    "parse_distance_km",
    "perpendicular_offsets",
    "point_in_ring",
]

EARTH_RADIUS_KM = 6371.0088
"""IUGG mean Earth radius. The basis of every kilometre in this module."""

KM_PER_DEGREE_LATITUDE = math.pi * EARTH_RADIUS_KM / 180.0

# Distance units the interface accepts, each as its factor to kilometres. Anything else is
# refused with the unit named rather than guessed at: a nautical mile misread as a statute
# mile would select a plausible wrong neighbourhood, which no caller could see.
_UNIT_FACTORS_TO_KM = {"km": 1.0, "m": 0.001}


def haversine_km(
    longitude_a: float, latitude_a: float, longitude_b: float, latitude_b: float
) -> float:
    """Great-circle distance between two points, in kilometres."""
    phi_a = math.radians(latitude_a)
    phi_b = math.radians(latitude_b)
    d_phi = phi_b - phi_a
    d_lambda = math.radians(longitude_b - longitude_a)
    half_chord = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(d_lambda / 2.0) ** 2
    )
    return 2.0 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(half_chord)))


def parse_distance_km(value: str | None, units: str | None, *, name: str) -> float:
    """A distance parameter with its units, as kilometres, or a refusal naming the cause."""
    if value is None or str(value).strip() == "":
        raise QueryLayerError(
            f"this query needs a {name} parameter carrying the distance; none was given"
        )
    try:
        magnitude = float(value)
    except (TypeError, ValueError) as error:
        raise QueryLayerError(f"{name} is not a number: {value!r}") from error
    if magnitude <= 0:
        raise QueryLayerError(f"{name} is {magnitude}, and a distance here is positive")
    unit = (units or "km").strip()
    factor = _UNIT_FACTORS_TO_KM.get(unit)
    if factor is None:
        served = ", ".join(sorted(_UNIT_FACTORS_TO_KM))
        raise QueryLayerError(
            f"the distance unit {unit!r} is not served here; this interface serves {served}. "
            f"Refused rather than guessed: a unit misread would select a plausible wrong "
            f"neighbourhood and nothing in the response would say so."
        )
    return magnitude * factor


def point_in_ring(longitude: float, latitude: float, ring: Sequence[Sequence[float]]) -> bool:
    """Even-odd membership of a point in a closed ring of (longitude, latitude) pairs.

    The ring may be given open or closed (last vertex repeating the first); both are
    walked the same way. A point exactly on an edge or a vertex is inside.
    """
    vertices = [(float(x), float(y)) for x, y in ring]
    if len(vertices) >= 2 and vertices[0] == vertices[-1]:
        vertices = vertices[:-1]
    if len(vertices) < 3:
        raise QueryLayerError(
            f"a ring has at least three distinct vertices; this one has {len(vertices)}"
        )

    inside = False
    for index in range(len(vertices)):
        ax, ay = vertices[index]
        bx, by = vertices[(index + 1) % len(vertices)]
        if _on_segment(longitude, latitude, ax, ay, bx, by):
            return True
        # Even-odd rule: count edges a ray cast east from the point would cross.
        if (ay > latitude) != (by > latitude):
            crossing_x = ax + (latitude - ay) * (bx - ax) / (by - ay)
            if crossing_x > longitude:
                inside = not inside
    return inside


def _on_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> bool:
    cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    if cross != 0.0:
        return False
    return min(ax, bx) <= px <= max(ax, bx) and min(ay, by) <= py <= max(ay, by)


def displace_km(
    longitude: float, latitude: float, *, east_km: float, north_km: float
) -> tuple[float, float]:
    """The point a given eastward and northward displacement away, in degrees."""
    km_per_degree_longitude = KM_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude))
    if km_per_degree_longitude <= 0.0:
        raise QueryLayerError(f"a displacement in longitude is undefined at latitude {latitude}")
    return (
        longitude + east_km / km_per_degree_longitude,
        latitude + north_km / KM_PER_DEGREE_LATITUDE,
    )


def perpendicular_offsets(
    points: Sequence[Sequence[float]], offset_km: float
) -> list[tuple[float, float]]:
    """Each point of a route displaced perpendicular to the route's local direction.

    Positive offsets displace to the left of the direction of travel, negative to the
    right; the sign convention is stated here once and the corridor response labels each
    member route with its signed offset so a reader need not rederive it.

    The local direction at a vertex is central — the direction from its predecessor to
    its successor — with the end vertices taking their single adjacent segment. A route
    of fewer than two points has no direction, and that is the caller's refusal to make.
    """
    if len(points) < 2:
        raise QueryLayerError("a route of fewer than two vertices has no direction to offset from")
    if offset_km == 0.0:
        return [(float(p[0]), float(p[1])) for p in points]

    # Work in local kilometres about each vertex so direction and displacement agree.
    displaced: list[tuple[float, float]] = []
    for index, point in enumerate(points):
        earlier = points[max(index - 1, 0)]
        later = points[min(index + 1, len(points) - 1)]
        latitude = float(point[1])
        km_per_degree_longitude = KM_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude))
        east = (float(later[0]) - float(earlier[0])) * km_per_degree_longitude
        north = (float(later[1]) - float(earlier[1])) * KM_PER_DEGREE_LATITUDE
        length = math.hypot(east, north)
        if length == 0.0:
            raise QueryLayerError(
                f"vertex {index} has no direction: its neighbouring vertices coincide, so "
                f"the corridor's edge is undefined there"
            )
        # Left of travel: rotate the unit direction (east, north) a quarter turn.
        left_east, left_north = -north / length, east / length
        displaced.append(
            displace_km(
                float(point[0]),
                latitude,
                east_km=left_east * offset_km,
                north_km=left_north * offset_km,
            )
        )
    return displaced
