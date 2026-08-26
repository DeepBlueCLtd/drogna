"""The implemented query options work, and every excluded one is refused by name (SC-015).

The half of this that matters most is the second half. An option that is implemented and
wrong shows up as a wrong answer somebody can see. An option that is *ignored* returns an
answer to a question nobody asked and looks exactly like a correct one, which is why FR-029
requires a refusal naming the option rather than silence.
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
from plugins.errors import QueryLayerError, QueryOptionRefusedError  # noqa: E402
from plugins.sensorthings_entities import ENTITY_SETS  # noqa: E402
from plugins.sensorthings_options import (  # noqa: E402
    IMPLEMENTED_OPTIONS,
    OUT_OF_SCOPE,
    next_link,
    parse_options,
)
from plugins.sensorthings_provider import (  # noqa: E402
    InMemoryRowSource,
    SensorThingsService,
)

CONFORMANCE = "https://drogna.invalid/query/conformance"
OBSERVATIONS = ENTITY_SETS["Observations"]
DATASTREAMS = ENTITY_SETS["Datastreams"]


def service(page_size_default: int = 100, page_size_maximum: int = 1000) -> SensorThingsService:
    return SensorThingsService(
        InMemoryRowSource(support.observation_rows()),
        base_url="https://drogna.invalid/query",
        page_size_default=page_size_default,
        page_size_maximum=page_size_maximum,
    )


def parse(parameters, entity=OBSERVATIONS, **kwargs):
    return parse_options(
        parameters,
        entity,
        conformance=CONFORMANCE,
        page_size_default=kwargs.pop("page_size_default", 100),
        page_size_maximum=kwargs.pop("page_size_maximum", 1000),
        **kwargs,
    )


# -- the implemented subset ----------------------------------------------------------------


def test_top_and_skip_page_and_the_next_link_carries_the_offset_forward() -> None:
    first = service().resource("Observations", {"$top": "3"})
    assert len(first["value"]) == 3
    assert "$skip=3" in first["@iot.nextLink"]

    second = service().resource("Observations", {"$top": "3", "$skip": "3"})
    assert [entity["@iot.id"] for entity in second["value"]] != [
        entity["@iot.id"] for entity in first["value"]
    ]


def test_a_short_page_carries_no_next_link() -> None:
    """A next link on a short page invites a round trip that returns nothing."""
    options = parse({"$top": "100"})
    assert next_link("https://drogna.invalid/query/Observations", {}, options, returned=7) is None


def test_top_is_bounded_by_the_configured_maximum_rather_than_honoured_unbounded() -> None:
    options = parse({"$top": "100000"}, page_size_maximum=25)
    assert options.top == 25


def test_count_reports_the_total_without_retrieving_every_page() -> None:
    document = service().resource("Observations", {"$top": "2", "$count": "true"})
    assert len(document["value"]) == 2
    assert document["@iot.count"] == 21


def test_orderby_on_phenomenon_time_reverses_the_series() -> None:
    ascending = service().resource("Observations", {"$orderby": "phenomenonTime asc"})
    descending = service().resource("Observations", {"$orderby": "phenomenonTime desc"})
    assert [entity["@iot.id"] for entity in descending["value"]] == list(
        reversed([entity["@iot.id"] for entity in ascending["value"]])
    )


def test_filter_on_phenomenon_time_selects_a_window() -> None:
    document = service().resource(
        "Datastreams('ds-temperature')/Observations",
        {
            "$filter": (
                "phenomenonTime ge 2026-09-01T02:00:00.000000Z and "
                "phenomenonTime lt 2026-09-01T05:00:00.000000Z"
            ),
            "$count": "true",
        },
    )
    assert document["@iot.count"] == 3
    assert [entity["phenomenonTime"] for entity in document["value"]] == [
        "2026-09-01T02:00:00.000000Z",
        "2026-09-01T03:00:00.000000Z",
        "2026-09-01T04:00:00.000000Z",
    ]


def test_expand_reaches_one_level_and_no_further() -> None:
    document = service().resource(
        "Datastreams('ds-salinity')",
        {"$expand": "Sensor,ObservedProperty,Thing"},
    )
    assert document["Sensor"]["@iot.id"] == "sensor-salinity"
    assert document["ObservedProperty"]["@iot.id"] == "sea_water_practical_salinity"
    assert document["Thing"]["@iot.id"] == "platform-a"
    # The expanded entities are entities, with their own self links, not bare property bags.
    assert document["Sensor"]["@iot.selfLink"].endswith("Sensors('sensor-salinity')")


def test_every_implemented_option_is_accepted() -> None:
    for option, value in (
        ("$top", "5"),
        ("$skip", "1"),
        ("$count", "true"),
        ("$orderby", "phenomenonTime"),
        ("$filter", "phenomenonTime gt 2026-09-01T00:00:00.000000Z"),
    ):
        parse({option: value})
    parse({"$expand": "Sensor"}, entity=DATASTREAMS)
    assert set(IMPLEMENTED_OPTIONS) == {
        "$top",
        "$skip",
        "$count",
        "$orderby",
        "$filter",
        "$expand",
    }


# -- what is out of scope, and is refused rather than ignored -------------------------------


@pytest.mark.parametrize(
    ("option", "value"),
    [
        ("$select", "result"),
        ("$search", "temperature"),
        ("$apply", "groupby((Datastream/name))"),
        ("$value", "true"),
        ("$ref", "true"),
    ],
)
def test_an_excluded_option_is_refused_with_its_own_name(option: str, value: str) -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({option: value})
    message = str(refusal.value)
    assert option in message
    assert CONFORMANCE in message
    assert refusal.value.option == option


def test_a_nested_expand_is_refused_as_such() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$expand": "Datastream/Sensor"}, entity=OBSERVATIONS)
    assert "nested" in str(refusal.value)


def test_options_inside_an_expand_are_refused_as_such() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$expand": "Observations($top=5)"}, entity=DATASTREAMS)
    assert "nested options" in str(refusal.value)


def test_a_filter_on_a_result_value_is_refused_naming_the_property() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$filter": "result gt 12.0"})
    message = str(refusal.value)
    assert "result" in message
    assert "phenomenon time" in message


def test_a_spatial_filter_function_is_refused_naming_the_function() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$filter": "st_within(FeatureOfInterest/feature, geography'POLYGON(())')"})
    assert "st_within()" in str(refusal.value)


def test_a_filter_on_an_entity_with_no_phenomenon_time_is_refused() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$filter": "phenomenonTime gt 2026-09-01T00:00:00.000000Z"}, entity=DATASTREAMS)
    assert "phenomenon time" in str(refusal.value)


def test_orderby_on_any_other_property_is_refused_naming_it() -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({"$orderby": "result desc"})
    assert "result" in str(refusal.value)


@pytest.mark.parametrize("method", ["POST", "PATCH", "PUT", "DELETE"])
def test_every_write_method_is_refused_before_anything_is_touched(method: str) -> None:
    with pytest.raises(QueryOptionRefusedError) as refusal:
        parse({}, method=method)
    message = str(refusal.value)
    assert method in message
    assert "select permission" in message


def test_the_out_of_scope_list_covers_everything_fr029_enumerates() -> None:
    """The list is what the served statement and the documentation are both built from."""
    for expected in (
        "$select",
        "$search",
        "$apply",
        "$value",
        "$ref",
        "$expand-nested",
        "$expand-options",
        "$filter-property",
        "$filter-function",
        "write",
        "Tasking",
        "MQTT",
    ):
        assert expected in OUT_OF_SCOPE
        assert OUT_OF_SCOPE[expected].strip()


def test_a_path_deeper_than_the_grammar_is_refused_with_the_grammar_named() -> None:
    with pytest.raises(QueryLayerError) as refusal:
        service().resource("Datastreams('ds-temperature')/Observations/FeatureOfInterest")
    assert "navigation step" in str(refusal.value)


def test_an_unserved_entity_set_is_refused_with_the_reason_for_its_absence() -> None:
    for absent in ("Locations", "HistoricalLocations"):
        with pytest.raises(QueryLayerError) as refusal:
            service().resource(absent)
        message = str(refusal.value)
        assert absent in message
        assert "conformance statement" in message
