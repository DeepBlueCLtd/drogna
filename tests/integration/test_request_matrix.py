"""The boundary, driven over the network, against a stub upstream that records what reached it.

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
from proxy_boundary import CLEARED, UNCLEARED, Boundary, skip_without_containers, start_boundary

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
        f"{NATIVE}/{RELEASED}",
        f"{NATIVE}/{WITHHELD}",
        "/query/openapi",
        "/query/conformance",
        "/",
        "/nothing-at-all",
        f"{UPGRADE}/anything",
    ],
)
def test_everything_not_released_is_refused_for_a_cleared_caller(
    boundary: Boundary, path: str
) -> None:
    """FR-001, FR-002, FR-003 and US1 scenario 5, over one list of paths.

    The query layer's own specification and conformance documents are in the list
    deliberately: they enumerate every collection it serves, withheld ones included, so
    serving them through the released prefix would disclose the shape of what is being
    withheld even though the data stays refused.
    """
    assert boundary.request(path).status == 404


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


# --- the page, behind the same clearance (issue #34 link 6) --------------------------------
#
# The tracked configuration this matrix is built from declares the page's surface, so the
# rendered boundary carries its locations. The stub upstream is not a client and answers
# what it answers; what is asserted here is routing and clearance, which is what the
# boundary owns.


def test_the_page_is_behind_the_same_clearance(boundary: Boundary) -> None:
    """One credential for the page, the data, and everything else — and an uncleared
    caller is told the same thing about the page as about any other path (FR-006)."""
    page = boundary.request("/", clearance=None)
    nowhere = boundary.request("/nothing-at-all", clearance=None)

    assert page.status == 401
    assert page.comparable() == nowhere.comparable()


def test_a_cleared_caller_reaches_the_page_upstream(boundary: Boundary) -> None:
    boundary.request("/", clearance=CLEARED)

    assert [line for line in boundary.upstream_log() if line == "upstream GET /"], (
        "the page root never reached the page upstream; the boundary is not serving "
        "the page it declares"
    )


def test_the_asset_subtree_is_admitted_and_the_bare_prefix_is_not(boundary: Boundary) -> None:
    """The bare prefix names a directory, not a document.

    The first rendering of the page surface answered it with nginx's own trailing-slash
    301 into the subtree — issued when the location is chosen, before the access phase,
    so an uncleared caller could map the page's directories from the redirects. This
    matrix caught it; the exact guard location is what keeps it caught.
    """
    boundary.request("/assets/index-1a2b3c.js", clearance=CLEARED)

    assert [line for line in boundary.upstream_log() if "/assets/index-1a2b3c.js" in line]
    assert boundary.request("/assets", clearance=CLEARED).status == 404
    uncleared = boundary.request("/assets", clearance=None)
    nowhere = boundary.request("/nothing-at-all", clearance=None)
    assert uncleared.comparable() == nowhere.comparable(), (
        "an uncleared caller is told something different about the asset prefix than "
        "about a path that is not part of the boundary at all (FR-006)"
    )


def test_a_build_path_the_document_does_not_name_is_refused(boundary: Boundary) -> None:
    """FR-003's property applied to the page: a new build output is not a new exposure."""
    answer = boundary.request("/vite.svg", clearance=CLEARED)

    assert answer.status == 404
    assert not [line for line in boundary.upstream_log() if "vite.svg" in line]


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
def test_a_path_that_normalises_into_the_withheld_set_is_refused(
    boundary: Boundary, path: str
) -> None:
    """FR-004. Policy is applied to the normalised path, and an ambiguous one is refused."""
    assert boundary.request(path).status in (400, 404)
    assert not [line for line in boundary.upstream_log() if WITHHELD in line]


def test_duplicate_separators_do_not_change_what_a_released_path_means(
    boundary: Boundary,
) -> None:
    assert boundary.request(f"//{PREFIX.strip('/')}//{RELEASED}").status == 200


# --- what the log says ---------------------------------------------------------------------


def test_a_refusal_is_diagnosable_from_the_log_alone(boundary: Boundary) -> None:
    """FR-020. An unexplainable refusal is one somebody loosens policy to understand."""
    boundary.request(f"{PREFIX}/{WITHHELD}")
    boundary.request("/nothing-at-all")

    lines = boundary.refusal_log()

    assert [line for line in lines if WITHHELD in line and "rule=deny-not-released" in line]
    assert [line for line in lines if "nothing-at-all" in line and "rule=deny-default" in line]


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
