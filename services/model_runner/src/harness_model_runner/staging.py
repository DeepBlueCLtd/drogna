"""Writing a run: into staging, never anywhere a reader can reach.

FR-021 draws the line this module keeps. The runner writes the two fields and a descriptor
of the run into a staging location; making them visible is one indivisible operation and it
belongs to the publisher. A runner that wrote into the catalogue would make partial
visibility possible however careful the publisher then was, because the failure would
already have happened by the time the publisher was asked.

Even inside staging, a run appears whole or not at all: the directory is written under the
configured partial suffix and moved into place with a single rename. The publisher then has
one rule to apply — a directory in staging is a finished run — rather than a heuristic about
whether writing has stopped.

The bytes are NetCDF classic, written by the one encoder in the repository. Two runs from
one seed must produce byte-identical files, which the usual writers make impossible by
stamping a creation time and a library version into the header; the harness therefore
writes the format directly, and this module calls that encoder rather than becoming a
second one. The coverage output is a genuine port (Constitution VI): what NetCDF is here,
Zarr could be later, and only :class:`NetcdfCoverage` would change.
"""

from __future__ import annotations

import json
import os
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from harness_core.clock import SimInstant
from harness_core.netcdf import NetcdfVariable, encode_netcdf
from harness_env_generator.writer import (
    CONVENTIONS,
    STORED_DTYPES,
    digest_of,
)

from harness_model_runner.ensemble import EnsembleOutcome
from harness_model_runner.kernel import RunGrid
from harness_model_runner.version import ANALYTIC_FORM_VERSION, RUNNER_NAME, RUNNER_VERSION

__all__ = ["CoverageOutput", "NetcdfCoverage", "StagedRun", "Staging"]

_SYNTHETIC = (
    "Synthetic data from a learning harness. The numerics are deliberately fake and the "
    "fields are produced from a seed by analytic advection; nothing here was measured, "
    "nothing here was forecast by a physical model, and nothing here is advice."
)
_MICROS_PER_SECOND = 1_000_000
_NC_FLOAT_AXIS = "f"


@dataclass(frozen=True)
class StagedRun:
    """Where a finished run is, and what it is: the publisher's whole input."""

    directory: Path
    descriptor: dict[str, Any]


class CoverageOutput(Protocol):
    """The coverage output port: a gridded field in, an artefact's bytes out."""

    @property
    def format(self) -> str:
        """The named format, recorded in the descriptor so a reader need not guess."""
        ...

    def encode(
        self,
        grid: RunGrid,
        variables: Mapping[str, tuple[Sequence[float], Mapping[str, Any]]],
        attributes: Mapping[str, Any],
        *,
        stored_dtype: str,
    ) -> bytes:
        """Encode one field on one grid."""
        ...


class NetcdfCoverage:
    """NetCDF classic with CF conventions: what the coverage store holds today."""

    format = "netcdf-classic-cdf1"

    def encode(
        self,
        grid: RunGrid,
        variables: Mapping[str, tuple[Sequence[float], Mapping[str, Any]]],
        attributes: Mapping[str, Any],
        *,
        stored_dtype: str = "float32",
    ) -> bytes:
        typecode, _, nc_type = STORED_DTYPES[stored_dtype]
        origin = SimInstant(grid.sim_micros[0])
        seconds = [
            (instant - grid.sim_micros[0]) / _MICROS_PER_SECOND for instant in grid.sim_micros
        ]
        axes = [
            NetcdfVariable(
                "time",
                STORED_DTYPES["float64"][2],
                ("time",),
                array("d", seconds),
                {
                    "standard_name": "time",
                    "units": f"seconds since {origin.iso()}",
                    "axis": "T",
                    "long_name": "simulation time",
                },
            ),
            NetcdfVariable(
                "depth",
                nc_type,
                ("depth",),
                array(typecode, grid.depths_m),
                {
                    "standard_name": "depth",
                    "units": "m",
                    "axis": "Z",
                    "positive": "down",
                },
            ),
            NetcdfVariable(
                "latitude",
                nc_type,
                ("latitude",),
                array(typecode, grid.latitudes),
                {"standard_name": "latitude", "units": "degrees_north", "axis": "Y"},
            ),
            NetcdfVariable(
                "longitude",
                nc_type,
                ("longitude",),
                array(typecode, grid.longitudes),
                {"standard_name": "longitude", "units": "degrees_east", "axis": "X"},
            ),
        ]
        data = [
            NetcdfVariable(
                name,
                nc_type,
                ("time", "depth", "latitude", "longitude"),
                array(typecode, values),
                dict(metadata),
            )
            for name, (values, metadata) in variables.items()
        ]
        return encode_netcdf(
            [
                ("time", len(grid.sim_micros)),
                ("depth", len(grid.depths_m)),
                ("latitude", len(grid.latitudes)),
                ("longitude", len(grid.longitudes)),
            ],
            {"Conventions": CONVENTIONS, **dict(attributes)},
            [*axes, *data],
        )


