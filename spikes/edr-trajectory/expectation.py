"""The test route, and the two competing expectations that make the result falsifiable.

SPIKE CODE. Throwaway. See `version_probe.py` for the standing caveat.

The route is twenty vertices crossing longitude, latitude and depth together, with
arrival times that deliberately fall *between* the fixture's three-hourly steps, so a
provider that snaps to the nearest step is distinguishable from one that interpolates.

Two hypotheses are computed for every vertex:

* `per_vertex` — the field at each vertex's own arrival time. This is what SRD FR-20
  asks for: conditions forecast for the moment of arrival.
* `single_time_query` — the field at the time named by the request's `datetime`
  parameter, which is the fixture's first time step. This is what a provider that
  ignores the M ordinate returns: conditions at query time, for every vertex.

`single_time_first_vertex` is reported as well, because it is the other plausible
way of getting it wrong. It necessarily agrees with `per_vertex` at vertex 0, which is
why it is not the discriminator; no route vertex coincides with the query time, so
`single_time_query` separates at every vertex including the first.

Vertical convention: WKT Z is elevation, positive up (OGC simple features); the
coverage's vertical axis is depth, positive down (CF). The route is emitted with
Z = -depth, and a provider must apply depth = -Z. A route that descends and one that
ascends therefore return different values, so a sign error is visible rather than
silent.

M convention: seconds since the Unix epoch. OGC API-EDR carries the vertex time in the
M ordinate; this spike encodes it as epoch seconds, and the finding records that choice
as a decision the build must confirm against the specification text rather than inherit.
"""

from __future__ import annotations

import numpy as np
from make_fixture import (
    DISCRIMINATING_FACTOR,
    T0,
    TOLERANCE,
    coefficients,
    hours_since_t0,
    theta,
)

N_VERTICES = 20

# Start and end of the route. Both sit inside the fixture's domain with room to spare.
ROUTE_LON = (-3.60, 0.60)
ROUTE_LAT = (48.40, 52.60)
ROUTE_DEPTH = (5.0, 380.0)

# Arrival times: first vertex 1.5 h after the fixture's origin, then 1.63 h apart. The
# offsets are chosen so that no vertex lands on a three-hourly grid step (asserted in
# selfcheck.py), so the interpolation question cannot be dodged.
ROUTE_FIRST_OFFSET_HOURS = 1.5
ROUTE_STEP_HOURS = 1.63

# The time the request's `datetime` parameter names: the fixture's first step. No route
# vertex shares it.
QUERY_TIME = T0

EPOCH = np.datetime64("1970-01-01T00:00:00")


def epoch_seconds(times: np.ndarray) -> np.ndarray:
    delta = np.asarray(times, dtype="datetime64[ns]") - EPOCH.astype("datetime64[ns]")
    return delta / np.timedelta64(1, "s")


def route() -> dict[str, np.ndarray]:
    """The test route: longitude, latitude, depth and arrival time per vertex."""
    fraction = np.linspace(0.0, 1.0, N_VERTICES)
    offsets = ROUTE_FIRST_OFFSET_HOURS + ROUTE_STEP_HOURS * np.arange(N_VERTICES)
    return {
        "lon": ROUTE_LON[0] + fraction * (ROUTE_LON[1] - ROUTE_LON[0]),
        "lat": ROUTE_LAT[0] + fraction * (ROUTE_LAT[1] - ROUTE_LAT[0]),
        "depth": ROUTE_DEPTH[0] + fraction * (ROUTE_DEPTH[1] - ROUTE_DEPTH[0]),
        "time": T0.astype("datetime64[ns]") + (offsets * 3600.0 * 1e9).astype("timedelta64[ns]"),
        "offset_hours": offsets,
    }


