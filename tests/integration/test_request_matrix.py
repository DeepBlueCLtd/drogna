"""The boundary, driven over the network, against stub upstreams that record what reached them.

Two stubs since the one-door topology put the page behind the boundary: one plays the
query layer, the broker and the clock, the other plays the client's server. An unclaimed
path answering the page is only evidence of anything because the two are separate
containers: the claim is not "it answered something" but "the page's server answered it
and the query layer never saw it".

Everything here is a property of nginx rather than of the rendered file, which is why it
needs a container and why `proxy/tests/test_render_config.py` cannot stand in for it. The
two that matter most, and that reading the configuration back would never catch:

**Nothing unreleased reaches upstream.** The stub logs every request it is given. A
refusal that proxied first and refused afterwards would look identical from the caller's
side and would be a different system. FR-001 asks for the first.

**The uncleared caller learns nothing.** A released path, an unreleased path and a path
that exists nowhere must produce one response — same status, same body, same headers
(FR-006, SC-003). This is where a `return 404` in a deny location would show up: `return`
runs in nginx's rewrite phase, before the access phase, so a boundary written that way
answers 404 without looking at the credential and the released set becomes enumerable by
somebody holding nothing.

These tests skip, loudly and with the reason, where no container runtime is available.
They never pass without one: a request matrix that examined nothing would be worse than no
request matrix, because it would look like evidence.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from proxy_boundary import (
    CLEARED,
    PAGE_BODY,
    UNCLEARED,
    Boundary,
    skip_without_containers,
    start_boundary,
)

pytestmark = skip_without_containers()

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]

RELEASED = "drogna-forecast"
ALSO_RELEASED = "drogna-uncertainty"
WITHHELD = "drogna-observations"
NEAR_MISS = f"{RELEASED}-raw"
DOCUMENTS = ("openapi", "conformance")

PREFIX = "/released"
UPGRADE = "/ctl"
NATIVE = "/query/collections"


def configuration() -> dict[str, Any]:
    """The local destination's own configuration, with the release list this matrix needs.

    Built from the tracked file rather than written here, so the matrix is over the shape a
    destination actually carries. Only the release list is replaced, because the whole
    question is what a given release list does and does not admit.
    """
    document = json.loads(
        (REPOSITORY_ROOT / "config" / "local" / "proxy.json").read_text(encoding="utf-8")
    )
    document["proxy"]["released"]["collections"] = [RELEASED, ALSO_RELEASED]
    document["proxy"]["released"]["prefix"] = PREFIX
    document["proxy"]["control"]["upgrade_prefix"] = UPGRADE
    return document


@pytest.fixture(scope="module")
def boundary(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Boundary]:
    """One boundary for the whole matrix. Nothing here mutates it except the stability test."""
    yield from start_boundary(
        tmp_path_factory.mktemp("boundary"),
        configuration(),
        served=[RELEASED, ALSO_RELEASED, WITHHELD, NEAR_MISS],
        documents=DOCUMENTS,
    )


# --- what answers, and what does not ------------------------------------------------------


def test_a_released_collection_answers_from_upstream(boundary: Boundary) -> None:
    answer = boundary.request(f"{PREFIX}/{RELEASED}")

    assert answer.status == 200
    assert answer.body == f"served-{RELEASED}".encode()


def test_the_proxied_body_is_byte_identical_to_the_upstream_body(boundary: Boundary) -> None:
    """FR-005, US2 scenario 1. The boundary forwards; it does not edit."""
    through = boundary.request(f"{PREFIX}/{RELEASED}")
    direct = boundary.upstream_directly(f"{NATIVE}/{RELEASED}")

    assert through.body == direct.body


@pytest.mark.parametrize(
    "path",
    [
        f"{PREFIX}/{WITHHELD}",
        f"{PREFIX}/{NEAR_MISS}",
        f"{PREFIX}/{NEAR_MISS}/items",
        f"{PREFIX}",
        f"{PREFIX}/",
    ],
)
def test_beneath_the_released_prefix_everything_off_the_list_is_refused(
    boundary: Boundary, path: str
) -> None:
    """FR-003 and US1 scenario 5: the released prefix answers the list and nothing else.

    This is the refusal that did not become the page when the one-door topology put the
    page where the default deny was. A withheld collection and a name that never existed
    meet the same 404 here, which is what keeps the released set unenumerable even behind
    the clearance.
    """
    assert boundary.request(path).status == 404


@pytest.mark.parametrize(
    "path",
    [
        f"{NATIVE}/{RELEASED}",
        f"{NATIVE}/{WITHHELD}",
        "/query/openapi",
        "/query/conformance",
        "/",
        "/nothing-at-all",
        f"{UPGRADE}/anything",
    ],
)
def test_every_unclaimed_path_is_answered_by_the_page_and_never_by_the_query_layer(
    boundary: Boundary, path: str
) -> None:
    """FR-001 and FR-002, in their one-door form (the topology decision of 28 August).

    These paths used to meet the default deny; a cleared caller now gets the page, which
    the client's server answers for every single-page route. What FR-002 actually forbids
    is asserted in full: the query layer's native paths, its emitted specification and
    its conformance documents — which enumerate every collection it serves, withheld ones
    included — are answered by the *page's* server, and the query layer's upstream never
    sees the request.
    """
    before = boundary.upstream_log()
    answer = boundary.request(path)

    assert answer.status == 200
    assert answer.body == PAGE_BODY.encode()
    # Compared as a delta, not a membership: the released locations legitimately map onto
    # the query layer's native collection path, so a line naming this path may already be
    # in the log from a released request. What this request must not do is add one.
    assert boundary.upstream_log() == before


def test_a_released_identifier_does_not_admit_the_one_it_prefixes(boundary: Boundary) -> None:
    """The stub serves both. Only one of them is released, and the string is not the segment."""
    assert boundary.request(f"{PREFIX}/{RELEASED}").status == 200
    assert boundary.request(f"{PREFIX}/{NEAR_MISS}").status == 404


def test_nothing_unreleased_ever_reached_upstream(boundary: Boundary) -> None:
    """FR-001, and the difference between refusing and proxying-then-refusing."""
    boundary.request(f"{PREFIX}/{WITHHELD}")
    boundary.request(f"{NATIVE}/{WITHHELD}")
    boundary.request("/query/openapi")

    reached = boundary.upstream_log()

    assert not [line for line in reached if WITHHELD in line]
    assert not [line for line in reached if "openapi" in line]


# --- the refusal is not method-dependent ---------------------------------------------------


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_the_refusal_does_not_depend_on_the_method(boundary: Boundary, method: str) -> None:
    assert boundary.request(f"{PREFIX}/{WITHHELD}", method=method).status == 404


def test_a_cors_preflight_against_an_unreleased_path_is_refused(boundary: Boundary) -> None:
    answer = boundary.request(
        f"{PREFIX}/{WITHHELD}",
        method="OPTIONS",
        headers={
            "Origin": "https://elsewhere.invalid",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert answer.status == 404
    assert not [name for name, _ in answer.headers if name.lower().startswith("access-control")]


# --- the uncleared caller ------------------------------------------------------------------


def test_an_uncleared_caller_is_told_the_same_thing_about_every_path(boundary: Boundary) -> None:
    """FR-006 and SC-003: three responses, zero differences.

    This is the assertion that fails if a deny location is ever written as `return 404`.
    `return` is executed in nginx's rewrite phase, before the access phase where the
    credential is examined, so the released path would answer 401 and the other two 404 —
    and the released set would be enumerable by a caller holding nothing.
    """
    released = boundary.request(f"{PREFIX}/{RELEASED}", clearance=None)
    unreleased = boundary.request(f"{PREFIX}/{WITHHELD}", clearance=None)
    nowhere = boundary.request("/nothing-at-all", clearance=None)

    assert released.status == 401
    assert released.comparable() == unreleased.comparable()
    assert released.comparable() == nowhere.comparable()


def test_a_wrong_credential_is_the_same_as_no_credential(boundary: Boundary) -> None:
    absent = boundary.request(f"{PREFIX}/{RELEASED}", clearance=None)
    wrong = boundary.request(f"{PREFIX}/{RELEASED}", clearance=UNCLEARED)

    assert wrong.comparable() == absent.comparable()


def test_the_challenge_is_one_a_browser_can_complete(boundary: Boundary) -> None:
    """Binary access still has to be usable, or the boundary is a wall (ADR-0001)."""
    answer = boundary.request(f"{PREFIX}/{RELEASED}", clearance=None)

    assert [value for name, value in answer.headers if name.lower() == "www-authenticate"]
    assert boundary.request(f"{PREFIX}/{RELEASED}", clearance=CLEARED).status == 200


def test_an_uncleared_caller_never_reaches_upstream(boundary: Boundary) -> None:
    boundary.request(f"{PREFIX}/{ALSO_RELEASED}", clearance=None)

    assert not [line for line in boundary.upstream_log() if ALSO_RELEASED in line]


# --- paths with two readings ---------------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    [
        f"{PREFIX}/{RELEASED}%2f..%2f{WITHHELD}",
        f"{PREFIX}/{RELEASED}/../{WITHHELD}",
        f"{PREFIX}/../{NATIVE}/{WITHHELD}",
        f"{PREFIX}/%2e%2e/{NATIVE}/{WITHHELD}",
        f"{PREFIX}/{WITHHELD}/.",
        f"//{PREFIX.strip('/')}//{WITHHELD}",
        f"{PREFIX.upper()}/{RELEASED}",
    ],
)
def test_a_path_that_normalises_towards_the_withheld_set_never_reaches_it(
    boundary: Boundary, path: str
) -> None:
    """FR-004. Policy is applied to the normalised path, and an ambiguous one is refused.

    A path that normalises into the released prefix meets the refusal; one that
    normalises out of it — towards the query layer's native paths — meets the page, like
    any other unclaimed path. Either way the withheld content is never the answer and the
    query layer's upstream never sees the request, which is the property under test.
    """
    answer = boundary.request(path)

    assert answer.status in (400, 404) or answer.body == PAGE_BODY.encode()
    assert answer.body != f"served-{WITHHELD}".encode()
    assert not [line for line in boundary.upstream_log() if WITHHELD in line]


def test_duplicate_separators_do_not_change_what_a_released_path_means(
    boundary: Boundary,
) -> None:
    assert boundary.request(f"//{PREFIX.strip('/')}//{RELEASED}").status == 200


# --- what the log says ---------------------------------------------------------------------


def test_a_decision_is_diagnosable_from_the_log_alone(boundary: Boundary) -> None:
    """FR-020. An unexplainable decision is one somebody loosens policy to understand."""
    boundary.request(f"{PREFIX}/{WITHHELD}")
    boundary.request("/nothing-at-all")
    boundary.request("/clock/snapshot")

    lines = boundary.refusal_log()

    assert [line for line in lines if WITHHELD in line and "rule=deny-not-released" in line]
    assert [line for line in lines if "nothing-at-all" in line and "rule=allow-page" in line]
    assert [line for line in lines if "/clock/snapshot" in line and "rule=allow-clock" in line]


# --- the page and the clock, through the one door -------------------------------------------


def test_the_page_is_served_at_the_root_and_is_byte_identical(boundary: Boundary) -> None:
    """The one-door topology: the page loads from the boundary, unedited (FR-005 extends)."""
    through = boundary.request("/")
    direct = boundary.page_directly("/")

    assert through.status == 200
    assert through.body == direct.body == PAGE_BODY.encode()


def test_a_page_asset_is_served_through_the_boundary(boundary: Boundary) -> None:
    assert boundary.request("/app.js").body == b"page-asset"


def test_an_uncleared_caller_is_refused_the_page_and_the_clock_identically(
    boundary: Boundary,
) -> None:
    """FR-006 still holds with the page behind the door: one challenge, every path."""
    page = boundary.request("/", clearance=None)
    clock = boundary.request("/clock/snapshot", clearance=None)
    released = boundary.request(f"{PREFIX}/{RELEASED}", clearance=None)

    assert page.status == 401
    assert page.comparable() == clock.comparable()
    assert page.comparable() == released.comparable()


def test_an_uncleared_caller_never_reaches_the_pages_server(boundary: Boundary) -> None:
    probe = "/uncleared-page-probe"
    boundary.request(probe, clearance=None)

    assert not [line for line in boundary.page_log() if probe in line]


def test_the_clocks_routes_reach_the_clock_upstream_unrewritten(boundary: Boundary) -> None:
    """FR-74's strand (ADR-0025): the control surface, through the boundary, path intact."""
    answer = boundary.request("/clock/snapshot")

    assert answer.status == 200
    assert answer.body == b"clock-snapshot"
    assert [line for line in boundary.upstream_log() if line.endswith(" /clock/snapshot")]