class Staging:
    """The staging location, and the only thing in this component that writes anything."""

    def __init__(
        self,
        directory: Path,
        *,
        forecast_file: str,
        uncertainty_file: str,
        manifest_file: str,
        partial_suffix: str,
        output: CoverageOutput | None = None,
        stored_dtype: str = "float32",
    ) -> None:
        self._directory = directory
        self._forecast_file = forecast_file
        self._uncertainty_file = uncertainty_file
        self._manifest_file = manifest_file
        # Configuration rather than a constant here, in the publisher and in the query
        # layer alike: Constitution IV admits no filename in component source, and this one
        # was stated three times as a literal before it was stated once in each schema.
        self._partial_suffix = partial_suffix
        self._output = output or NetcdfCoverage()
        self._stored_dtype = stored_dtype

    @property
    def directory(self) -> Path:
        return self._directory

    def write(
        self,
        outcome: EnsembleOutcome,
        *,
        run_id: str,
        run_sequence: int | None,
        scenario_run_id: str,
        kernel: str,
        root_seed: int,
        config_digest: str | None,
        initialisation_micros: int,
    ) -> StagedRun:
        """Write one finished run into staging, whole or not at all."""
        grid = outcome.mean.grid
        shared = {
            "run_id": run_id,
            "scenario_run_id": scenario_run_id,
            "time_origin_sim_time": SimInstant(grid.sim_micros[0]).iso(),
            "initialisation_sim_time": SimInstant(initialisation_micros).iso(),
            "kernel": kernel,
            "source": f"{RUNNER_NAME} {RUNNER_VERSION}",
            "analytic_form_version": ANALYTIC_FORM_VERSION,
            "comment": _SYNTHETIC,
        }
        forecast = self._output.encode(
            grid,
            {
                "temperature": (
                    outcome.mean.temperature_c,
                    {"standard_name": "sea_water_temperature", "units": "degree_Celsius"},
                ),
                "salinity": (
                    outcome.mean.salinity_psu,
                    {"standard_name": "sea_water_practical_salinity", "units": "1e-3"},
                ),
            },
            {
                **shared,
                "title": "drogna forecast field (ensemble mean)",
                "summary": (
                    "The ensemble mean of a small perturbed ensemble, on the generated "
                    "world's grid. Sound speed is not stored: it is derived at the point "
                    "of use from temperature, salinity and depth (ADR-0005)."
                ),
                "member_count": outcome.member_count,
            },
            stored_dtype=self._stored_dtype,
        )
        uncertainty = self._output.encode(
            grid,
            {
                "temperature_spread": (
                    outcome.temperature_spread_c,
                    {
                        "long_name": "ensemble spread of sea water temperature",
                        "units": "degree_Celsius",
                    },
                ),
                "salinity_spread": (
                    outcome.salinity_spread_psu,
                    {"long_name": "ensemble spread of practical salinity", "units": "1e-3"},
                ),
            },
            {
                **shared,
                "title": "drogna uncertainty field (ensemble spread)",
                "summary": (
                    "The per-cell spread across the run's members, and nothing else. It "
                    "is not combined with observation age: the planner holds that "
                    "combination, because it is the only consumer that needs it."
                ),
                "member_count": outcome.member_count,
            },
            stored_dtype=self._stored_dtype,
        )

        descriptor = {
            "run_id": run_id,
            # Which run of the scenario this is, carried from the request rather than parsed
            # back out of the name. The coverage store's manifest asks for it, and before
            # the request carried it there was nothing to answer with but a null.
            "run_sequence": run_sequence,
            "scenario_run_id": scenario_run_id,
            "status": "complete",
            "kernel": kernel,
            "format": self._output.format,
            "member_count": outcome.member_count,
            "initialisation_sim_time": SimInstant(initialisation_micros).iso(),
            "valid_time": {
                "start_sim_time": SimInstant(grid.sim_micros[0]).iso(),
                "end_sim_time": SimInstant(grid.sim_micros[-1]).iso(),
            },
            "grid_bounds": {
                "minimum_latitude": grid.latitudes[0],
                "maximum_latitude": grid.latitudes[-1],
                "minimum_longitude": grid.longitudes[0],
                "maximum_longitude": grid.longitudes[-1],
                "minimum_depth_m": grid.depths_m[0],
                "maximum_depth_m": grid.depths_m[-1],
            },
            "files": {
                "forecast": self._forecast_file,
                "uncertainty": self._uncertainty_file,
            },
            "digests": {
                "forecast": digest_of(forecast),
                "uncertainty": digest_of(uncertainty),
            },
            "seed": {"root": root_seed},
            "config_digest": config_digest,
            "stored_dtype": self._stored_dtype,
            "generator": {
                "name": RUNNER_NAME,
                "version": RUNNER_VERSION,
                "analytic_form_version": ANALYTIC_FORM_VERSION,
            },
        }

        return self._place(run_id, forecast, uncertainty, descriptor)

    def _place(
        self, run_id: str, forecast: bytes, uncertainty: bytes, descriptor: dict[str, Any]
    ) -> StagedRun:
        """Write to a partial directory and move it into place in one operation."""
        self._directory.mkdir(parents=True, exist_ok=True)
        final = self._directory / run_id
        partial = self._directory / (run_id + self._partial_suffix)
        if partial.exists():
            for existing in partial.iterdir():
                existing.unlink()
            partial.rmdir()
        partial.mkdir()
        (partial / self._forecast_file).write_bytes(forecast)
        (partial / self._uncertainty_file).write_bytes(uncertainty)
        (partial / self._manifest_file).write_text(
            json.dumps(descriptor, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        os.replace(partial, final)
        return StagedRun(directory=final, descriptor=descriptor)
