"""The entity set is walkable from the service root, and the counts reconcile with the store.

The walk is the point. FR-027 and SC-013 ask that every relationship a served entity has
carries a navigation link, so a consumer can reach everything from the root without knowing
the path grammar in advance. This test does exactly that — it follows links and never
constructs a path — because a test that built the paths itself would pass over an interface
nobody could actually navigate.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import query_layer_support as support  # noqa: E402
from plugins.errors import QueryLayerError, QueryOptionRefusedError  # noqa: E402
from plugins.sensorthings_entities import (  # noqa: E402
    ABSENT_ENTITY_SETS,
    ENTITY_SETS,
    PHENOMENON_TIME,
)
from plugins.sensorthings_provider import (  # noqa: E402
    InMemoryRowSource,
    SensorThingsService,
)

BASE = "https://drogna.invalid/query"
ROWS = support.observation_rows()


@pytest.fixture
def service() -> SensorThingsService:
    return SensorThingsService(
        InMemoryRowSource(ROWS),
        base_url=BASE,
        page_size_default=100,
        page_size_maximum=1000,
    )


def follow(service: SensorThingsService, url: str, parameters: dict[str, str] | None = None):
    """Resolve a link the interface itself served. No path is constructed by this test."""
    assert url.startswith(BASE + "/"), f"{url} is not under the served base"
    return service.resource(url[len(BASE) + 1 :], parameters or {})


def test_the_service_root_lists_every_served_entity_set_by_link(
    service: SensorThingsService,
) -> None:
    root = service.root()
    assert [entry["name"] for entry in root["value"]] == list(ENTITY_SETS)
    for entry in root["value"]:
        assert follow(service, entry["url"])["value"] is not None


def test_the_conformance_statement_the_root_advertises_is_reachable_at_the_link_it_gives(
    service: SensorThingsService,
) -> None:
    """The statement of what is not implemented is the one link a reader follows first.

    The root advertises it by href, so it has to answer there. It did not: the service
    knew the segment, built the link from it, and never routed it — a reader following
    the link was told there is no entity set of that name, which is true and useless.
    Followed rather than constructed, like every other link in this file.
    """
    root = service.root()
    href = root["drogna:conformance"]["href"]
    served = follow(service, href)
    assert served["conformant"] is False
    assert served["entity_sets_served"] == list(ENTITY_SETS)
    assert set(served["entity_sets_absent"]) == set(ABSENT_ENTITY_SETS)


def test_the_whole_entity_set_can_be_walked_from_the_root_through_links_alone(
    service: SensorThingsService,
) -> None:
    reached: set[str] = set()
    queue: list[str] = [entry["url"] for entry in service.root()["value"]]
    seen: set[str] = set()

    while queue:
        url = queue.pop()
        if url in seen:
            continue
        seen.add(url)
        document = follow(service, url)
        entities: list[dict[str, Any]] = document.get("value", [document])
        for entity in entities:
            reached.add(entity["@iot.selfLink"])
            for key, value in entity.items():
                if key.endswith("@iot.navigationLink"):
                    queue.append(value)
            if "@iot.selfLink" in entity:
                queue.append(entity["@iot.selfLink"])

    expected = {
        f"{BASE}/{name}('{row[ENTITY_SETS[name].id_column]}')"
        for name, rows in ROWS.items()
        for row in rows
    }
    assert expected <= reached


def test_every_relationship_carries_a_navigation_link(service: SensorThingsService) -> None:
    """SC-013: the count of relationships served without a navigation link is zero."""
    missing: list[str] = []
    for name, model in ENTITY_SETS.items():
        document = service.resource(name)
        for entity in document["value"]:
            for relationship in model.relationships:
                if f"{relationship.name}@iot.navigationLink" not in entity:
                    missing.append(f"{name}({entity['@iot.id']}).{relationship.name}")
    assert missing == []


def test_navigation_resolves_in_both_directions_and_the_identifiers_agree(
    service: SensorThingsService,
) -> None:
    datastream = service.resource("Datastreams('ds-temperature')")
    thing = follow(service, datastream["Thing@iot.navigationLink"])
    back = follow(service, thing["Datastreams@iot.navigationLink"])

    assert thing["@iot.id"] == "platform-a"
    assert datastream["@iot.id"] in [entity["@iot.id"] for entity in back["value"]]

    observations = follow(service, datastream["Observations@iot.navigationLink"])
    first = observations["value"][0]
    owner = follow(service, first["Datastream@iot.navigationLink"])
    assert owner["@iot.id"] == datastream["@iot.id"]

    feature = follow(service, first["FeatureOfInterest@iot.navigationLink"])
    its_observations = follow(service, feature["Observations@iot.navigationLink"])
    assert first["@iot.id"] in [entity["@iot.id"] for entity in its_observations["value"]]


def test_the_datastreams_are_temperature_salinity_and_pressure_and_nothing_derived(
    service: SensorThingsService,
) -> None:
    """ADR-0005: sound speed is derived at the point of use and is never a datastream."""
    document = service.resource("Datastreams", {"$expand": "ObservedProperty"})
    definitions = [entity["ObservedProperty"]["definition"] for entity in document["value"]]

    assert sorted(definitions) == [
        "sea_water_practical_salinity",
        "sea_water_pressure",
        "sea_water_temperature",
    ]
    assert not any("sound" in definition for definition in definitions)
    for entity in document["value"]:
        assert entity["unitOfMeasurement"]["symbol"]


def test_the_observation_count_per_datastream_equals_the_store_s(
    service: SensorThingsService,
) -> None:
    """SC-009, reconciled through $count rather than by retrieving every page."""
    for datastream in service.resource("Datastreams")["value"]:
        served = follow(
            service,
            datastream["Observations@iot.navigationLink"],
            {"$count": "true", "$top": "1"},
        )
        in_store = sum(
            1 for row in ROWS["Observations"] if row["datastream_id"] == datastream["@iot.id"]
        )
        assert served["@iot.count"] == in_store


def test_observations_carry_their_phenomenon_times_and_no_other_time(
    service: SensorThingsService,
) -> None:
    document = service.resource("Datastreams('ds-pressure')/Observations")
    for entity in document["value"]:
        assert entity[PHENOMENON_TIME]
        for forbidden in ("resultTime", "receivedAt", "insertedAt", "createdAt"):
            assert forbidden not in entity


def test_filtering_and_ordering_are_on_phenomenon_time_alone(
    service: SensorThingsService,
) -> None:
    """Constitution I: no arrival or insertion time is exposed, filterable or orderable."""
    window = service.resource(
        "Observations",
        {"$filter": "phenomenonTime lt 2026-09-01T03:00:00.000000Z", "$count": "true"},
    )
    assert window["@iot.count"] == 9

    for property_name in ("resultTime", "receivedAt", "insertedAt"):
        with pytest.raises(QueryOptionRefusedError) as refusal:
            service.resource("Observations", {"$filter": f"{property_name} gt 2026-09-01"})
        assert property_name in str(refusal.value)
        with pytest.raises(QueryOptionRefusedError):
            service.resource("Observations", {"$orderby": property_name})


@pytest.mark.parametrize("method", ["POST", "PATCH", "PUT", "DELETE"])
def test_no_write_operation_succeeds(service: SensorThingsService, method: str) -> None:
    """SC-010. The refusal is decided before any connection is touched."""
    with pytest.raises(QueryOptionRefusedError) as refusal:
        service.resource("Observations", {}, method=method)
    assert "select permission" in str(refusal.value)


def test_locations_and_historical_locations_are_not_served_and_the_reason_is_given(
    service: SensorThingsService,
) -> None:
    for absent in ABSENT_ENTITY_SETS:
        with pytest.raises(QueryLayerError) as refusal:
            service.resource(absent)
        assert absent in str(refusal.value)
    assert set(ABSENT_ENTITY_SETS) == {"Locations", "HistoricalLocations"}
    assert not set(ABSENT_ENTITY_SETS) & set(ENTITY_SETS)


def test_paging_a_datastream_s_observations_reaches_every_one_of_them(
    service: SensorThingsService,
) -> None:
    collected: list[str] = []
    document = service.resource("Datastreams('ds-temperature')/Observations", {"$top": "2"})
    while True:
        collected.extend(entity["@iot.id"] for entity in document["value"])
        link = document.get("@iot.nextLink")
        if link is None:
            break
        url, _, query = link.partition("?")
        parameters = dict(pair.split("=", 1) for pair in query.split("&") if "=" in pair)
        document = follow(service, url, parameters)

    in_store = [
        row["id"] for row in ROWS["Observations"] if row["datastream_id"] == "ds-temperature"
    ]
    assert sorted(collected) == sorted(in_store)


def test_the_sql_a_postgres_row_source_would_issue_is_a_select_and_nothing_else() -> None:
    """The role holds select permission; the statements the provider builds hold no more."""
    from plugins.sensorthings_entities import SelectionCriteria, TimeComparison
    from plugins.sensorthings_provider import PostgresRowSource

    source = PostgresRowSource(
        dsn="postgresql://drogna_read@observations:5432/drogna",
        schema="observations",
        tables={
            "things": "thing",
            "sensors": "sensor",
            "observed_properties": "observed_property",
            "datastreams": "datastream",
            "observations": "observation",
            "features_of_interest": "feature_of_interest",
        },
    )
    statement, values = source._statement(
        "Observations",
        SelectionCriteria(
            equals={"datastream_id": "ds-temperature"},
            phenomenon_time=(TimeComparison("ge", "2026-09-01T00:00:00.000000Z"),),
            skip=0,
            top=10,
        ),
        counting=False,
    )
    assert statement.startswith("SELECT * FROM observations.observation WHERE")
    for forbidden in ("INSERT", "UPDATE", "DELETE", "COPY", "CREATE", "GRANT"):
        assert forbidden not in statement.upper()
    # Values travel as parameters, never interpolated into the statement.
    assert "ds-temperature" not in statement
    assert "ds-temperature" in values
