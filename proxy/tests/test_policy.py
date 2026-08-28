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
    ALLOW_CLOCK,
    ALLOW_PAGE,
    ALLOW_UPGRADE,
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
    outcome = decide(policy(), "/released/forecast")

    assert outcome.allowed
    assert outcome.rule == "allow-released:forecast"
    assert outcome.location is not None


def test_what_is_beneath_a_released_collection_is_reachable() -> None:
    assert decide(policy(), "/released/forecast/items").allowed


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


@pytest.mark.parametrize(
    "target",
    [
        "/query/collections/forecast",
        "/collections/forecast",
        "/query/openapi",
        "/query/conformance",
        "/openapi",
        "/conformance",
        "/collections",
        "/RELEASED/forecast",
    ],
)
def test_the_query_layers_native_paths_reach_the_page_and_never_the_query_layer(
    target: str,
) -> None:
    """FR-002, in its one-door form. The released prefix is the only way to the data.

    These paths used to meet the default deny. The 28 August topology decision put the
    page where the deny was, so a cleared caller asking for the query layer's native paths
    — its collections, its emitted specification, its conformance documents — is answered
    by the *client's* server, which resolves them as single-page routes and answers the
    page. What FR-002 actually forbids is unchanged and asserted here: no such path is
    ever sent to the query layer's upstream.
    """
    outcome = decide(policy(), target)

    assert outcome.allowed
    assert outcome.rule == ALLOW_PAGE
    assert outcome.location is not None
    assert outcome.location.upstream == policy().page_url
    assert policy().query_url not in outcome.location.upstream


@pytest.mark.parametrize(
    "target",
    [
        "/released",
        "/released/drogna-raw",
        "/released/forecast/../drogna-raw",
    ],
)
def test_beneath_the_released_prefix_the_refusal_stands(target: str) -> None:
    """The one refusal a cleared caller can still meet, and it does not become the page.

    The released prefix answers released collections and nothing else. A withheld name and
    a name that never existed meet the same refusal, which is what keeps the released set
    unenumerable now that everything off the prefix answers something.
    """
    outcome = decide(policy(), target)

    assert not outcome.allowed
    assert outcome.rule == DENY_NOT_RELEASED


def test_an_unnormalisable_target_is_refused_before_any_location_is_considered() -> None:
    outcome = decide(policy(), "/released%2fforecast")

    assert not outcome.allowed
    assert outcome.rule == DENY_UNNORMALISABLE


# --- the page and the clock (the one-door topology; ADR-0025) -----------------------------


def test_the_page_is_what_the_root_answers() -> None:
    outcome = decide(policy(), "/")

    assert outcome.allowed
    assert outcome.rule == ALLOW_PAGE
    assert outcome.location is not None
    assert outcome.location.upstream == policy().page_url


def test_the_clocks_routes_are_reachable_and_name_their_rule() -> None:
    """FR-74's strand (ADR-0025): the control surface, behind the clearance, per request."""
    for target in ("/clock/snapshot", "/clock/control"):
        outcome = decide(policy(), target)

        assert outcome.allowed
        assert outcome.rule == ALLOW_CLOCK
        assert outcome.location is not None
        assert outcome.location.upstream == policy().clock_url


def test_the_bare_clock_prefix_belongs_to_the_clock_surface() -> None:
    """The prefix names no clock route, and it still ends up at the clock, not the page.

    nginx canonicalises a request for the bare prefix into the subtree with a relative
    301 — the slash-terminated proxied location's own behaviour — so what finally answers
    is the clock, with a 404 for a route it does not serve. The reference says where a
    path ends up, and this one ends up at the clock.
    """
    outcome = decide(policy(), "/clock")

    assert outcome.rule == ALLOW_CLOCK
    assert outcome.location is not None
    assert outcome.location.upstream == policy().clock_url


def test_a_name_the_clock_prefix_prefixes_is_the_page_not_the_clock() -> None:
    outcome = decide(policy(), "/clock-other/route")

    assert outcome.rule == ALLOW_PAGE


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
    for beneath in ("/ctl/mqtt", "/ctl/anything/at/all"):
        outcome = decide(settled, beneath)
        # Beneath the upgrade path is not the upgrade: it answers the page like any other
        # unclaimed path, and nothing beneath it ever reaches the broker's listener.
        assert outcome.rule == ALLOW_PAGE
        assert outcome.location is not None
        assert outcome.location.upstream == settled.page_url


def test_the_upgrade_prefix_and_the_released_prefix_cannot_be_the_same_path() -> None:
    with pytest.raises(PolicyError) as refusal:
        policy(control={"upgrade_prefix": "/released"})
    assert "widen" in str(refusal.value)


def test_the_clock_prefix_cannot_share_a_path_with_either_other_surface() -> None:
    for taken in ("/released", "/ctl"):
        with pytest.raises(PolicyError) as refusal:
            policy(upstream={"clock": {"url": "http://clock:8090", "prefix": taken}})
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
    advertised = ["forecast", "drogna-raw", "observations"]

    assert unreleased(policy(), advertised) == ("drogna-raw", "observations")
