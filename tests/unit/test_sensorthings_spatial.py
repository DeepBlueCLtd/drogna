"""The filter subset's one spatial predicate, and the refusals that keep it one.

FR-80 grows `st_within(location, geography'POLYGON (…)')` into the subset, composing with
the temporal comparisons. What is asserted here is the narrowness as much as the width:
every other function, property and geometry keeps a refusal that names it, both row
sources answer the predicate from the same parse, and the Postgres statement carries the
geometry as a bound parameter rather than interpolated text.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from plugins.errors import QueryOptionRefusedError  # noqa: E402
from plugins.sensorthings_entities import ENTITY_SETS, SelectionCriteria  # noqa: E402
from plugins.sensorthings_options import parse_options, rows_after_filter  # noqa: E402
from plugins.sensorthings_provider import PostgresRowSource  # noqa: E402

CONFORMANCE = "https://drogna.invalid/query/conformance"
OBSERVATIONS = ENTITY_SETS["Observations"]

SQUARE = "POLYGON ((-5.0 48.4, -4.0 48.4, -4.0 49.6, -5.0 49.6, -5.0 48.4))"


def parse(query: dict[str, str], entity=OBSERVATIONS):
    return parse_options(
        query,
        entity,
        conformance=CONFORMANCE,
        page_size_default=100,
        page_size_maximum=1000,
    )


def row(identifier: str, longitude: float, latitude: float, time: str) -> dict:
    return {
        "id": identifier,
        "phenomenon_time": time,
        "result": 12.0,
        "location": {"type": "Point", "coordinates": [longitude, latitude]},
    }


def test_the_predicate_parses_into_criteria_both_row_sources_read() -> None:
    options = parse({"$filter": f"st_within(location, geography'{SQUARE}')"})
    assert len(options.criteria.within) == 1
    predicate = options.criteria.within[0]
    assert predicate.wkt == SQUARE
    assert predicate.ring[0] == (-5.0, 48.4)


def test_the_predicate_composes_with_temporal_filtering_by_and() -> None:
    options = parse(
        {
            "$filter": (
                f"phenomenonTime ge 2026-09-01T02:00:00.000000Z and "
                f"st_within(location, geography'{SQUARE}') and "
                f"phenomenonTime lt 2026-09-01T04:00:00.000000Z"
            )
        }
    )
    inside_late = row("a", -4.5, 49.0, "2026-09-01T03:00:00.000000Z")
    inside_early = row("b", -4.5, 49.0, "2026-09-01T01:00:00.000000Z")
    outside_late = row("c", -3.2, 49.0, "2026-09-01T03:00:00.000000Z")
    selected = rows_after_filter(
        [inside_late, inside_early, outside_late], OBSERVATIONS, options.criteria
    )
    # Both halves genuinely filter: the drawn geometry excludes c, the window excludes b.
    assert [entry["id"] for entry in selected] == ["a"]


def test_a_point_on_the_ring_is_within_as_the_area_query_reads_it() -> None:
    options = parse({"$filter": f"st_within(location, geography'{SQUARE}')"})
    boundary = row("edge", -5.0, 49.0, "2026-09-01T00:00:00.000000Z")
    assert rows_after_filter([boundary], OBSERVATIONS, options.criteria) == [boundary]


def test_a_row_with_no_location_is_not_within_anything() -> None:
    options = parse({"$filter": f"st_within(location, geography'{SQUARE}')"})
    missing = {"id": "x", "phenomenon_time": "2026-09-01T00:00:00.000000Z", "result": 1.0}
    assert rows_after_filter([missing], OBSERVATIONS, options.criteria) == []


def test_the_postgres_statement_binds_the_geometry_rather_than_splicing_it() -> None:
    source = PostgresRowSource(
        dsn="postgresql://drogna_read@observations:5432/drogna",
        schema="observations",
        tables={"observations": "observation"},
    )
    options = parse(
        {
            "$filter": (
                f"st_within(location, geography'{SQUARE}') and "
                f"phenomenonTime ge 2026-09-01T02:00:00.000000Z"
            )
        }
    )
    statement, values = source._statement("Observations", options.criteria, counting=False)
    assert "ST_Within(location::geometry, ST_GeomFromText(%s, 4326))" in statement
    assert SQUARE in values
    assert SQUARE not in statement, "the WKT is a bound parameter, never interpolated"
    assert "phenomenon_time >= %s" in statement


@pytest.mark.parametrize(
    ("expression", "named"),
    [
        ("st_intersects(location, geography'POLYGON ((0 0,1 0,1 1,0 0))')", "st_intersects()"),
        ("geo.distance(location, geography'POINT (0 0)') lt 10", "distance()"),
        ("st_within(result, geography'POLYGON ((0 0,1 0,1 1,0 0))')", "st_within on result"),
        ("st_within(location, geography'POINT (0 0)')", "st_within with POINT"),
        (
            "st_within(location, geography'MULTIPOLYGON (((0 0,1 0,1 1,0 0)))')",
            "st_within with MULTIPOLYGON",
        ),
        (
            "st_within(location, geography'POLYGON ((0 0,1 0,1 1,0 0),"
            "(0.2 0.2,0.4 0.2,0.4 0.4,0.2 0.2))')",
            "st_within with POLYGON",
        ),
        ("st_within(location, geography'POLYGON ((not numbers)')", "st_within"),
    ],
)
def test_everything_beyond_the_one_predicate_is_refused_with_its_name(
    expression: str, named: str
) -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$filter": expression})
    message = str(refusal.value)
    assert named in message
    assert CONFORMANCE in message


def test_a_spatial_filter_on_an_entity_with_no_geometry_is_refused_naming_it() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse(
            {"$filter": f"st_within(location, geography'{SQUARE}')"},
            entity=ENTITY_SETS["Things"],
        )
    message = str(refusal.value)
    assert "Things" in message
    assert "no geometry" in message


def test_the_predicate_travels_through_navigation_criteria() -> None:
    # Datastreams('x')/Observations?$filter=st_within(...): the navigation keeps the
    # spatial half exactly as it keeps the temporal half.
    options = parse({"$filter": f"st_within(location, geography'{SQUARE}')"})
    criteria = SelectionCriteria(
        equals={"datastream_id": "ds-temperature"},
        phenomenon_time=options.criteria.phenomenon_time,
        within=options.criteria.within,
    )
    inside = {**row("a", -4.5, 49.0, "2026-09-01T00:00:00.000000Z")}
    inside["datastream_id"] = "ds-temperature"
    outside = {**row("b", -3.2, 49.0, "2026-09-01T00:00:00.000000Z")}
    outside["datastream_id"] = "ds-temperature"
    assert rows_after_filter([inside, outside], OBSERVATIONS, criteria) == [inside]
