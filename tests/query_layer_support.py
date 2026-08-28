"""A coverage store built by the documented convention, for the query layer's tests.

Two things this module is careful about.

**The files are written by the environment generator's own writer.** ``encode_netcdf`` from
``harness_env_generator`` produces the bytes, so the query layer's reader is exercised
against the format the harness actually produces rather than against one written to match
it. A reader that agreed only with its own writer would prove nothing.

**The field has a closed-form ground truth.** It is multilinear — degree at most one in each
of time, depth, latitude and longitude — so quadrilinear interpolation reproduces it exactly
and the expected value at an off-grid point is arithmetic rather than a second
interpolation. The spike used the same trick, for the same reason: it makes "each vertex at
its own time" and "the whole route at one time" answers that cannot be confused.

The ground truth here stands in for the environment generator's recorded manifest. The
publisher (feature 009) is what will put a real generated run into a coverage store; until
then this is what a value can be scored against, and it is named as a stand-in rather than
presented as the generator's own output.
"""

from __future__ import annotations

import json
import sys
from array import array
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
QUERY_ROOT = REPO_ROOT / "query"
if str(QUERY_ROOT) not in sys.path:
    sys.path.insert(0, str(QUERY_ROOT))

from harness_core.netcdf import NetcdfVariable, encode_netcdf  # noqa: E402
from plugins.coverage_catalogue import StoreLayout, derive_run_id  # noqa: E402
from plugins.edr_coverage import CoverageSettings  # noqa: E402

_NC_DOUBLE = 6

TIME_ORIGIN = "2026-09-01T00:00:00.000000Z"
ROOT_SEED = 20260826
RUN_ID_RULE = "drogna-coverage-run-id"
RUN_ID_VERSION = 1
RUN_ID_PREFIX = "run"

TIMES: tuple[float, ...] = (0.0, 3600.0, 7200.0, 10800.0, 14400.0)
DEPTHS: tuple[float, ...] = (0.0, 100.0, 200.0, 300.0)
LATITUDES: tuple[float, ...] = (48.0, 48.5, 49.0, 49.5, 50.0)
LONGITUDES: tuple[float, ...] = (-6.0, -5.4, -4.8, -4.2, -3.6, -3.0)


@dataclass(frozen=True)
class AnalyticField:
    """A multilinear field: exactly recoverable, and each term visible in the result.

    ``time_longitude`` is the term that makes a moving feature: a vertex's value depends on
    the product of its time and its longitude, so shifting one vertex's arrival time changes
    that vertex's value and no other's, in a direction the coefficient's sign fixes.
    """

    constant: float
    per_hour: float
    per_metre_depth: float
    per_degree_latitude: float
    per_degree_longitude: float
    time_longitude: float
    depth_latitude: float

    def at(self, time_seconds: float, depth: float, latitude: float, longitude: float) -> float:
        hours = time_seconds / 3600.0
        return (
            self.constant
            + self.per_hour * hours
            + self.per_metre_depth * depth
            + self.per_degree_latitude * latitude
            + self.per_degree_longitude * longitude
            + self.time_longitude * hours * longitude
            + self.depth_latitude * depth * latitude
        )


FIELDS: Mapping[str, AnalyticField] = {
    "sea_water_temperature": AnalyticField(
        constant=34.0,
        per_hour=-0.21,
        per_metre_depth=-0.013,
        per_degree_latitude=-0.35,
        per_degree_longitude=0.18,
        time_longitude=0.043,
        depth_latitude=-0.00011,
    ),
    "sea_water_practical_salinity": AnalyticField(
        constant=35.2,
        per_hour=0.007,
        per_metre_depth=0.0009,
        per_degree_latitude=0.011,
        per_degree_longitude=-0.006,
        time_longitude=0.0013,
        depth_latitude=0.0000041,
    ),
    "sea_water_pressure": AnalyticField(
        constant=0.0,
        per_hour=0.0,
        per_metre_depth=1.0051,
        per_degree_latitude=0.0,
        per_degree_longitude=0.0,
        time_longitude=0.0,
        depth_latitude=0.0,
    ),
    "sea_water_temperature_uncertainty": AnalyticField(
        constant=0.25,
        per_hour=0.031,
        per_metre_depth=0.00042,
        per_degree_latitude=0.0,
        per_degree_longitude=0.0,
        time_longitude=0.0021,
        depth_latitude=0.0,
    ),
}

