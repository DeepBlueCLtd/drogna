"""The configuration shape: what a destination must say, and what it may not leave out.

The proxy validates its configuration before any other I/O, like every other component,
and the interesting cases here are the ones where an omission would be indistinguishable
from a decision. An absent release list is the clearest of them: read as an empty release
it is a proxy that serves nothing, which looks like a working default-deny right up to the
moment somebody notices the collections they released are missing.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from harness_core.config import ConfigInvalidError, validate_document

from proxy.policy import PolicyError, ReleasePolicy
from proxy.schemas import COMMON_CONFIG_SCHEMA, CONFIG_SCHEMA, schema

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MASTERS = REPOSITORY_ROOT / "contracts" / "schemas"
PACKAGED = REPOSITORY_ROOT / "proxy" / "schemas"
DESTINATIONS = REPOSITORY_ROOT / "config"

DESTINATION_NAMES = sorted(
    entry.name for entry in DESTINATIONS.iterdir() if (entry / "proxy.json").is_file()
)


def load(destination: str) -> dict[str, Any]:
    return json.loads((DESTINATIONS / destination / "proxy.json").read_text(encoding="utf-8"))


def validate(document: Any) -> None:
    validate_document(
        document,
        schema(CONFIG_SCHEMA),
        source="proxy.json",
        referenced_schemas=[schema(COMMON_CONFIG_SCHEMA)],
    )


@pytest.mark.parametrize("destination", DESTINATION_NAMES)
def test_the_destination_configurations_validate(destination: str) -> None:
    validate(load(destination))


@pytest.mark.parametrize("name", [CONFIG_SCHEMA, COMMON_CONFIG_SCHEMA])
def test_the_packaged_schema_is_its_master(name: str) -> None:
    """A container has no contracts/ directory, so the schema travels with the code.

    The copy is written by scripts/generate_types.sh from the entry in
    contracts/openapi/generators.toml and compared byte for byte by
    scripts/check_types_drift.sh. This asserts the same thing from the component's side,
    where a reader of the component will look.
    """
    assert (PACKAGED / name).read_bytes() == (MASTERS / name).read_bytes()


def test_an_absent_release_list_is_a_startup_failure_not_an_empty_release() -> None:
    document = load("local")
    del document["proxy"]["released"]["collections"]

    with pytest.raises(ConfigInvalidError) as refusal:
        validate(document)

    assert refusal.value.pointer.endswith("/released")


def test_an_empty_release_list_is_refused_by_the_renderer() -> None:
    """The schema declares the key and the renderer refuses the empty value, deliberately.

    An array-length keyword here would be refused outright by the destination validator
    that runs on a machine holding nothing but a container runtime, which implements no
    such keyword and rejects a schema that uses one rather than ignoring it. So the shape
    is in the schema and the emptiness is in the code, and this test is what keeps the
    second half from being forgotten.
    """
    document = load("local")
    document["proxy"]["released"]["collections"] = []
    validate(document)

    with pytest.raises(PolicyError) as refusal:
        ReleasePolicy.from_document(document)

    assert "empty release" in str(refusal.value)


@pytest.mark.parametrize(
    "section",
    ["listen", "tls", "credentials", "upstream", "released", "control", "health", "logs"],
)
def test_every_section_the_boundary_needs_is_required(section: str) -> None:
    document = load("local")
    del document["proxy"][section]

    with pytest.raises(ConfigInvalidError):
        validate(document)


def test_an_unknown_key_is_refused_rather_than_ignored() -> None:
    """A key nobody reads is a setting somebody believes is in force."""
    document = load("local")
    document["proxy"]["released"]["also_release"] = ["drogna-raw"]

    with pytest.raises(ConfigInvalidError):
        validate(document)


@pytest.mark.parametrize("prefix", ["released", "/Released", "/released/deep", "//released"])
def test_a_prefix_that_is_not_one_lowercase_segment_is_refused(prefix: str) -> None:
    document = load("local")
    document["proxy"]["released"]["prefix"] = prefix

    with pytest.raises(ConfigInvalidError):
        validate(document)


def test_a_collection_identifier_that_is_a_path_is_refused() -> None:
    document = load("local")
    document["proxy"]["released"]["collections"] = ["../../etc/passwd"]

    with pytest.raises(ConfigInvalidError):
        validate(document)


def test_the_destinations_differ_in_values_and_not_in_keys() -> None:
    """NFR-05, asserted here as well as by scripts/check_destination_parity.sh.

    The parity check compares every file at every destination. This one is about the file
    this feature owns, and it fails in the suite of the feature that would have caused it.
    """

    def keys(value: Any, prefix: str = "") -> set[str]:
        if not isinstance(value, dict):
            return {prefix}
        return {name for key, entry in value.items() for name in keys(entry, f"{prefix}.{key}")}

    shapes = {destination: keys(load(destination)) for destination in DESTINATION_NAMES}
    first, *rest = DESTINATION_NAMES
    for destination in rest:
        assert shapes[destination] == shapes[first], (
            f"{destination}/proxy.json and {first}/proxy.json differ in shape, not only in "
            "values; a key present in one destination and absent from another is drift"
        )
