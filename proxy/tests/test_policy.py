"""What the boundary lets through, and what it refuses to guess at.

These tests are over :mod:`proxy.policy`, which is the reference the request matrix checks
nginx against rather than anything consulted at run time. That makes them cheap and it
makes them honest about their limits: a disagreement between this module and the served
configuration is a bug this file cannot see, which is why
``tests/integration/test_request_matrix.py`` exists and stands a real nginx in front of a
real upstream.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from proxy.policy import (
    ALLOW_UPGRADE,
    DENY_DEFAULT,
    DENY_NOT_RELEASED,
    DENY_UNNORMALISABLE,
    PolicyError,
    ReleasePolicy,
    UnnormalisablePathError,
    decide,
    normalise,
    released_locations,
    unreleased,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DESTINATIONS = REPOSITORY_ROOT / "config"


def document(**overrides: Any) -> dict[str, Any]:
    """A configuration document shaped like a destination's, with a section replaced.

    Built from the local destination rather than written out here, so that a change to the
    shape of the configuration reaches these tests as a failure rather than leaving them
    asserting things about a shape nothing uses any more.
    """
    loaded = json.loads((DESTINATIONS / "local" / "proxy.json").read_text(encoding="utf-8"))
    for section, value in overrides.items():
        loaded["proxy"][section] = {**loaded["proxy"][section], **value}
    return loaded


def policy(**overrides: Any) -> ReleasePolicy:
    return ReleasePolicy.from_document(document(**overrides))


# --- normalisation ------------------------------------------------------------------------
#
# Every case here is refusal-biased. A path with two readings is refused rather than given
# one of them, because the reading a proxy picks is a reading an attacker gets to choose
# the input to (FR-004).


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("/released/temperature", "/released/temperature"),
        ("//released//temperature", "/released/temperature"),
        ("/released/temperature/", "/released/temperature"),
        ("/released/./temperature", "/released/temperature"),
        ("/released/temperature/.", "/released/temperature"),
        ("/released/withheld/../temperature", "/released/temperature"),
        ("/released/temperature?f=json", "/released/temperature"),
        ("/released/temperature#fragment", "/released/temperature"),
        ("/released/%74emperature", "/released/temperature"),
        ("/", "/"),
    ],
)
def test_a_path_with_one_reading_is_given_it(target: str, expected: str) -> None:
    assert normalise(target) == expected


@pytest.mark.parametrize(
    "target",
    [
        "",
        "released/temperature",
        "/released/..%2ftemperature",
        "/released%2ftemperature",
        "/released/%2e%2e/%2e%2e/etc",
        "/../etc",
        "/released/../../etc",
        "/released\\temperature",
        "/released/%zz",
        "/released/%f0",
        "/released/temp%00erature",
        "/released/temp\nerature",
    ],
)
def test_a_path_with_two_readings_or_none_is_refused(target: str) -> None:
    with pytest.raises(UnnormalisablePathError) as refusal:
        normalise(target)
    assert refusal.value.reason, "a refusal that does not say why is a refusal nobody can act on"


def test_an_encoded_separator_is_refused_rather_than_decoded() -> None:
    """The case that matters most: `%2f` decoded is a separator, undecoded is a name."""
    with pytest.raises(UnnormalisablePathError) as refusal:
        normalise("/released/temperature%2f..%2fwithheld")
    assert "separator" in refusal.value.reason


# --- the released surface -----------------------------------------------------------------


def test_a_released_collection_is_reachable_and_names_its_rule() -> None:
    outcome = decide(policy(), "/released/drogna-forecast")

    assert outcome.allowed
    assert outcome.rule == "allow-released:drogna-forecast"
    assert outcome.location is not None


def test_what_is_beneath_a_released_collection_is_reachable() -> None:
    assert decide(policy(), "/released/drogna-forecast/items").allowed


def test_a_collection_the_list_does_not_name_is_refused() -> None:
    """FR-003. The query layer may serve it; that is not the same as releasing it."""
    outcome = decide(policy(), "/released/drogna-raw")

    assert not outcome.allowed
    assert outcome.rule == DENY_NOT_RELEASED


def test_a_released_identifier_that_prefixes_an_unreleased_one_does_not_admit_it() -> None:
    """spec.md US1 scenario 5, and the reason the template emits two locations per entry."""
    released = policy(released={"collections": ["temperature"]})

    assert decide(released, "/released/temperature").allowed
    assert not decide(released, "/released/temperature-raw").allowed
    assert not decide(released, "/released/temperature-raw/items").allowed


def test_the_query_layers_native_path_is_not_reachable() -> None:
    """FR-002. The released prefix is the only way in; the upstream path is not a way in."""
    outcome = decide(policy(), "/query/collections/drogna-forecast")

    assert not outcome.allowed
    assert outcome.rule == DENY_DEFAULT


@pytest.mark.parametrize(
    "target",
    [
        "/query/openapi",
        "/query/conformance",
        "/openapi",
        "/conformance",
        "/collections",
        "/released",
        "/RELEASED/drogna-forecast",
        "/released/drogna-forecast/../drogna-raw",
    ],
)
def test_everything_else_is_refused_by_default(target: str) -> None:
    """FR-001. Including the documents that enumerate what is withheld."""
    assert not decide(policy(), target).allowed


def test_an_unnormalisable_target_is_refused_before_any_location_is_considered() -> None:
    outcome = decide(policy(), "/released%2fdrogna-forecast")

    assert not outcome.allowed
    assert outcome.rule == DENY_UNNORMALISABLE


# --- the upgrade location (ADR-0008) ------------------------------------------------------


def test_the_upgrade_location_is_exactly_one_path() -> None:
    """A static prefix can afford a subtree. This cannot.

    Policy on an upgrade location is evaluated once, at the upgrade, and the connection
    then persists carrying traffic the proxy does not inspect per message. So the surface
    is exactly the one URL the client needs, and the served configuration renders it as
    `location = /ctl`. If this module admitted a subtree it would disagree with what is
    actually served, which is the disagreement the request matrix exists to catch and this
    assertion exists to prevent.
    """
    settled = policy()

    assert decide(settled, "/ctl").allowed
    assert decide(settled, "/ctl").rule == ALLOW_UPGRADE
    assert not decide(settled, "/ctl/mqtt").allowed
    assert not decide(settled, "/ctl/anything/at/all").allowed


def test_the_upgrade_prefix_and_the_released_prefix_cannot_be_the_same_path() -> None:
    with pytest.raises(PolicyError) as refusal:
        policy(control={"upgrade_prefix": "/released"})
    assert "widen" in str(refusal.value)


# --- reading the policy out of a configuration --------------------------------------------


def test_an_empty_release_is_refused_rather_than_served() -> None:
    with pytest.raises(PolicyError):
        policy(released={"collections": []})


def test_an_empty_variable_allowlist_is_refused() -> None:
    """FR-014's list bounds what a released artefact may carry; empty would admit anything."""
    with pytest.raises(PolicyError):
        policy(released={"variables": []})


