"""Position and cube over a run: valid CoverageJSON, scored against the field it came from.

Two things are checked here that a schema check alone would miss.

**The values agree with the field.** The fixture's field is multilinear, so quadrilinear
interpolation reproduces it exactly and the expected value at an off-grid point is closed
form rather than a second interpolation. The difference is *reported as a figure* beside the
grid spacing it is derived from, because "the values agree" is meaningless without one
(Constitution IX).

**A refusal is a refusal.** A point outside the domain is an error naming the extent, not an
empty coverage — an empty coverage reads as a measurement of nothing. A cube over the limit
is refused with the limit named, not truncated into a response that looks complete.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import query_layer_support as support  # noqa: E402
from plugins.coverage_catalogue import CoverageCatalogue  # noqa: E402
from plugins.edr_coverage import CoverageQuery, open_run  # noqa: E402
from plugins.errors import QueryLayerError, RequestTooLargeError  # noqa: E402

# Derived, not chosen. The field is exactly representable by quadrilinear interpolation, so
# the whole of the disagreement is the arithmetic: sixteen weighted double-precision products
# summed, against a closed form evaluated in a different order. A few units in the last place
# at the magnitude of the values, quoted generously.
INTERPOLATION_TOLERANCE = 1e-9

FORECAST_PARAMETERS = (
    "sea_water_temperature",
    "sea_water_practical_salinity",
    "sea_water_pressure",
)
UNCERTAINTY_PARAMETER = "temperature_uncertainty"


@pytest.fixture
def query(tmp_path: Path) -> CoverageQuery:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    return CoverageQuery(open_run(entry, support.settings()))


def assert_valid_coverage(document, domain_type: str, parameters) -> None:
    """The structure CoverageJSON fixes, checked rather than assumed."""
    assert document["type"] == "Coverage"
    domain = document["domain"]
    assert domain["type"] == "Domain"
    assert domain["domainType"] == domain_type

    systems = {
        tuple(entry["coordinates"]): entry["system"]["type"] for entry in domain["referencing"]
    }
    assert systems[("x", "y")] == "GeographicCRS"
    assert systems[("z",)] == "VerticalCRS"
    assert systems[("t",)] == "TemporalRS"
    # A vertical axis whose direction is left implicit gets read upside down by somebody.
    vertical = next(entry for entry in domain["referencing"] if entry["coordinates"] == ["z"])
    assert vertical["system"]["cs"]["csAxes"][0]["direction"] == "down"

    assert set(document["parameters"]) == set(parameters)
    for name in parameters:
        parameter = document["parameters"][name]
        assert parameter["type"] == "Parameter"
        assert parameter["unit"]["symbol"]
        assert parameter["observedProperty"]["label"]["en"]

        block = document["ranges"][name]
        assert block["type"] == "NdArray"
        assert block["dataType"] == "float"
        expected = 1
        for extent in block["shape"]:
            expected *= extent
        assert len(block["values"]) == expected


def test_a_position_query_returns_valid_coveragejson_with_forecast_and_uncertainty(
    query: CoverageQuery,
) -> None:
    document = query.position(
        longitude=-4.5,
        latitude=49.0,
        depth=25.0,
        time_iso="2026-09-01T01:30:00.000000Z",
    )
    served = (*FORECAST_PARAMETERS, UNCERTAINTY_PARAMETER)
    assert_valid_coverage(document, "Point", served)

    # FR-002: the uncertainty field is a parameter of the same collection, not a second one.
    assert UNCERTAINTY_PARAMETER in document["ranges"]
    assert document["domain"]["axes"]["t"]["values"] == ["2026-09-01T01:30:00.000000Z"]


def test_a_cube_query_covers_exactly_the_requested_extent(query: CoverageQuery) -> None:
    document = query.cube(
        bbox=[-5.0, 48.4, -4.0, 49.6],
        z="0/200",
        datetime_="2026-09-01T00:00:00.000000Z/2026-09-01T02:00:00.000000Z",
        parameters=["sea_water_temperature", UNCERTAINTY_PARAMETER],
    )
    assert_valid_coverage(document, "Grid", ["sea_water_temperature", UNCERTAINTY_PARAMETER])

    axes = document["domain"]["axes"]
    assert axes["x"]["values"] == [-4.8, -4.2]
    assert axes["y"]["values"] == [48.5, 49.0, 49.5]
    assert axes["z"]["values"] == [0.0, 100.0, 200.0]
    assert axes["t"]["values"] == [
        "2026-09-01T00:00:00.000000Z",
        "2026-09-01T01:00:00.000000Z",
        "2026-09-01T02:00:00.000000Z",
    ]
    assert document["ranges"]["sea_water_temperature"]["shape"] == [3, 3, 3, 2]


def test_returned_values_agree_with_the_field_and_the_difference_is_reported(
    query: CoverageQuery, capsys: pytest.CaptureFixture[str]
) -> None:
    """SC-002. The figure is printed beside the grid spacing it is derived from."""
    probes = [
        (-4.5, 49.0, 25.0, 5400.0),
        (-3.9, 48.75, 150.0, 1800.0),
        (-5.1, 49.25, 275.0, 12600.0),
        (-4.8, 49.0, 100.0, 7200.0),  # exactly on a grid node in every axis
        (-4.5, 48.75, 50.0, 1800.0),  # exactly between two nodes in every axis
    ]
    worst = 0.0
    for longitude, latitude, depth, seconds in probes:
        moment = f"2026-09-01T{int(seconds) // 3600:02d}:{int(seconds) % 3600 // 60:02d}:00.000000Z"
        document = query.position(
            longitude=longitude, latitude=latitude, depth=depth, time_iso=moment
        )
        for parameter in (*FORECAST_PARAMETERS, UNCERTAINTY_PARAMETER):
            returned = document["ranges"][parameter]["values"][0]
            expected = support.truth(parameter, seconds, depth, latitude, longitude)
            worst = max(worst, abs(returned - expected))

    spacing = support.grid_spacing()
    with capsys.disabled():
        print(
            f"\n  interpolation error against the field, worst of "
            f"{len(probes) * 4} probes: {worst:.3e}"
            f"\n  grid spacing: {spacing['longitude_degrees']}° longitude, "
            f"{spacing['latitude_degrees']}° latitude, {spacing['depth_metres']} m depth, "
            f"{spacing['time_seconds']:.0f} s"
            f"\n  declared tolerance: {INTERPOLATION_TOLERANCE:.3e}"
        )
    assert worst < INTERPOLATION_TOLERANCE


def test_a_query_on_a_grid_node_returns_the_stored_value_unaltered(
    query: CoverageQuery,
) -> None:
    """Boundary behaviour, stated and checked: on a node, no arithmetic between neighbours."""
    document = query.position(
        longitude=-4.8,
        latitude=49.0,
        depth=100.0,
        time_iso="2026-09-01T02:00:00.000000Z",
        parameters=["sea_water_temperature"],
    )
    returned = document["ranges"]["sea_water_temperature"]["values"][0]
    assert returned == pytest.approx(
        support.truth("sea_water_temperature", 7200.0, 100.0, 49.0, -4.8), abs=1e-12
    )


def test_a_query_between_two_time_steps_interpolates_rather_than_snapping(
    query: CoverageQuery,
) -> None:
    """Snapping is indistinguishable from outside and puts avoidable error into AT-01."""
    midpoint = query.position(
        longitude=-4.5,
        latitude=49.0,
        depth=25.0,
        time_iso="2026-09-01T00:30:00.000000Z",
        parameters=["sea_water_temperature"],
    )["ranges"]["sea_water_temperature"]["values"][0]
    before = query.position(
        longitude=-4.5,
        latitude=49.0,
        depth=25.0,
        time_iso="2026-09-01T00:00:00.000000Z",
        parameters=["sea_water_temperature"],
    )["ranges"]["sea_water_temperature"]["values"][0]
    after = query.position(
        longitude=-4.5,
        latitude=49.0,
        depth=25.0,
        time_iso="2026-09-01T01:00:00.000000Z",
        parameters=["sea_water_temperature"],
    )["ranges"]["sea_water_temperature"]["values"][0]

    assert midpoint != before
    assert midpoint != after
    assert midpoint == pytest.approx((before + after) / 2, abs=1e-12)


def test_a_point_outside_the_domain_is_refused_with_the_extent_named(
    query: CoverageQuery,
) -> None:
    with pytest.raises(QueryLayerError) as refusal:
        query.position(
            longitude=12.0, latitude=49.0, depth=25.0, time_iso="2026-09-01T01:00:00.000000Z"
        )
    message = str(refusal.value)
    assert "longitude" in message
    assert "outside" in message
    assert "-6.0" in message and "-3.0" in message


def test_a_cube_over_the_limit_is_refused_with_the_limit_named(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    entry = CoverageCatalogue(layout).current()
    narrow = CoverageQuery(open_run(entry, support.settings(cube_maximum_cells=10)))

    with pytest.raises(RequestTooLargeError) as refusal:
        narrow.cube(bbox=[-6.0, 48.0, -3.0, 50.0])
    message = str(refusal.value)
    assert "limit is 10" in message
    assert "600 cells" in message


def test_a_query_naming_no_time_is_answered_over_the_run_s_valid_time(
    query: CoverageQuery,
) -> None:
    """Not "now". There is no now, and reading one would be a host clock deciding this."""
    document = query.cube(bbox=[-5.0, 48.4, -4.0, 49.6], z="0", parameters=["sea_water_pressure"])
    times = document["domain"]["axes"]["t"]["values"]
    assert times[0] == support.TIME_ORIGIN
    assert times[-1] == "2026-09-01T04:00:00.000000Z"


def test_an_earlier_run_is_readable_by_its_own_identifier(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=2, current=1)
    catalogue = CoverageCatalogue(layout)
    earlier = catalogue.entry(support.run_id_for(0))
    document = CoverageQuery(open_run(earlier, support.settings())).position(
        longitude=-4.5, latitude=49.0, depth=25.0, time_iso="2026-09-01T01:00:00.000000Z"
    )
    assert_valid_coverage(document, "Point", (*FORECAST_PARAMETERS, UNCERTAINTY_PARAMETER))
