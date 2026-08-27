"""Write the committed leakage fixtures. Run by hand; never imported by a test.

Feature 014 will produce release bundles, and when it does these tests should be pointed at
one. Until then the bundles under this directory are the corpus, and this script is what
made them. It is committed with them so that the fixtures can be argued with rather than
merely trusted: a control that nobody can regenerate is a control nobody can change.

    uv run python tests/leakage/fixtures/make_fixtures.py

Everything here is a pure function of the seed at the top. The fields are written through
``harness_core.netcdf``, which is the one encoder in this repository and the reason two
runs produce byte-identical files (Constitution II). Randomness comes through
``harness_core.rng``, which is the only place a generator may be constructed
(Constitution II).

Six of the eight fixtures are **deliberately leaky controls**. They exist so that a gate
which has stopped working fails rather than passing quietly, and they are documented as
controls in ``README.md`` beside them. Nothing here is data about anything; the numerics
are fake and the domain is invented (Constitution V).
"""

from __future__ import annotations

import json
import math
from array import array
from collections.abc import Sequence
from pathlib import Path

from harness_core.netcdf import NC_DOUBLE, NetcdfVariable, encode_netcdf
from harness_core.rng import configure_run, rng_for
from harness_types.messages.run_manifest import Measurement

HERE = Path(__file__).resolve().parent

ROOT_SEED = 20260826

# The domain. Small, invented, and chosen so that the identification radius is a couple of
# cells across: a radius smaller than one cell would make the buffered geometry a scatter of
# single cells and the statistic a measure of the grid rather than of the leak.
LATITUDES = 32
LONGITUDES = 32
LATITUDE_ORIGIN = 55.00
LATITUDE_STEP = 0.010
LONGITUDE_ORIGIN = -8.00
LONGITUDE_STEP = 0.0175

METRES_PER_DEGREE_LATITUDE = 111_320.0

IDENTIFICATION_RADIUS_M = 2000.0
QUANTISATION_STEP = 0.01

# The interval between the two products, in simulation seconds. Payload, not schedule: no
# clock is read anywhere here (Constitution I).
INTERVAL_SECONDS = 3600

# The run the pairs belong to. A name, derived from nothing: these fixtures are not the
# output of a run and saying so is more honest than borrowing a plausible identifier.
RUN_ID = "leakage-fixture"


def metres_per_degree_longitude(latitude: float) -> float:
    return METRES_PER_DEGREE_LATITUDE * math.cos(math.radians(latitude))


def latitudes() -> list[float]:
    return [LATITUDE_ORIGIN + index * LATITUDE_STEP for index in range(LATITUDES)]


def longitudes() -> list[float]:
    return [LONGITUDE_ORIGIN + index * LONGITUDE_STEP for index in range(LONGITUDES)]


