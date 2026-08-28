"""The named-locations list: two kinds, current positions only, and a column per entry.

The sensor half's "current position only" rule lives in one SQL statement, and the
statement is built by a pure function so its shape can be inspected here without a
database: DISTINCT ON the platform with phenomenon time descending is what makes a past
position unreachable through this interface. The catalogue's own behaviour — the kinds
distinguished, the budget, the datetime refusal, the unknown-identifier refusal — is
tested through an in-memory source, and every served list is validated against the
generated model of `contracts/schemas/edr-locations.schema.json`, so the shape served and
the shape declared cannot drift.
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
from harness_types.messages.edr_locations import DrognaEdrNamedLocations  # noqa: E402
from plugins.coverage_catalogue import CoverageCatalogue  # noqa: E402
from plugins.edr_coverage import open_run  # noqa: E402
from plugins.edr_locations import (  # noqa: E402
    LocationsCatalogue,
    NamedLocation,
    location_column,
    sensor_position_statement,
)
from plugins.errors import QueryLayerError, RequestTooLargeError  # noqa: E402

FEATURES = [
    {"id": "eddy_a", "name": "the seeded eddy", "longitude": -4.5, "latitude": 49.0},
    {"id": "front_a", "name": "the seeded front", "longitude": -5.2, "latitude": 48.8},
]

AS_OF = "2026-09-01T06:00:00.000000Z"


class StubSensorPositions:
    """One current position per platform, as the SQL statement would hand back."""

    def __init__(self, *positions: NamedLocation) -> None:
        self._positions = list(positions)

    def current_positions(self) -> list[NamedLocation]:
        return list(self._positions)


def platform(identifier: str = "platform-a", longitude: float = -4.5) -> NamedLocation:
    return NamedLocation(
        identifier=identifier,
        name=f"sampling platform {identifier[-1].upper()}",
        kind="sensor",
        longitude=longitude,
        latitude=49.0,
        as_of=AS_OF,
    )


def catalogue(*sensors: NamedLocation, maximum: int = 100) -> LocationsCatalogue:
    return LocationsCatalogue(FEATURES, StubSensorPositions(*sensors), maximum_locations=maximum)


def test_the_list_distinguishes_the_two_kinds_and_matches_the_declared_shape() -> None:
    document = catalogue(platform()).list()
    DrognaEdrNamedLocations.model_validate(document)

    by_id = {entry["id"]: entry for entry in document["features"]}
    assert by_id["eddy_a"]["properties"]["kind"] == "feature"
    assert "as_of" not in by_id["eddy_a"]["properties"]
    assert by_id["platform-a"]["properties"]["kind"] == "sensor"
    assert by_id["platform-a"]["properties"]["as_of"] == AS_OF
    assert by_id["platform-a"]["geometry"]["coordinates"] == [-4.5, 49.0]


def test_the_statement_takes_one_latest_row_per_platform_and_nothing_deeper() -> None:
    statement = sensor_position_statement(
        "observations",
        {"observations": "observation", "datastreams": "datastream", "things": "thing"},
    )
    # DISTINCT ON the platform with phenomenon time descending: exactly one row per
    # platform, its latest observation. No shape of this query returns a history.
    assert statement.startswith("SELECT DISTINCT ON (d.thing_id)")
    assert "ORDER BY d.thing_id, o.phenomenon_time DESC" in statement
    assert "phenomenon_time" in statement
    # Ordering is simulation time alone; nothing here reads or exposes a host clock.
    for forbidden in ("now()", "current_timestamp", "inserted", "received"):
        assert forbidden not in statement.lower()


def test_an_over_budget_list_is_refused_with_the_count_and_the_limit() -> None:
    sensors = [platform(f"platform-{letter}") for letter in "abc"]
    with pytest.raises(RequestTooLargeError) as caught:
        catalogue(*sensors, maximum=4).list()
    message = str(caught.value)
    assert "5 entries" in message
    assert "locations_maximum_locations is 4" in message
    assert "truncated" in message


def test_a_datetime_on_the_list_is_refused_as_the_history_it_would_be() -> None:
    with pytest.raises(QueryLayerError) as caught:
        catalogue(platform()).list(datetime_="2026-09-01T00:00:00Z/2026-09-01T06:00:00Z")
    message = str(caught.value)
    assert "location history" in message
    assert "Constitution V" in message


def test_a_bbox_filters_the_list_without_touching_the_kinds() -> None:
    document = catalogue(platform(longitude=-3.2)).list(bbox=[-5.0, 48.0, -4.0, 50.0])
    identifiers = [entry["id"] for entry in document["features"]]
    assert identifiers == ["eddy_a"]

    with pytest.raises(QueryLayerError, match="four numbers"):
        catalogue().list(bbox=[1.0, 2.0])


def test_an_unknown_identifier_is_refused_naming_the_known_ones() -> None:
    with pytest.raises(QueryLayerError) as caught:
        catalogue(platform()).find("eddy_b")
    message = str(caught.value)
    assert "'eddy_b'" in message
    for known in ("eddy_a", "front_a", "platform-a"):
        assert known in message


def test_a_named_location_answers_its_water_column_against_the_field(tmp_path: Path) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run = open_run(CoverageCatalogue(layout).current(), support.settings())
    location = catalogue().find("eddy_a")

    document = location_column(
        run,
        location,
        datetime_="2026-09-01T02:00:00.000000Z",
        parameters=["sea_water_temperature"],
    )
    axes = document["domain"]["axes"]
    assert axes["x"]["values"] == [-4.5]
    assert axes["y"]["values"] == [49.0]
    assert axes["z"]["values"] == [0.0, 100.0, 200.0, 300.0]
    values = document["ranges"]["sea_water_temperature"]["values"]
    for depth, value in zip(axes["z"]["values"], values, strict=True):
        expected = support.truth("sea_water_temperature", 7200.0, depth, 49.0, -4.5)
        assert value == pytest.approx(expected, abs=1e-9)


def test_a_column_over_the_cube_budget_is_refused_naming_that_same_limit(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run = open_run(CoverageCatalogue(layout).current(), support.settings(cube_maximum_cells=10))
    with pytest.raises(RequestTooLargeError) as caught:
        location_column(run, catalogue().find("eddy_a"))
    message = str(caught.value)
    assert "20 cells" in message  # 5 times x 4 depths
    assert "cube_maximum_cells is 10" in message


def test_a_location_outside_the_run_domain_is_refused_naming_the_extent(
    tmp_path: Path,
) -> None:
    layout = support.build_store(tmp_path, runs=1, current=0)
    run = open_run(CoverageCatalogue(layout).current(), support.settings())
    adrift = NamedLocation(
        identifier="platform-x", name="adrift", kind="sensor", longitude=10.0, latitude=49.0
    )
    with pytest.raises(QueryLayerError) as caught:
        location_column(run, adrift)
    message = str(caught.value)
    assert "outside this run's domain in longitude" in message
    assert "covers" in message