def wkt_linestring_zm(vertices: dict[str, np.ndarray] | None = None) -> str:
    """The route as EDR `coords`: WKT LINESTRING ZM, Z elevation, M epoch seconds."""
    vertices = vertices or route()
    seconds = epoch_seconds(vertices["time"])
    parts = [
        f"{lon:.6f} {lat:.6f} {-depth:.6f} {second:.0f}"
        for lon, lat, depth, second in zip(
            vertices["lon"],
            vertices["lat"],
            vertices["depth"],
            seconds,
            strict=True,
        )
    ]
    return "LINESTRING ZM (" + ", ".join(parts) + ")"


def wkt_linestring_m(vertices: dict[str, np.ndarray] | None = None) -> str:
    """The same route without a vertical component: WKT LINESTRING M."""
    vertices = vertices or route()
    seconds = epoch_seconds(vertices["time"])
    parts = [
        f"{lon:.6f} {lat:.6f} {second:.0f}"
        for lon, lat, second in zip(vertices["lon"], vertices["lat"], seconds, strict=True)
    ]
    return "LINESTRING M (" + ", ".join(parts) + ")"


def hypotheses(vertices: dict[str, np.ndarray] | None = None) -> dict[str, np.ndarray]:
    """The analytic values under per-vertex and single-time evaluation."""
    vertices = vertices or route()
    coeffs = coefficients()
    per_vertex_hours = hours_since_t0(vertices["time"])
    query_hours = hours_since_t0(np.array([QUERY_TIME]))[0]
    first_vertex_hours = per_vertex_hours[0]

    def evaluate(hours) -> np.ndarray:
        return theta(vertices["lon"], vertices["lat"], vertices["depth"], hours, coeffs)

    return {
        "per_vertex": evaluate(per_vertex_hours),
        "single_time_query": evaluate(np.full_like(per_vertex_hours, query_hours)),
        "single_time_first_vertex": evaluate(np.full_like(per_vertex_hours, first_vertex_hours)),
    }


def separation(vertices: dict[str, np.ndarray] | None = None) -> dict[str, float]:
    """How far apart the hypotheses are, in units of the fixture's tolerance."""
    values = hypotheses(vertices)
    gap_query = np.abs(values["per_vertex"] - values["single_time_query"])
    gap_first = np.abs(values["per_vertex"] - values["single_time_first_vertex"])
    return {
        "tolerance_degC": TOLERANCE,
        "required_factor": DISCRIMINATING_FACTOR,
        "min_gap_query_degC": float(gap_query.min()),
        "min_gap_query_in_tolerances": float(gap_query.min() / TOLERANCE),
        "min_gap_first_vertex_degC": float(gap_first.min()),
        # Vertex 0 is at the first vertex's time by definition, so this gap is zero
        # there. Reported for completeness; the discriminator is the query-time gap.
        "min_gap_first_vertex_excluding_v0_degC": float(gap_first[1:].min()),
    }


def as_records() -> list[dict]:
    """One row per vertex, for printing and for the captured evidence files."""
    vertices = route()
    values = hypotheses(vertices)
    seconds = epoch_seconds(vertices["time"])
    return [
        {
            "index": index,
            "lon": float(vertices["lon"][index]),
            "lat": float(vertices["lat"][index]),
            "depth_m": float(vertices["depth"][index]),
            "wkt_z_elevation_m": float(-vertices["depth"][index]),
            "time": str(vertices["time"][index]),
            "m_epoch_seconds": float(seconds[index]),
            "offset_hours_from_origin": float(vertices["offset_hours"][index]),
            "expected_per_vertex": float(values["per_vertex"][index]),
            "expected_single_time_query": float(values["single_time_query"][index]),
            "expected_single_time_first_vertex": float(values["single_time_first_vertex"][index]),
        }
        for index in range(N_VERTICES)
    ]


if __name__ == "__main__":
    import json

    print(wkt_linestring_zm())
    print()
    print(json.dumps(separation(), indent=2))
    print()
    for record in as_records():
        print(
            "{index:2d}  lon {lon:7.3f}  lat {lat:7.3f}  depth {depth_m:7.2f}  "
            "{time}  per-vertex {expected_per_vertex:8.4f}  "
            "single-time {expected_single_time_query:8.4f}".format(**record)
        )
