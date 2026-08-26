"""Prove the fixture can tell the two answers apart, before any query is issued.

SPIKE CODE. Throwaway. See `version_probe.py` for the standing caveat.

Three checks, all of which must hold before a returned value means anything:

1. The NetCDF on disk matches the analytic form at every grid point, within tolerance.
   Otherwise the expectation is not the expectation.
2. Quadrilinear interpolation of the written grid reproduces the analytic value at the
   route's vertices, which are deliberately off-grid. This is what makes it legitimate
   to score an interpolating provider against a closed-form expectation.
3. The per-vertex and single-time hypotheses differ, at every vertex, by at least ten
   times the tolerance. Without this the experiment cannot fail, and an implementation
   that quietly evaluated the whole route at one time would pass unnoticed.

Fails loudly and exits non-zero.
"""

from __future__ import annotations

import json
import sys

import numpy as np
import xarray as xr
from expectation import (
    QUERY_TIME,
    as_records,
    hypotheses,
    route,
    separation,
)
from make_fixture import (
    DISCRIMINATING_FACTOR,
    FIXTURE_PATH,
    TIME_STEP_HOURS,
    TOLERANCE,
    coefficients,
    grid,
    hours_since_t0,
    theta,
)


class SelfCheckError(Exception):
    """Raised when the fixture cannot support the conclusion the spike wants to draw."""


def check_fixture_matches_analytic_form() -> dict:
    if not FIXTURE_PATH.exists():
        raise SelfCheckError(f"fixture missing at {FIXTURE_PATH}; run make_fixture.py first")
    dataset = xr.open_dataset(FIXTURE_PATH)
    axes = grid()
    expected = theta(
        axes["lon"][None, None, None, :],
        axes["lat"][None, None, :, None],
        axes["depth"][None, :, None, None],
        hours_since_t0(axes["time"])[:, None, None, None],
        coefficients(),
    )
    written = dataset["sea_water_temperature"].values
    error = float(np.abs(written - expected).max())
    if error > TOLERANCE:
        raise SelfCheckError(
            f"written fixture departs from the analytic form by {error} degC, tolerance {TOLERANCE}"
        )
    if dataset.attrs.get("drogna_synthetic") != "true":
        raise SelfCheckError("fixture does not declare itself synthetic")
    return {
        "max_abs_error_degC": error,
        "tolerance_degC": TOLERANCE,
        "shape": list(written.shape),
        "bytes": FIXTURE_PATH.stat().st_size,
        "declares_synthetic": dataset.attrs.get("drogna_synthetic"),
        "conventions": dataset.attrs.get("Conventions"),
    }


def check_interpolation_is_exact_at_route_vertices() -> dict:
    """Off-grid vertices interpolate back to the closed-form value.

    The field is multilinear by construction, so this must hold to machine precision.
    If it ever does not, the fixture's design has been broken and the expectation can
    no longer be trusted against an interpolating provider.
    """
    dataset = xr.open_dataset(FIXTURE_PATH)
    vertices = route()
    dimension = xr.DataArray(np.arange(len(vertices["lon"])), dims="vertex")
    sampled = (
        dataset["sea_water_temperature"]
        .interp(
            lon=xr.DataArray(vertices["lon"], dims="vertex", coords={"vertex": dimension}),
            lat=xr.DataArray(vertices["lat"], dims="vertex", coords={"vertex": dimension}),
            depth=xr.DataArray(vertices["depth"], dims="vertex", coords={"vertex": dimension}),
            time=xr.DataArray(vertices["time"], dims="vertex", coords={"vertex": dimension}),
            method="linear",
        )
        .values
    )
    expected = hypotheses(vertices)["per_vertex"]
    error = float(np.abs(sampled - expected).max())
    if error > TOLERANCE:
        raise SelfCheckError(
            f"quadrilinear interpolation departs from the analytic form by {error} "
            f"degC at the route vertices, tolerance {TOLERANCE}"
        )
    return {"max_abs_error_degC": error, "tolerance_degC": TOLERANCE}


def check_vertices_fall_between_time_steps() -> dict:
    vertices = route()
    remainder = np.remainder(vertices["offset_hours"], TIME_STEP_HOURS)
    closest = float(np.minimum(remainder, TIME_STEP_HOURS - remainder).min())
    if closest < 1e-3:
        raise SelfCheckError(
            "a route vertex lands on a coverage time step; interpolation behaviour "
            "would not be exposed"
        )
    return {
        "time_step_hours": TIME_STEP_HOURS,
        "closest_approach_to_a_step_hours": closest,
        "query_time": str(QUERY_TIME),
    }


def check_hypotheses_are_separated() -> dict:
    gaps = separation()
    required = DISCRIMINATING_FACTOR * TOLERANCE
    if gaps["min_gap_query_degC"] < required:
        raise SelfCheckError(
            "per-vertex and single-time expectations differ by only "
            f"{gaps['min_gap_query_degC']} degC at the closest vertex; at least "
            f"{required} degC is required for the result to be falsifiable"
        )
    return gaps


def run() -> dict:
    return {
        "fixture_matches_analytic_form": check_fixture_matches_analytic_form(),
        "interpolation_exact_at_vertices": (check_interpolation_is_exact_at_route_vertices()),
        "vertices_between_time_steps": check_vertices_fall_between_time_steps(),
        "hypotheses_separated": check_hypotheses_are_separated(),
        "route": as_records(),
    }


if __name__ == "__main__":
    try:
        report = run()
    except SelfCheckError as failure:
        print(f"SELFCHECK FAILED: {failure}")
        sys.exit(1)
    print(json.dumps({k: v for k, v in report.items() if k != "route"}, indent=2))
    print("SELFCHECK PASSED: the fixture can distinguish the two hypotheses.")