def test_the_bare_clock_prefix_canonicalises_into_the_subtree_and_ends_at_the_clock(
    boundary: Boundary,
) -> None:
    """nginx 301s `/clock` to `/clock/` — relatively, so the caller's own origin resolves
    it — and the clock then answers 404 for a route it does not serve. The absolute form
    of that redirect carried the container's listen port, which no caller can reach at
    any destination that publishes a different one; `absolute_redirect off` is what this
    exercises. The page never sees the path."""
    answer = boundary.request("/clock")

    assert answer.status == 404
    assert [line for line in boundary.upstream_log() if line.endswith(" /clock/")]
    assert not [line for line in boundary.page_log() if "/clock" in line]


# --- adding a collection upstream changes nothing -------------------------------------------


def test_a_collection_becoming_servable_does_not_change_the_public_surface(
    boundary: Boundary,
) -> None:
    """SC-002 and US1 scenario 4. FR-21 makes a new collection servable; releasing is an act.

    The matrix is recorded, the stub is given a collection it did not have, and the matrix
    is taken again without re-rendering anything. A single difference is the whole failure
    this feature exists to prevent.
    """
    appeared = "drogna-brand-new"
    paths = [
        f"{PREFIX}/{RELEASED}",
        f"{PREFIX}/{appeared}",
        f"{NATIVE}/{appeared}",
        "/",
    ]

    before = [boundary.request(path).comparable() for path in paths]
    boundary.serve_additionally(appeared)
    after = [boundary.request(path).comparable() for path in paths]

    assert boundary.upstream_directly(f"{NATIVE}/{appeared}").status == 200, (
        "the stub did not actually start serving it, so this test proved nothing"
    )
    assert before == after