def test_a_collection_identifier_carrying_a_separator_is_refused() -> None:
    with pytest.raises(PolicyError) as refusal:
        policy(released={"collections": ["drogna/forecast"]})
    assert "identifier" in str(refusal.value)


@pytest.mark.parametrize("prefix", ["released", "/", "/a/b", "/released/"])
def test_a_prefix_that_is_not_one_whole_segment_is_refused(prefix: str) -> None:
    with pytest.raises(PolicyError):
        policy(released={"prefix": prefix})


def test_the_locations_are_ordered_deterministically() -> None:
    """Two renders of one configuration must be byte-identical, so the order is fixed here."""
    shuffled = policy(released={"collections": ["b-collection", "a-collection", "c-collection"]})

    paths = [location.path for location in released_locations(shuffled)]

    assert paths == sorted(paths)


def test_one_location_per_released_collection_and_one_upgrade() -> None:
    settled = policy()
    locations = released_locations(settled)

    assert sum(1 for location in locations if location.upgrade) == 1
    assert len(locations) == len(settled.collections) + 1


def test_unreleased_names_what_the_policy_withholds() -> None:
    """The request matrix builds its unreleased cases from what upstream says it serves."""
    advertised = ["drogna-forecast", "drogna-raw", "observations", "drogna-uncertainty"]

    assert unreleased(policy(), advertised) == ("drogna-raw", "observations")