UNITS: Mapping[str, str] = {
    "sea_water_temperature": "degree_C",
    "sea_water_practical_salinity": "1e-3",
    "sea_water_pressure": "dbar",
    "sea_water_temperature_uncertainty": "degree_C",
}


def grid_spacing() -> dict[str, float]:
    """The nominal spacing of each axis, which is what a tolerance is derived from."""
    return {
        "time_seconds": TIMES[1] - TIMES[0],
        "depth_metres": DEPTHS[1] - DEPTHS[0],
        "latitude_degrees": LATITUDES[1] - LATITUDES[0],
        "longitude_degrees": LONGITUDES[1] - LONGITUDES[0],
    }


def _axis(name: str, values: Sequence[float], attributes: Mapping[str, Any]) -> NetcdfVariable:
    return NetcdfVariable(
        name=name,
        nc_type=_NC_DOUBLE,
        dimensions=(name,),
        values=array("d", list(values)),
        attributes=dict(attributes),
    )


def _column(field: AnalyticField) -> array:
    values = array("d")
    for time_seconds in TIMES:
        for depth in DEPTHS:
            for latitude in LATITUDES:
                for longitude in LONGITUDES:
                    values.append(field.at(time_seconds, depth, latitude, longitude))
    return values


def encode_field(names: Sequence[str], *, title: str) -> bytes:
    """One coverage file carrying the named variables on the shared grid."""
    variables = [
        _axis(
            "time",
            TIMES,
            {
                "standard_name": "time",
                "long_name": "simulation time",
                "units": f"seconds since {TIME_ORIGIN}",
                "axis": "T",
            },
        ),
        _axis(
            "depth",
            DEPTHS,
            {
                "standard_name": "depth",
                "long_name": "depth below sea surface",
                "units": "m",
                "positive": "down",
                "axis": "Z",
            },
        ),
        _axis(
            "latitude",
            LATITUDES,
            {
                "standard_name": "latitude",
                "long_name": "latitude",
                "units": "degrees_north",
                "axis": "Y",
            },
        ),
        _axis(
            "longitude",
            LONGITUDES,
            {
                "standard_name": "longitude",
                "long_name": "longitude",
                "units": "degrees_east",
                "axis": "X",
            },
        ),
    ]
    for name in names:
        variables.append(
            NetcdfVariable(
                name=name,
                nc_type=_NC_DOUBLE,
                dimensions=("time", "depth", "latitude", "longitude"),
                values=_column(FIELDS[name]),
                attributes={
                    "long_name": name.replace("_", " "),
                    "units": UNITS[name],
                    "coordinates": "time depth latitude longitude",
                },
            )
        )
    return encode_netcdf(
        dimensions=[
            ("time", len(TIMES)),
            ("depth", len(DEPTHS)),
            ("latitude", len(LATITUDES)),
            ("longitude", len(LONGITUDES)),
        ],
        global_attributes={
            "Conventions": "CF-1.10",
            "title": title,
            "comment": "Synthetic. The numerics are deliberately fake.",
            "drogna_synthetic": "true",
        },
        variables=variables,
    )


def run_manifest(run_id: str, sequence: int) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "run_id": run_id,
        "root_seed": ROOT_SEED,
        "run_sequence": sequence,
        "generator_version": "drogna-env-generator 0.1.0",
        "model_version": "drogna-model-kernel 0.1.0",
        "sim_time": TIME_ORIGIN,
        "valid_time": {"begin": TIME_ORIGIN, "end": "2026-09-01T04:00:00.000000Z"},
        "ensemble": {"members": 4, "method": "seeded-perturbation-mean"},
    }


