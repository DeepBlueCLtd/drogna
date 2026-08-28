"""The rendered pygeoapi configuration carries values, and `query/` carries none.

A pygeoapi configuration is conventionally written full of absolute paths and a base URL.
That is exactly what Constitution IV forbids in component source, and this is the component
where it is easiest to lose. So the template holds placeholders, the destination
configuration holds the values, and this asserts both halves: that nothing which should have
come from configuration is written into `query/`, and that a placeholder with no value fails
the render by name rather than becoming an empty string that fails later somewhere less
informative.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
for candidate in (REPO_ROOT / "tests", REPO_ROOT / "query"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from harness_core.config import ConfigInvalidError, validate_document  # noqa: E402
from plugins.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema  # noqa: E402
from render_config import (  # noqa: E402
    MissingConfigurationValueError,
    render_from_document,
    template_text,
)

DESTINATIONS = ("local", "droplet")


def document(destination: str) -> dict:
    return json.loads(
        (REPO_ROOT / "config" / destination / "query.json").read_text(encoding="utf-8")
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_each_destination_validates_against_the_query_layer_schema(destination: str) -> None:
    validate_document(
        document(destination),
        schema(CONFIG_SCHEMA),
        source=destination,
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )


@pytest.mark.parametrize("destination", DESTINATIONS)
def test_the_rendered_configuration_carries_this_destination_s_values(destination: str) -> None:
    values = document(destination)
    rendered = render_from_document(values)

    query = values["query"]
    assert query["public_base_url"] in rendered
    assert query["coverage_store"]["root"] in rendered
    assert query["observations"]["dsn"] in rendered
    assert str(query["bind"]["port"]) in rendered
    assert "${" not in rendered, "a placeholder survived the render"


def test_the_two_destinations_differ_only_in_their_values() -> None:
    """One configuration, several destinations. What distinguishes them is values."""
    local = render_from_document(document("local"))
    droplet = render_from_document(document("droplet"))
    assert local != droplet
    assert document("local")["query"]["public_base_url"] not in droplet
    assert document("droplet")["query"]["public_base_url"] not in local


def test_a_missing_key_fails_the_render_and_names_it() -> None:
    values = document("local")
    del values["query"]["coverage_store"]["root"]
    with pytest.raises(MissingConfigurationValueError) as refusal:
        render_from_document(values)
    assert "root" in str(refusal.value)


def test_a_missing_section_fails_the_render_and_names_it() -> None:
    values = document("local")
    del values["query"]["presentation"]
    with pytest.raises(MissingConfigurationValueError) as refusal:
        render_from_document(values)
    assert "presentation" in str(refusal.value)


def test_a_placeholder_with_no_value_names_itself_rather_than_rendering_empty() -> None:
    with pytest.raises(MissingConfigurationValueError) as refusal:
        render_from_document(
            document("local"), "server:\n  something: ${a_value_nobody_supplies}\n"
        )
    assert "a_value_nobody_supplies" in str(refusal.value)


def test_a_configuration_missing_a_required_section_is_refused_at_load() -> None:
    values = document("local")
    del values["query"]["limits"]
    with pytest.raises(ConfigInvalidError) as refusal:
        validate_document(
            values,
            schema(CONFIG_SCHEMA),
            source="local",
            referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
        )
    assert "limits" in str(refusal.value)


def test_the_template_names_both_providers_by_dotted_module_path() -> None:
    """That is the whole of the wiring: load_plugin imports the class by name."""
    text = template_text()
    assert "plugins.edr_trajectory.DrognaTrajectoryEDRProvider" in text
    assert "plugins.sensorthings_provider.DrognaSensorThingsProvider" in text


def test_the_template_defines_no_collection_per_run() -> None:
    """FR-017: no run is enumerated in configuration, so publishing edits nothing."""
    text = template_text()
    assert "run-0" not in text
    assert text.count("type: collection") == 2


def test_the_packaged_common_schema_is_byte_identical_to_its_master() -> None:
    """The copy travels with the code that validates against it, and cannot drift from it."""
    packaged = (
        REPO_ROOT / "query" / "plugins" / "schemas" / "config.common.schema.json"
    ).read_bytes()
    master = (REPO_ROOT / "contracts" / "schemas" / "config.common.schema.json").read_bytes()
    assert packaged == master


def test_the_sensorthings_base_url_is_where_the_rendered_configuration_puts_the_provider() -> None:
    """The links the interface serves must name the path pygeoapi actually routes.

    Every ``@iot.selfLink``, ``@iot.navigationLink`` and entity-set url the SensorThings
    service emits is built on ``options.base_url``. pygeoapi reaches a feature provider at
    ``<server.url>/collections/<collection>/items``, and the resource path follows as
    ``<path:item_id>``. So the base must be that, and not the server url — a base one
    collection short advertises an entity set at a path nothing serves, which is what the
    running stack answered 404 to while every in-process test walked the same links
    happily. Read out of the rendered document rather than asserted against a literal, so
    that moving the collection moves the base with it or fails here.
    """
    import yaml

    rendered = yaml.safe_load(render_from_document(document("local")))
    collections = [
        (name, resource)
        for name, resource in rendered["resources"].items()
        if any(
            provider["name"] == "plugins.sensorthings_provider.DrognaSensorThingsProvider"
            for provider in resource["providers"]
        )
    ]
    assert len(collections) == 1, "exactly one collection is served by the SensorThings provider"
    name, resource = collections[0]
    options = next(
        provider["options"]
        for provider in resource["providers"]
        if provider["name"] == "plugins.sensorthings_provider.DrognaSensorThingsProvider"
    )
    assert options["base_url"] == f"{rendered['server']['url']}/collections/{name}/items"