def measurement_geometry() -> list[Measurement]:
    """A platform that moves, because a platform that does not cannot be recovered.

    The span matters: the updated-region test reports a comparison as inconclusive when the
    geometry in the interval does not span more than the identification radius, since a
    stationary platform makes the buffered geometry a single blob that any mask covering
    the middle of the domain would appear to recover. This path spans about nineteen
    kilometres against a two-kilometre radius.
    """
    count = 12
    start = (55.05, -7.95)
    end = (55.22, -7.60)
    points = []
    for index in range(count):
        fraction = index / (count - 1)
        points.append(
            Measurement(
                longitude=start[1] + fraction * (end[1] - start[1]),
                latitude=start[0] + fraction * (end[0] - start[0]),
                simulation_seconds=index * (INTERVAL_SECONDS // count),
            )
        )
    return points


def distance_m(longitude: float, latitude: float, measurement: Measurement) -> float:
    """Local flat-earth distance. The domain is a third of a degree; a great circle is noise."""
    northing = (latitude - measurement.latitude) * METRES_PER_DEGREE_LATITUDE
    easting = (longitude - measurement.longitude) * metres_per_degree_longitude(latitude)
    return math.hypot(northing, easting)


def near_measurements(longitude: float, latitude: float, geometry: Sequence[Measurement]) -> bool:
    return any(
        distance_m(longitude, latitude, measurement) <= IDENTIFICATION_RADIUS_M
        for measurement in geometry
    )


# --- the fields ----------------------------------------------------------------------------


def base_field() -> list[list[float]]:
    """The temperature at the first of the two products. Smooth, invented, and fake."""
    field = []
    for latitude in latitudes():
        row = []
        for longitude in longitudes():
            northing = (latitude - LATITUDE_ORIGIN) / (LATITUDES * LATITUDE_STEP)
            easting = (longitude - LONGITUDE_ORIGIN) / (LONGITUDES * LONGITUDE_STEP)
            row.append(
                11.5
                + 1.8 * math.sin(2 * math.pi * (0.8 * easting + 0.3))
                + 1.1 * math.cos(2 * math.pi * (0.6 * northing - 0.2))
            )
        field.append(row)
    return field


def whole_domain_rewrite(field: list[list[float]], strength: float = 2.0) -> list[list[float]]:
    """The mitigation: every cell is recomputed, and the change is a property of the domain.

    A wave across the whole domain rather than a per-cell draw, because that is what a model
    run actually produces and because a mask whose shape has nothing to do with the domain
    would be a weaker control. At the default strength its amplitude is twice the
    quantisation step, so about two cells in three change by more than the step and the mask
    is a proper subset — a mask covering every cell would score at chance for the
    uninteresting reason that it predicts nothing.

    ``strength`` exists for one fixture. The age-driven control needs the whole-domain mask
    to be wide enough that the *union* of it with a near-measurement mask falls below the
    chance bound while the age variable on its own is fully recovered. That is the case the
    per-variable scoring exists for, and a control that does not actually produce it would
    not be a control.
    """
    amplitude = strength * QUANTISATION_STEP
    rewritten = []
    for latitude, row in zip(latitudes(), field, strict=True):
        new_row = []
        for longitude, value in zip(longitudes(), row, strict=True):
            northing = (latitude - LATITUDE_ORIGIN) / (LATITUDES * LATITUDE_STEP)
            easting = (longitude - LONGITUDE_ORIGIN) / (LONGITUDES * LONGITUDE_STEP)
            new_row.append(
                value + amplitude * math.sin(2 * math.pi * (2.7 * easting + 1.9 * northing) + 0.61)
            )
        rewritten.append(new_row)
    return rewritten


def refresh_near_measurements(
    field: list[list[float]], geometry: Sequence[Measurement]
) -> list[list[float]]:
    """The unmitigated control: only the neighbourhood of recent measurements is refreshed.

    This is what the whole-domain rewrite exists to prevent. The change mask it produces is
    the buffered measurement geometry, which is to say it is a picture of where the platform
    went, drawn by arithmetic on two files that each contain no coordinate at all.
    """
    refreshed = []
    for latitude, row in zip(latitudes(), field, strict=True):
        new_row = []
        for longitude, value in zip(longitudes(), row, strict=True):
            if near_measurements(longitude, latitude, geometry):
                new_row.append(value + 40.0 * QUANTISATION_STEP)
            else:
                new_row.append(value)
        refreshed.append(new_row)
    return refreshed


def observation_age(geometry: Sequence[Measurement], *, refreshed: bool) -> list[list[float]]:
    """Hours since the nearest measurement. A field that is a map of measurement locations.

    It is excluded from the released variable allow-list for exactly that reason. The
    fixture exists so that a build in which somebody added it back fails, rather than
    producing a released product that withholds every coordinate and discloses the geometry
    anyway.
    """
    aged = []
    for latitude in latitudes():
        row = []
        for longitude in longitudes():
            if refreshed and near_measurements(longitude, latitude, geometry):
                row.append(0.5)
            else:
                row.append(24.0)
        aged.append(row)
    return aged


def noisy_field(field: list[list[float]], stream: str) -> list[list[float]]:
    """A field with seeded, sub-quantisation jitter — a change no reader may call a change."""
    generator = rng_for(stream)
    return [
        [value + generator.uniform(-0.3, 0.3) * QUANTISATION_STEP for value in row] for row in field
    ]


# --- writing -------------------------------------------------------------------------------

CLEAN_GLOBAL_ATTRIBUTES = {
    "Conventions": "CF-1.10",
    "title": "Synthetic released field",
    "summary": "Fake numerics from an invented domain. Not data about anywhere.",
    "institution": "drogna harness",
    "source": "synthetic",
    "license": "CC0-1.0",
}


def coordinate_variables() -> list[NetcdfVariable]:
    return [
        NetcdfVariable(
            name="latitude",
            nc_type=NC_DOUBLE,
            dimensions=("latitude",),
            values=array("d", latitudes()),
            attributes={
                "standard_name": "latitude",
                "units": "degrees_north",
                "axis": "Y",
            },
        ),
        NetcdfVariable(
            name="longitude",
            nc_type=NC_DOUBLE,
            dimensions=("longitude",),
            values=array("d", longitudes()),
            attributes={
                "standard_name": "longitude",
                "units": "degrees_east",
                "axis": "X",
            },
        ),
    ]


def field_variable(
    name: str, field: Sequence[Sequence[float]], attributes: dict[str, str]
) -> NetcdfVariable:
    flat = array("d", [value for row in field for value in row])
    return NetcdfVariable(
        name=name,
        nc_type=NC_DOUBLE,
        dimensions=("latitude", "longitude"),
        values=flat,
        attributes=attributes,
    )


TEMPERATURE_ATTRIBUTES = {
    "standard_name": "sea_water_temperature",
    "units": "degree_Celsius",
    "long_name": "Synthetic sea water temperature",
}

AGE_ATTRIBUTES = {
    "long_name": "Hours since the nearest contributing measurement",
    "units": "hours",
}


def write_product(
    path: Path,
    variables: Sequence[NetcdfVariable],
    *,
    global_attributes: dict[str, object] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    dimensions = [("latitude", LATITUDES), ("longitude", LONGITUDES)]
    payload = encode_netcdf(
        dimensions,
        dict(global_attributes if global_attributes is not None else CLEAN_GLOBAL_ATTRIBUTES),
        list(variables),
    )
    path.write_bytes(payload)


def run_manifest_document(
    *, run_id: str, geometry: Sequence[Measurement] | None
) -> dict[str, object]:
    """A run manifest, with and without the measurement geometry.

    Both forms are real documents and the difference is the whole reason the block is
    optional in ``contracts/schemas/run-manifest.schema.json``: C-01 writes the run's own
    manifest as the run starts and holds no observations, so what it writes carries no
    geometry and is complete without one; the offload packager writes the copy that travels
    beside a bundle and does know where the measurements were taken, so that copy carries it.
    ``manifest_bundle`` below is the first form and every pair carries the second.

    Nothing here reads a clock or draws a number: the epoch and the revision are payload
    (Constitution I) and the geometry is a pure function of the seed at the top of this file.
    """
    document: dict[str, object] = {
        "schema_version": 1,
        "run_id": run_id,
        "root_seed": ROOT_SEED,
        "seed_derivation": {"rule": "harness-rng", "version": 1},
        "clock": {
            "epoch": "2026-01-01T00:00:00.000000Z",
            "tick_interval_us": 1_000_000,
            "mode": "lockstep",
            "rate": 1.0,
        },
        "code_version": {"revision": "0000000", "dirty": False},
        "participants": [],
        "exit_state": {"state": "completed"},
        "non_reproducible": [],
    }
    if geometry is not None:
        document["measurement_geometry"] = {
            "identification_radius_m": IDENTIFICATION_RADIUS_M,
            "interval_seconds": INTERVAL_SECONDS,
            "measurements": [
                {
                    "longitude": round(measurement.longitude, 6),
                    "latitude": round(measurement.latitude, 6),
                    "simulation_seconds": measurement.simulation_seconds,
                }
                for measurement in geometry
            ],
        }
    return document


def write_run_manifest(directory: Path, document: dict[str, object]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "run-manifest.json").write_text(
        json.dumps(document, indent=2) + "\n", encoding="utf-8"
    )


# --- the seven fixtures ---------------------------------------------------------------------


def clean_bundle(geometry: Sequence[Measurement]) -> None:
    """What a release should look like: a field, its coordinates, and nothing else."""
    directory = HERE / "clean_bundle"
    write_product(
        directory / "drogna-forecast.nc",
        [
            *coordinate_variables(),
            field_variable("sea_water_temperature", base_field(), TEMPERATURE_ATTRIBUTES),
        ],
    )
    del geometry


def leaky_bundle(geometry: Sequence[Measurement]) -> None:
    """A deliberate control. Four separate leaks, one per rule the scanner has.

    `history` carries a command line and the input files that produced it; a variable
    attribute names a sensor and a datastream; a global attribute holds a coordinate pair
    inside the identification radius of a measurement; and a text member beside the field
    names a host and a home directory.
    """
    directory = HERE / "leaky_bundle"
    first = geometry[0]
    attributes = dict(CLEAN_GLOBAL_ATTRIBUTES)
    attributes["history"] = (
        "python -m harness_offload.package --input /srv/drogna/coverage/run-0007/field.nc "
        "--manifest /srv/drogna/runs/run-0007/manifest.json"
    )
    attributes["nearest_station"] = f"{first.latitude:.5f}, {first.longitude:.5f}"
    leaking = dict(TEMPERATURE_ATTRIBUTES)
    leaking["comment"] = "derived from sensor drogna-sensor-03 datastream ds-0007-temperature"
    write_product(
        directory / "drogna-forecast.nc",
        [
            *coordinate_variables(),
            field_variable("sea_water_temperature", base_field(), leaking),
        ],
        global_attributes=attributes,
    )
    (directory / "notes.txt").write_text(
        "Packaged on droplet-01.drogna.invalid by /home/analyst/bin/package.sh\n",
        encoding="utf-8",
    )


def unreadable_bundle(geometry: Sequence[Measurement]) -> None:
    """A deliberate control: a member in a format the scanner does not understand.

    An unrecognised member is a failure and not a skip. A scanner that skipped what it could
    not read would report zero hits on a bundle it had not examined, which is the most
    dangerous result a leakage gate can produce.
    """
    directory = HERE / "unreadable_bundle"
    directory.mkdir(parents=True, exist_ok=True)
    write_product(
        directory / "drogna-forecast.nc",
        [
            *coordinate_variables(),
            field_variable("sea_water_temperature", base_field(), TEMPERATURE_ATTRIBUTES),
        ],
    )
    (directory / "thumbnail.tiff").write_bytes(b"II\x2a\x00" + b"\x00" * 64)
    del geometry


def manifest_bundle(geometry: Sequence[Measurement]) -> None:
    """A deliberate control: the run manifest itself, included in the bundle.

    It carries the root seed, the clock configuration and the digest of every participant's
    configuration. It is exactly the thing being withheld, and it arrives in a bundle by
    somebody being helpful rather than by anybody deciding to release it.
    """
    directory = HERE / "manifest_bundle"
    directory.mkdir(parents=True, exist_ok=True)
    write_product(
        directory / "drogna-forecast.nc",
        [
            *coordinate_variables(),
            field_variable("sea_water_temperature", base_field(), TEMPERATURE_ATTRIBUTES),
        ],
    )
    write_run_manifest(directory, run_manifest_document(run_id="run-0007", geometry=None))
    del geometry


def mitigated_pair(geometry: Sequence[Measurement]) -> None:
    """Two successive released products from a whole-domain rewrite. The mitigation."""
    directory = HERE / "mitigated_pair"
    first = base_field()
    second = whole_domain_rewrite(first)
    for name, field in (("t0", first), ("t1", second)):
        write_product(
            directory / name / "drogna-forecast.nc",
            [
                *coordinate_variables(),
                field_variable("sea_water_temperature", field, TEMPERATURE_ATTRIBUTES),
            ],
        )
    write_run_manifest(directory, run_manifest_document(run_id=RUN_ID, geometry=geometry))


def unmitigated_pair(geometry: Sequence[Measurement]) -> None:
    """A deliberate control: the same run with the whole-domain rewrite disabled."""
    directory = HERE / "unmitigated_pair"
    first = base_field()
    second = refresh_near_measurements(first, geometry)
    for name, field in (("t0", first), ("t1", second)):
        write_product(
            directory / name / "drogna-forecast.nc",
            [
                *coordinate_variables(),
                field_variable("sea_water_temperature", field, TEMPERATURE_ATTRIBUTES),
            ],
        )
    write_run_manifest(directory, run_manifest_document(run_id=RUN_ID, geometry=geometry))


def age_driven_pair(geometry: Sequence[Measurement]) -> None:
    """A deliberate control: the mitigation applied, and an age field released beside it.

    The temperature field is rewritten across the whole domain exactly as the mitigation
    requires, so the unioned change mask is at chance and a test that looked only at the
    union would pass. The age field beside it changes only where measurements were taken.
    This is why every variable is scored as well as the union.
    """
    directory = HERE / "age_driven_pair"
    first = base_field()
    second = whole_domain_rewrite(first, strength=6.0)
    for name, field, refreshed in (("t0", first, False), ("t1", second, True)):
        write_product(
            directory / name / "drogna-forecast.nc",
            [
                *coordinate_variables(),
                field_variable("sea_water_temperature", field, TEMPERATURE_ATTRIBUTES),
                field_variable(
                    "observation_age",
                    observation_age(geometry, refreshed=refreshed),
                    AGE_ATTRIBUTES,
                ),
            ],
        )
    write_run_manifest(directory, run_manifest_document(run_id=RUN_ID, geometry=geometry))


def unchanged_pair(geometry: Sequence[Measurement]) -> None:
    """Two products whose only difference is below the quantisation step.

    The mask is empty. That is not a pass: an empty mask means the comparison could not have
    recovered anything and the test learned nothing, so it is reported as inconclusive and
    the run fails (FR-017).
    """
    directory = HERE / "unchanged_pair"
    first = base_field()
    second = noisy_field(first, "leakage.unchanged")
    for name, field in (("t0", first), ("t1", second)):
        write_product(
            directory / name / "drogna-forecast.nc",
            [
                *coordinate_variables(),
                field_variable("sea_water_temperature", field, TEMPERATURE_ATTRIBUTES),
            ],
        )
    write_run_manifest(directory, run_manifest_document(run_id=RUN_ID, geometry=geometry))


def main() -> int:
    configure_run(ROOT_SEED)
    geometry = measurement_geometry()
    for build in (
        clean_bundle,
        leaky_bundle,
        unreadable_bundle,
        manifest_bundle,
        mitigated_pair,
        unmitigated_pair,
        age_driven_pair,
        unchanged_pair,
    ):
        build(geometry)
        print(f"wrote {build.__name__}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