def layout_for(root: Path) -> StoreLayout:
    """The layout both destinations carry, rooted wherever the test put its store."""
    return StoreLayout(
        root=root,
        runs_dirname="runs",
        staging_dirname="staging",
        current_pointer="current",
        forecast_file="forecast.nc",
        uncertainty_file="uncertainty.nc",
        manifest_file="run-manifest.json",
        partial_suffix=".partial",
    )


def run_id_for(sequence: int) -> str:
    return derive_run_id(
        root_seed=ROOT_SEED,
        run_sequence=sequence,
        rule=RUN_ID_RULE,
        version=RUN_ID_VERSION,
        prefix=RUN_ID_PREFIX,
    )


def write_run(
    layout: StoreLayout,
    sequence: int,
    *,
    complete: bool = True,
    make_current: bool = False,
) -> str:
    """Write one run into the store, by the convention, and return its identifier.

    ``complete=False`` writes the forecast field and nothing else, which is the shape a
    partially written run has if a publisher ignores the contract; the catalogue must not
    serve it.
    """
    run_id = run_id_for(sequence)
    directory = layout.run_directory(run_id)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / layout.forecast_file).write_bytes(
        encode_field(
            [
                "sea_water_temperature",
                "sea_water_practical_salinity",
                "sea_water_pressure",
            ],
            title=f"forecast, {run_id}",
        )
    )
    if complete:
        (directory / layout.uncertainty_file).write_bytes(
            encode_field(["sea_water_temperature_uncertainty"], title=f"uncertainty, {run_id}")
        )
        (directory / layout.manifest_file).write_text(
            json.dumps(run_manifest(run_id, sequence), indent=2), encoding="utf-8"
        )
    if make_current:
        set_current(layout, run_id)
    return run_id


def set_current(layout: StoreLayout, *run_ids: str) -> None:
    """Write the pointer. More than one identifier is how the conflict case is built."""
    layout.root.mkdir(parents=True, exist_ok=True)
    layout.pointer_path.write_text("\n".join(run_ids) + "\n", encoding="utf-8")


def build_store(root: Path, *, runs: int = 1, current: int | None = 0) -> StoreLayout:
    """A store holding ``runs`` complete runs, with one of them named current."""
    layout = layout_for(root)
    for sequence in range(runs):
        write_run(layout, sequence)
    if current is not None:
        set_current(layout, run_id_for(current))
    return layout


def settings(**overrides: Any) -> CoverageSettings:
    """The coverage settings both destinations carry, with anything a test needs changed."""
    section: dict[str, Any] = {
        "coverage": {
            "axes": {
                "time": "time",
                "depth": "depth",
                "latitude": "latitude",
                "longitude": "longitude",
            },
            "parameters": [
                {
                    "name": "sea_water_temperature",
                    "variable": "sea_water_temperature",
                    "source": "forecast",
                    "unit": "degree_C",
                    "label": "forecast sea water temperature",
                    "standard_name": "sea_water_temperature",
                },
                {
                    "name": "sea_water_practical_salinity",
                    "variable": "sea_water_practical_salinity",
                    "source": "forecast",
                    "unit": "1e-3",
                    "label": "forecast sea water practical salinity",
                    "standard_name": "sea_water_practical_salinity",
                },
                {
                    "name": "sea_water_pressure",
                    "variable": "sea_water_pressure",
                    "source": "forecast",
                    "unit": "dbar",
                    "label": "forecast sea water pressure",
                    "standard_name": "sea_water_pressure",
                },
                {
                    "name": "temperature_uncertainty",
                    "variable": "sea_water_temperature_uncertainty",
                    "source": "uncertainty",
                    "unit": "degree_C",
                    "label": "one standard deviation of the temperature forecast",
                },
            ],
        },
        "limits": {
            "cube_maximum_cells": 250000,
            "trajectory_maximum_vertices": 91,
            "radius_maximum_cells": 250000,
            "area_maximum_cells": 250000,
            "corridor_maximum_samples": 1001,
            "locations_maximum_locations": 100,
            "page_size_default": 100,
            "page_size_maximum": 1000,
        },
        "interpolation": {
            "method": "linear",
            "out_of_domain": "null",
            "default_depth_metres": 0.0,
        },
    }
    for key, value in overrides.items():
        section["limits"][key] = value
    return CoverageSettings.from_config(section)


def unix_seconds(iso: str) -> float:
    """A simulation instant as seconds since the Unix epoch, which is what M carries."""
    from harness_core.clock import SimInstant

    return SimInstant.from_iso(iso).micros / 1_000_000


def truth(parameter: str, time_seconds: float, depth: float, latitude: float, longitude: float):
    """The analytic ground truth a returned value is scored against."""
    variable = {
        "sea_water_temperature": "sea_water_temperature",
        "sea_water_practical_salinity": "sea_water_practical_salinity",
        "sea_water_pressure": "sea_water_pressure",
        "temperature_uncertainty": "sea_water_temperature_uncertainty",
    }[parameter]
    return FIELDS[variable].at(time_seconds, depth, latitude, longitude)


def observation_rows() -> dict[str, list[dict[str, Any]]]:
    """A small SensorThings entity set, shaped as the observation store projects it.

    Three datastreams — temperature, salinity and pressure — and no sound-speed datastream,
    because sound speed is derived at the point of use and is never stored (ADR-0005).
    """
    things = [
        {
            "id": "platform-a",
            "name": "sampling platform A",
            "description": "A simulated sampling platform. A coordinate and a sampler.",
        }
    ]
    sensors = [
        {
            "id": f"sensor-{quantity}",
            "name": f"simulated {quantity} sensor",
            "description": f"Simulated {quantity} instrument with a seeded noise model.",
            "encoding_type": "application/pdf",
            "metadata": f"synthetic {quantity} instrument",
        }
        for quantity in ("temperature", "salinity", "pressure")
    ]
    observed = [
        {
            "id": "sea_water_temperature",
            "name": "sea water temperature",
            "definition": "sea_water_temperature",
            "description": "Temperature of sea water.",
        },
        {
            "id": "sea_water_practical_salinity",
            "name": "sea water practical salinity",
            "definition": "sea_water_practical_salinity",
            "description": "Practical salinity of sea water.",
        },
        {
            "id": "sea_water_pressure",
            "name": "sea water pressure",
            "definition": "sea_water_pressure",
            "description": "Pressure of sea water.",
        },
    ]
    datastreams = [
        {
            "id": f"ds-{quantity}",
            "name": f"{quantity} at platform A",
            "description": f"Simulated {quantity} series.",
            "observation_type": "OM_Measurement",
            "unit_name": name,
            "unit_symbol": symbol,
            "unit_definition": definition,
            "thing_id": "platform-a",
            "sensor_id": f"sensor-{quantity}",
            "observed_property_id": observed_id,
        }
        for quantity, name, symbol, definition, observed_id in (
            ("temperature", "degree Celsius", "degC", "degree_C", "sea_water_temperature"),
            ("salinity", "practical salinity unit", "psu", "1e-3", "sea_water_practical_salinity"),
            ("pressure", "decibar", "dbar", "dbar", "sea_water_pressure"),
        )
    ]
    features = [
        {
            "id": "foi-000",
            "name": "sampling location 000",
            "description": "Where an observation pertains to. Not a location history.",
            "encoding_type": "application/geo+json",
            "feature": '{"type": "Point", "coordinates": [-4.5, 49.0, -25.0]}',
        }
    ]
    observations: list[dict[str, Any]] = []
    for quantity, base in (("temperature", 12.0), ("salinity", 35.1), ("pressure", 25.0)):
        for index in range(7):
            observations.append(
                {
                    "id": f"obs-{quantity}-{index:03d}",
                    "phenomenon_time": f"2026-09-01T0{index}:00:00.000000Z",
                    "result": base + index * 0.1,
                    "datastream_id": f"ds-{quantity}",
                    "feature_id": "foi-000",
                }
            )
    return {
        "Things": things,
        "Sensors": sensors,
        "ObservedProperties": observed,
        "Datastreams": datastreams,
        "Observations": observations,
        "FeaturesOfInterest": features,
    }
